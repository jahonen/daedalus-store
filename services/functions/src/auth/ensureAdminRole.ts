import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { auth, db } from "../admin.js";

const ADMIN_DOMAIN = "@cvpe.dev";

/**
 * Called by the admin app right after Google sign-in.
 * Any authenticated user whose email is @cvpe.dev is created in `admins`
 * and promoted via the `admin` custom claim. Other domains are rejected
 * (the claim is revoked defensively).
 */
export const ensureAdminRole = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "sign in first");
  const { uid, token } = req.auth;
  const email = (token.email as string | undefined) ?? "";
  logger.info("ensureAdminRole start", { uid });

  if (!email.endsWith(ADMIN_DOMAIN)) {
    if (token.admin) await auth.setCustomUserClaims(uid, { admin: false });
    logger.warn("ensureAdminRole rejected domain", { uid });
    throw new HttpsError("permission-denied", "admin domain required");
  }

  await auth.setCustomUserClaims(uid, { admin: true });
  await db.collection("admins").doc(uid).set(
    { email, role: "admin", createdAt: new Date().toISOString() },
    { merge: true },
  );
  logger.info("ensureAdminRole done", { uid });
  return { admin: true };
});
