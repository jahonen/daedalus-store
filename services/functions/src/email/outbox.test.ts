import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  send: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("../admin.js", () => {
  const reference = (path: string) => ({
    id: path.split("/").at(-1),
    path,
    update: async (data: Record<string, unknown>) =>
      state.data.set(path, { ...state.data.get(path), ...data }),
  });
  return {
    db: {
      doc: reference,
      collection: (path: string) => ({ doc: (id: string) => reference(`${path}/${id}`) }),
      runTransaction: async (handler: (tx: unknown) => unknown) =>
        handler({
          get: async (ref: { path: string }) => ({
            exists: state.data.has(ref.path),
            data: () => state.data.get(ref.path),
            get: (key: string) => state.data.get(ref.path)?.[key],
          }),
          create: (ref: { path: string }, data: Record<string, unknown>) => {
            if (state.data.has(ref.path)) throw new Error("duplicate");
            state.data.set(ref.path, data);
          },
          update: (ref: { path: string }, data: Record<string, unknown>) =>
            state.data.set(ref.path, { ...state.data.get(ref.path), ...data }),
        }),
    },
  };
});
vi.mock("firebase-admin/functions", () => ({
  getFunctions: () => ({ taskQueue: () => ({ enqueue: state.enqueue }) }),
}));
vi.mock("firebase-functions/v2/tasks", () => ({
  onTaskDispatched: (...args: unknown[]) => args.at(-1),
}));
vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentCreated: (...args: unknown[]) => args.at(-1),
}));
vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (...args: unknown[]) => args.at(-1),
}));
vi.mock("./sendgrid.js", () => ({ sendEmail: state.send }));
import { deliveryKey, deliverMarketingEmail as deliverEmail, deliverTransactionalEmail as deliverServiceEmail, enqueueEmail } from "./outbox.js";
const id = deliveryKey("test");
const path = `emailDeliveries/${id}`;
const invoke = () =>
  (
    (state.data.get(path)?.kind === "marketing"
      ? deliverEmail
      : deliverServiceEmail) as unknown as (req: unknown) => Promise<void>
  )({ data: { deliveryId: id } });
beforeEach(() => {
  state.data.clear();
  state.send.mockReset();
  state.send.mockResolvedValue("message-1");
  state.data.set("settings/email", { marketingPaused: false });
  state.data.set("emailContacts/contact", { status: "confirmed", measurement: false });
  state.data.set(path, {
    to: "hello@example.com",
    subject: "Test",
    text: "Test",
    html: "Test",
    kind: "marketing",
    contactId: "contact",
    status: "queued",
    attempts: 0,
  });
});
describe("durable email delivery", () => {
  it("deduplicates outbox creation and does not subscribe service contacts", async () => {
    const message = {
      to: "customer@example.com",
      subject: "Order",
      text: "Paid",
      html: "Paid",
      kind: "transactional" as const,
    };
    await enqueueEmail("order:1", message);
    await enqueueEmail("order:1", message);
    const created = [...state.data.keys()].filter((key) => key.startsWith("emailDeliveries/"));
    expect(created).toHaveLength(2);
    expect(
      [...state.data.entries()]
        .filter(([key]) => key.startsWith("emailContacts/"))
        .some(([, value]) => value.status === "not_subscribed"),
    ).toBe(true);
  });
  it("respects marketing pause at submission time", async () => {
    state.data.set("settings/email", { marketingPaused: true });
    await invoke();
    expect(state.send).not.toHaveBeenCalled();
    expect(state.data.get(path)?.status).toBe("queued");
  });
  it("rechecks withdrawn recipients after campaign preparation", async () => {
    state.data.set("emailContacts/contact", { status: "unsubscribed" });
    await invoke();
    expect(state.send).not.toHaveBeenCalled();
    expect(state.data.get(path)?.status).toBe("suppressed");
  });
  it("does not let marketing unsubscribe block service email", async () => {
    state.data.set("emailContacts/contact", { status: "unsubscribed" });
    state.data.set(path, { ...state.data.get(path), kind: "transactional" });
    await invoke();
    expect(state.send).toHaveBeenCalledOnce();
    expect(state.send.mock.calls[0][0].trackOpens).toBe(false);
  });
  it("never automatically retries uncertain transport acceptance", async () => {
    state.send.mockRejectedValue(new Error("socket closed"));
    await invoke();
    expect(state.data.get(path)?.status).toBe("ambiguous");
    await invoke();
    expect(state.send).toHaveBeenCalledOnce();
  });
  it("retries a rate limit with a bounded attempt counter", async () => {
    state.send.mockRejectedValue({ code: 429 });
    await expect(invoke()).rejects.toThrow("Transient");
    expect(state.data.get(path)).toMatchObject({ status: "queued", attempts: 1 });
  });
  it("does not downgrade delivery feedback racing provider acceptance", async () => {
    state.send.mockImplementation(async () => {
      state.data.set(path, { ...state.data.get(path), status: "delivered" });
      return "message-1";
    });
    await invoke();
    expect(state.data.get(path)?.status).toBe("delivered");
  });
});
