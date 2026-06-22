import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Wordle for real estate — guess a real US home's price in 5 tries. New listing every day.";

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
