import { Box, TextField, Typography } from "@mui/material";
import type { CompanySettings } from "@daedalus/shared";

/** Lifecycle: beta — legal entity profile used in emails, JSON-LD, legal pages. */
export function CompanyTab({
  settings,
  set,
}: {
  settings: CompanySettings;
  set: (patch: Partial<CompanySettings>) => void;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Typography variant="body2" color="text.secondary">
        Used in order emails, legal pages, and structured data.
      </Typography>
      <TextField label="Legal name" value={settings.legalName} onChange={(e) => set({ legalName: e.target.value })} />
      <TextField label="Address" value={settings.address} onChange={(e) => set({ address: e.target.value })} />
      <TextField label="Y-tunnus" value={settings.yTunnus} onChange={(e) => set({ yTunnus: e.target.value })} />
      <TextField label="EU VAT ID" value={settings.euVatId} onChange={(e) => set({ euVatId: e.target.value })} />
      <TextField label="Contact email" value={settings.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
      <TextField label="Privacy representative" value={settings.privacyRep} onChange={(e) => set({ privacyRep: e.target.value })} />
    </Box>
  );
}
