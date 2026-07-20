"use client";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// An odometer for the big price readout: every digit sits in a vertical 0–9
// strip that glides to its new value, so scrubbing the slider makes the number
// flutter like a price ticker instead of teleporting between values. The strips
// only ever animate glyphs — the value itself updates 1:1 with the drag, so the
// control never feels laggy. Cells are keyed from the RIGHT so the low digits
// keep their columns as the number grows or shrinks ($982,000 → $1,020,000).
export function RollingNumber({ text, className = "" }: { text: string; className?: string }) {
  const chars = [...text].reverse();
  return (
    <span
      aria-label={text}
      className={`inline-flex flex-row-reverse tabular-nums ${className}`}
    >
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <span key={i} aria-hidden="true" className="inline-block h-[1em] overflow-hidden">
            <span
              className="flex flex-col transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={{ transform: `translateY(-${Number(c)}em)` }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true" className="inline-block h-[1em] leading-none">
            {c}
          </span>
        ),
      )}
    </span>
  );
}
