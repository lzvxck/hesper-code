import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./cli";

const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
  version: string;
};

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
