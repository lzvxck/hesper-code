import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RevealNoScript } from "@seri/ui";

import "./globals.css";

export const metadata: Metadata = {
  // Without this Next emits a relative og:image URL, which most scrapers reject.
  metadataBase: new URL("https://seriora.ai"),
  title: "Seriora Research",
  description:
    "Seriora Research builds tools for working alongside models — small, legible programs that do what you asked and stop where you said.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <RevealNoScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
