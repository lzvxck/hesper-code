import { spawnSync } from "node:child_process";
import { rgPath } from "@vscode/ripgrep";

type RgMatchEvent = {
  type: "match";
  data: { path: { text: string }; line_number: number; lines: { text: string } };
};

export function grep(pattern: string, opts: { path: string; glob?: string }): { file: string; line: number; text: string }[] {
  const args = ["--json"];
  if (opts.glob) args.push("-g", opts.glob);
  args.push(pattern, opts.path);

  const result = spawnSync(rgPath, args, { encoding: "utf8" });
  // rg exits 1 when there are no matches (not an error); anything else is a real failure.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`rg exited with code ${result.status}: ${result.stderr}`);
  }

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string })
    .filter((event): event is RgMatchEvent => event.type === "match")
    .map((event) => ({
      file: event.data.path.text,
      line: event.data.line_number,
      text: event.data.lines.text.replace(/\r?\n$/, ""),
    }));
}
