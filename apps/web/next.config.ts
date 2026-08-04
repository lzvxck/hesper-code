import type { NextConfig } from "next";

const RAW_BASE = "https://raw.githubusercontent.com/lzvxck/seri-agent/main";

// @seri/ui ships raw TSX, so Next has to compile it rather than treat it as a built dep.
const nextConfig: NextConfig = {
  transpilePackages: ["@seri/ui"],
  // The installers are documented under this domain but live at the repo root, so the
  // rewrite proxies main's copy rather than duplicating the scripts into public/.
  async rewrites() {
    return [
      { source: "/install.sh", destination: `${RAW_BASE}/install.sh` },
      { source: "/install.ps1", destination: `${RAW_BASE}/install.ps1` },
    ];
  },
};

export default nextConfig;
