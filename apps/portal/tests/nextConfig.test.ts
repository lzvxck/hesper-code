import { describe, expect, test } from "bun:test";

import nextConfig from "../next.config";

/*
 * Both workspace packages ship raw TS(X), so losing either entry does not produce a loud
 * build error — @seri/ui produces a page whose Tailwind classes have all been purged, and
 * @seri/plans fails only once something imports it. Cheap assertion, expensive symptom.
 */
describe("next config", () => {
  test.each(["@seri/ui", "@seri/plans"])("transpiles %s", (pkg) => {
    expect(nextConfig.transpilePackages).toContain(pkg);
  });
});
