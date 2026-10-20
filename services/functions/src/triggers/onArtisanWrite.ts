import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { revalidateToken } from "../config.js";
import { revalidateStorefront } from "../lib/storefront.js";

/** Purge artisan cache on any artisan doc change. */
export const onArtisanWrite = onDocumentWritten(
  { document: "artisans/{id}", secrets: [revalidateToken] },
  async () => {
    logger.info("onArtisanWrite: revalidating artisans + products");
    await revalidateStorefront("artisans");
    await revalidateStorefront("products");
  },
);
