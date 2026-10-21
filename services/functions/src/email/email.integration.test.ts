import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, terminate, type Firestore } from "firebase/firestore";

const projectId = "demo-daedalus-mailer";
const enabled = process.env.GCLOUD_PROJECT === projectId && !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.skipIf(!enabled)("mailer emulator security and concurrency", () => {
  let server: typeof import("../admin.js");
  let outbox: typeof import("./outbox.js");
  let guest: Firestore;
  let admin: Firestore;
  const apps: FirebaseApp[] = [];
  beforeAll(async () => {
    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST!;
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
    if (![firestoreHost, authHost].every((host) => /^(127\.0\.0\.1|localhost):\d+$/.test(host))) throw new Error("Emulator tests require loopback hosts");
    server = await import("../admin.js");
    outbox = await import("./outbox.js");
    const [host, port] = firestoreHost.split(":");
    const makeApp = () => { const app = initializeApp({ projectId, apiKey: "demo-api-key" }, randomUUID()); apps.push(app); return app; };
    const guestApp = makeApp();
    guest = getFirestore(guestApp); connectFirestoreEmulator(guest, host, Number(port));
    const adminApp = makeApp();
    const auth = getAuth(adminApp); connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const user = await signInAnonymously(auth);
    await server.auth.setCustomUserClaims(user.user.uid, { admin: true });
    await user.user.getIdToken(true);
    admin = getFirestore(adminApp); connectFirestoreEmulator(admin, host, Number(port));
    await server.db.doc("settings/company").set({ legalName: "Test company" });
    await server.db.doc("settings/email").set({ marketingPaused: true });
    await server.db.doc("settings/integrations").set({ privateTestMarker: true });
  }, 30000);
  afterAll(async () => {
    if (guest) await terminate(guest);
    if (admin) await terminate(admin);
    await Promise.all(apps.map((app) => deleteApp(app)));
    if (server) await server.db.terminate();
  });
  it("allows public company reads but not private integrations or email data", async () => {
    expect((await getDoc(doc(guest, "settings/company"))).exists()).toBe(true);
    await expect(getDoc(doc(guest, "settings/integrations"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(guest, "emailContacts/unknown"))).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("prevents browser admins bypassing consent/outbox/settings callables", async () => {
    expect((await getDoc(doc(admin, "settings/email"))).exists()).toBe(true);
    for (const path of ["settings/email", "emailContacts/forged", "emailConsentEvents/forged", "emailDeliveries/forged"]) {
      await expect(setDoc(doc(admin, path), { status: "confirmed" })).rejects.toMatchObject({ code: "permission-denied" });
    }
  });
  it("deduplicates simultaneous outbox writes and service contact creation", async () => {
    const key = `emulator:${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    const ids = await Promise.all(Array.from({ length: 12 }, () => outbox.enqueueEmail(key, { to: email, subject: "Test", text: "Test", html: "Test", kind: "transactional" })));
    expect(new Set(ids).size).toBe(1);
    const delivery = await server.db.doc(`emailDeliveries/${ids[0]}`).get();
    expect(delivery.get("status")).toBe("queued");
    const contact = await server.db.doc(`emailContacts/${delivery.get("contactId")}`).get();
    expect(contact.get("status")).toBe("not_subscribed");
  }, 30000);
});
