import { describe, expect, test } from "bun:test";

import nextConfig from "../next.config";

/*
 * The documented install command pipes these two responses straight into a shell, so the
 * rewrite destinations are the only thing standing between `curl … | bash` and arbitrary
 * code. They are asserted in full — a fork, a branch or a host typo has to fail here rather
 * than ship silently, since nothing at the call site reveals where the URL now points.
 */
describe("install script rewrites", () => {
  test("resolve to the seri-agent scripts on main", async () => {
    expect(await nextConfig.rewrites!()).toEqual([
      {
        source: "/install.sh",
        destination: "https://raw.githubusercontent.com/lzvxck/seri-agent/main/install.sh",
      },
      {
        source: "/install.ps1",
        destination: "https://raw.githubusercontent.com/lzvxck/seri-agent/main/install.ps1",
      },
    ]);
  });
});
