import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PwaRegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL), // env-driven — never bakes localhost
  alternates: { canonical: "/" },
  title: {
    default: "MedSafe — Scan Before You Take",
    template: "%s | MedSafe",
  },
  description:
    "MedSafe is an AI-powered medicine safety & awareness platform. Scan a medicine, understand its ingredients, warnings and expiry — before you take it.",
  manifest: "/manifest.webmanifest",
  applicationName: "MedSafe",
  appleWebApp: {
    capable: true,
    title: "MedSafe",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "MedSafe — Scan Before You Take",
    description:
      "AI-powered medicine safety & awareness platform. Scan a medicine, understand its ingredients, warnings and expiry — before you take it.",
    type: "website",
    siteName: "MedSafe",
  },
  twitter: {
    card: "summary",
    title: "MedSafe — Scan Before You Take",
    description: "AI-powered medicine safety & awareness platform.",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a2540",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-navy-900">
        <Providers>
          <PwaRegister />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
