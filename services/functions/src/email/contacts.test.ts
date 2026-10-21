import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const memory = vi.hoisted(() => ({ data: new Map<string, Record<string, unknown>>(), count: 0 }));
vi.mock("../admin.js", () => {
  const ref = (path: string) => ({ id: path.split("/").at(-1), path });
  return {
    db: {
      doc: ref,
      collection: (path: string) => ({ doc: () => ref(`${path}/event-${memory.count++}`) }),
      runTransaction: async (handler: (tx: unknown) => unknown) =>
        handler({
          get: async (reference: { path: string }) => ({
            exists: memory.data.has(reference.path),
            data: () => memory.data.get(reference.path),
            get: (key: string) => memory.data.get(reference.path)?.[key],
          }),
          update: (reference: { path: string }, data: Record<string, unknown>) =>
            memory.data.set(reference.path, { ...memory.data.get(reference.path), ...data }),
          create: (reference: { path: string }, data: Record<string, unknown>) =>
            memory.data.set(reference.path, data),
        }),
    },
  };
});
vi.mock("firebase-functions/v2/https", () => ({
  onRequest: (...args: unknown[]) => args.at(-1),
  onCall: (...args: unknown[]) => args.at(-1),
  HttpsError: Error,
}));
vi.mock("./outbox.js", () => ({ enqueueEmail: vi.fn() }));
import { newsletterAction, newsletterOneClick } from "./contacts.js";

const token = "a".repeat(64);
const tokenPath = `emailTokens/${createHash("sha256").update(token).digest("hex")}`;
const response = () => ({
  set: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
});
const invoke = (handler: unknown, request: unknown, res: unknown) =>
  (handler as (req: unknown, res: unknown) => Promise<void>)(request, res);
beforeEach(() => {
  memory.data.clear();
  memory.count = 0;
  memory.data.set("emailContacts/contact", {
    status: "pending",
    generation: "current",
    requestedMeasurement: true,
  });
});
describe("newsletter HTTP consent contract", () => {
  it("never grants consent via scanner GET", async () => {
    memory.data.set(tokenPath, { contactId: "contact", purpose: "confirm", generation: "current" });
    const res = response();
    await invoke(newsletterAction, { method: "GET", body: { token, action: "confirm" } }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(memory.data.get("emailContacts/contact")?.status).toBe("pending");
  });
  it("records newsletter and optional measurement grants independently", async () => {
    memory.data.set(tokenPath, { contactId: "contact", purpose: "confirm", generation: "current" });
    await invoke(
      newsletterAction,
      { method: "POST", body: { token, action: "confirm", measurement: true } },
      response(),
    );
    expect(memory.data.get("emailContacts/contact")).toMatchObject({
      status: "confirmed",
      measurement: true,
    });
    expect(
      [...memory.data.entries()]
        .filter(([key]) => key.startsWith("emailConsentEvents/"))
        .map(([, value]) => value.purpose)
        .sort(),
    ).toEqual(["newsletter", "openMeasurement"]);
  });
  it("does not infer measurement permission from the original request alone", async () => {
    memory.data.set(tokenPath, { contactId: "contact", purpose: "confirm", generation: "current" });
    await invoke(
      newsletterAction,
      { method: "POST", body: { token, action: "confirm" } },
      response(),
    );
    expect(memory.data.get("emailContacts/contact")).toMatchObject({
      status: "confirmed",
      measurement: false,
    });
  });
  it("does not let old DOI links undo withdrawal", async () => {
    memory.data.set(tokenPath, { contactId: "contact", purpose: "confirm", generation: "old" });
    const res = response();
    await invoke(newsletterAction, { method: "POST", body: { token, action: "confirm" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("allows immediate one-click POST without login", async () => {
    memory.data.set(tokenPath, { contactId: "contact", purpose: "preferences" });
    await invoke(newsletterOneClick, { method: "POST", query: { token } }, response());
    expect(memory.data.get("emailContacts/contact")).toMatchObject({
      status: "unsubscribed",
      measurement: false,
    });
  });
  it("can withdraw measurement without unsubscribing", async () => {
    memory.data.set("emailContacts/contact", { status: "confirmed", measurement: true });
    memory.data.set(tokenPath, { contactId: "contact", purpose: "preferences" });
    await invoke(
      newsletterAction,
      { method: "POST", body: { token, action: "disableMeasurement" } },
      response(),
    );
    expect(memory.data.get("emailContacts/contact")).toMatchObject({
      status: "confirmed",
      measurement: false,
    });
  });
});
