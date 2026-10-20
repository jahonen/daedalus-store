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
import { db } from "../admin.js";
import { stripeSecretKey, storeBaseUrl } from "../config.js";

const inputSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), qty: z.number().int().positive() }))
    .min(1),
  email: z.string().email().optional(),
  gaClientId: z.string().max(64).optional(),
});

const LOCK_MS = CHECKOUT_LOCK_TTL_MINUTES * 60 * 1000;

function cors(res: { set: (k: string, v: string) => unknown }) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

/**
 * Inventory reservation (spec §4.1): atomic transaction reserves stock
 * and writes the checkout session doc + inventory locks, then creates the
 * Stripe Checkout session. On Stripe failure the reservation is rolled back.
 *
 * Critical race-condition fixes:
 *  - Aggregate qty per productId so duplicate line items can't oversell.
 *  - Write checkoutSessions doc inside the reservation tx (status "reserving")
 *    so a crash before Stripe can't orphan reserved stock without a record.
 *  - After Stripe: update status to "reserved" (webhook reads this).
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
    const { items, email, gaClientId } = parsed.data;

    // Aggregate qty per productId so duplicate line items can't bypass
    // the availability check (F#4 fix).
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty);
    }
    const uniqueProductIds = [...qtyByProduct.keys()];
    const productRefs = uniqueProductIds.map((id) => db.collection("products").doc(id));

    // Resolve products.
    const productSnaps = await db.getAll(...productRefs);
    const products: { id: string; product: ReturnType<typeof productSchema.parse> }[] = [];
    for (let i = 0; i < productSnaps.length; i++) {
      const s = productSnaps[i];
      if (!s.exists) {
        res.status(400).json({ error: `unknown product ${uniqueProductIds[i]}` });
        return;
      }
      const p = productSchema.parse(s.data());
      if (p.status !== "active") {
        res.status(400).json({ error: "product not available" });
        return;
      }
      products.push({ id: s.id, product: p });
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
      const unit = salePrices.get(p.id) ?? p.product.basePriceCents;
      return { item, product: p, unitPriceCents: unit };
    });
    const totalCents = priced.reduce((s, x) => s + x.unitPriceCents * x.item.qty, 0);
    const vatTotal = priced.reduce(
      (s, x) => s + vatCents(x.unitPriceCents * x.item.qty, x.product.product.vatRate),
      0,
    );

    const expiresAt = new Date(now.getTime() + LOCK_MS);

    // Placeholder session ID for the pre-Stripe checkout doc. The doc is
    // created inside the reservation tx to prevent orphan reservations.
    const tempSessionId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingRef = db.collection("checkoutSessions").doc(tempSessionId);

    const sessionPayload = {
      items: priced.map((x) => ({
        productId: x.product.id,
        name: x.product.product.name,
        qty: x.item.qty,
        unitPriceCents: x.unitPriceCents,
        vatRate: x.product.product.vatRate,
      })),
      amounts: {
        subtotalCents: totalCents - vatTotal,
        vatCents: vatTotal,
        totalCents,
        currency: "EUR" as const,
      },
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      ...(gaClientId ? { gaClientId } : {}),
    };

    // 1) Atomic reservation + checkout session doc + inventory locks.
    //    The checkout session starts in "reserving" — webhook/expireLocks
    //    know to wait for "reserved" before acting on it.
    try {
      await db.runTransaction(async (tx) => {
        // Re-read inside tx for isolation (aggregate qty per product).
        const snaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
        for (let i = 0; i < snaps.length; i++) {
          const p = productSchema.parse(snaps[i].data());
          const available = p.stockQuantity - p.reservedQuantity;
          const needed = qtyByProduct.get(uniqueProductIds[i])!;
          if (available < needed) {
            throw new Error(`sold out: ${p.name}`);
          }
        }
        // Increment reservedQuantity per product (aggregated).
        for (let i = 0; i < productRefs.length; i++) {
          tx.update(productRefs[i], {
            reservedQuantity: FieldValue.increment(qtyByProduct.get(uniqueProductIds[i])!),
          });
        }
        // Write checkout session doc (status "reserving" — not yet usable).
        tx.set(pendingRef, { ...sessionPayload, status: "reserving" });
        // Write inventory lock docs.
        for (const x of priced) {
          tx.set(db.collection("inventoryLocks").doc(), {
            productId: x.product.id,
            qty: x.item.qty,
            stripeSessionId: tempSessionId,
            expiresAt: expiresAt.toISOString(),
          });
        }
      });
    } catch (e) {
      logger.warn("reservation failed", { error: String(e) });
      res.status(409).json({ error: String(e instanceof Error ? e.message : e) });
      return;
    }

    // 2) Stripe Checkout session (min expiry 30 min == lock TTL).
    const stripe = new Stripe(stripeSecretKey.value());
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
            product_data: { name: x.product.product.name, metadata: { productId: x.product.id } },
          },
        })),
        success_url: `${storeBaseUrl.value()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${storeBaseUrl.value()}/checkout/cancel`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        shipping_address_collection: { allowed_countries: ["FI", "SE", "DK", "DE", "NL", "EE", "FR", "ES", "IT", "AT", "BE", "IE", "PT", "PL"] },
      });
    } catch (e) {
      // Compensating release — roll back the reservation + mark session released.
      await db.runTransaction(async (tx) => {
        for (let i = 0; i < productRefs.length; i++) {
          tx.update(productRefs[i], {
            reservedQuantity: FieldValue.increment(-qtyByProduct.get(uniqueProductIds[i])!),
          });
        }
        tx.update(pendingRef, { status: "released" });
      });
      logger.error("stripe session failed; reservation rolled back", { error: String(e) });
      res.status(502).json({ error: "payment provider error" });
      return;
    }

    // 3) Promote to "reserved" and re-key to the real Stripe session ID.
    //    The webhook will look up by session.id, so we need the doc keyed
    //    by that ID. Also update lock docs to reference the Stripe session.
    const realRef = db.collection("checkoutSessions").doc(session.id);
    const batch = db.batch();
    batch.set(realRef, { ...sessionPayload, status: "reserved" });
    batch.delete(pendingRef);
    // Update inventory locks to reference the Stripe session ID.
    const lockSnaps = await db
      .collection("inventoryLocks")
      .where("stripeSessionId", "==", tempSessionId)
      .get();
    for (const lockSnap of lockSnaps.docs) {
      batch.update(lockSnap.ref, { stripeSessionId: session.id });
    }
    await batch.commit();

    logger.info("createCheckoutSession done", { sessionId: session.id, totalCents });
    res.json({ checkoutUrl: session.url, sessionId: session.id });
  },
);
