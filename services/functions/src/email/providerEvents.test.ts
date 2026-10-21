import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: new Map<string, Record<string, unknown>>(), sequence: 0 }));
vi.mock("firebase-functions/v2/https", () => ({ onRequest: (...args: unknown[]) => args.at(-1) }));
vi.mock("./outbox.js", () => ({ deliveryKey: (value: string) => value }));
vi.mock("../admin.js", () => {
  const ref = (path: string) => ({
    id: path.split("/").at(-1),
    path,
    get: async () => snapshot(path),
    set: async (value: Record<string, unknown>) => state.data.set(path, value),
  });
  const snapshot = (path: string) => ({
    id: path.split("/").at(-1),
    ref: ref(path),
    exists: state.data.has(path),
    data: () => state.data.get(path),
    get: (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, name) => (value as Record<string, unknown> | undefined)?.[name],
          state.data.get(path),
        ),
  });
  return {
    db: {
      doc: ref,
      collection: (name: string) => ({ doc: () => ref(`${name}/generated-${state.sequence++}`) }),
      runTransaction: async (handler: (tx: unknown) => unknown) =>
        handler({
          get: async (reference: { path: string }) => snapshot(reference.path),
          create: (reference: { path: string }, value: Record<string, unknown>) =>
            state.data.set(reference.path, value),
          update: (reference: { path: string }, value: Record<string, unknown>) =>
            state.data.set(reference.path, { ...state.data.get(reference.path), ...value }),
        }),
    },
  };
});
import { sendgridEvents } from "./providerEvents.js";
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const id = "a".repeat(64);
async function event(type: string, eventId = "event-1", validSignature = true) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = [
    { sg_event_id: eventId, event: type, deliveryId: id, timestamp: Number(timestamp) },
  ];
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = validSignature
    ? sign("sha256", Buffer.concat([Buffer.from(timestamp), rawBody]), keys.privateKey).toString(
        "base64",
      )
    : "invalid";
  const res = { status: vi.fn().mockReturnThis(), end: vi.fn(), json: vi.fn() };
  await (sendgridEvents as unknown as (req: unknown, res: unknown) => Promise<void>)(
    {
      method: "POST",
      rawBody,
      body,
      get: (header: string) => (header.includes("Timestamp") ? timestamp : signature),
    },
    res,
  );
  return res;
}
beforeEach(() => {
  state.data.clear();
  state.data.set("settings/integrations", { sendgrid: { webhookPublicKey: publicKey } });
  state.data.set(`emailDeliveries/${id}`, {
    status: "accepted",
    kind: "marketing",
    trackingEligible: true,
    contactId: "contact",
    campaignId: "campaign",
    createdAt: new Date().toISOString(),
  });
  state.data.set("emailContacts/contact", { measurement: true, status: "confirmed" });
  state.data.set("emailCampaigns/campaign", { approximateOpens: 0 });
});
describe("provider feedback contracts", () => {
  it("rejects unsigned events before any state transition", async () => {
    const res = await event("delivered", "bad", false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(state.data.get(`emailDeliveries/${id}`)?.status).toBe("accepted");
  });
  it("deduplicates opens across repeated and distinct provider events", async () => {
    await event("open");
    await event("open");
    await event("open", "event-2");
    expect(state.data.get("emailCampaigns/campaign")?.approximateOpens).toBe(1);
  });
  it("does not persist open feedback after measurement withdrawal", async () => {
    state.data.set("emailContacts/contact", { measurement: false, status: "confirmed" });
    await event("open");
    expect(state.data.has("emailProviderEvents/event-1")).toBe(false);
    expect(state.data.get("emailCampaigns/campaign")?.approximateOpens).toBe(0);
  });
  it("does not downgrade a bounce on late delivered feedback", async () => {
    await event("bounce");
    await event("delivered", "late");
    expect(state.data.get(`emailDeliveries/${id}`)?.status).toBe("failed");
    expect(state.data.get("emailContacts/contact")?.suppression).toBe("bounce");
  });
  it("synchronizes unsubscribe without granting later consent", async () => {
    await event("unsubscribe");
    await event("group_resubscribe", "later");
    expect(state.data.get("emailContacts/contact")).toMatchObject({
      status: "unsubscribed",
      measurement: false,
    });
  });
});
