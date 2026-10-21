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
      <TextField
        label="Legal name"
        value={settings.legalName}
        onChange={(e) => set({ legalName: e.target.value })}
      />
      <TextField
        label="Address"
        value={settings.address}
        onChange={(e) => set({ address: e.target.value })}
      />
      {(
        [
          "streetAddress",
          "postalCode",
          "addressLocality",
          "addressRegion",
          "addressCountry",
        ] as const
      ).map((field) => (
        <TextField
          key={field}
          label={
            {
              streetAddress: "Street address",
              postalCode: "Postal code",
              addressLocality: "City / locality",
              addressRegion: "Region (optional)",
              addressCountry: "Country code (ISO, e.g. FI)",
            }[field]
          }
          value={settings.postalAddress?.[field] ?? ""}
          onChange={(e) =>
            set({
              postalAddress: {
                streetAddress: "",
                postalCode: "",
                addressLocality: "",
                addressRegion: "",
                addressCountry: "",
                ...settings.postalAddress,
                [field]: field === "addressCountry" ? e.target.value.toUpperCase() : e.target.value,
              },
            })
          }
          helperText={
            field === "streetAddress"
              ? "Structured fields feed rich results. Enter verified company details; the legacy address remains a fallback."
              : undefined
          }
        />
      ))}
      <TextField
        label="Y-tunnus"
        value={settings.yTunnus}
        onChange={(e) => set({ yTunnus: e.target.value })}
      />
      <TextField
        label="EU VAT ID"
        value={settings.euVatId}
        onChange={(e) => set({ euVatId: e.target.value })}
      />
      <TextField
        label="Contact email"
        value={settings.contactEmail}
        onChange={(e) => set({ contactEmail: e.target.value })}
      />
      <TextField
        label="Return policy countries (ISO codes, comma separated)"
        value={(settings.returnPolicyCountries ?? []).join(",")}
        onBlur={() =>
          set({ returnPolicyCountries: (settings.returnPolicyCountries ?? []).filter(Boolean) })
        }
        onChange={(e) =>
          set({
            returnPolicyCountries: e.target.value
              .toUpperCase()
              .split(",")
              .map((value) => value.trim()),
          })
        }
        helperText="Enter only countries covered by the published 14-day return policy. Empty omits return-policy structured data."
      />
      <TextField
        label="Privacy representative"
        value={settings.privacyRep}
        onChange={(e) => set({ privacyRep: e.target.value })}
      />
    </Box>
  );
}
