import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "daedalus-store",
  appId: "1:229074810509:web:24f78abffa42653e4f14c4",
  storageBucket: "daedalus-store.firebasestorage.app",
  apiKey: "AIzaSyCsM30Ge3kllFuwNCGy2jNKGJl4JBBUFK4",
  authDomain: "daedalus-store.firebaseapp.com",
  messagingSenderId: "229074810509",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
/** onCall functions live in europe-north1 — the region arg matters. */
export const fns = getFunctions(app, "europe-north1");
export const storage = getStorage(app);
export const storageBucket = firebaseConfig.storageBucket;
export const googleProvider = new GoogleAuthProvider();
