import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import {
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { Upload } from "@mui/icons-material";
import type { CompanySettings } from "@daedalus/shared";
import { companySettingsSchema } from "@daedalus/shared";
import { db, fns, storage, storageBucket } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";
import "./SettingsScreen.scss";

const processFavicon = httpsCallable<{ storagePath: string }>(fns, "processFavicon");

const FAVICON_PREVIEW =
  `https://firebasestorage.googleapis.com/v0/b/${storageBucket}` +
  "/o/public%2Fbrand%2Ffavicon-48.png?alt=media";

const EMPTY: CompanySettings = {
  legalName: "",
  storefrontName: "",
  address: "",
  yTunnus: "",
  euVatId: "",
  contactEmail: "",
  privacyRep: "",
  defaultLocale: "en",
};

/** Lifecycle: beta — company/legal profile used in emails, JSON-LD, legal pages. */
export function SettingsScreen() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [faviconUpdatedAt, setFaviconUpdatedAt] = useState<string | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const [execute, saveBusy] = useAsyncAction();

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "company"),
      (snap) => {
        const parsed = snap.exists() ? companySettingsSchema.safeParse(snap.data()) : null;
        setSettings(parsed?.success ? parsed.data : EMPTY);
      },
      (err) => console.error("[Settings] snapshot error:", err),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "branding"),
      (snap) => {
        const data = snap.data() as { faviconUpdatedAt?: string } | undefined;
        setFaviconUpdatedAt(data?.faviconUpdatedAt ?? null);
      },
      (err) => console.error("[Settings] branding snapshot error:", err),
    );
  }, []);

  async function save() {
    if (!settings) return;
    trackEvent("settings_save");
    await execute(async () => {
      await setDoc(doc(db, "settings", "company"), companySettingsSchema.parse(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  async function uploadFavicon(file: File) {
    setFaviconBusy(true);
    setFaviconError(null);
    trackEvent("favicon_upload");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `uploads/favicon-${Date.now()}-${safeName}`;
      await uploadBytes(storageRef(storage, storagePath), file, {
        contentType: file.type || "application/octet-stream",
      });
      await processFavicon({ storagePath });
    } catch (e) {
      setFaviconError(e instanceof Error ? e.message : "Favicon processing failed");
    } finally {
      setFaviconBusy(false);
      if (faviconInput.current) faviconInput.current.value = "";
    }
  }

  if (!settings) return null;
  const set = (patch: Partial<CompanySettings>) =>
    setSettings({ ...settings, ...patch });

  return (
    <Box className="settings" display="flex" flexDirection="column" gap={2}>
      <Typography variant="body2" color="text.secondary">
        Used in order emails, legal pages, and structured data.
      </Typography>
      <TextField label="Legal name" value={settings.legalName} onChange={(e) => set({ legalName: e.target.value })} />
      <TextField
        label="Storefront name (trademark)"
        placeholder={settings.legalName || "Public brand name"}
        value={settings.storefrontName}
        onChange={(e) => set({ storefrontName: e.target.value })}
        helperText="Public-facing brand — browser tab, header, metadata, rich results. Legal name stays on legal docs."
      />
      <TextField label="Address" value={settings.address} onChange={(e) => set({ address: e.target.value })} />
      <TextField label="Y-tunnus" value={settings.yTunnus} onChange={(e) => set({ yTunnus: e.target.value })} />
      <TextField label="EU VAT ID" value={settings.euVatId} onChange={(e) => set({ euVatId: e.target.value })} />
      <TextField label="Contact email" value={settings.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
      <TextField label="Privacy representative" value={settings.privacyRep} onChange={(e) => set({ privacyRep: e.target.value })} />
      <TextField
        select
        label="Default locale"
        value={settings.defaultLocale}
        onChange={(e) => set({ defaultLocale: e.target.value as "fi" | "en" })}
      >
        <MenuItem value="en">English</MenuItem>
        <MenuItem value="fi">Suomi</MenuItem>
      </TextField>
      <Button variant="contained" disabled={saveBusy} onClick={save}>
        {saved ? "Saved" : saveBusy ? "Saving…" : "Save"}
      </Button>

      <Box className="favicon-section" mt={3}>
        <Typography variant="h6">Storefront favicon</Typography>
        <Typography variant="body2" color="text.secondary" mb={1}>
          Upload a square logo (PNG or SVG, at least 512×512). It's resized into
          the browser, iOS, and Android icon set automatically.
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          {faviconUpdatedAt && (
            <img
              className="favicon-preview"
              src={`${FAVICON_PREVIEW}&v=${encodeURIComponent(faviconUpdatedAt)}`}
              alt="Current favicon"
            />
          )}
          <input
            ref={faviconInput}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFavicon(f);
            }}
          />
          <Button
            variant="outlined"
            startIcon={<Upload />}
            disabled={faviconBusy}
            onClick={() => faviconInput.current?.click()}
          >
            {faviconBusy
              ? "Processing…"
              : faviconUpdatedAt
                ? "Replace favicon"
                : "Upload favicon"}
          </Button>
        </Box>
        {faviconUpdatedAt && (
          <Typography variant="caption" color="text.secondary">
            Last updated {new Date(faviconUpdatedAt).toLocaleString()} — browser
            tabs can take a few minutes to pick up a new icon.
          </Typography>
        )}
        {faviconError && (
          <Typography variant="body2" color="error" mt={1}>
            {faviconError}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
