import { logger } from "firebase-functions/v2";
import { revalidateToken, storefrontUrl } from "../config.js";

/** Purge the storefront ISR cache after content writes (all tags when none given). */
export async function revalidateStorefront(tag?: string): Promise<void> {
  try {
    await fetch(`${storefrontUrl.value()}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-token": revalidateToken.value(),
      },
      body: JSON.stringify(tag ? { tag } : {}),
    });
  } catch (e) {
    logger.warn("storefront revalidate failed", { error: `${e}` });
  }
}
