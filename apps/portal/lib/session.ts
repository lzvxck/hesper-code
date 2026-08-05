import { withAuth } from "@workos-inc/authkit-nextjs";

export type SessionUser = { userId: string; email: string };

/*
 * The only place a userId enters this application. Everything downstream takes it as an
 * argument, and no route may read an account identifier out of a request: Supabase Auth is
 * unused here, so there is no auth.uid() and no RLS policy to catch an IDOR — this is the
 * whole backstop.
 *
 * `ensureSignedIn` redirects to AuthKit when there is no session, so it must not be wrapped
 * in a try/catch: the redirect is thrown.
 */
export async function getSessionUser(): Promise<SessionUser> {
  const { user } = await withAuth({ ensureSignedIn: true });
  return { userId: user.id, email: user.email };
}
