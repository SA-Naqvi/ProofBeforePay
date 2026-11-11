import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import { MotionNotice } from "@/components/layout/MotionNotice";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { SmoothScroll } from "@/components/layout/SmoothScroll";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://proofbeforepay-qaax.onrender.com"),
  title: "ProofBeforePay · Check a supplier before you pay the deposit",
  description:
    "Paste a supplier's invoice or listing. AI agents built on NVIDIA Nemotron check the company, its registration, customs records, certificates, address and photos, following every inconsistency to a verdict on whether it's safe to pay.",
  openGraph: {
    title: "ProofBeforePay",
    description: "Check a supplier before you pay the deposit. Every claim cited.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProofBeforePay",
    description: "Check a supplier before you pay the deposit. Every claim cited.",
  },
};

export const viewport: Viewport = {
  themeColor: "#080807",
  colorScheme: "dark",
};

// Applies the visitor's animation choice before first paint, so the page never flashes the wrong motion setting.
const MOTION_SCRIPT = `try{var m=localStorage.getItem("pbp:motion");if(m==="full"||m==="reduced")document.documentElement.setAttribute("data-motion",m)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      </head>
      <body>
        <SmoothScroll>
          <RouteProgress />
          {children}
          <MotionNotice />
        </SmoothScroll>
      </body>
    </html>
  );
}
