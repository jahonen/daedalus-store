import type { MetadataRoute } from "next";
import { getCompanySettings } from "@/lib/data";
import { brandAsset } from "@/lib/brand";
import { storefrontLabel } from "@/lib/jsonld";

/** Web manifest referencing the admin-uploaded brand icons. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = storefrontLabel(await getCompanySettings());
  return {
    name,
    short_name: name,
    description: `Official ${name} store.`,
    start_url: "/",
    display: "browser",
    theme_color: "#1c1c1e",
    background_color: "#f4f4f6",
    icons: [
      {
        src: brandAsset("icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: brandAsset("icon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
