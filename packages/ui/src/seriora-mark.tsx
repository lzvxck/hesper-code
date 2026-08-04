/*
 * Traced from brand/logo.png: the sun is a circle centred (310, 103) r 102, cut at y 122
 * where it meets the horizon at x 210 and x 410; the horizon is a lens across the full
 * width. Sweep flag 0 is load-bearing — sweep 1 bulges the dome downward instead.
 */
export function SerioraMark() {
  return (
    <svg width="56" height="12" viewBox="0 0 622 128" fill="currentColor" aria-hidden="true">
      <path d="M410 122A102 102 0 1 0 210 122Z" />
      <path d="M0 121Q310 115 622 121Q310 128 0 121Z" />
    </svg>
  );
}
