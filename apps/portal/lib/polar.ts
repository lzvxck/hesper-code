import { Polar } from "@polar-sh/sdk";

let client: Polar | undefined;

// Anything other than an explicit "production" is read as sandbox, so a missing or
// misspelled POLAR_SERVER cannot point real money at the wrong environment.
export function polarServer(): "sandbox" | "production" {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

// Same laziness as getSupabaseClient, for the same reason.
export function getPolarClient(): Polar {
  if (!client) {
    client = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN!, server: polarServer() });
  }
  return client;
}
