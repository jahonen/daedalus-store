#!/usr/bin/env node
/**
 * Lifecycle: beta — build-time Firestore snapshot for storefront prerendering.
 *
 * Runs as a Cloud Build step BEFORE `docker build`. Reads the public
 * collections the storefront needs via the Firestore REST API and writes
 * apps/storefront/build-snapshot.json, which the image bakes in. The
 * Dockerfile sets NEXT_PRIVATE_SKIP_FIRESTORE=1, so data.ts serves this
 * snapshot instead of Firestore — the prerendered shell contains real
 * catalogue data and cold-start stale serves are harmless.
 *
 * Auth: metadata-server token inside Cloud Build; GOOGLE_OAUTH_TOKEN or
 * `gcloud auth print-access-token` locally.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = process.env.GCP_PROJECT || "daedalus-store";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "apps/storefront/build-snapshot.json");
const API = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const COLLECTIONS = [
  "storefrontPages",
  "products",
  "campaigns",
  "priceHistory",
  "media",
  "artisans",
];
const SINGLE_DOCS = ["settings/company"];

async function getToken() {
  if (process.env.GOOGLE_OAUTH_TOKEN) return process.env.GOOGLE_OAUTH_TOKEN;
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (res.ok) return (await res.json()).access_token;
  } catch {
    /* not on GCP */
  }
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
  }).trim();
}

function decodeValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("geoPointValue" in v) return v.geoPointValue;
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

const docId = (name) => name.split("/").pop();

async function listCollection(token, name) {
  const docs = {};
  let pageToken = "";
  do {
    const url = `${API}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const d of body.documents || []) {
      docs[docId(d.name)] = decodeFields(d.fields || {});
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}

async function getDoc(token, path) {
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return decodeFields((await res.json()).fields || {});
}

const token = await getToken();
const collections = {};
for (const c of COLLECTIONS) {
  collections[c] = await listCollection(token, c);
  console.log(`  ${c}: ${Object.keys(collections[c]).length} docs`);
}
const settings = {};
for (const p of SINGLE_DOCS) {
  settings[p.split("/").pop()] = await getDoc(token, p);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), collections, settings }),
);
console.log(`Snapshot written → ${OUT}`);
