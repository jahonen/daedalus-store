/**
 * Vertex AI model configuration.
 * Values verified live by infra/scripts/provision.sh — see infra/models.json.
 * Re-run provisioning to upgrade as EU regional availability expands.
 */
export const TEXT_MODEL = {
  id: "gemini-3.5-flash",
  location: "europe-west3",
} as const;

export const IMAGE_MODEL = {
  id: "gemini-2.5-flash-image", // retires 2027-03-15; upgrade path: gemini-3.1-flash-image
  location: "europe-north1",
} as const;
