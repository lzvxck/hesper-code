import { clearAuthSession, loadAuthSession, saveAuthSession } from "./authStore";
import { openBrowser } from "./browser";
import { pollForToken, requestDeviceCode } from "./deviceFlow";

export async function login(mode: "login" | "signup", clientId: string, configDir: string): Promise<void> {
  const device = await requestDeviceCode(clientId);

  console.log(`To continue, open: ${device.verificationUri}`);
  console.log(`And enter code: ${device.userCode}`);
  await openBrowser(device.verificationUriComplete);

  const result = await pollForToken(clientId, device);

  if (result.status === "denied") {
    console.error("Authorization was denied.");
    return;
  }
  if (result.status === "expired") {
    console.error("The login request expired. Please try again.");
    return;
  }

  saveAuthSession(
    {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      userId: result.user.id,
      email: result.user.email,
      obtainedAt: new Date().toISOString(),
    },
    configDir,
  );

  console.log(mode === "signup" ? `Account created — logged in as ${result.user.email}` : `Logged in as ${result.user.email}`);
}

export function logout(configDir: string): void {
  const existing = loadAuthSession(configDir);
  clearAuthSession(configDir);
  console.log(existing ? "Logged out." : "Not logged in.");
}
