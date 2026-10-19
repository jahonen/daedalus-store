import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { revalidateToken } from "../config.js";
import { revalidateStorefront } from "../lib/storefront.js";

/** Purge campaign cache on any campaign doc change. */
export const onCampaignWrite = onDocumentWritten(
  { document: "campaigns/{id}", secrets: [revalidateToken] },
  async () => {
    logger.info("onCampaignWrite: revalidating campaigns");
    await revalidateStorefront("campaigns");
  },
);
