import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import {
  BLUESKY_MAX_GRAPHEMES,
  integrationsSettingsSchema,
  socialPostSchema,
} from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";
import { createSession, graphemeCount, publishPost } from "./bluesky.js";

const publishInput = z.object({ text: z.string().min(1) });

/**
 * Lifecycle: alpha — publishes a post to Bluesky via app-password session.
 * Link facets make URLs clickable; the first link gets an OG preview card
 * (title/description/thumb fetched from the destination). Persists a
 * socialPosts record for history.
 */
export const publishSocialPost = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (req) => {
    requireAdmin(req);
    const parsed = publishInput.safeParse(req.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.message);
    const { text } = parsed.data;
    logger.info("publishSocialPost start", { len: text.length });

    const graphemes = graphemeCount(text);
    if (graphemes > BLUESKY_MAX_GRAPHEMES) {
      throw new HttpsError(
        "invalid-argument",
        `Post is ${graphemes} graphemes — limit is ${BLUESKY_MAX_GRAPHEMES}`,
      );
    }

    const integSnap = await db.collection("settings").doc("integrations").get();
    const bsky = integSnap.exists
      ? integrationsSettingsSchema.parse(integSnap.data()).bluesky
      : undefined;
    if (!bsky?.handle || !bsky.appPassword) {
      throw new HttpsError(
        "failed-precondition",
        "Bluesky credentials not configured — set handle + app password in Settings → Integrations",
      );
    }

    const session = await createSession(
      bsky.serviceUrl || "https://bsky.social",
      bsky.handle,
      bsky.appPassword,
    );
    const posted = await publishPost(session, text);

    const post = socialPostSchema.parse({
      text,
      status: "posted",
      recordUri: posted.uri,
      recordCid: posted.cid,
      postUrl: posted.postUrl,
      postedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    await db.collection("socialPosts").doc().set(post);

    logger.info("publishSocialPost done", { postUrl: posted.postUrl });
    return posted;
  },
);

/** Lifecycle: alpha — recent published posts (history list for the Social tab). */
export const listSocialPosts = onCall({ timeoutSeconds: 30 }, async (req) => {
  requireAdmin(req);
  const snap = await db
    .collection("socialPosts")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return {
    posts: snap.docs.map((d) => ({ id: d.id, ...socialPostSchema.parse(d.data()) })),
  };
});
