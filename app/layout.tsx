import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discount Mobility Scooters | A little more freedom",
  description: "Explore travel, folding, and heavy-duty mobility scooters. Compare real specifications and request a personal quote with payment assistance.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
