import { HttpsError } from "firebase-functions/v2/https";
import type { EmailContent } from "@daedalus/shared";
import { bucket, db } from "../admin.js";

export function trustedEmailImage(value: string) {
  const url = new URL(value);
  const prefix = `/v0/b/${bucket.name}/o/`;
  return (
    url.protocol === "https:" &&
    url.hostname === "firebasestorage.googleapis.com" &&
    url.pathname.startsWith(prefix) &&
    decodeURIComponent(url.pathname.slice(prefix.length)).startsWith("public/")
  );
}
export async function validateCampaignContent(
  content: EmailContent,
  base: string,
  logoUrl?: string,
) {
  const productIds: string[] = [];
  for (const image of [
    ...content.blocks.filter((block) => block.type === "image").map((block) => block.url),
    ...(logoUrl ? [logoUrl] : []),
  ]) {
    if (!trustedEmailImage(image))
      throw new HttpsError("invalid-argument", "Use public images from this store's media library");
  }
  for (const block of content.blocks) {
    if (block.type !== "button") continue;
    const url = new URL(block.url);
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith("/products/")) continue;
    const slug = decodeURIComponent(url.pathname.slice("/products/".length));
    const found = await db.collection("products").where("slug", "==", slug).limit(1).get();
    const product = found.docs[0];
    if (!product || product.get("status") !== "active")
      throw new HttpsError(
        "failed-precondition",
        "Product buttons must link to active products; draft products can only be discussed as upcoming",
      );
    productIds.push(product.id);
  }
  return [...new Set(productIds)];
}
