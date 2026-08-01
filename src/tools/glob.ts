import { spawnSync } from "node:child_process";
import { rgPath } from "@vscode/ripgrep";

export function glob(pattern: string, opts: { path: string }): string[] {
  const result = spawnSync(rgPath, ["--files", "-g", pattern, opts.path], { encoding: "utf8" });
  // rg exits 1 when there are no matches (not an error); anything else is a real failure.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`rg exited with code ${result.status}: ${result.stderr}`);
  }

  return result.stdout.split("\n").filter(Boolean);
}
