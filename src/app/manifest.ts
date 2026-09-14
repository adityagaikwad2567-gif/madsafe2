import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes MedSafe installable on Android/iOS/desktop.
 * `display: standalone` + maskable icons let it sit on a home screen like a native app,
 * which is the foundation of the low-internet mode story.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MedSafe — Scan Before You Take",
    short_name: "MedSafe",
    description:
      "AI-powered medicine safety & awareness platform. Scan a medicine, understand its ingredients, warnings and expiry — before you take it.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0a2540",
    categories: ["medical", "health", "utilities"],
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Scan Medicine",
        short_name: "Scan",
        url: "/scan",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My Medicine Cabinet",
        short_name: "Cabinet",
        url: "/cabinet",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
