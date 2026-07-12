// Lazy Lottie mount. The 240KB player script loads only when an animation
// actually appears (never at boot), from our own origin (CSP-safe), and the
// service worker caches it immutably via ?v. Honors reduced-motion.
let playerReady = null;
function loadPlayer(v) {
  if (window.lottie) return Promise.resolve();
  if (!playerReady) playerReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `lottie_svg.min.js?v=${v}`;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return playerReady;
}

export async function mountAnim(el, path, { loop = true, v = "0" } = {}) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  try {
    await loadPlayer(v);
    return window.lottie.loadAnimation({
      container: el, renderer: "svg", loop, autoplay: true, path: `${path}?v=${v}`,
    });
  } catch { return null; }   // decorative — never let it break a screen
}
