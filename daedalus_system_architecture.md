# Project DAEDALUS: System Architecture & Technical Specification

## Executive Summary
**Project DAEDALUS** is a Born-in-AI e-commerce engine designed for a single brand operating within the European Economic Area. Instead of requiring manual storefront design and traditional CMS management, DAEDALUS transforms high-level strategy inputs—Target Ideal Customer Profiles (ICPs), Market Insights, and Product Specifications—into high-converting, block-based storefronts.

DAEDALUS operates on two primary surfaces:
1. **Public Storefront:** An ultra-fast, edge-rendered (SSG/ISR) public store optimized for high conversion, Generative Engine Optimization (GEO), traditional SEO, and EU regulatory compliance.
2. **Admin Interface:** A mobile-first, native iOS-feeling Web application crafted with Material UI under a philosophy of radical minimalism.

---

## 1. System Vision & Core Principles

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                           STRATEGIC INPUTS                              │
  │     [ Ideal Customer Profiles ]  [ Market Insights ]  [ Products ]      │
  └────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    PROJECT DAEDALUS CORE ENGINE                         │
  │                                                                         │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │  Implicit Challenger Framework Transformation Pipeline            │  │
  │  │  (Hook ──► Commercial Reframe ──► Cost of Inaction ──► Spotlight) │  │
  │  └─────────────────────────────────┬─────────────────────────────────┘  │
  │                                    │                                    │
  │                                    ▼                                    │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │  Interactive Storefront Canvas (Ambient Chat 💬 + Regenerate 🔄)   │  │
  │  └─────────────────────────────────┬─────────────────────────────────┘  │
  └────────────────────────────────────┼────────────────────────────────────┘
                                       │
                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                   PUBLIC STOREFRONT & CHECKOUT LAYER                    │
  │                                                                         │
  │  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────┐  │
  │  │ Edge Static HTML/SSG  │ │ GEO / JSON-LD Schema  │ │ Stripe (EU)   │  │
  │  └───────────────────────┘ └───────────────────────┘ └───────────────┘  │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Core Axioms
* **Radical Minimalism:** A view or component is only ready when nothing else can be removed from the UI or UX. No secondary navigation clutter or complex options lists.
* **Implicit Strategic Methodology:** The system internally utilizes the *Challenger Sale* framework (Warm-up, Reframe, Rational Drowning, Emotional Impact, Value Proposition) without ever exposing sales terminology to the user.
* **Edge-First Performance:** Static content is generated and distributed at the network edge to achieve sub-second page loads globally.
* **EU Native:** 100% EEA data residency (`europe-north1` Finland), GDPR compliance, and strict adherence to European consumer protection laws.

---

## 2. Functional Requirements

### 2.1 Strategic Input & Generation Engine
* **ICP Configuration:** Admin provides qualitative descriptions of target buyers, their pain points, and current status quo assumptions.
* **Market Insights:** Admin inputs commercial insights, market shifts, and competitive realities.
* **Product Catalog Management:** Minimalist product manager covering item names, SKUs, physical dimensions, inventory counts, base prices, and product feature vectors.
* **Automated Block Synthesis:** Vertex AI processes strategic inputs into structured storefront section schemas:
  * **Phase 1: The Status Quo Hook** (Disrupts current thinking)
  * **Phase 2: The Commercial Reframe** (Introduces a new perspective)
  * **Phase 3: The Cost of Inaction** (Quantifies the tension)
  * **Phase 4: Product Spotlight** (Presents the product as the inevitable solution)
  * **Phase 5: Validated Outcomes** (Social proof and feature highlights)

### 2.2 Interactive Canvas & Ambient AI
* **Block Reordering:** Touch-optimized drag-and-drop / push-to-reorder interface.
* **Ambient Block Chat:** Every storefront section features an embedded floating action bubble at the bottom-right corner during preview mode.
  * **Function:** Opens a non-modal micro-chat to issue natural language edit commands (e.g., *"Make this sound more urgent for decision-makers"*).
* **Targeted Regeneration:** A dedicated **Regenerate** trigger re-queries the LLM for a specific block using refreshed ICP or product context while preserving explicit manual edits in other blocks.
* **Manual Override Layer:** Full direct text editing capabilities and an asset replacement picker for both AI-generated lifestyle photography and raw uploaded media.

### 2.3 Inventory Management & Pricing Engine
* **Inventory Tracking:** Real-time quantity management supporting physical warehouse stock.
* **Distributed Inventory Locking:** Initiating a checkout session reserves stock for a strict duration ($TTL = 15 \text{ minutes}$). Expired or canceled sessions automatically return reserved stock to available inventory.
* **Discount Campaign Management:** Scheduled promotional campaigns with starting and ending timestamps.
* **EU Omnibus Directive Pricing Display:**
  * Displays active sale price ($P_{\text{sale}}$) and a client-side real-time countdown timer ($hh:mm:ss$).
  * Displays reference price calculated as the lowest price charged in the preceding 30 days ($P_{\text{30d\_min}}$):

$$\text{Reference Price} = \min(P_t) \quad \text{for } t \in [t_{\text{now}} - 30\text{ days}, t_{\text{now}}]$$

### 2.4 Warehouse Fulfillment Board
* **Mobile Fulfillment Interface:** iOS-native card interface for warehouse staff to view incoming paid orders.
* **Manual Fulfillment Execution:** Single-tap interface to enter shipping carrier (e.g., Posti, DHL Express EU) and tracking number.
* **Automated Customer Dispatch:** Updating fulfillment triggers an automated, localized shipping confirmation email containing tracking URLs and EU withdrawal terms.

### 2.5 Company & Regulatory Settings
* **Configurable Legal Profile:** Native form managing Finnish company details:
  * Legal Entity Name
  * Registered Address
  * Business ID (*Y-tunnus*) & EU VAT ID
  * Contact Email & Privacy Representative Info

---

## 3. Technical Architecture & Infrastructure

### 3.1 EEA Cloud Topology

```
                  ┌──────────────────────────────────────────────┐
                  │          GOOGLE CLOUD REGIONAL BOUNDARY      │
                  │             (EEA / Finland & Germany)        │
                  │                                              │
  ┌───────────────┼──────────────────────┐                       │
  │ Admin PWA     │ Firebase Hosting Edge│                       │
  └───────────────┼──────────┬───────────┘                       │
                  │          │                                   │
  ┌───────────────┼──────────▼───────────┐                       │
  │ Storefront    │ Next.js App Router   │                       │
  │ (SSG / ISR)   │ Cloud Run            │                       │
  └───────────────┼──────────┬───────────┘                       │
                  │          │                                   │
                  │          ├─────────────────┐                 │
                  │          │                 │                 │
                  │          ▼                 ▼                 │
                  │  ┌───────────────┐ ┌───────────────┐         │
                  │  │ Cloud         │ │ Cloud Storage │         │
                  │  │ Firestore     │ │ Firebase      │         │
                  │  │ `eur3`       │ │ `europe-      │         │
                  │  │ (Multi-Region)│ │  north1`      │         │
                  │  └───────┬───────┘ └───────┬───────┘         │
                  │          │                 │                 │
                  │          └────────┬────────┘                 │
                  │                   │                          │
                  │                   ▼                          │
                  │        ┌─────────────────────┐               │
                  │        │ Google Vertex AI    │               │
                  │        │ Gemini 1.5 & Imagen │               │
                  │        │ `europe-west3`      │               │
                  │        └─────────────────────┘               │
                  └──────────────────────────────────────────────┘
```

| Infrastructure Tier | Technology | Region / Location | Purpose |
| :--- | :--- | :--- | :--- |
| **Compute & Hosting** | Firebase Hosting + Cloud Run | `europe-north1` (Hamina, FI) | Edge SSR/SSG serving and administrative hosting |
| **Database** | Cloud Firestore | `eur3` (EU Multi-Region) | Schema storage, product catalog, orders, and locks |
| **Object Storage** | Cloud Storage for Firebase | `europe-north1` (Finland) | Optimized static media assets and generated OG images |
| **AI Inference** | Google Vertex AI | `europe-west3` (Frankfurt) | Strategic copy synthesis and Imagen 3 asset generation |
| **Caching & Locking** | Upstash Redis (EU) / Firestore | `europe-west3` | Distributed inventory lock store |
| **Payment Gateway** | Stripe Checkout (PSD2 / SCA) | EU Endpoint | Compliant PCI-DSS checkout processing |

---

## 4. E-Commerce Engine Specifications

### 4.1 Inventory Reservation Algorithm

```
  [ Buyer Clicks "Checkout" ]
               │
               ▼
  Call Firestore Atomic Transaction:
  1. Read Product document `stockQuantity` & `reservedQuantity`
  2. Available Stock = `stockQuantity` - `reservedQuantity`
               │
       ┌───────┴───────┐
       │ Available >=  │
       │ Order Qty?    │
       └───────┬───────┘
         YES   │   NO ──► Return Error: "Item Sold Out"
               ▼
  3. Increment `reservedQuantity` += OrderQty
  4. Write Lock Record: { userId, orderQty, expiresAt: Now + 15m }
  5. Create Stripe Checkout Session (session.expires_at = Now + 15m)
               │
               ├────────────────────────────────────────┐
               ▼                                        ▼
  [ Payment Succeeded Webhook ]           [ Session Expired / Canceled ]
               │                                        │
  1. Decrement `stockQuantity` -= OrderQty              1. Decrement `reservedQuantity` -= OrderQty
  2. Decrement `reservedQuantity` -= OrderQty          2. Delete Lock Record
  3. Set Order Status = PENDING_FULFILLMENT
```

---

## 5. SEO, GEO & Dynamic Media Pipeline

### 5.1 Generative Engine Optimization (GEO)
To maximize discoverability in AI search tools (Perplexity, SearchGPT, Gemini):
* **Declarative Entity Modeling:** Every page embeds JSON-LD microdata conforming to `@type: Product`, `@type: Offer`, `@type: Organization`, and `@type: MerchantReturnPolicy`.
* **Semantic Hierarchy:** HTML tags follow strict structural ordering (`<header>`, `<main>`, `<section>`, `<article>`, `<footer>`).
* **Direct Fact Headers:** Key product features are stated using canonical facts and verifiable specifications.

### 5.2 Dynamic OpenGraph (`og:image`) Generation
1. Admin edits or regenerates a storefront block.
2. Cloud Function hook fires `generateSocialCard(blockId)`.
3. Satori processes brand typography, extracted headline text, and product image into an SVG.
4. Sharp compiles the SVG into a compressed $1200 \times 630\text{px}$ PNG.
5. Image is stored in Cloud Storage and served via Firebase Hosting CDN headers (`Cache-Control: public, max-age=31536000, immutable`).

---

## 6. Admin Interface Design System & UX Standards

The Admin Interface is built using **Material UI (MUI v6)** modified to deliver a native iOS app aesthetic:

```
┌─────────────────────────────────────────────────────────────────┐
│                        ADMIN CANVAS (MUI v6)                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Block: Value Proposition                             🔄  │  │
│  │                                                           │  │
│  │ "Redefining how home coffee is crafted in the Nordics."   │  │
│  │                                                           │  │
│  │ [ Product Image Asset ]                                   │  │
│  │                                                           │  │
│  │                                                     💬    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### UI Specifications
* **Border Radius:** Global component radius set to $20\text{px}$ (`theme.shape.borderRadius = 20`).
* **Borders & Dividers:** Zero-border philosophy (`border: 'none'`). Separation achieved exclusively using tonal background offsets (e.g., `#F4F4F6` light vs `#1C1C1E` dark) and soft blur shadows.
* **Physics & Motion:** Fluid spring animations on interactive surfaces (`cubic-bezier(0.32, 0.72, 0, 1)`).
* **Mobile Drawers:** Secondary actions and ambient chat rely on bottom-anchored modal sheets (`MUI SwipeableDrawer`) with pull-indicator handles.
* **Touch Targets:** Minimum button height of $48\text{px}$ across all viewports.

---

## 7. EU Regulatory & Compliance Matrix

| Requirement | Implementation Strategy |
| :--- | :--- |
| **GDPR Data Residency** | Primary databases and storage strictly pinned to GCP `europe-north1` (Finland). |
| **PII Encryption** | Encryption at rest via standard GCP AES-256 keys; TLS 1.3 in transit. |
| **Cookieless Analytics** | Zero client-side tracking cookies used. Basic operational telemetry collected server-side to avoid cookie consent banners. |
| **EU Consumer Rights Directive** | Automatic injection of mandatory 14-day Right of Withdrawal documentation and pre-filled cancellation links into checkout confirmations. |
| **EU Omnibus Directive** | Historical pricing logs track price changes over a rolling 30-day window to calculate and display compliant reference prices during promotional discount campaigns. |