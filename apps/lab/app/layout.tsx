import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RevealNoScript } from "@seri/ui";

import "./globals.css";

export const metadata: Metadata = {
  // Without this Next emits a relative og:image URL, which most scrapers reject.
  metadataBase: new URL("https://seriora.ai"),
  title: "Seriora Research",
  description:
    "Seriora Research is an independent lab working on autonomous agents that learn from their own work — what an agent should keep, how that changes what it does next, and how anyone can tell whether it actually got better.",
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
