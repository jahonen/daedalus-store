import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: new Map<string, Record<string, unknown>>(), sequence: 0 }));
vi.mock("firebase-functions/v2/https", () => ({ onCall: (...args: unknown[]) => args.at(-1), HttpsError: Error }));
vi.mock("../admin.js", () => {
  const apply = (path: string, data: Record<string, unknown>, replace = false) => {
    const result = replace ? {} : { ...state.data.get(path) };
    for (const [key, value] of Object.entries(data)) {
      if ((value as { methodName?: string })?.methodName === "FieldValue.delete") delete result[key];
      else result[key] = value;
    }
    state.data.set(path, result);
  };
  const ref = (path: string) => ({ id: path.split("/").at(-1), path, get: async () => snapshot(path) });
  const snapshot = (path: string) => ({ id: path.split("/").at(-1), ref: ref(path), exists: state.data.has(path), data: () => state.data.get(path), get: (key: string) => state.data.get(path)?.[key] });
  const collection = (name: string, id?: string) => ({
    doc: () => ref(`${name}/event-${state.sequence++}`),
    where: (_field: string, _op: string, value: string) => collection(name, value),
    orderBy: () => collection(name, id), limit: () => collection(name, id), startAfter: () => collection(name, id),
    count: () => ({ get: async () => ({ data: () => ({ count: [...state.data.entries()].filter(([key, value]) => key.startsWith(`${name}/`) && value.contactId === id).length }) }) }),
    get: async () => { const docs = [...state.data.entries()].filter(([key, value]) => key.startsWith(`${name}/`) && value.contactId === id).map(([key]) => snapshot(key)); return { docs, size: docs.length }; },
  });
  return { db: {
    doc: ref, collection,
    runTransaction: async (handler: (tx: unknown) => unknown) => handler({ get: async (reference: { path: string }) => snapshot(reference.path), set: (reference: { path: string }, data: Record<string, unknown>) => apply(reference.path, data, true), create: (reference: { path: string }, data: Record<string, unknown>) => apply(reference.path, data, true) }),
    batch: () => ({ update: (reference: { path: string }, data: Record<string, unknown>) => apply(reference.path, data), commit: async () => [] }),
  } };
});
import { redactEmailContact } from "./privacy.js";
const id = "123e4567-e89b-42d3-a456-426614174000";
const invoke = (data: unknown) => (redactEmailContact as unknown as (req: unknown) => Promise<unknown>)({ data, auth: { uid: "operator", token: { admin: true } } });
beforeEach(() => {
  state.data.clear();
  state.data.set(`emailContacts/${id}`, { email: "customer@example.com", status: "confirmed", measurement: true });
  state.data.set("emailDeliveries/marketing", { contactId: id, kind: "marketing", to: "customer@example.com", html: "Private content", text: "Private content", headers: { link: "token" }, subject: "News", status: "queued" });
  state.data.set("emailDeliveries/service", { contactId: id, kind: "transactional", to: "customer@example.com", text: "Order details", status: "accepted" });
  state.data.set("emailTokens/preference", { contactId: id, purpose: "preferences" });
  state.data.set("emailConsentEvents/import", { contactId: id, evidence: "Personal consent evidence" });
  state.data.set("orders/retained", { customer: "customer@example.com" });
});
describe("newsletter privacy operations", () => {
  it("previews scope without changing data", async () => {
    await expect(invoke({ contactId: id, dryRun: true })).resolves.toMatchObject({ dryRun: true, deliveryRecordsToReview: 2 });
    expect(state.data.get(`emailContacts/${id}`)?.email).toBe("customer@example.com");
  });
  it("requires a separate explicit irreversible-action confirmation", async () => {
    await expect(invoke({ contactId: id, dryRun: false })).rejects.toThrow();
    expect(state.data.get(`emailContacts/${id}`)?.status).toBe("confirmed");
  });
  it("redacts newsletter data while retaining legal/service records", async () => {
    await invoke({ contactId: id, dryRun: false, confirmation: "REDACT NEWSLETTER DATA" });
    expect(state.data.get(`emailContacts/${id}`)).toMatchObject({ status: "erased", measurement: false });
    expect(state.data.get(`emailContacts/${id}`)).not.toHaveProperty("email");
    expect(state.data.get("emailDeliveries/marketing")).not.toHaveProperty("html");
    expect(state.data.get("emailDeliveries/marketing")).toMatchObject({ status: "suppressed" });
    expect(state.data.get("emailDeliveries/service")?.text).toBe("Order details");
    expect(state.data.get("orders/retained")?.customer).toBe("customer@example.com");
    expect(state.data.get("emailTokens/preference")?.purpose).toBe("revoked");
    expect(state.data.get("emailConsentEvents/import")).not.toHaveProperty("evidence");
  });
});
