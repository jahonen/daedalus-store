import { logger } from "firebase-functions/v2";

/**
 * Minimal AT Protocol client — raw XRPC over fetch, no @atproto dependency.
 * Covers the publish flow: session → link facets → OG card → createRecord.
 */

const encoder = new TextEncoder();

export interface BskySession {
  did: string;
  handle: string;
  accessJwt: string;
  serviceUrl: string;
}

export async function createSession(
  serviceUrl: string,
  handle: string,
  appPassword: string,
): Promise<BskySession> {
  const res = await fetch(
    `${serviceUrl}/xrpc/com.atproto.server.createSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    },
  );
  const data = (await res.json()) as {
    did: string;
    handle: string;
    accessJwt: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(`Bluesky login failed: ${data.message ?? res.status}`);
  }
  return { did: data.did, handle: data.handle, accessJwt: data.accessJwt, serviceUrl };
}

/** Grapheme-cluster count — Bluesky's 300-char limit counts graphemes. */
export function graphemeCount(text: string): number {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)]
    .length;
}

const URL_RE = /https?:\/\/[^\s<>"'()[\]]+/g;

export function firstLink(text: string): string | undefined {
  const m = URL_RE.exec(text);
  if (!m) return undefined;
  return trimTrailing(m[0]);
}

/** URLs in the text become clickable only via richtext facets (byte offsets). */
export function linkFacets(text: string) {
  const facets = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = trimTrailing(m[0]);
    const byteStart = encoder.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + encoder.encode(url).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    });
  }
  return facets;
}

function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?)\]"']+$/, "");
}

interface OgCard {
  uri: string;
  title: string;
  description: string;
  thumbUrl?: string;
}

function metaContent(html: string, prop: string): string | undefined {
  // og:* meta tags appear in either attribute order.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']og:${prop}["'][^>]*content=["']([^"']*)["']` +
      `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']og:${prop}["']`,
    "i",
  );
  const m = re.exec(html);
  return m ? (m[1] ?? m[2]) : undefined;
}

/** Fetch OG metadata for the link card. Best-effort — caller tolerates null. */
async function fetchOgCard(uri: string): Promise<OgCard | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(uri, {
      signal: ctrl.signal,
      headers: { "User-Agent": "DaedalusBot/1.0 (+link-card)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 500_000);
    const title = metaContent(html, "title");
    if (!title) return null;
    return {
      uri,
      title,
      description: metaContent(html, "description") ?? "",
      thumbUrl: metaContent(html, "image"),
    };
  } catch (e) {
    logger.warn("og fetch failed", { uri, error: String(e) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MAX_THUMB_BYTES = 900_000; // embed thumb ceiling is ~976 KiB

async function uploadThumb(
  session: BskySession,
  thumbUrl: string,
): Promise<Record<string, unknown> | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const img = await fetch(thumbUrl, { signal: ctrl.signal });
    if (!img.ok) return undefined;
    const mime = img.headers.get("content-type") ?? "";
    if (!mime.startsWith("image/")) return undefined;
    const bytes = Buffer.from(await img.arrayBuffer());
    if (bytes.length > MAX_THUMB_BYTES) return undefined;
    const up = await fetch(
      `${session.serviceUrl}/xrpc/com.atproto.repo.uploadBlob`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": mime,
        },
        body: new Uint8Array(bytes),
      },
    );
    const data = (await up.json()) as { blob?: Record<string, unknown> };
    return up.ok ? data.blob : undefined;
  } catch (e) {
    logger.warn("thumb upload failed", { thumbUrl, error: String(e) });
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Build the app.bsky.embed.external card for the post's first link. */
async function buildExternalEmbed(session: BskySession, uri: string) {
  const card = await fetchOgCard(uri);
  if (!card) return undefined;
  const thumb = card.thumbUrl ? await uploadThumb(session, card.thumbUrl) : undefined;
  return {
    $type: "app.bsky.embed.external",
    external: {
      uri: card.uri,
      title: card.title,
      description: card.description,
      ...(thumb ? { thumb } : {}),
    },
  };
}

/** Publish a post; returns the AT uri/cid and the web permalink. */
export async function publishPost(
  session: BskySession,
  text: string,
): Promise<{ uri: string; cid: string; postUrl: string }> {
  const facets = linkFacets(text);
  const link = firstLink(text);
  const embed = link ? await buildExternalEmbed(session, link) : undefined;

  const res = await fetch(
    `${session.serviceUrl}/xrpc/com.atproto.repo.createRecord`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          createdAt: new Date().toISOString(),
          ...(facets.length ? { facets } : {}),
          ...(embed ? { embed } : {}),
        },
      }),
    },
  );
  const data = (await res.json()) as { uri: string; cid: string; message?: string };
  if (!res.ok) {
    throw new Error(`Bluesky post failed: ${data.message ?? res.status}`);
  }
  const rkey = data.uri.split("/").pop();
  return {
    uri: data.uri,
    cid: data.cid,
    postUrl: `https://bsky.app/profile/${session.handle}/post/${rkey}`,
  };
}
