import { useEffect, useRef, useState, useCallback } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
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
import {
  Add,
  DeleteOutline,
  DragIndicator,
  OpenInNew,
  PhotoLibrary,
  Upload,
} from "@mui/icons-material";
import type { MediaAsset, Product } from "@daedalus/shared";
import { mediaAssetSchema, productSchema } from "@daedalus/shared";
import { DEFAULT_VAT_RATE, formatEur } from "@daedalus/shared";
import { db, fns, storage, storageBucket } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { autocropSquare } from "../../lib/autocrop";
import "./ProductsScreen.scss";

const STOREFRONT_BASE = "https://storefront-229074810509.europe-north1.run.app";

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
  vatRate: DEFAULT_VAT_RATE,
  currency: "EUR",
  features: [],
  mediaAssetIds: [],
  status: "draft",
};

/** Lifecycle: beta — catalogue CRUD, media library (upload + AI), full product detail. */
export function ProductsScreen() {
  const [products, setProducts] = useState<{ id: string; product: Product }[] | null>(null);
  const [media, setMedia] = useState<Map<string, MediaAsset>>(new Map());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [featuresText, setFeaturesText] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "products"),
      (snap) => {
        const items: { id: string; product: Product }[] = [];
        for (const d of snap.docs) {
          const parsed = productSchema.safeParse(d.data());
          if (parsed.success) items.push({ id: d.id, product: parsed.data });
          else console.warn("[Products] malformed doc:", d.id, parsed.error);
        }
        setProducts(items);
      },
      (err) => console.error("[Products] snapshot error:", err),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "media"),
      (snap) => {
        const m = new Map<string, MediaAsset>();
        for (const d of snap.docs) {
          const parsed = mediaAssetSchema.safeParse(d.data());
          if (parsed.success) m.set(d.id, parsed.data);
        }
        setMedia(m);
      },
      (err) => console.error("[Products] media snapshot error:", err),
    );
  }, []);

  function openEdit(id: string | null, product: Product) {
    setEditing({ id, product });
    setFeaturesText(product.features.join("\n"));
    setImagePrompt("");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    trackEvent("product_save");
    try {
      const features = featuresText
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
      // Fields owned by server processes (media links, checkout locks, stock)
      // are taken from the live doc so a save can't clobber concurrent writes.
      const live = editing.id
        ? products?.find((p) => p.id === editing.id)?.product
        : undefined;
      const p = productSchema.parse({
        ...editing.product,
        features,
        mediaAssetIds: live?.mediaAssetIds ?? editing.product.mediaAssetIds,
        reservedQuantity: live?.reservedQuantity ?? editing.product.reservedQuantity,
        stockQuantity: live?.stockQuantity ?? editing.product.stockQuantity,
      });
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
      setImageError(null);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList) {
    if (!editing?.id || files.length === 0) return;
    setBusy(true);
    const productId = editing.id;
    trackEvent("product_image_upload", { productId, count: files.length });
    try {
      for (const file of Array.from(files)) {
        // Smart autocrop to 1:1 before upload.
        const cropped = await autocropSquare(file);
        const ext = cropped.type === "image/png" ? "png" : "jpg";
        const safeName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `public/products/${productId}/${Date.now()}-${safeName}.${ext}`;
        await uploadBytes(storageRef(storage, storagePath), cropped, {
          contentType: cropped.type,
        });
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
        const asset = mediaAssetSchema.parse({
          storagePath,
          publicUrl,
          kind: "uploaded",
          altText: editing.product.name,
          createdAt: new Date().toISOString(),
        });
        const mediaDoc = await addDoc(collection(db, "media"), asset);
        await updateDoc(doc(db, "products", productId), {
          mediaAssetIds: arrayUnion(mediaDoc.id),
        });
      }
      setImageError(null);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function detachMedia(mediaId: string) {
    if (!editing?.id) return;
    await updateDoc(doc(db, "products", editing.id), {
      mediaAssetIds: arrayRemove(mediaId),
    });
    setEditing({
      ...editing,
      product: {
        ...editing.product,
        mediaAssetIds: editing.product.mediaAssetIds.filter((m) => m !== mediaId),
      },
    });
  }

  async function saveAltText(mediaId: string, altText: string) {
    await updateDoc(doc(db, "media", mediaId), { altText });
  }

  // Media links live on the product doc — read the live snapshot (the
  // editing copy goes stale while server-side generation appends to it).
  const liveMediaIds = editing?.id
    ? (products?.find((p) => p.id === editing.id)?.product.mediaAssetIds ??
      editing.product.mediaAssetIds)
    : (editing?.product.mediaAssetIds ?? []);
  const editingMedia = liveMediaIds
    .map((id) => ({ id, asset: media.get(id) }))
    .filter((m): m is { id: string; asset: MediaAsset } => !!m.asset);

  /** Drag-reorder: moves a media item from `from` to `to` in the array. */
  const moveMedia = useCallback(
    async (from: number, to: number) => {
      if (!editing?.id || from === to) return;
      const ids = [...liveMediaIds];
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      await updateDoc(doc(db, "products", editing.id), { mediaAssetIds: ids });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing?.id, liveMediaIds],
  );

  // ── Drag state for reorder ──────────────────────────────────────────
  const dragIdx = useRef<number | null>(null);

  if (!products) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="products">
      {products.map(({ id, product: p }) => {
        const thumb = p.mediaAssetIds.length ? media.get(p.mediaAssetIds[0]) : undefined;
        return (
          <Card key={id} className="product-card">
            {thumb && (
              <img className="product-thumb" src={thumb.publicUrl} alt={thumb.altText || p.name} />
            )}
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="h6" flex={1}>
                  {p.name}
                </Typography>
                <Chip size="small" label={p.status} />
              </Box>
              <Typography color="text.secondary" variant="body2">
                {formatEur(p.basePriceCents)} · stock {p.stockQuantity - p.reservedQuantity}
                /{p.stockQuantity} · SKU {p.sku} · {p.mediaAssetIds.length} image
                {p.mediaAssetIds.length === 1 ? "" : "s"}
              </Typography>
              <Box display="flex" alignItems="center">
                <Button size="small" sx={{ mt: 1 }} onClick={() => openEdit(id, p)}>
                  Edit
                </Button>
                {p.status === "active" && (
                  <IconButton
                    size="small"
                    aria-label="view on storefront"
                    href={`${STOREFRONT_BASE}/products/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <OpenInNew fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </CardContent>
          </Card>
        );
      })}

      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={() => openEdit(null, EMPTY)}
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
              {editingMedia.length > 0 && (
                <Box className="media-gallery">
                  {editingMedia.map(({ id, asset }, idx) => (
                    <Box
                      key={id}
                      className="media-item"
                      draggable
                      onDragStart={() => { dragIdx.current = idx; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIdx.current !== null) {
                          void moveMedia(dragIdx.current, idx);
                          dragIdx.current = null;
                        }
                      }}
                    >
                      <IconButton
                        size="small"
                        className="drag-handle"
                        aria-label="reorder"
                        sx={{ cursor: "grab", touchAction: "none" }}
                      >
                        <DragIndicator fontSize="small" />
                      </IconButton>
                      <img src={asset.publicUrl} alt={asset.altText} />
                      <TextField
                        size="small"
                        label="Alt text"
                        defaultValue={asset.altText}
                        onBlur={(e) => saveAltText(id, e.target.value)}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="remove image"
                        onClick={() => detachMedia(id)}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                      {idx === 0 && (
                        <Chip
                          size="small"
                          label="Primary"
                          color="primary"
                          className="primary-badge"
                        />
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <TextField
                label="Name"
                value={editing.product.name}
                onChange={(e) =>
                  setEditing({ ...editing, product: { ...editing.product, name: e.target.value } })
                }
              />
              <Box display="flex" gap={2}>
                <TextField
                  label="SKU"
                  value={editing.product.sku}
                  onChange={(e) =>
                    setEditing({ ...editing, product: { ...editing.product, sku: e.target.value } })
                  }
                />
                <TextField
                  label="Slug"
                  value={editing.product.slug}
                  placeholder="auto from name"
                  onChange={(e) =>
                    setEditing({ ...editing, product: { ...editing.product, slug: e.target.value } })
                  }
                />
              </Box>
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
              <TextField
                label="Features (one per line)"
                multiline
                minRows={2}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
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
                  label="VAT %"
                  type="number"
                  value={Math.round(editing.product.vatRate * 100)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      product: {
                        ...editing.product,
                        vatRate: Math.min(100, Math.max(0, Number(e.target.value))) / 100,
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
              <Box display="flex" gap={2}>
                {(["w", "h", "d", "weightKg"] as const).map((k) => (
                  <TextField
                    key={k}
                    size="small"
                    type="number"
                    label={k === "weightKg" ? "kg" : `${k} cm`}
                    value={editing.product.dims?.[k] ?? ""}
                    onChange={(e) => {
                      const dims = { w: 0, h: 0, d: 0, weightKg: 0, ...editing.product.dims };
                      dims[k] = Number(e.target.value);
                      setEditing({ ...editing, product: { ...editing.product, dims } });
                    }}
                  />
                ))}
              </Box>
              <Box display="flex" gap={1} alignItems="center">
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
                {editing.product.reservedQuantity > 0 && (
                  <Typography variant="caption" color="text.secondary" ml="auto">
                    {editing.product.reservedQuantity} reserved (checkout locks)
                  </Typography>
                )}
              </Box>
              {editing.id && (
                <>
                  <Box display="flex" gap={1} alignItems="center">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files?.length) void uploadImages(files);
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Upload />}
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      Upload images
                    </Button>
                  </Box>
                  <Box display="flex" gap={1} alignItems="flex-start">
                    <TextField
                      fullWidth
                      label="AI image prompt"
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
                  {imageError && (
                    <Typography variant="body2" color="error">
                      {imageError}
                    </Typography>
                  )}
                </>
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
