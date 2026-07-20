"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import type { LocalSpot } from "../_lib/local-mode";
import { Modal } from "./Modal";

type City = { city: string; state: string; count: number; lat: number; lon: number };

// The Local mode gate: explains the mode, then lets the player anchor it — one
// tap on "Use my location" (browser geolocation → nearest pool city), or an
// explicit pick from every city we have homes in. The chosen spot is handed back
// to LocalGame; nothing here talks to localStorage.
export function LocalModeModal({
  onPick,
  onClose,
}: {
  onPick: (spot: LocalSpot) => void;
  onClose: () => void;
}) {
  const [cities, setCities] = useState<City[] | null>(null);
  const [filter, setFilter] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/local?cities=1")
      .then((r) => r.json())
      .then((d) => setCities(d.cities ?? []))
      .catch(() => setCities([]));
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!cities) return [];
    return q ? cities.filter((c) => `${c.city}, ${c.state}`.toLowerCase().includes(q)) : cities;
  }, [cities, filter]);

  // Browser geolocation → resolve the nearest pool city server-side. Anything
  // that goes wrong (denied, timeout, too far from any pool city) lands the
  // player on the picker with an honest one-liner, never a dead end.
  const locateMe = (dismiss: () => void) => {
    if (locating) return;
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Your browser doesn't share location — pick a city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const res = await fetch(`/api/local?lat=${lat}&lon=${lon}&count=1`);
          const data = await res.json();
          if (data.tooFar) {
            setGeoError("No homes near you yet — pick a city instead.");
          } else if (data.city) {
            onPick({ city: data.city.city, state: data.city.state, lat, lon });
            dismiss();
          } else {
            setGeoError("Couldn't place you — pick a city instead.");
          }
        } catch {
          setGeoError("Couldn't place you — pick a city instead.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied — pick a city instead."
            : "Couldn't get your location — pick a city instead.",
        );
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  };

  return (
    <Modal onClose={onClose} label="Local mode" maxWidth="md">
      {(dismiss) => (
        <>
          <h2 className="text-2xl font-black text-emerald-900">📍 Local mode</h2>
          <p className="mt-1 text-sm text-stone-500">An endless run of real homes near you.</p>

          <button
            onClick={() => locateMe(dismiss)}
            disabled={locating}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {locating ? (
              <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <MapPin size={18} aria-hidden="true" />
            )}
            {locating ? "Finding you…" : "Use my location"}
          </button>
          {geoError && <p className="mt-2 text-center text-sm text-red-600">{geoError}</p>}

          <div className="mt-4 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-stone-400">
            <span className="h-px flex-1 bg-stone-200" aria-hidden="true" />
            or pick a city
            <span className="h-px flex-1 bg-stone-200" aria-hidden="true" />
          </div>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search cities"
            aria-label="Search cities"
            className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />

          <ul className="mt-2 max-h-56 overflow-y-auto overscroll-contain">
            {cities === null ? (
              <li className="py-6 text-center text-sm text-stone-400">Loading cities…</li>
            ) : shown.length === 0 ? (
              <li className="py-6 text-center text-sm text-stone-400">No cities match.</li>
            ) : (
              shown.map((c) => (
                <li key={`${c.city}|${c.state}`}>
                  <button
                    onClick={() => {
                      onPick({ city: c.city, state: c.state, lat: c.lat, lon: c.lon });
                      dismiss();
                    }}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-emerald-50"
                  >
                    {c.city}, {c.state}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </Modal>
  );
}
