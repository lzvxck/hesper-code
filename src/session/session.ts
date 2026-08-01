import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PermissionMode } from "../gate/gate";

export type SessionState = {
  id: string;
  cwd: string;
  agentsFilePath?: string;
  permissionMode: PermissionMode;
  messages: unknown[];
};

export function saveSession(state: SessionState, sessionsDir: string): void {
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(join(sessionsDir, `${state.id}.json`), JSON.stringify(state));
}

export function loadSession(id: string, sessionsDir: string): SessionState {
  const path = join(sessionsDir, `${id}.json`);
  if (!existsSync(path)) throw new Error(`Session "${id}" not found in ${sessionsDir}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function findMostRecentSession(sessionsDir: string): string | undefined {
  if (!existsSync(sessionsDir)) return undefined;

  let mostRecentId: string | undefined;
  let mostRecentMtime = -Infinity;
  for (const file of readdirSync(sessionsDir)) {
    if (!file.endsWith(".json")) continue;
    const mtime = statSync(join(sessionsDir, file)).mtimeMs;
    if (mtime > mostRecentMtime) {
      mostRecentMtime = mtime;
      mostRecentId = file.slice(0, -".json".length);
    }
  }
  return mostRecentId;
}
