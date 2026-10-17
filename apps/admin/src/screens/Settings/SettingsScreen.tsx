import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import type { CompanySettings } from "@daedalus/shared";
import { companySettingsSchema } from "@daedalus/shared";
import { db } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import "./SettingsScreen.scss";

const EMPTY: CompanySettings = {
  legalName: "",
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

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "company"), (snap) => {
      setSettings(
        snap.exists() ? companySettingsSchema.parse(snap.data()) : EMPTY,
      );
    });
  }, []);

  async function save() {
    if (!settings) return;
    trackEvent("settings_save");
    await setDoc(doc(db, "settings", "company"), companySettingsSchema.parse(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      <Button variant="contained" onClick={save}>
        {saved ? "Saved ✓" : "Save"}
      </Button>
    </Box>
  );
}
