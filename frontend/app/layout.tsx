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

// Enterprise-Grade Metadata & OpenGraph Tags for Link Previews
export const metadata: Metadata = {
  title: "BillionairesTrade | Institutional Intelligence",
  description: "Track institutional disclosures, Form 4 insider trades, and activist stakes in real-time.",
  metadataBase: new URL('https://billionaire-trades.vercel.app'),
  openGraph: {
    title: "BillionairesTrade | Institutional Intelligence",
    description: "Track institutional disclosures, Form 4 insider trades, and activist stakes in real-time.",
    url: "https://billionaire-trades.vercel.app",
    siteName: "BillionairesTrade",
    type: "website",
  },
};

// FIX: Replaced the undefined 'LayoutProps<"/">' with standard Next.js TypeScript declarations
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