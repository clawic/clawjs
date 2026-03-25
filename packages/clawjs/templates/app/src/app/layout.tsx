import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "__APP_TITLE__",
  description: "Minimal Next.js starter prewired for ClawJS.",
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
