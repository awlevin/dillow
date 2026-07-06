import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { PageFooter } from "./_components/PageFooter";

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
        {/* One quiet footer strip for the whole site: Friends / Recent homes (shown
            only once you have history) and the changelog, on a single baseline. On
            tall screens sm:mt-auto pins it to the bottom. */}
        <PageFooter />
        <Analytics />
      </body>
    </html>
  );
}
