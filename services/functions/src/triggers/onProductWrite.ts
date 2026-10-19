import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { revalidateToken } from "../config.js";
import { revalidateStorefront } from "../lib/storefront.js";

/** Purge product cache on any product doc change. */
export const onProductWrite = onDocumentWritten(
  { document: "products/{id}", secrets: [revalidateToken] },
  async () => {
    logger.info("onProductWrite: revalidating products");
    await revalidateStorefront("products");
  },
);
