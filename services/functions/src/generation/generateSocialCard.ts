import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { storefrontPageSchema } from "@daedalus/shared";
import satori from "satori";
import sharp from "sharp";
import { bucket, db } from "../admin.js";

const fontPath = join(dirname(fileURLToPath(import.meta.url)), "../assets/Inter-Regular.ttf");
const fontData = readFileSync(fontPath);

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Dynamic OpenGraph pipeline (spec §5.2): on any published page write,
 * render headline + brand into a 1200×630 PNG in Storage with immutable
 * cache headers. Guarded by a content hash so re-deploys/edits that don't
 * change visible content don't churn images.
 */
export const onStorefrontPageWrite = onDocumentWritten(
  "storefrontPages/{slug}",
  async (event) => {
    const slug = event.params.slug;
    const after = event.data?.after;
    if (!after?.exists) return; // deleted
    const page = storefrontPageSchema.parse(after.data());
    if (page.status !== "published") return;
    logger.info("generateSocialCard start", { slug });

    const spotlight =
      page.blocks.find((b) => b.type === "spotlight") ?? page.blocks[0];
    if (!spotlight) return;

    const contentHash = createHash("sha256")
      .update(`${page.title}|${spotlight.headline}|${spotlight.body}`)
      .digest("hex")
      .slice(0, 16);
    if ((after.data() as Record<string, unknown>).ogContentHash === contentHash) {
      logger.info("generateSocialCard skipped (unchanged)", { slug });
      return;
    }

    const svg = await satori(
      {
        type: "div",
        props: {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 72,
            background: "linear-gradient(135deg,#1C1C1E 0%,#2C2C2E 100%)",
            color: "#FFFFFF",
            fontFamily: "Inter",
          },
          children: [
            {
              type: "div",
              props: {
                style: { fontSize: 28, opacity: 0.7, letterSpacing: 2 },
                children: page.title.toUpperCase(),
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: 24 },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 64, fontWeight: 700, lineHeight: 1.1 },
                      children: spotlight.headline,
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 30, opacity: 0.85, lineHeight: 1.4 },
                      children: spotlight.body.slice(0, 160),
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        width: WIDTH,
        height: HEIGHT,
        fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
      },
    );

    const png = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
    const path = `public/og/${slug}-${contentHash}.png`;
    await bucket.file(path).save(png, {
      contentType: "image/png",
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });
    await bucket.file(path).makePublic();

    const ogImageUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
    await after.ref.update({ ogImageUrl, ogContentHash: contentHash });
    logger.info("generateSocialCard done", { slug, ogImageUrl });
  },
);
