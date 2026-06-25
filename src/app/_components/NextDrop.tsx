"use client";

import { useEffect, useState } from "react";
import { msUntilNextDrop } from "../_lib/game-day";
import { HouseMark } from "./LoadingHouse";

function TimeUnit({ value, label, animateKey }: { value: number; label: string; animateKey?: number }) {
  const text = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative overflow-hidden rounded-xl bg-emerald-900/90 px-3 py-2 shadow-inner sm:px-4 sm:py-2.5">
        <span
          key={animateKey}
          className={`block min-w-[1.6ch] text-center text-3xl font-black tabular-nums tracking-tight text-white sm:text-4xl ${
            animateKey !== undefined ? "animate-tickpop" : ""
          }`}
        >
          {text}
        </span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700/70">{label}</span>
    </div>
  );
}

export function NextDrop() {
  const [ms, setMs] = useState<number>(() => msUntilNextDrop());
  const [next, setNext] = useState<{ city: string; state: string } | null>(null);

  useEffect(() => {
    const tick = () => setMs(msUntilNextDrop());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/tomorrow")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.city) setNext({ city: d.city, state: d.state });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  return (
    <section className="animate-reveal relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-5 text-center shadow-sm">
      <div
        aria-hidden
        className="animate-nextglow pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_-10%,theme(colors.emerald.200/0.5),transparent)]"
      />
      <div className="relative flex flex-col items-center gap-3">
        <h2 className="text-base font-extrabold tracking-tight text-emerald-900">🏡 Next home drops in</h2>

        <div className="flex items-end justify-center gap-2 sm:gap-3">
          <TimeUnit value={hours} label="hrs" />
          <span className="pb-7 text-2xl font-black text-emerald-300 sm:text-3xl">:</span>
          <TimeUnit value={mins} label="min" />
          <span className="pb-7 text-2xl font-black text-emerald-300 sm:text-3xl">:</span>
          <TimeUnit value={secs} label="sec" animateKey={secs} />
        </div>

        {next ? (
          <p className="animate-reveal text-sm text-stone-600">
            Tomorrow we&apos;re house-hunting in{" "}
            <span className="inline-block whitespace-nowrap font-bold text-emerald-800">
              📍 {next.city}, {next.state}
            </span>
          </p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-stone-400">
            <HouseMark className="h-5 w-5" />
            Scouting tomorrow&apos;s city…
          </p>
        )}
      </div>
    </section>
  );
}
