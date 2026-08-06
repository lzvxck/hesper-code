import type { Polar } from "@polar-sh/sdk";
import type { Order } from "@polar-sh/sdk/models/components/order";
import { polarStatusCode } from "./polar";

/*
 * `orders.list` paginates — Polar's default page size is 10 — and a customer subscribed for a
 * while can hold more orders than that. The SDK's own async iterator walks every page, so this
 * collects the lot rather than silently reporting only the most recent ten.
 */
export async function listOrders(polar: Polar, externalId: string): Promise<Order[]> {
  const pages = await polar.orders.list({ externalCustomerId: externalId });
  const orders: Order[] = [];
  for await (const page of pages) {
    orders.push(...page.result.items);
  }
  return orders;
}

/*
 * Polar generates an invoice PDF asynchronously: `generateInvoice` answers 202, and the
 * document itself lands a "few seconds" later (Polar's own wording) — so the GET that follows
 * 404s until it does. Three retries on a short growing backoff (0.5s, 1s, 2s — 3.5s total on
 * top of the immediate first try) comfortably covers "a few seconds" without turning one click
 * into an open-ended poll; the fourth 404 propagates instead of retrying again.
 */
const RETRY_DELAYS_MS = [500, 1000, 2000];

export async function invoiceUrl(
  polar: Polar,
  orderId: string,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string> {
  await polar.orders.generateInvoice({ id: orderId });
  for (let attempt = 0; ; attempt++) {
    try {
      return (await polar.orders.invoice({ id: orderId })).url;
    } catch (error) {
      if (polarStatusCode(error) !== 404 || attempt >= RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}
