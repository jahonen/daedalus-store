import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { revalidateToken } from "../config.js";
import { revalidateStorefront } from "../lib/storefront.js";

/** Purge media cache on any media doc change. */
export const onMediaWrite = onDocumentWritten(
  { document: "media/{id}", secrets: [revalidateToken] },
  async () => {
    logger.info("onMediaWrite: revalidating media");
    await revalidateStorefront("media");
  },
);
