// Animated window scroll to an absolute Y. We step it ourselves (timer + easing)
// rather than scrollTo({behavior:"smooth"}) / scrollIntoView({behavior:"smooth"})
// because the native smooth animation can get silently dropped; stepping the
// position is reliable everywhere. Honors prefers-reduced-motion with a jump.
export function smoothScrollTo(targetY: number, duration = 500) {
  const startY = window.scrollY;
  const dist = targetY - startY;
  if (Math.abs(dist) < 2) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, targetY);
    return;
  }
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const t0 = performance.now();
  const id = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / duration);
    window.scrollTo(0, startY + dist * ease(p));
    if (p >= 1) clearInterval(id);
  }, 16);
}

// A short buzz on supported devices — silently ignored where unavailable.
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
