import { spawnCollect as spawnCollectReal } from "../tools/spawnCollect";

function commandFor(url: string): [string, string[]] {
  if (process.platform === "win32") return ["cmd", ["/c", "start", "", url]];
  if (process.platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}

// Best-effort only: the printed verification_uri/user_code is always the primary path
// (per WorkOS's own device-flow guidance), so a failure to open a browser here is logged
// and swallowed rather than thrown.
export async function openBrowser(url: string, spawnFn: typeof spawnCollectReal = spawnCollectReal): Promise<void> {
  const [executable, args] = commandFor(url);
  try {
    await spawnFn(executable, args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
  }
}
