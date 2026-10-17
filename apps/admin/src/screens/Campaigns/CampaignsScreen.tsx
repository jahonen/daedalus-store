import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import type { Campaign, Product } from "@daedalus/shared";
import { campaignSchema, formatEur, productSchema } from "@daedalus/shared";
import { db } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import "./CampaignsScreen.scss";

type Draft = { productId: string; salePriceEur: string; startsAt: string; endsAt: string };

/**
 * Lifecycle: beta — promotional pricing. Omnibus compliance note: a campaign
 * write schedules the sale; the storefront displays the 30-day lowest price
 * computed from priceHistory (server-side in the data layer).
 */
export function CampaignsScreen() {
  const [campaigns, setCampaigns] = useState<{ id: string; campaign: Campaign }[] | null>(null);
  const [products, setProducts] = useState<{ id: string; product: Product }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const un1 = onSnapshot(collection(db, "campaigns"), (snap) =>
      setCampaigns(
        snap.docs.map((d) => ({ id: d.id, campaign: campaignSchema.parse(d.data()) })),
      ),
    );
    const un2 = onSnapshot(collection(db, "products"), (snap) =>
      setProducts(
        snap.docs.map((d) => ({ id: d.id, product: productSchema.parse(d.data()) })),
      ),
    );
    return () => {
      un1();
      un2();
    };
  }, []);

  async function save() {
    if (!draft?.productId || !draft.salePriceEur || !draft.startsAt || !draft.endsAt) return;
    setBusy(true);
    trackEvent("campaign_create", { productId: draft.productId });
    try {
      const campaign = campaignSchema.parse({
        productId: draft.productId,
        salePriceCents: Math.round(Number(draft.salePriceEur) * 100),
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        status: "scheduled",
      });
      await setDoc(doc(db, "campaigns", crypto.randomUUID()), campaign);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  if (!campaigns) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.product.name ?? id;

  return (
    <Box className="campaigns">
      {campaigns.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          No campaigns yet.
        </Typography>
      )}
      {campaigns.map(({ id, campaign: c }) => (
        <Card key={id} className="campaign-card">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" flex={1}>
                {productName(c.productId)}
              </Typography>
              <Chip size="small" label={c.status} />
            </Box>
            <Typography color="text.secondary" variant="body2">
              {formatEur(c.salePriceCents)} ·{" "}
              {new Date(c.startsAt).toLocaleDateString()} –{" "}
              {new Date(c.endsAt).toLocaleDateString()}
            </Typography>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={() => setDraft({ productId: "", salePriceEur: "", startsAt: "", endsAt: "" })}
      >
        New campaign
      </Button>

      <Drawer anchor="bottom" open={!!draft} onClose={() => setDraft(null)}>
        <Box className="campaign-sheet" p={3} pb={4}>
          <Typography variant="h6" mb={2}>
            New campaign
          </Typography>
          {draft && (
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField
                select
                label="Product"
                value={draft.productId}
                onChange={(e) => setDraft({ ...draft, productId: e.target.value })}
              >
                {products
                  .filter((p) => p.product.status === "active")
                  .map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.product.name} — {formatEur(p.product.basePriceCents)}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                label="Sale price € (incl. VAT)"
                type="number"
                value={draft.salePriceEur}
                onChange={(e) => setDraft({ ...draft, salePriceEur: e.target.value })}
              />
              <TextField
                label="Starts"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
              <TextField
                label="Ends"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
              <Button variant="contained" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Create"}
              </Button>
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
