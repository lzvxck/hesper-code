import { describe, expect, test } from "bun:test";
import { run } from "./cli";
import pkg from "../package.json";

describe("run", () => {
  test("--version prints the package.json version and returns 0", () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    const code = run(["--version"]);

    console.log = originalLog;
    expect(code).toBe(0);
    expect(logs).toEqual([`vela ${pkg.version}`]);
  });
});
