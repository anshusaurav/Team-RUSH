import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, Hind } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import BackendPing from "@/components/BackendPing";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Display face for headings + brand. Friendly modern sans; pairs well with
// the agricultural-tech tone without leaning enterprise-stiff.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Devanagari face — used as a fallback whenever Hindi text appears in the
// document so we don't render box-glyphs on machines without a system font.
const hind = Hind({
  subsets: ["devanagari", "latin"],
  variable: "--font-deva",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Disha · Syngenta",
  description: "Disha is an AI-guided field force intelligence app for Syngenta sales representatives across India.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Disha",
  },
};

export const viewport: Viewport = {
  themeColor: "#15803d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${hind.variable}`}>
      <body className="bg-stone-50 min-h-screen text-gray-800 antialiased">
        <LocaleProvider>
          <ServiceWorkerRegistrar />
          <BackendPing />
          <Navbar />
          {/* Pages opt into their own width. App pages wrap in .page-shell
              (max-w-2xl) via globals.css; the landing page is free to be
              full-width. */}
          <main>{children}</main>
        </LocaleProvider>
      </body>
    </html>
  );
}
