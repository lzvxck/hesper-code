import type { NextConfig } from "next";

// @seri/plans ships raw TS, so Next has to compile it rather than treat it as a built dep.
const nextConfig: NextConfig = {
  transpilePackages: ["@seri/plans"],
};

export default nextConfig;
