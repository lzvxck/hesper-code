/*
 * Reveal renders the hidden state on the server to avoid a flash, so without JS the
 * content would never un-hide. This restores it. It travels with Reveal rather than
 * living in one app's layout, so every app that uses Reveal gets the fallback.
 * Render it inside <head>.
 */
export function RevealNoScript() {
  return (
    <noscript>
      <style>{`[data-reveal] { opacity: 1 !important; transform: none !important; }`}</style>
    </noscript>
  );
}
