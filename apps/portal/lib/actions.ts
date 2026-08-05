"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

// Shared so the error boundary can offer it too: a signed-in user whose page throws is
// otherwise stuck with no way out of the session that is failing.
export async function endSession(): Promise<void> {
  await signOut();
}
