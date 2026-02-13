import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BUHUB Backend",
  description: "BUHUB - Campus Community Platform API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
