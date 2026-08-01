import pkg from "../package.json";

export function run(argv: string[]): number {
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(`vela ${pkg.version}`);
    return 0;
  }
  return 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2)));
