import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./paths";

export function loadConfig(): Record<string, string> {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, string>;
}

export function getApiKey(name: string): string | undefined {
  return process.env[name] ?? loadConfig()[name];
}
