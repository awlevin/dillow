// Custom next/image loader for realtor.com's rdcpix CDN. rdcpix serves arbitrary
// sizes via a filename token (e.g. rd-w640_h480.jpg), so we resize AT THE CDN and
// bypass Vercel's (billed) Image Optimization entirely — $0 optimization cost
// while still getting responsive, right-sized images per viewport + DPR.

const RDCPIX_RE =
  /^(https?:\/\/[\w.]*rdcpix\.com\/.*\d)(?:rd-w\d+_h\d+|od|s|t|m|b|l|x|o)\.jpg$/i;

export function rdcpixResize(src: string, width: number): string {
  const m = src.match(RDCPIX_RE);
  if (!m) return src; // non-rdcpix (e.g. SimplyRETS) — leave untouched
  const h = Math.round((width * 3) / 4); // 4:3 to match the card
  return `${m[1]}rd-w${width}_h${h}.jpg`;
}

// next/image custom loader (bypasses Vercel optimization).
export function rdcpixLoader({ src, width }: { src: string; width: number }): string {
  return rdcpixResize(src, width);
}

// Tiny ~4KB thumbnail — a free low-quality placeholder for blur-up.
export function rdcpixThumb(src: string): string {
  const m = src.match(RDCPIX_RE);
  return m ? `${m[1]}s.jpg` : src;
}
