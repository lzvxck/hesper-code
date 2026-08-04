import type { NextConfig } from "next";

// @seri/ui ships raw TSX, so Next has to compile it rather than treat it as a built dep.
const nextConfig: NextConfig = { transpilePackages: ["@seri/ui"] };

export default nextConfig;
