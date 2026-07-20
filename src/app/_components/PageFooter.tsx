"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { loadRecentHomes, loadRooms, type SavedHome, type SavedRoom } from "../_lib/client-storage";
import { usd } from "../_lib/format";

type Panel = "friends" | "homes";

// The quiet utility strip at the foot of every page: re-entry to the rooms and
// homes you've played, plus the changelog. Friends/Recent homes stay hidden until
// you have history; each expands in place as an accordion (one open at a time),
// so the row stays a single tidy baseline instead of three stacked orphans.
export function PageFooter() {
  const pathname = usePathname();
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [homes, setHomes] = useState<SavedHome[]>([]);
  const [open, setOpen] = useState<Panel | null>(null);
  // roomId -> how many members have played today; fills in as fetches land.
  const [played, setPlayed] = useState<Record<string, number>>({});

  useEffect(() => {
    // Deferred (async) so the localStorage read lands after mount — reading it
    // during render would break SSR hydration.
    (async () => {
      setRooms(loadRooms());
      setHomes(loadRecentHomes());
    })();
  }, []);

  const shownRooms = rooms.slice(0, 6);

  // Fetch the "N played today" counts only once the Friends panel is opened —
  // best-effort and in parallel, so a slow or failed fetch just leaves that row
  // without a count and never blocks or reflows the list.
  useEffect(() => {
    if (open !== "friends") return;
    let cancelled = false;
    for (const r of shownRooms) {
      if (r.roomId in played) continue;
      fetch(`/api/room/${r.roomId}?summary=1`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data || typeof data.playedCount !== "number") return;
          setPlayed((p) => ({ ...p, [r.roomId]: data.playedCount }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rooms]);

  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));

  // Assemble the row from only the entries that apply, then interleave middot
  // separators — so a separator never brackets a hidden slot.
  const entries: ReactNode[] = [];
  // The mode pair leads the row: the game you're in reads as the current one
  // (Random is the default on the home page), the other is one tap away.
  entries.push(
    <span key="modes" className="flex items-center gap-1.5">
      <ModeLink href="/" label="🎲 Random mode" current={pathname === "/"} />
      <span aria-hidden="true" className="select-none text-stone-300">
        /
      </span>
      <ModeLink href="/local" label="📍 Local mode" current={pathname === "/local"} />
    </span>,
  );
  if (rooms.length > 0)
    entries.push(
      <FooterToggle key="friends" label="Friends" active={open === "friends"} onClick={() => toggle("friends")} />,
    );
  if (homes.length > 0)
    entries.push(
      <FooterToggle key="homes" label="Recent homes" active={open === "homes"} onClick={() => toggle("homes")} />,
    );
  entries.push(
    <Link key="whatsnew" href="/changelog" className="text-stone-400 transition hover:text-stone-600">
      What&apos;s new
    </Link>,
  );

  // Each separator is bound to the entry it precedes (one nowrap unit), so a
  // line break can never strand a lone "·" at the end of a wrapped line.
  const row: ReactNode[] = entries.map((node, i) =>
    i === 0 ? (
      node
    ) : (
      <span key={`entry-${i}`} className="flex items-center gap-x-3">
        <span aria-hidden="true" className="select-none text-stone-300">
          ·
        </span>
        {node}
      </span>
    ),
  );

  return (
    <footer className="mx-auto w-full max-w-xl px-4 pb-8 pt-4 sm:mt-auto sm:pt-6">
      <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5 border-t border-stone-200/70 pt-3 text-xs font-medium">
        {row}
      </nav>

      {open === "friends" && (
        <ul className="animate-reveal mx-auto mt-2 flex w-full max-w-xs flex-col gap-0.5">
          {shownRooms.map((r) => (
            <li key={r.roomId}>
              <Link
                href={`/r/${r.roomId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm text-stone-600 transition hover:bg-amber-50"
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-medium">{r.title ?? `Room ${r.roomId}`}</span>
                  {played[r.roomId] != null && (
                    <span className="shrink-0 text-xs text-stone-400">· {played[r.roomId]} played</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-stone-400">{r.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open === "homes" && (
        <ul className="animate-reveal mx-auto mt-2 flex w-full max-w-xs flex-col gap-0.5">
          {homes.map((h) => (
            <li key={`${h.date}:${h.propertyId}`}>
              <Link
                href={`/h/${h.propertyId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm text-stone-600 transition hover:bg-amber-50"
              >
                <span className="truncate font-medium">{h.title}</span>
                <span className="shrink-0 font-semibold text-stone-500">{usd(h.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}

// One side of the Random/Local pair: the current mode reads as a quiet label,
// the other as a link inviting the switch.
function ModeLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  if (current) {
    return (
      <span aria-current="page" className="font-semibold text-emerald-700">
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="text-stone-400 transition hover:text-emerald-600">
      {label}
    </Link>
  );
}

function FooterToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex items-center gap-1 transition hover:text-stone-600 ${active ? "text-stone-600" : "text-stone-400"}`}
    >
      {label}
      <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${active ? "rotate-180" : ""}`} />
    </button>
  );
}
