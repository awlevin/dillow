# Dillow

A daily real-estate price-guessing game. Every day there's one real US home — study the photos, location, and stats, then **guess the price in 5 tries**. Each guess tells you *higher / lower* plus a proximity band, and you zero in via an over/under slider. There's a global leaderboard with a next-day reveal, personal stats, and a play streak.

- **Live:** https://dillow.vercel.app
- **Repo:** https://github.com/awlevin/dillow
- **Hosting:** Vercel (scope `aaron-levins-projects`)

---

## TL;DR for contributors

- **Next.js 16 (App Router) + React 19 + Tailwind v4 + TypeScript.** Node 20+ (dev machine runs 25).
- **Play-time makes ZERO third-party API calls.** The game reads a committed snapshot (`src/data/pool.json`) plus Upstash Redis. This is deliberate — see [The request budget](#the-request-budget-read-this).
- **The daily property is deterministic:** `pool[(hash(dayKey) + offset) % pool.length]`. Same for everyone, every UTC day. `offset` is an admin-controlled rotation.
- **Listing data comes from the `realtor16` RapidAPI actor** behind a swappable provider adapter. The **free plan is ~30 requests/month** — treat every request as precious.
- **Redis (Upstash)** backs the leaderboard, per-player game state, the daily offset, and the runtime photo-gallery cache.
- Run `npm run dev`, `npm run build`, `npm run lint`. Deploy with `vercel deploy --prod`.
- **Commit + push every change as you go** (project convention).

---

## The request budget (READ THIS)

The single most important constraint. Listings come from `realtor16` on RapidAPI's **free tier: ~30 requests/month**. The entire architecture is built around spending as few as possible:

- **Gameplay spends 0 requests.** `/api/daily`, `/api/attempt`, `/api/leaderboard` only read the committed snapshot + Redis.
- **Requests are spent only by explicit, manual actions:**
  - `POST /api/refresh` — pulls a fresh pool (one request **per city** in `REALTOR16_LOCATIONS`, ~12 by default).
  - `POST /api/enrich?days=N` — fetches full photo galleries for the next `N` deterministic daily listings (one request each).
  - Admin **rotate** / **enrich** actions (one request each, when a property isn't already rich).
- Check remaining quota via the `x-ratelimit-requests-remaining` response header.

**If you're about to write code that calls the provider at request time, stop** — it will drain the month's budget. Cache into the snapshot (dev) or Redis (runtime) instead.

---

## Architecture

```
Browser ──GET /api/daily────────► snapshot pick (+offset) (+Redis gallery)   [0 provider calls]
        ──POST /api/attempt─────► score vs hidden price, Redis game state     [0 provider calls]
        ──GET /api/leaderboard──► past-day reveal from Redis sorted set        [0 provider calls]

Admin   ──POST /api/admin────────► verify | rotate | enrich (Redis offset/gallery)  [≤1 call]
Manual  ──POST /api/refresh──────► realtor16 search × N cities → writes pool.json    [N calls, DEV only]
Manual  ──POST /api/enrich───────► realtor16 details for upcoming dailies → pool.json [N calls, DEV only]
```

### Data sources & the provider adapter

Everything normalizes into one `Property` shape (`src/lib/types.ts`). Providers live in `src/lib/providers/` and are selected by the `PROPERTY_PROVIDER` env var (`src/lib/providers/index.ts`):

- **`realtor16.ts`** (default, production) — wraps the realtor16 RapidAPI actor. `fetchProperties()` does a `/search/forsale` per city (2 photos each); `fetchDetails(id)` hits `/property/details` for the full gallery + `year_built` (1 request each).
- **`simplyrets.ts`** — the public SimplyRETS demo feed. Works with zero credentials but prices are randomized — useful only for wiring/UX.

To add a provider: write a module returning `Property[]` and wire it into the switch in `providers/index.ts`.

### The committed snapshot (`src/data/pool.json`)

```jsonc
{ "fetchedAt": "2026-...", "properties": [ /* Property[] */ ] }
```

This is the game's content (currently **494 listings**). It's imported statically by `src/lib/game.ts`, so it's baked in at build time and gameplay never touches the network. **It is committed to git on purpose.** Update it by running `/api/refresh` or `/api/enrich` locally, then commit + deploy.

> ⚠️ **Vercel's filesystem is read-only at runtime.** `/api/refresh` and `/api/enrich` use `fs.writeFile` on `pool.json` — that only works in local dev. The runtime path for updating data is Redis (galleries/offset), never the snapshot file.

### Deterministic daily selection (`src/lib/game.ts`)

```ts
getDailyProperty(dayKey(), offset) => pool[(hash(dayKey) + offset) % pool.length]
```

`dayKey()` is the UTC `YYYY-MM-DD`. `hash` is FNV-1a. Everyone worldwide gets the same property per day. `offset` (from Redis, default 0) lets an admin **rotate** the property — see [Admin](#admin).

### Game mechanics & scoring (`src/lib/game.ts`)

- `MAX_ATTEMPTS = 5`, `WIN_THRESHOLD = 0.05` (within 5% = win).
- `feedback(guess, actual)` returns `{ direction: higher|lower|match, band, within }` **without revealing the price**. Bands escalate bad→good: `🟥 🟧 🟨 🟩 ✅`.
- Scoring is **log-error based** (`scoreGuess`) so a $5M home and a $200k condo are judged on the same curve. `finalScore(bestScore, attempts)` = best guess's closeness minus a per-extra-attempt penalty. **Score is internal only — never shown to users**; it just orders the leaderboard.

### Server-authoritative attempts

`/api/attempt` is the heart of play. It scores against the hidden price, persists per-player `GameState` in Redis (`game:{date}:{id}`), enforces the 5-attempt cap server-side, and only returns the full reveal (price, address, coords) when the game ends (win or out of guesses). The price never reaches the browser early — `toClue()` strips `price`/`address` from `/api/daily`. (Coordinates *are* sent, for the optional in-play map peek.)

### Redis (Upstash) key map

Provisioned via the Vercel Marketplace (Upstash integration); env vars are `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the client also accepts `UPSTASH_REDIS_REST_*`). All in `src/lib/leaderboard.ts`, which **degrades gracefully** to a no-op if Redis isn't configured (single-player still works).

| Key | Type | Purpose |
|---|---|---|
| `lb:{date}` | sorted set | Leaderboard for a day (member = player id, score = final score) |
| `lbmeta:{date}` | hash | Display details per entry (name, guess, attempts, …) |
| `game:{date}:{id}` | string (JSON) | Per-player game state; enforces attempts, holds best guess |
| `offset:{date}` | int | Admin rotation offset for the daily pick |
| `gallery:{propertyId}` | string (JSON) | Runtime-fetched photo gallery (overrides snapshot photos) |

### Images (`src/lib/rdcpix.ts`)

Photos come from realtor.com's `rdcpix` CDN, which encodes size in the filename. The search endpoint returns a tiny `...s.jpg` thumbnail (≈4KB, blurry); we rewrite the token to full-res. A **custom `next/image` loader** (`rdcpixLoader`) resizes at the CDN per viewport/DPR, **bypassing Vercel's (billed) image optimization**. Galleries come from the details endpoint and are stored hi-res.

### Map (`src/app/PropertyMap.tsx`)

Keyless **OpenStreetMap** embed by default, with an exact pin overlaid at the property's center. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (a browser key with the free Maps Embed API enabled) to switch to Google. Shown only as an optional in-play "📍 Location" peek — coordinates are a clue, not a spoiler of the price.

### Client state (localStorage)

The frontend (`src/app/page.tsx`) is one client component. No user accounts — identity is an anonymous `crypto.randomUUID()`.

| Key | Purpose |
|---|---|
| `dillow:id` | Anonymous player id |
| `dillow:name` | Display name for the leaderboard |
| `dillow:game:{date}` | Today's rows + range + reveal (one play per day) |
| `dillow:streak` | `{ count, lastDate, best }` consecutive-day streak |
| `dillow:stats` | Per-game history for the "Your stats" panel (accuracy by price band, etc.) |

---

## Directory layout

```
src/
  app/
    page.tsx                 # the whole game UI (client component)
    PropertyMap.tsx          # OSM/Google map with exact pin
    admin/page.tsx           # password-gated admin screen
    api/
      daily/route.ts         # today's clue (price/address stripped, gallery merged)
      attempt/route.ts       # score a guess; server-authoritative attempts
      leaderboard/route.ts   # next-day reveal of a past board
      refresh/route.ts       # MANUAL: rebuild the pool snapshot (dev only)
      enrich/route.ts        # MANUAL: galleries for upcoming dailies (dev only)
      admin/route.ts         # verify | rotate | enrich (password-gated)
    layout.tsx               # metadata (title, description, OG/Twitter)
    opengraph-image.tsx      # generated 1200×630 OG image (next/og)
    apple-icon.tsx, icon.svg # branding marks
    globals.css              # Tailwind + slider/carousel/animation CSS
  lib/
    types.ts                 # Property shape + toClue()
    game.ts                  # snapshot pool, daily pick, scoring, feedback
    leaderboard.ts           # Redis: leaderboard, game state, offset, galleries
    rdcpix.ts                # next/image custom loader for realtor.com photos
    providers/
      index.ts               # provider switch (PROPERTY_PROVIDER)
      realtor16.ts           # RapidAPI realtor16 adapter (default)
      simplyrets.ts          # SimplyRETS demo adapter
  data/
    pool.json                # committed property snapshot (the game content)
```

---

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in values (see below)
npm run dev                  # http://localhost:3000 (or next free port)
npm run build && npm run lint # before committing
```

Gameplay works with no env at all (falls back to the SimplyRETS demo provider; leaderboard/streak disable gracefully). For production-like data you need the realtor16 key and Upstash creds.

### Environment variables

| Var | Required? | Notes |
|---|---|---|
| `PROPERTY_PROVIDER` | for realtor16 | `realtor16` \| `simplyrets` (default `simplyrets`) |
| `REALTOR_16_RAPID_API_KEY` | for realtor16 | RapidAPI key **subscribed to the realtor16 API** |
| `REALTOR16_LOCATIONS` | no | Comma-separated `City, ST` list for `/api/refresh` |
| `REALTOR16_LIMIT` | no | Listings per city (default 50) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | for Redis features | Auto-injected by the Vercel Upstash integration |
| `ADMIN_PASSWORD` | no | Password for `/admin` (defaults to `8228`) |
| `REFRESH_TOKEN` | prod only | Required as `?token=` to call `/api/refresh` and `/api/enrich` in production |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | no | Switches the map from OSM to Google |

> `.env.local` is git-ignored; `.env.example` is the template. Note: `vercel env pull` overwrites `.env.local` with only the Vercel project's vars — keep a copy of local-only keys (e.g. the realtor16 key, which lives locally, not in the Vercel project).

---

## Common workflows

### Refresh / enrich the content (spends budget)

```bash
# Rebuild the whole pool (one request per city) — DEV ONLY, then commit the snapshot
curl -X POST http://localhost:3000/api/refresh

# Give the next N daily listings full interior galleries — DEV ONLY, then commit
curl -X POST "http://localhost:3000/api/enrich?days=10"

git add src/data/pool.json && git commit -m "Refresh pool" && git push
```

### Admin

`/admin` → enter the password (`ADMIN_PASSWORD`, default `8228`). Server-validated; the password is never shipped to the client. Actions (POST `/api/admin`):
- **rotate** — bumps `offset:{date}`, clears today's leaderboard + in-progress games, and **auto-enriches** the new property's gallery (1 request). Everyone sees the new home immediately.
- **enrich** ("Load more photos") — fetches the current property's full gallery into Redis (1 request; no-op if already rich).

### Deploy

```bash
vercel deploy --prod --yes --scope aaron-levins-projects
```

Deploys the committed snapshot + code. CI is just the Vercel build.

---

## Conventions & gotchas

- **Commit + push every change as you go**, with focused commits. End commit messages with the `Co-Authored-By` trailer.
- **Never call the provider at request time.** Budget. (Worth repeating.)
- **`getDailyProperty` reads the snapshot synchronously**; the route layer applies the Redis `offset` and gallery override.
- **Don't write to `pool.json` at runtime** — read-only FS on Vercel. Use Redis for runtime data.
- **Points are internal.** Compute them for ranking, but never render a raw "pts" value to users.
- **Mind the `react-hooks/set-state-in-effect` lint rule** (Next 16): wrap localStorage-read effects that call `setState` in an async IIFE.
- The repo at `~` (the dev machine's home dir) is itself a git repo — this project has its **own** git repo created with `git init`; don't commit into the home repo.

---

## Status / ideas

Working: daily game, over/under slider, server-authoritative 5-try mechanic, leaderboard + next-day reveal, streak, stats-by-price-band, runtime gallery enrichment, admin rotation, branded OG/favicon. See `RESEARCH.md` for the original API research and game-format brainstorm.

Open ideas: bulk-enrich the full pool (needs a paid realtor16 plan), stats by geography, friends/private leagues, a nightly enrichment cron (budget permitting).
