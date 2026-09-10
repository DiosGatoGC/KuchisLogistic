import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { AuthProvider } from "@/features/auth/auth-context";
import { PwaRuntime } from "@/features/pwa/pwa-runtime";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KUCHI'S Logistics",
  description: "Sistema interno de operación de KUCHI'S.",
  applicationName: "KUCHI'S Logistics",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KUCHI'S",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/kuchis-logistics-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/kuchis-logistics-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf7f1",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${fredoka.variable} ${nunitoSans.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <PwaRuntime />
      </body>
    </html>
  );
}
