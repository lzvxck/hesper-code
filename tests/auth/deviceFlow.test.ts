import { describe, expect, test } from "bun:test";
import { type DeviceAuthorization, pollForToken, requestDeviceCode } from "../../src/auth/deviceFlow";

function fakeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: async () => body } as Response;
}

describe("requestDeviceCode", () => {
  test("posts client_id as JSON and maps the snake_case response to camelCase", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchFn = async (url: string, init: RequestInit) => {
      captured = { url, init };
      return fakeResponse(true, {
        device_code: "dc-1",
        user_code: "ABCD-1234",
        verification_uri: "https://example.com/device",
        verification_uri_complete: "https://example.com/device?user_code=ABCD-1234",
        expires_in: 300,
        interval: 5,
      });
    };

    const result = await requestDeviceCode("client_123", fetchFn as unknown as typeof fetch);

    expect(result).toEqual({
      deviceCode: "dc-1",
      userCode: "ABCD-1234",
      verificationUri: "https://example.com/device",
      verificationUriComplete: "https://example.com/device?user_code=ABCD-1234",
      expiresIn: 300,
      interval: 5,
    });
    expect(captured?.url).toBe("https://api.workos.com/user_management/authorize/device");
    expect(captured?.init.method).toBe("POST");
    expect(captured?.init.headers).toEqual({ "Content-Type": "application/json" });
    expect(captured?.init.body).toBe(JSON.stringify({ client_id: "client_123" }));
  });
});

describe("pollForToken", () => {
  const device: DeviceAuthorization = {
    deviceCode: "dc-1",
    userCode: "ABCD-1234",
    verificationUri: "https://example.com/device",
    verificationUriComplete: "https://example.com/device?user_code=ABCD-1234",
    expiresIn: 300,
    interval: 5,
  };

  test("waits `interval` seconds between polls and returns the token on success", async () => {
    const responses = [
      fakeResponse(false, { error: "authorization_pending" }),
      fakeResponse(false, { error: "authorization_pending" }),
      fakeResponse(true, {
        access_token: "at-1",
        refresh_token: "rt-1",
        user: { id: "user_1", email: "a@example.com" },
      }),
    ];
    const fetchFn = (async () => responses.shift() as Response) as unknown as typeof fetch;
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    const result = await pollForToken("client_123", device, { fetchFn, sleep, now: () => 0 });

    expect(result).toEqual({
      status: "success",
      accessToken: "at-1",
      refreshToken: "rt-1",
      user: { id: "user_1", email: "a@example.com" },
    });
    expect(sleepCalls).toEqual([5000, 5000, 5000]);
  });

  test("slow_down increases the wait by 5 seconds for subsequent polls", async () => {
    const responses = [
      fakeResponse(false, { error: "authorization_pending" }),
      fakeResponse(false, { error: "slow_down" }),
      fakeResponse(true, {
        access_token: "at-1",
        refresh_token: "rt-1",
        user: { id: "user_1", email: "a@example.com" },
      }),
    ];
    const fetchFn = (async () => responses.shift() as Response) as unknown as typeof fetch;
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
    };

    await pollForToken("client_123", device, { fetchFn, sleep, now: () => 0 });

    expect(sleepCalls).toEqual([5000, 5000, 10000]);
  });

  test("access_denied is terminal and returns {status: 'denied'} without further polling", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return fakeResponse(false, { error: "access_denied" });
    }) as unknown as typeof fetch;

    const result = await pollForToken("client_123", device, { fetchFn, sleep: async () => {}, now: () => 0 });

    expect(result).toEqual({ status: "denied" });
    expect(calls).toBe(1);
  });

  test("expired_token is terminal and returns {status: 'expired'}", async () => {
    const fetchFn = (async () => fakeResponse(false, { error: "expired_token" })) as unknown as typeof fetch;

    const result = await pollForToken("client_123", device, { fetchFn, sleep: async () => {}, now: () => 0 });

    expect(result).toEqual({ status: "expired" });
  });

  test("client-side backstop: expires when injected now() passes device.expiresIn before a terminal response arrives", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return fakeResponse(false, { error: "authorization_pending" });
    }) as unknown as typeof fetch;
    // now() sequence: 0 (deadline calc), 0 (pre-poll check, not yet expired — one poll
    // happens), then past the 300s expiry (pre-poll check for the would-be second poll).
    const nowValues = [0, 0, 301_000];
    const now = () => nowValues.shift() ?? 301_000;

    const result = await pollForToken("client_123", device, { fetchFn, sleep: async () => {}, now });

    expect(result).toEqual({ status: "expired" });
    expect(calls).toBe(1);
  });
});
