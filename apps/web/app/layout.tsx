import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RevealNoScript } from "@seri/ui";

import "./globals.css";

export const metadata: Metadata = {
  // Without this Next emits a relative og:image URL, which most scrapers reject.
  metadataBase: new URL("https://seri-agent.seriora.ai"),
  title: "seri — a coding agent that asks before it writes",
  description:
    "A cross-platform coding CLI with gate-first permissions. Every write, command and edit clears a gate you control — and new sessions start read-only.",
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
