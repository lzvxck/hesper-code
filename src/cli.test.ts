import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import { run } from "./cli";
import type { LoopEvent, runLoop } from "./loop/loop";
import { toolDefinitions } from "./provider/tools";
import { loadSession, saveSession, type SessionState } from "./session/session";

describe("run", () => {
  test("--version prints the package.json version and returns 0", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    const code = await run(["--version"]);

    console.log = originalLog;
    expect(code).toBe(0);
    expect(logs).toEqual([`vela ${pkg.version}`]);
  });
});

describe("run (task invocation)", () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalLocalAppData = process.env.LOCALAPPDATA;
  const originalHome = process.env.HOME;
  let sessionsDir: string;
  let tmpConfigRoot: string;

  function restoreEnv(key: string, original: string | undefined): void {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "vela-cli-test-sessions-"));
    // Redirect the config dir to an empty temp dir so a real config.json on this machine
    // can never supply GROQ_API_KEY and mask the "unset" case (same guard as groq.test.ts).
    tmpConfigRoot = mkdtempSync(join(tmpdir(), "vela-cli-test-config-"));
    if (process.platform === "win32") process.env.LOCALAPPDATA = tmpConfigRoot;
    else process.env.HOME = tmpConfigRoot;
  });

  afterEach(() => {
    restoreEnv("GROQ_API_KEY", originalKey);
    restoreEnv("LOCALAPPDATA", originalLocalAppData);
    restoreEnv("HOME", originalHome);
    rmSync(sessionsDir, { recursive: true, force: true });
    rmSync(tmpConfigRoot, { recursive: true, force: true });
  });

  test("missing GROQ_API_KEY returns a non-zero exit code instead of crashing", async () => {
    delete process.env.GROQ_API_KEY;
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (msg: string) => errors.push(String(msg));

    let code: number;
    try {
      code = await run(["do", "a", "task"], { sessionsDir, loadAgentsFile: () => "" });
    } finally {
      console.error = originalError;
    }

    expect(code).not.toBe(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("constructs runLoop with the expected messages, permissionMode, and tools", async () => {
    process.env.GROQ_API_KEY = "fake-test-key";

    type RunLoopOpts = Parameters<typeof runLoop>[0];
    let captured: RunLoopOpts | undefined;
    async function* runLoopFake(opts: RunLoopOpts): AsyncGenerator<LoopEvent, RunLoopOpts["messages"]> {
      captured = opts;
      yield { type: "done", reason: "no-tool-call" };
      return opts.messages;
    }

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(String(msg));

    let code: number;
    try {
      code = await run(["write", "hello.txt"], {
        runLoop: runLoopFake,
        loadAgentsFile: () => "",
        sessionsDir,
      });
    } finally {
      console.log = originalLog;
    }

    expect(code).toBe(0);
    expect(captured).toBeDefined();
    expect(captured?.permissionMode).toBe("read-only");
    expect(captured?.tools).toBe(toolDefinitions);
    expect(captured?.messages.at(-1)).toEqual({ role: "user", content: "write hello.txt" });
    expect(captured?.messages[0]).toEqual({ role: "system", content: "You are Vela, a coding agent." });
  });
});

describe("run (/mode)", () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "vela-cli-test-mode-sessions-"));
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
  });

  test("`--resume /mode` cycles the most-recent session's mode instead of misparsing /mode as a session id", async () => {
    const existing: SessionState = { id: "abc", cwd: ".", permissionMode: "read-only", messages: [] };
    saveSession(existing, sessionsDir);

    const code = await run(["--resume", "/mode"], { sessionsDir });

    expect(code).toBe(0);
    expect(readdirSync(sessionsDir)).toHaveLength(1);
    expect(loadSession("abc", sessionsDir).permissionMode).toBe("approve-each");
  });

  test("bare `/mode` (no --resume) cycles the most-recent session instead of creating a new orphan session", async () => {
    const existing: SessionState = { id: "def", cwd: ".", permissionMode: "read-only", messages: [] };
    saveSession(existing, sessionsDir);

    const code = await run(["/mode"], { sessionsDir });

    expect(code).toBe(0);
    expect(readdirSync(sessionsDir)).toHaveLength(1);
    expect(loadSession("def", sessionsDir).permissionMode).toBe("approve-each");
  });
});
