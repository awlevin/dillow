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

export const metadata: Metadata = {
  metadataBase: new URL("https://dillow.vercel.app"),
  title: "Dillow — Guess the Price",
  description: "A daily real estate price-guessing game. New home every day.",
  openGraph: {
    title: "Dillow — Guess the Price",
    description: "Higher or lower? Nail the daily home's price in 5 tries.",
    url: "https://dillow.vercel.app",
    siteName: "Dillow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dillow — Guess the Price",
    description: "Higher or lower? Nail the daily home's price in 5 tries.",
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
