import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Hesper — a coding agent that asks before it writes",
  description:
    "A cross-platform coding CLI with gate-first permissions. Every write, command and edit clears a gate you control — and new sessions start read-only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Reveal.tsx renders the hidden state on the server to avoid a flash, so without
            JS the content would never un-hide. This restores it. */}
        <noscript>
          <style>{`[data-reveal] { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
