import { authkitProxy } from "@workos-inc/authkit-nextjs";

/*
 * Next 16 renamed middleware.ts to proxy.ts, and authkit-nextjs 4 renamed the helper to
 * match — `authkitMiddleware` is still exported but deprecated.
 *
 * `middlewareAuth` makes every matched route secure by default rather than relying on each
 * page remembering to call withAuth, and `unauthenticatedPaths` is deliberately empty: this
 * app has no signed-out surface. /callback is excluded by the matcher instead, since it is
 * what establishes the session in the first place, and the static paths are excluded
 * because a catch-all matcher intercepts them and breaks Tailwind's stylesheet.
 */
export default authkitProxy({
  middlewareAuth: { enabled: true, unauthenticatedPaths: [] },
});

// `callback$` and not `callback`: the bare prefix would also exempt /callbackfoo, which is
// an ordinary protected route this app happens not to have yet.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|callback$).*)"],
};
