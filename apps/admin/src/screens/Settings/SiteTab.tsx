import { useRef } from "react";
import { Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { Upload } from "@mui/icons-material";
import type { CompanySettings } from "@daedalus/shared";
import { FAVICON_PREVIEW } from "./SettingsScreen";

/** Lifecycle: beta — storefront identity: brand name, locale, favicon. */
export function SiteTab({
  settings,
  set,
  faviconUpdatedAt,
  faviconBusy,
  faviconError,
  uploadFavicon,
}: {
  settings: CompanySettings;
  set: (patch: Partial<CompanySettings>) => void;
  faviconUpdatedAt: string | null;
  faviconBusy: boolean;
  faviconError: string | null;
  uploadFavicon: (file: File) => Promise<void>;
}) {
  const faviconInput = useRef<HTMLInputElement>(null);

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <TextField
        label="Storefront name (trademark)"
        placeholder={settings.legalName || "Public brand name"}
        value={settings.storefrontName}
        onChange={(e) => set({ storefrontName: e.target.value })}
        helperText="Public-facing brand — browser tab, header, metadata, rich results. Legal name stays on legal docs."
      />
      <TextField
        label="Production storefront URL"
        placeholder="https://store.ocatelier.com"
        value={settings.siteUrl}
        onChange={(e) => set({ siteUrl: e.target.value.trim() })}
        helperText="Used for links in generated social posts and other outbound content — product URLs resolve against this base."
      />
      <TextField
        select
        label="Default locale"
        value={settings.defaultLocale}
        onChange={(e) => set({ defaultLocale: e.target.value as "fi" | "en" })}
      >
        <MenuItem value="en">English</MenuItem>
        <MenuItem value="fi">Suomi</MenuItem>
      </TextField>

      <Box className="favicon-section" mt={2}>
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
              if (f)
                void uploadFavicon(f).finally(() => {
                  if (faviconInput.current) faviconInput.current.value = "";
                });
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
