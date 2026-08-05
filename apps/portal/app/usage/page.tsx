import { Shell } from "@/app/Shell";
import { getSessionUser } from "@/lib/session";

/*
 * A placeholder that says what it is. proxy.ts secures every matched route, so this page opts
 * into nothing — getSessionUser is here for the email the account row shows, and the redirect
 * to AuthKit has already happened by the time it runs.
 */
export default async function UsagePage() {
  const user = await getSessionUser();

  return (
    <Shell email={user.email}>
      <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">Usage</h1>
      <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
        Per-session token and spend detail lives here. It is not built yet — Manage billing has your
        invoices and payment history in the meantime.
      </p>
    </Shell>
  );
}
