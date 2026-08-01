import { describe, expect, spyOn, test } from "bun:test";
import * as bashModule from "./bash";

describe("runBash", () => {
  test("runs a trivial command", async () => {
    const result = await bashModule.runBash("echo hi");
    expect(result.stdout.trim()).toBe("hi");
    expect(result.exitCode).toBe(0);
  });

  test("throws before spawning when bash is unavailable", () => {
    const spy = spyOn(bashModule, "isBashAvailable").mockReturnValue(false);
    expect(() => bashModule.runBash("echo hi")).toThrow();
    spy.mockRestore();
  });
});
