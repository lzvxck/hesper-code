import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RevealNoScript } from "@seri/ui";

import "./globals.css";

export const metadata: Metadata = {
  // Without this Next emits a relative og:image URL, which most scrapers reject.
  metadataBase: new URL("https://seri-agent.seriora.ai"),
  title: "seri — a coding agent that learns from its own work",
  description:
    "As you work, seri reviews what happened and decides what was worth keeping. What it keeps is bounded, every write waits for your approval by default, and it takes effect next session.",
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
