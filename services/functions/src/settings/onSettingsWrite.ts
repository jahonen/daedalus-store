import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { revalidateToken } from "../config.js";
import { revalidateStorefront } from "../lib/storefront.js";

/** Purge storefront caches when company/branding settings change. */
export const onSettingsWrite = onDocumentWritten(
  { document: "settings/{docId}", secrets: [revalidateToken] },
  async (event) => {
    const docId = event.params.docId;
    logger.info("onSettingsWrite", { docId });
    // Narrow revalidation to the affected tag.
    if (docId === "company") {
      await revalidateStorefront("company");
    } else if (docId === "branding") {
      await revalidateStorefront("media");
    } else {
      // Unknown settings doc — purge all to be safe.
      await revalidateStorefront();
    }
  },
);
