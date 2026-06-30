import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION = "A new home every day. Guess the price and see if you can win!";

export const metadata: Metadata = {
  metadataBase: new URL("https://dillow.vercel.app"),
  title: "Dillow — Guess the Price",
  description: DESCRIPTION,
  openGraph: {
    title: "Dillow — Guess the Price",
    description: DESCRIPTION,
    url: "https://dillow.vercel.app",
    siteName: "Dillow",
    type: "website",
    // og image is auto-attached from app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "Dillow — Guess the Price",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* On small screens the footer follows the content so "What's new" sits
            just under the game card (above the fold on short phones); on larger
            screens mt-auto pins it to the bottom as a tidy sticky footer. */}
        <footer className="py-3 text-center sm:mt-auto sm:py-6">
          <Link href="/changelog" className="text-xs text-stone-400 transition hover:text-emerald-600">
            What&apos;s new
          </Link>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
