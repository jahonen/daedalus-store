import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// On Cloud Run, Application Default Credentials use the compute SA
// (roles/datastore.user). Locally use the Firestore emulator or ADC.
if (!getApps().length) {
  initializeApp({ projectId: "daedalus-store" });
}

export const db = getFirestore();
