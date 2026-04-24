import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K-12 Demographic Data",
  description:
    "Look up and aggregate NCES demographic data for schools, districts, and state education agencies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
