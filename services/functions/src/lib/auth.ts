import { HttpsError } from "firebase-functions/v2/https";

/** Require admin claim on a callable request. Throws permission-denied if missing. */
export function requireAdmin(req: { auth?: { token: Record<string, unknown> } | null }): void {
  if (req.auth?.token.admin !== true) {
    throw new HttpsError("permission-denied", "admin only");
  }
}
