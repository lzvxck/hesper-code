import { describe, expect, test } from "bun:test";

import nextConfig from "../next.config";

/*
 * @seri/ui ships raw TSX, so losing this entry does not produce a loud build error — it
 * produces a page whose Tailwind classes have all been purged. Cheap assertion, expensive
 * symptom.
 */
describe("next config", () => {
  test("transpiles @seri/ui", () => {
    expect(nextConfig.transpilePackages).toContain("@seri/ui");
  });
});
