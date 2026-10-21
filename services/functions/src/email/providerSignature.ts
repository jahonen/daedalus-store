import { createPublicKey, verify } from "node:crypto";

export function verifyEmailWebhook(
  publicKey: string,
  timestamp: string,
  signature: string,
  body: Buffer,
  now = Date.now(),
): boolean {
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 86400 ||
    body.length > 1000000
  )
    return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(
      "sha256",
      Buffer.concat([Buffer.from(timestamp), body]),
      key,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}
