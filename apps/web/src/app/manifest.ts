import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/** Lets people add ProofBeforePay to their home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProofBeforePay",
    short_name: "ProofBeforePay",
    description: "Check a supplier before you pay the deposit. Every claim cited.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f8fe",
    theme_color: "#f3f8fe",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
