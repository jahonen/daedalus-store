import type { MetadataRoute } from "next";
import { brandAsset } from "@/lib/brand";

/** Web manifest referencing the admin-uploaded brand icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Store",
    short_name: "Store",
    start_url: "/",
    display: "browser",
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
