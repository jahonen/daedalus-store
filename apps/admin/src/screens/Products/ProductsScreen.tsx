import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Add, PhotoLibrary } from "@mui/icons-material";
import type { Product } from "@daedalus/shared";
import { productSchema } from "@daedalus/shared";
import { formatEur } from "@daedalus/shared";
import { db, fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import "./ProductsScreen.scss";

const generateProductImage = httpsCallable<{
  productId: string;
  prompt: string;
  altText: string;
}>(fns, "generateProductImage");

type Editing = { id: string | null; product: Product };

const EMPTY: Product = {
  name: "",
  slug: "",
  sku: "",
  description: "",
  stockQuantity: 0,
  reservedQuantity: 0,
  basePriceCents: 0,
  vatRate: 0.24,
  currency: "EUR",
  features: [],
  mediaAssetIds: [],
  status: "draft",
};

/** Lifecycle: beta — catalogue CRUD + AI product-image generation. */
export function ProductsScreen() {
  const [products, setProducts] = useState<{ id: string; product: Product }[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, "products"), (snap) => {
      setProducts(
        snap.docs.map((d) => ({ id: d.id, product: productSchema.parse(d.data()) })),
      );
    });
  }, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    trackEvent("product_save");
    try {
      const p = productSchema.parse(editing.product);
      const slug = p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (editing.id) {
        await updateDoc(doc(db, "products", editing.id), { ...p, slug });
      } else {
        await setDoc(doc(db, "products", crypto.randomUUID()), { ...p, slug });
      }
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  async function genImage() {
    if (!editing?.id || !imagePrompt.trim()) return;
    setBusy(true);
    trackEvent("product_image_generate", { productId: editing.id });
    try {
      await generateProductImage({
        productId: editing.id,
        prompt: imagePrompt,
        altText: editing.product.name,
      });
      setImagePrompt("");
    } finally {
      setBusy(false);
    }
  }

  if (!products) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="products">
      {products.map(({ id, product: p }) => (
        <Card key={id} className="product-card">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" flex={1}>
                {p.name}
              </Typography>
              <Chip size="small" label={p.status} />
            </Box>
            <Typography color="text.secondary" variant="body2">
              {formatEur(p.basePriceCents)} · stock {p.stockQuantity - p.reservedQuantity}
              /{p.stockQuantity} · SKU {p.sku}
            </Typography>
            <Button size="small" sx={{ mt: 1 }} onClick={() => setEditing({ id, product: p })}>
              Edit
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={() => setEditing({ id: null, product: EMPTY })}
      >
        New product
      </Button>

      <Drawer anchor="bottom" open={!!editing} onClose={() => setEditing(null)}>
        <Box className="product-sheet" p={3} pb={4}>
          <Typography variant="h6" mb={2}>
            {editing?.id ? "Edit product" : "New product"}
          </Typography>
          {editing && (
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField
                label="Name"
                value={editing.product.name}
                onChange={(e) =>
                  setEditing({ ...editing, product: { ...editing.product, name: e.target.value } })
                }
              />
              <TextField
                label="SKU"
                value={editing.product.sku}
                onChange={(e) =>
                  setEditing({ ...editing, product: { ...editing.product, sku: e.target.value } })
                }
              />
              <TextField
                label="Description"
                multiline
                minRows={2}
                value={editing.product.description}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    product: { ...editing.product, description: e.target.value },
                  })
                }
              />
              <Box display="flex" gap={2}>
                <TextField
                  label="Price € (incl. VAT)"
                  type="number"
                  value={editing.product.basePriceCents / 100}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      product: {
                        ...editing.product,
                        basePriceCents: Math.round(Number(e.target.value) * 100),
                      },
                    })
                  }
                />
                <TextField
                  label="Stock"
                  type="number"
                  value={editing.product.stockQuantity}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      product: {
                        ...editing.product,
                        stockQuantity: Number(e.target.value),
                      },
                    })
                  }
                />
              </Box>
              <Box display="flex" gap={1}>
                {(["draft", "active", "archived"] as const).map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    color={editing.product.status === s ? "primary" : "default"}
                    onClick={() =>
                      setEditing({ ...editing, product: { ...editing.product, status: s } })
                    }
                  />
                ))}
              </Box>
              {editing.id && (
                <Box display="flex" gap={1} alignItems="flex-start">
                  <TextField
                    fullWidth
                    label="Image prompt"
                    placeholder="Studio photo, white background…"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                  />
                  <IconButton
                    aria-label="generate image"
                    disabled={busy || !imagePrompt.trim()}
                    onClick={genImage}
                  >
                    <PhotoLibrary />
                  </IconButton>
                </Box>
              )}
              <Button variant="contained" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
