#!/usr/bin/env node
/**
 * Phase 6 demo seed — writes via Firestore REST with the gcloud user token
 * (ADC is broken locally with invalid_rapt; REST bypasses security rules via
 * IAM, same as the admin SDK).
 *
 * Then end-to-end smoke: mints a custom token with admin claim via
 * iamcredentials:signBlob → identitytoolkit → calls generateStorefront →
 * publishes the page.
 *
 * Usage: node infra/scripts/seed-demo.mjs
 */
import { execSync } from "node:child_process";

const PROJECT = "daedalus-store";
const API_KEY = "AIzaSyCsM30Ge3kllFuwNCGy2jNKGJl4JBBUFK4";
const SA = "firebase-adminsdk-fbsvc@daedalus-store.iam.gserviceaccount.com";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN_BASE = `https://europe-north1-${PROJECT}.cloudfunctions.net`;

const token = execSync("gcloud auth print-access-token").toString().trim();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// ── Firestore field encoding ───────────────────────────────────────────────
function fsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
  return { mapValue: { fields: fsFields(v) } };
}
function fsFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsVal(v)]));
}
async function putDoc(path, data) {
  const res = await fetch(`${FS}/${path}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields: fsFields(data) }),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
  console.log(`  wrote ${path}`);
}

// ── Demo content ───────────────────────────────────────────────────────────
const now = Date.now();
const dayAgo = (d) => new Date(now - d * 864e5).toISOString();
const inDays = (d) => new Date(now + d * 864e5).toISOString();

const ARTISANS = [
  {
    id: "erik-lindstrom",
    name: "Erik Lindström",
    bio: "Lighting artisan with 20 years at the bench — aluminium, brass, and hand-polished optics.",
    location: "Helsinki, Finland",
    specialties: ["Lighting", "Metalwork"],
    mediaAssetIds: [],
    status: "active",
  },
  {
    id: "kaisa-makinen",
    name: "Kaisa Mäkinen",
    bio: "Third-generation woodworker; solid-oak pieces finished with oil wax by hand.",
    location: "Turku, Finland",
    specialties: ["Woodworking", "Finishing"],
    mediaAssetIds: [],
    status: "active",
  },
];

const PRODUCTS = [
  {
    id: "aurora-lamp",
    name: "Aurora Desk Lamp",
    slug: "aurora-desk-lamp",
    sku: "AUR-LAMP-01",
    description:
      "Minimalist aluminum desk lamp with stepless warm-to-cool dimming and a glare-free edge-lit panel.",
    stockQuantity: 25,
    reservedQuantity: 0,
    basePriceCents: 12900,
    vatRate: 0.24,
    currency: "EUR",
    features: ["Edge-lit, flicker-free panel", "2700K–5000K stepless dimming", "USB-C powered, 12W"],
    mediaAssetIds: [],
    status: "active",
    dims: { w: 40, h: 45, d: 18, weightKg: 1.8 },
    artisanId: "erik-lindstrom",
    materials: [
      { material: "Anodized aluminium body", origin: "Sunndalsøra, Norway", supplier: "Hydro ASA" },
      { material: "Edge-lit LED panel", origin: "Regensburg, Germany", supplier: "Osram" },
      { material: "Brass fittings", origin: "Hamburg, Germany", supplier: "Aurubis" },
    ],
  },
  {
    id: "nord-speaker",
    name: "Nord Shelf Speaker",
    slug: "nord-shelf-speaker",
    sku: "NRD-SPK-02",
    description:
      "Compact powered speaker with a warm Nordic tuning — designed for small rooms and desktops.",
    stockQuantity: 12,
    reservedQuantity: 0,
    basePriceCents: 24900,
    vatRate: 0.24,
    currency: "EUR",
    features: ["4\" woofer + silk dome tweeter", "Bluetooth 5.3 + line-in", "Auto standby"],
    mediaAssetIds: [],
    status: "active",
    dims: { w: 16, h: 26, d: 20, weightKg: 3.2 },
    artisanId: "erik-lindstrom",
    materials: [
      { material: "Birch-ply cabinet", origin: "KoskiSen, Finland", supplier: "Koskisen Oy" },
      { material: "Silk dome tweeter", origin: "Scan-Speak, Videbæk, Denmark", supplier: "Scan-Speak" },
    ],
  },
  {
    id: "fjell-tray",
    name: "Fjell Oak Desk Tray",
    slug: "fjell-oak-desk-tray",
    sku: "FJL-TRY-03",
    description: "Solid oak valet tray with a vegan-leather base. Milled in Finland.",
    stockQuantity: 40,
    reservedQuantity: 0,
    basePriceCents: 5900,
    vatRate: 0.24,
    currency: "EUR",
    features: ["Solid European oak", "Vegan-leather insert", "Hand-finished oil wax"],
    mediaAssetIds: [],
    status: "active",
    dims: { w: 28, h: 3, d: 20, weightKg: 0.6 },
    artisanId: "kaisa-makinen",
    materials: [
      { material: "Solid European oak", origin: "KoskiSen, Finland", supplier: "Koskisen Oy" },
      { material: "Vegan-leather insert", origin: "Milan, Italy", supplier: "Alcantara-adjacent microfibre" },
      { material: "Natural oil-wax finish", origin: "Odense, Denmark", supplier: "WOCA Denmark" },
    ],
  },
];

console.log("== Seeding demo content ==");

await putDoc("settings/company", {
  legalName: "Daedalus Demo Oy",
  address: "Mannerheimintie 1, 00100 Helsinki, Finland",
  yTunnus: "3245678-9",
  euVatId: "FI32456789",
  contactEmail: "hello@cvpe.dev",
  privacyRep: "J. Ahonen",
  defaultLocale: "en",
});

await putDoc("strategy/icp-remote-worker", {
  kind: "icp",
  name: "Remote knowledge worker",
  description:
    "Works from a home office 3+ days a week; invests in a calm, functional desk setup; values quality over quantity.",
  painPoints: [
    "Cheap gear breaks and looks cluttered",
    "Eye strain from poor lighting",
    "Fast furniture feels wasteful",
  ],
  statusQuo: "Buys generic desk accessories from marketplaces; replaces them yearly.",
});

await putDoc("strategy/insight-desk-trend", {
  kind: "insight",
  insight:
    "Searches for 'minimal desk setup' grew 40% YoY; buyers increasingly filter by EU manufacturing and repairability.",
  source: "internal market scan",
  createdAt: new Date().toISOString(),
});

for (const a of ARTISANS) {
  const { id, ...data } = a;
  await putDoc(`artisans/${id}`, data);
}

for (const p of PRODUCTS) {
  const { id, ...data } = p;
  await putDoc(`products/${id}`, data);
}

// Heritage landing page — draft until generated/published via Canvas.
await putDoc("storefrontPages/heritage", {
  slug: "heritage",
  title: "Heritage",
  blocks: [
    {
      id: "heritage-hook-1",
      type: "hook",
      headline: "Made to be kept.",
      body: "Most things today are made to be replaced. We make each piece to be registered, repaired, and eventually passed on.",
      mediaAssetIds: [],
      manuallyEdited: false,
      version: 1,
    },
    {
      id: "heritage-spotlight-1",
      type: "spotlight",
      headline: "The Heritage programme",
      body: "Every piece carries a unique serial number, a named artisan, and a recorded bill of materials — registered to you for ten years. Lifetime repairs for normal wear are always included.",
      mediaAssetIds: [],
      manuallyEdited: false,
      version: 1,
    },
    {
      id: "heritage-outcomes-1",
      type: "outcomes",
      headline: "From owner to Heirloom",
      body: "When the time comes, our concierge service transfers ownership by phone or email. The piece becomes an Heirloom — its warranty and story carry forward to the next owner.",
      mediaAssetIds: [],
      manuallyEdited: false,
      version: 1,
    },
  ],
  status: "published",
  updatedAt: new Date().toISOString(),
});

// 30+ day price history so Omnibus reference price has data:
// Aurora was cheaper 20 days ago (€99) → PDP shows €99 as 30-day lowest.
await putDoc(`priceHistory/aurora-1`, {
  productId: "aurora-lamp",
  priceCents: 12900,
  effectiveAt: dayAgo(45),
});
await putDoc(`priceHistory/aurora-2`, {
  productId: "aurora-lamp",
  priceCents: 9900,
  effectiveAt: dayAgo(20),
});
await putDoc(`priceHistory/aurora-3`, {
  productId: "aurora-lamp",
  priceCents: 12900,
  effectiveAt: dayAgo(2),
});

// Active campaign on the speaker to exercise the Omnibus display path.
await putDoc("campaigns/nord-launch", {
  productId: "nord-speaker",
  salePriceCents: 19900,
  startsAt: dayAgo(1),
  endsAt: inDays(7),
  status: "active",
});

console.log("== Minting admin token for callable smoke test ==");

// Custom token: self-signed JWT via iamcredentials:signBlob.
const iat = Math.floor(now / 1000);
const payload = {
  iss: SA,
  sub: SA,
  aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
  iat,
  exp: iat + 3600,
  uid: "seed-admin",
  claims: { admin: true },
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}`;
const signRes = await fetch(
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA}:signBlob`,
  {
    method: "POST",
    headers: H,
    body: JSON.stringify({ payload: Buffer.from(unsigned).toString("base64") }),
  },
);
if (!signRes.ok) throw new Error(`signBlob: ${signRes.status} ${await signRes.text()}`);
const { signedBlob } = await signRes.json();
const customToken = `${unsigned}.${Buffer.from(signedBlob, "base64").toString("base64url")}`;

const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
if (!signIn.ok) throw new Error(`signInWithCustomToken: ${signIn.status} ${await signIn.text()}`);
const { idToken } = await signIn.json();
console.log("  admin idToken acquired");

console.log("== generateStorefront (live Gemini call, ~10-30s) ==");
const gen = await fetch(`${FN_BASE}/generateStorefront`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ data: { pageSlug: "home" } }),
});
const genBody = await gen.text();
if (!gen.ok) throw new Error(`generateStorefront: ${gen.status} ${genBody}`);
console.log("  generated:", genBody.slice(0, 200));

// Publish it.
const pageRes = await fetch(`${FS}/storefrontPages/home`, { headers: H });
const pageJson = await pageRes.json();
const fields = pageJson.fields ?? {};
fields.status = { stringValue: "published" };
await fetch(`${FS}/storefrontPages/home`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({ fields }),
});
console.log("  page published");

console.log(`
Done. Verify:
  Storefront:  https://storefront-229074810509.europe-north1.run.app/
  Admin:       https://daedalus-store.web.app
`);
