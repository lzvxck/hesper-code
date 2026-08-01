import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import * as self from "./bash";

const WIN32_GIT_BASH_PATHS = ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"];

function findOnPath(command: string): string | null {
  const dirs = (process.env.PATH ?? "").split(delimiter);
  const names = process.platform === "win32" ? [`${command}.exe`, command] : [command];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function isBashAvailable(): boolean {
  if (findOnPath("bash")) return true;
  return process.platform === "win32" && WIN32_GIT_BASH_PATHS.some(existsSync);
}

function resolveBashCommand(): string {
  return findOnPath("bash") ?? WIN32_GIT_BASH_PATHS.find(existsSync) ?? "bash";
}

export function runBash(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!self.isBashAvailable()) {
    throw new Error("bash is not available on this system");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(resolveBashCommand(), ["-c", command]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}
