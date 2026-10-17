import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { revalidateToken } from "../config.js";
import { revalidateStorefront } from "../lib/storefront.js";

/** Purge storefront caches when company/branding settings change. */
export const onSettingsWrite = onDocumentWritten(
  { document: "settings/{docId}", secrets: [revalidateToken] },
  async () => {
    await revalidateStorefront();
  },
);
