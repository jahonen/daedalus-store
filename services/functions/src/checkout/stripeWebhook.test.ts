import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  event: {} as Record<string, unknown>,
  emails: vi.fn(),
  seq: 0,
}));
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: () => state.event };
    checkout = { sessions: { list: async () => ({ data: [{ id: "cs_example" }] }) } };
  },
}));
vi.mock("../config.js", () => ({
  stripeSecretKey: { value: () => "test" },
  stripeWebhookSecret: { value: () => "test" },
}));
vi.mock("../email/orderEmails.js", () => ({ enqueueOrderEmail: state.emails }));
vi.mock("firebase-functions/v2/https", () => ({ onRequest: (...args: unknown[]) => args.at(-1) }));
vi.mock("../admin.js", () => {
  const value = (data: Record<string, unknown> | undefined, path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (result, key) => (result as Record<string, unknown> | undefined)?.[key],
        data,
      );
  const ref = (path: string) => ({
    id: path.split("/").at(-1),
    path,
    get: async () => snapshot(path),
  });
  const snapshot = (path: string) => ({
    id: path.split("/").at(-1),
    ref: ref(path),
    exists: state.data.has(path),
    data: () => state.data.get(path),
    get: (key: string) => value(state.data.get(path), key),
  });
  const collection = (name: string, filters: [string, unknown][] = []) => ({
    doc: (id?: string) => ref(`${name}/${id ?? `generated-${state.seq++}`}`),
    where: (field: string, _op: string, expected: unknown) =>
      collection(name, [...filters, [field, expected]]),
    limit: () => collection(name, filters),
    get: async () => {
      const docs = [...state.data.keys()]
        .filter(
          (path) =>
            path.startsWith(`${name}/`) &&
            filters.every(([key, expected]) => value(state.data.get(path), key) === expected),
        )
        .map(snapshot);
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    db: {
      doc: ref,
      collection,
      runTransaction: async (handler: (tx: unknown) => unknown) =>
        handler({
          get: async (reference: { path: string }) => snapshot(reference.path),
          update: (reference: { path: string }, data: Record<string, unknown>) =>
            state.data.set(reference.path, { ...state.data.get(reference.path), ...data }),
          set: (reference: { path: string }, data: Record<string, unknown>) =>
            state.data.set(reference.path, data),
          delete: (reference: { path: string }) => state.data.delete(reference.path),
        }),
    },
  };
});
import { stripeWebhook } from "./stripeWebhook.js";
const session = {
  id: "cs_example",
  payment_status: "paid",
  payment_intent: "pi_example",
  customer_details: { email: "customer@example.com", name: "Customer" },
};
const response = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn() });
const invoke = () =>
  (stripeWebhook as unknown as (request: unknown, response: unknown) => Promise<void>)(
    { rawBody: Buffer.from(""), headers: { "stripe-signature": "signed" } },
    response(),
  );
beforeEach(() => {
  state.data.clear();
  state.emails.mockReset();
  state.seq = 0;
  state.data.set("checkoutSessions/cs_example", {
    items: [{ productId: "bag", name: "Bag", qty: 1, unitPriceCents: 10000, vatRate: 0.255 }],
    amounts: { subtotalCents: 7968, vatCents: 2032, totalCents: 10000, currency: "EUR" },
    status: "reserved",
    expiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  state.data.set("products/bag", { stockQuantity: 1, reservedQuantity: 1 });
  state.event = { type: "checkout.session.completed", data: { object: session } };
});
describe("checkout notification/payment regression", () => {
  it("does not create a paid order for a completed unpaid session", async () => {
    state.event = {
      type: "checkout.session.completed",
      data: { object: { ...session, payment_status: "unpaid" } },
    };
    await invoke();
    expect(state.data.get("checkoutSessions/cs_example")?.status).toBe("awaiting_payment");
    expect([...state.data.keys()].filter((path) => path.startsWith("orders/"))).toHaveLength(0);
  });
  it("creates only one order for replayed paid webhooks", async () => {
    await invoke();
    await invoke();
    const orders = [...state.data.entries()].filter(([path]) => path.startsWith("orders/"));
    expect(orders).toHaveLength(1);
    expect(orders[0][1]).toMatchObject({
      stripePaymentIntentId: "pi_example",
      status: "PENDING_FULFILLMENT",
    });
  });
  it("accepts async success from awaiting payment", async () => {
    state.data.set("checkoutSessions/cs_example", {
      ...state.data.get("checkoutSessions/cs_example"),
      status: "awaiting_payment",
    });
    state.event = { type: "checkout.session.async_payment_succeeded", data: { object: session } };
    await invoke();
    expect(state.data.get("checkoutSessions/cs_example")?.status).toBe("consumed");
  });
  it("releases async failure without creating an order", async () => {
    state.data.set("checkoutSessions/cs_example", {
      ...state.data.get("checkoutSessions/cs_example"),
      status: "awaiting_payment",
    });
    state.event = { type: "checkout.session.async_payment_failed", data: { object: session } };
    await invoke();
    expect(state.data.get("checkoutSessions/cs_example")?.status).toBe("released");
    expect(state.emails).toHaveBeenCalledWith(
      "checkout:cs_example:failed",
      "customer@example.com",
      expect.any(String),
      expect.any(String),
    );
  });
  it("does not announce a pending refund as completed", async () => {
    state.event = {
      type: "refund.created",
      data: {
        object: { id: "re_test", status: "pending", payment_intent: "pi_example", amount: 1000 },
      },
    };
    await invoke();
    expect(state.emails).not.toHaveBeenCalled();
  });
  it("resolves legacy orders through the Stripe Checkout session", async () => {
    state.data.set("orders/legacy", {
      stripeSessionId: "cs_example",
      status: "FULFILLED",
      amounts: { totalCents: 10000 },
      customer: { email: "customer@example.com" },
    });
    state.event = {
      type: "refund.updated",
      data: {
        object: {
          id: "re_legacy",
          status: "succeeded",
          payment_intent: "pi_example",
          amount: 10000,
        },
      },
    };
    await invoke();
    expect(state.data.get("orders/legacy")).toMatchObject({
      stripePaymentIntentId: "pi_example",
      status: "REFUNDED",
      refundedCents: 10000,
    });
  });
  it("keys successful partial refund notifications by actual refund ID", async () => {
    state.data.set("orders/paid", {
      stripePaymentIntentId: "pi_example",
      stripeSessionId: "cs_example",
      status: "FULFILLED",
      amounts: { totalCents: 10000 },
      customer: { email: "customer@example.com" },
    });
    state.event = {
      type: "refund.updated",
      data: {
        object: {
          id: "re_partial",
          status: "succeeded",
          payment_intent: "pi_example",
          amount: 1000,
        },
      },
    };
    await invoke();
    await invoke();
    expect(state.emails).toHaveBeenCalledWith(
      "refund:re_partial:succeeded",
      "customer@example.com",
      "Refund confirmed",
      expect.stringContaining("re_partial"),
    );
    expect(state.data.get("orders/paid")).toMatchObject({
      status: "FULFILLED",
      refundedCents: 1000,
    });
    state.event = {
      type: "refund.updated",
      data: {
        object: {
          id: "re_remaining",
          status: "succeeded",
          payment_intent: "pi_example",
          amount: 9000,
        },
      },
    };
    await invoke();
    expect(state.data.get("orders/paid")).toMatchObject({
      status: "REFUNDED",
      refundedCents: 10000,
    });
  });
});
