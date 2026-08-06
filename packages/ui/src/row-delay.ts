/*
 * The Reveal delay for item `index` of a grid `columns` wide: 0, 100, 200… across a row, back
 * to 0 at the start of the next one.
 *
 * The invariant is that `columns` equals the N in the adjacent `md:grid-cols-N`, and it used to
 * be hand-maintained as a literal `% 2` or `% 3` sitting next to a class name nothing checked
 * it against. Two of the six sites were wrong and passed only because their arrays happened to
 * be exactly one row long, so the whole second row of either would have staggered 300ms, 400ms,
 * 500ms the moment an entry was added. Passing the count makes the coupling an argument.
 *
 * A single-column stacked list is not this: `columns: 1` returns 0 for every item, which is
 * correct for a row of one and wrong for a list whose stagger runs down the page. Those keep
 * `index * 100`.
 *
 * Its own module rather than reveal.tsx, which is where it belongs by subject: that file is
 * "use client", every call site is a server component, and the build fails on
 * `Attempted to call rowDelay() from the server but rowDelay is on the client` — measured, not
 * assumed.
 */
export const rowDelay = (index: number, columns: number) => (index % columns) * 100;
