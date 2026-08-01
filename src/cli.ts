import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// import.meta.url resolves to a real src/cli.ts path under `bun run`/`bun test`,
// but to a virtual embedded path once compiled via `bun build --compile`. Fall
// back to the location of the compiled binary itself in that case.
function findPackageJsonPath(): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    join(dirname(process.execPath), "..", "package.json"),
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error("could not locate package.json");
  return found;
}

const pkg = JSON.parse(readFileSync(findPackageJsonPath(), "utf8")) as { version: string };

export function run(argv: string[]): number {
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(`vela ${pkg.version}`);
    return 0;
  }
  return 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2)));
