import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "./writeFile";

const originalPlatform = process.platform;
const originalFsExports = { ...fs };

function setPlatform(platform: string): void {
  Object.defineProperty(process, "platform", { value: platform });
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "vela-writeFile-test-"));
});

afterEach(() => {
  setPlatform(originalPlatform);
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("writeFile", () => {
  test("atomic write succeeds and file contains the right content", () => {
    const filePath = join(tmpRoot, "out.txt");
    writeFile(filePath, "hello world");
    expect(readFileSync(filePath, "utf8")).toBe("hello world");
  });

  test("preserves an existing CRLF file's line endings", () => {
    const filePath = join(tmpRoot, "crlf.txt");
    writeFileSync(filePath, "old\r\ncontent\r\n");
    writeFile(filePath, "new\ncontent\n");
    expect(readFileSync(filePath, "utf8")).toBe("new\r\ncontent\r\n");
  });

  test("throws when writing to a reserved device name on win32", () => {
    setPlatform("win32");
    const filePath = join(tmpRoot, "CON.txt");
    expect(() => writeFile(filePath, "data")).toThrow();
  });

  test("retries on EBUSY then succeeds", () => {
    const filePath = join(tmpRoot, "locked.txt");
    let failuresLeft = 2;
    mock.module("node:fs", () => ({
      ...originalFsExports,
      renameSync: (src: string, dest: string) => {
        if (failuresLeft > 0) {
          failuresLeft--;
          const err = new Error("resource busy") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        }
        return originalFsExports.renameSync(src, dest);
      },
    }));

    try {
      writeFile(filePath, "unlocked");
    } finally {
      mock.module("node:fs", () => originalFsExports);
    }

    expect(readFileSync(filePath, "utf8")).toBe("unlocked");
  });
});
