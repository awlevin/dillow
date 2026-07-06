"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { loadRecentHomes, type SavedHome } from "../../_lib/client-storage";
import { formatPct, usd } from "../../_lib/format";

// A small in-app landing for a home you've already played, reached from the
// "Recent homes" footer. It shows the reveal you earned (price + how close you
// got) and the outbound realtor.com / Zillow links — so tapping a past home lands
// somewhere inside Dillow first instead of bouncing you straight to a listing.
// Rendered entirely from local history, so it only ever reveals a home you
// actually finished (never today's unguessed answer).
export default function RecentHomePage() {
  const params = useParams<{ propertyId: string }>();
  const propertyId = params?.propertyId;
  const [home, setHome] = useState<SavedHome | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Deferred (async) so the localStorage read lands after mount — reading it
    // during render would break SSR hydration.
    (async () => {
      setHome(loadRecentHomes().find((h) => h.propertyId === propertyId) ?? null);
      setLoaded(true);
    })();
  }, [propertyId]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8 sm:py-12">
      <Link
        href="/"
        className="flex items-center gap-1.5 text-sm font-medium text-stone-400 transition hover:text-emerald-600"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Back to today&apos;s homes
      </Link>

      {!loaded ? null : home ? (
        <section className="animate-reveal rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            {home.won ? "🎯 You nailed it" : `You got within ${formatPct(home.pct)}%`}
          </p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-stone-800">{home.title}</h1>
          <p className="mt-3 text-4xl font-black tracking-tight text-emerald-800">{usd(home.price)}</p>
          <p className="mt-0.5 text-xs text-stone-400">actual price</p>

          {(home.url || home.zillowUrl) && (
            <div className="mt-6 flex flex-col gap-2">
              {home.url && <ListingButton href={home.url} label="View on realtor.com" />}
              {home.zillowUrl && <ListingButton href={home.zillowUrl} label="View on Zillow" />}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-2xl">🏠</p>
          <h1 className="mt-2 text-lg font-extrabold text-stone-800">No results for this home yet</h1>
          <p className="mt-1 text-sm text-stone-500">
            Play a home to its finish and it&apos;ll show up here with the listing.
          </p>
          <Link
            href="/"
            className="mx-auto mt-5 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Play today&apos;s homes
          </Link>
        </section>
      )}
    </main>
  );
}

// Tag outbound clicks so the listing sites can attribute the traffic to Dillow;
// rel="noopener" (without noreferrer) keeps the Referer while protecting the tab.
function withUtm(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=dillow&utm_medium=referral&utm_campaign=listing`;
}

function ListingButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={withUtm(href)}
      target="_blank"
      rel="noopener"
      className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
    >
      {label}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}
