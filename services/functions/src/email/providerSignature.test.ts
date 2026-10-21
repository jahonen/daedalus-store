import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyEmailWebhook } from "./providerSignature.js";
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const now = Date.now();
const timestamp = String(Math.floor(now / 1000));
const body = Buffer.from('[{"event":"delivered","text":"café"}]');
const signature = sign(
  "sha256",
  Buffer.concat([Buffer.from(timestamp), body]),
  keys.privateKey,
).toString("base64");
describe("signed provider feedback", () => {
  it("verifies ECDSA over exact timestamp plus raw bytes", () =>
    expect(verifyEmailWebhook(publicKey, timestamp, signature, body, now)).toBe(true));
  it("rejects altered raw bytes", () =>
    expect(verifyEmailWebhook(publicKey, timestamp, signature, Buffer.from("[]"), now)).toBe(
      false,
    ));
  it("rejects stale signatures", () =>
    expect(verifyEmailWebhook(publicKey, timestamp, signature, body, now + 2 * 86400000)).toBe(
      false,
    ));
  it("rejects malformed keys", () =>
    expect(verifyEmailWebhook("not a key", timestamp, signature, body, now)).toBe(false));
});
