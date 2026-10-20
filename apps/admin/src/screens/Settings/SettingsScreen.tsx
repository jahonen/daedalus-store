import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { Box, Button, Tab, Tabs } from "@mui/material";
import type { CompanySettings, IntegrationsSettings } from "@daedalus/shared";
import { companySettingsSchema, integrationsSettingsSchema } from "@daedalus/shared";
import { db, fns, storage, storageBucket } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { CompanyTab } from "./CompanyTab";
import { SiteTab } from "./SiteTab";
import { IntegrationsTab } from "./IntegrationsTab";
import "./SettingsScreen.scss";

const processFavicon = httpsCallable<{ storagePath: string }>(fns, "processFavicon");

export const FAVICON_PREVIEW =
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
  gaMeasurementId: "",
  siteUrl: "",
};

const EMPTY_INTEGRATIONS: IntegrationsSettings = {
  gaApiSecret: "",
  bluesky: { handle: "", appPassword: "", serviceUrl: "https://bsky.social" },
};

const TABS = ["Company", "Site", "Integrations"] as const;

/** Lifecycle: beta — tabbed configuration: company profile, site identity, integrations. */
export function SettingsScreen() {
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsSettings>(EMPTY_INTEGRATIONS);
  const [saved, setSaved] = useState(false);
  const [faviconUpdatedAt, setFaviconUpdatedAt] = useState<string | null>(null);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
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
      doc(db, "settings", "integrations"),
      (snap) => {
        const parsed = snap.exists()
          ? integrationsSettingsSchema.safeParse(snap.data())
          : null;
        setIntegrations(parsed?.success ? parsed.data : EMPTY_INTEGRATIONS);
      },
      (err) => console.error("[Settings] integrations snapshot error:", err),
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
      await setDoc(doc(db, "settings", "integrations"), integrationsSettingsSchema.parse(integrations));
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
    }
  }

  if (!settings) return null;
  const set = (patch: Partial<CompanySettings>) =>
    setSettings({ ...settings, ...patch });
  const setInteg = (patch: Partial<IntegrationsSettings>) =>
    setIntegrations({ ...integrations, ...patch });

  return (
    <Box className="settings">
      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {TABS.map((t) => (
          <Tab key={t} label={t} />
        ))}
      </Tabs>

      <Box mt={2} display="flex" flexDirection="column" gap={2}>
        {tab === 0 && <CompanyTab settings={settings} set={set} />}
        {tab === 1 && (
          <SiteTab
            settings={settings}
            set={set}
            faviconUpdatedAt={faviconUpdatedAt}
            faviconBusy={faviconBusy}
            faviconError={faviconError}
            uploadFavicon={uploadFavicon}
          />
        )}
        {tab === 2 && (
          <IntegrationsTab settings={settings} set={set} integrations={integrations} setInteg={setInteg} />
        )}
        <Button variant="contained" disabled={saveBusy} onClick={save} className="settings-save">
          {saved ? "Saved" : saveBusy ? "Saving…" : "Save"}
        </Button>
      </Box>
    </Box>
  );
}
