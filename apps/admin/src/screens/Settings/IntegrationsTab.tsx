import { Box, TextField, Typography } from "@mui/material";
import type { CompanySettings, IntegrationsSettings } from "@daedalus/shared";

/** Lifecycle: beta — third-party credentials. Secrets land in
 *  settings/integrations — admin-only by Firestore rules. */
export function IntegrationsTab({
  settings,
  set,
  integrations,
  setInteg,
}: {
  settings: CompanySettings;
  set: (patch: Partial<CompanySettings>) => void;
  integrations: IntegrationsSettings;
  setInteg: (patch: Partial<IntegrationsSettings>) => void;
}) {
  const setBsky = (patch: Partial<IntegrationsSettings["bluesky"]>) =>
    setInteg({ bluesky: { ...integrations.bluesky, ...patch } });

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Typography variant="subtitle1">Google Analytics</Typography>
      <TextField
        label="Measurement ID"
        placeholder="G-XXXXXXXXXX"
        value={settings.gaMeasurementId}
        onChange={(e) => set({ gaMeasurementId: e.target.value.trim().toUpperCase() })}
        helperText="Leave empty to disable storefront analytics. When set, a GDPR consent banner gates the GA tag."
      />
      <TextField
        label="API secret (server-side purchase events)"
        placeholder="Create in GA4 → Admin → Data Streams → Measurement Protocol"
        type="password"
        value={integrations.gaApiSecret}
        onChange={(e) => setInteg({ gaApiSecret: e.target.value.trim() })}
        helperText="Enables server-side purchase reporting via Measurement Protocol — ad-blocker-proof and fires on confirmed payment. Admin-only; never exposed publicly."
      />

      <Typography variant="subtitle1" mt={2}>
        Bluesky
      </Typography>
      <TextField
        label="Handle"
        placeholder="brand.bsky.social"
        value={integrations.bluesky.handle}
        onChange={(e) => setBsky({ handle: e.target.value.trim() })}
        helperText="Your account handle — also accepts a custom-domain handle (e.g. social.yourbrand.com)."
      />
      <TextField
        label="App password"
        placeholder="xxxx-xxxx-xxxx-xxxx"
        type="password"
        value={integrations.bluesky.appPassword}
        onChange={(e) => setBsky({ appPassword: e.target.value.trim() })}
        helperText="Create in the Bluesky app → Settings → Privacy and security → App Passwords. Use an app password, never your main password."
      />
      <TextField
        label="PDS service URL"
        value={integrations.bluesky.serviceUrl}
        onChange={(e) => setBsky({ serviceUrl: e.target.value.trim() })}
        helperText="https://bsky.social for normal accounts; change only if the account lives on a self-hosted PDS."
      />
    </Box>
  );
}
