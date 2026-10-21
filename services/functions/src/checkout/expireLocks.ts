import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db } from "../admin.js";
import Stripe from "stripe";
import { stripeSecretKey } from "../config.js";
import { releaseReservation } from "./stripeWebhook.js";

/**
 * Safety net: sweep expired inventory locks every 5 minutes and return
 * reserved stock (covers webhook misses / abandoned sessions).
 *
 * releaseReservation checks status inside its transaction, so even if a
 * concurrent webhook is processing the same session, at most one of them
 * will actually decrement reservedQuantity.
 */
// Cloud Scheduler doesn't support europe-north1 — pin to europe-west3 (EEA).
export const expireLocks = onSchedule(
  { schedule: "every 5 minutes", region: "europe-west3", secrets: [stripeSecretKey] },
  async () => {
    logger.info("expireLocks start");
    const now = new Date().toISOString();
    const expired = await db
      .collection("inventoryLocks")
      .where("expiresAt", "<", now)
      .limit(200)
      .get();

    const sessionIds = [...new Set(expired.docs.map((d) => d.get("stripeSessionId") as string))];
    let released = 0;
    for (const sid of sessionIds) {
      // Skip sessions that already converted to orders.
      const order = await db
        .collection("orders")
        .where("stripeSessionId", "==", sid)
        .limit(1)
        .get();
      if (!order.empty) continue;
      if (sid.startsWith("cs_")) {
        const session = await new Stripe(stripeSecretKey.value()).checkout.sessions.retrieve(sid);
        if (session.status !== "expired") continue;
      }
      await releaseReservation(sid);
      released++;
    }
    logger.info("expireLocks done", { expiredLocks: expired.size, released });
  },
);
