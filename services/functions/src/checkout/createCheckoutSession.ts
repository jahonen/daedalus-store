import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { z } from "zod";
import {
  CHECKOUT_LOCK_TTL_MINUTES,
  campaignSchema,
  productSchema,
  vatCents,
} from "@daedalus/shared";
import { db, STORE_URL } from "../admin.js";
import { stripeSecretKey, storeBaseUrl } from "../config.js";

const inputSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), qty: z.number().int().positive() }))
    .min(1),
  email: z.string().email().optional(),
});

const LOCK_MS = CHECKOUT_LOCK_TTL_MINUTES * 60 * 1000;

function cors(res: { set: (k: string, v: string) => unknown }) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

/**
 * Inventory reservation (spec §4.1): atomic transaction reserves stock,
 * then a Stripe Checkout session with matching 30-min expiry is created.
 * On Stripe failure the reservation is rolled back.
 */
export const createCheckoutSession = onRequest(
  { secrets: [stripeSecretKey] },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method not allowed" });
      return;
    }
    logger.info("createCheckoutSession start");

    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.issues });
      return;
    }
    const { items, email } = parsed.data;

    // Resolve products + effective prices.
    const productRefs = items.map((i) => db.collection("products").doc(i.productId));
    const productSnaps = await db.getAll(...productRefs);
    const products = productSnaps.map((s, i) => {
      if (!s.exists) throw new Error(`unknown product ${items[i].productId}`);
      return { id: s.id, ...productSchema.parse(s.data()) };
    });
    if (products.some((p) => p.status !== "active")) {
      res.status(400).json({ error: "product not available" });
      return;
    }

    // Active campaigns → sale prices.
    const now = new Date();
    const campaignSnaps = await db
      .collection("campaigns")
      .where("status", "in", ["scheduled", "active"])
      .get();
    const salePrices = new Map<string, number>();
    for (const c of campaignSnaps.docs) {
      const camp = campaignSchema.parse(c.data());
      if (new Date(camp.startsAt) <= now && new Date(camp.endsAt) > now) {
        salePrices.set(camp.productId, camp.salePriceCents);
      }
    }

    const priced = items.map((item) => {
      const p = products.find((x) => x.id === item.productId)!;
      const unit = salePrices.get(p.id) ?? p.basePriceCents;
      return { item, product: p, unitPriceCents: unit };
    });
    const totalCents = priced.reduce((s, x) => s + x.unitPriceCents * x.item.qty, 0);
    const vatTotal = priced.reduce(
      (s, x) => s + vatCents(x.unitPriceCents * x.item.qty, x.product.vatRate),
      0,
    );

    // 1) Atomic reservation.
    try {
      await db.runTransaction(async (tx) => {
        const snaps = await Promise.all(items.map((i) => tx.get(productRefs[items.indexOf(i)])));
        for (let i = 0; i < items.length; i++) {
          const snap = snaps[i];
          const p = productSchema.parse(snap.data());
          const available = p.stockQuantity - p.reservedQuantity;
          if (available < items[i].qty) {
            throw new Error(`sold out: ${p.name}`);
          }
        }
        for (let i = 0; i < items.length; i++) {
          tx.update(productRefs[i], { reservedQuantity: FieldValue.increment(items[i].qty) });
        }
      });
    } catch (e) {
      logger.warn("reservation failed", { error: String(e) });
      res.status(409).json({ error: String(e instanceof Error ? e.message : e) });
      return;
    }

    // 2) Stripe Checkout session (min expiry 30 min == lock TTL).
    const stripe = new Stripe(stripeSecretKey.value());
    const expiresAt = new Date(now.getTime() + LOCK_MS);
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        line_items: priced.map((x) => ({
          quantity: x.item.qty,
          price_data: {
            currency: "eur",
            unit_amount: x.unitPriceCents,
            tax_behavior: "inclusive",
            product_data: { name: x.product.name, metadata: { productId: x.product.id } },
          },
        })),
        success_url: `${storeBaseUrl.value()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${storeBaseUrl.value()}/checkout/cancel`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        shipping_address_collection: { allowed_countries: ["FI", "SE", "DK", "DE", "NL", "EE", "FR", "ES", "IT", "AT", "BE", "IE", "PT", "PL"] },
      });
    } catch (e) {
      // Compensating release.
      await db.runTransaction(async (tx) => {
        for (let i = 0; i < items.length; i++) {
          tx.update(productRefs[i], { reservedQuantity: FieldValue.increment(-items[i].qty) });
        }
      });
      logger.error("stripe session failed; reservation rolled back", { error: String(e) });
      res.status(502).json({ error: "payment provider error" });
      return;
    }

    // 3) Locks + pending checkout record (webhook reads this).
    const batch = db.batch();
    for (const x of priced) {
      batch.set(db.collection("inventoryLocks").doc(), {
        productId: x.product.id,
        qty: x.item.qty,
        stripeSessionId: session.id,
        expiresAt: expiresAt.toISOString(),
      });
    }
    batch.set(db.collection("checkoutSessions").doc(session.id), {
      items: priced.map((x) => ({
        productId: x.product.id,
        name: x.product.name,
        qty: x.item.qty,
        unitPriceCents: x.unitPriceCents,
        vatRate: x.product.vatRate,
      })),
      amounts: {
        subtotalCents: totalCents - vatTotal,
        vatCents: vatTotal,
        totalCents,
        currency: "EUR",
      },
      status: "reserved",
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });
    await batch.commit();

    logger.info("createCheckoutSession done", { sessionId: session.id, totalCents });
    res.json({ checkoutUrl: session.url, sessionId: session.id });
  },
);
