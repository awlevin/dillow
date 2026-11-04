# Contributing to Dillow

Thanks for taking a look. Dillow is a small hobby project, so the process is
light.

## Before you build something big

Open an issue first and describe what you want to change. A quick agreement on
direction beats a large PR that has to be rewritten.

Bug reports and small fixes need no preamble — send the PR.

## Setup

See [Local development](README.md#local-development) in the README. Short
version:

```bash
npm install
cp .env.example .env.local   # optional; the app runs with no env at all
npm run dev
```

With no environment variables the app plays the fake sample dataset in
`src/data/sample/` (made-up homes, illustrated photos). Game state lives in
server memory, and the leaderboards and rooms switch off until you add Upstash
Redis credentials. The live game's real homes are private and not needed for
development.

## Pull requests

Outside contributors: fork the repo, branch from `main`, open a PR against
`main`. (`AGENTS.md` tells the maintainer's own agents to push straight to
`main`. That instruction is for the maintainer, not for you.)

Before you open a PR:

```bash
npm run lint
npm run typecheck
npm run build
```

All three must pass. CI runs them on every PR. There is no test suite yet; if you add one, that is a welcome
contribution on its own.

Keep PRs focused — one concern per PR. Write commit messages that say what
changed and why.

## The request budget — read this before touching a provider

Listing data comes from the `realtor16` RapidAPI actor on a **small monthly
request quota**. Gameplay is designed to spend **zero** upstream requests: it
reads the build-time snapshot in `src/data/` plus Redis.

**Never add a provider call on a request path.** If a change makes the app
fetch from `realtor16` while somebody is playing, it will not be merged. Warm
data into Redis or into the snapshot instead, out of band.

## Data files

`src/data/pool.json` and `src/data/enrichment.json` are git-ignored build
inputs: a copy of the sample, or the private real data on the maintainer's
machine and on Vercel. **Never commit real listing data** — CI fails if
anything outside `src/data/sample/` is tracked under `src/data/`.

To change the sample, edit `scripts/generate-sample-data.mjs` and run
`npm run data:sample`. Keep it obviously fake: invented addresses and
descriptions, illustrated photos. See the README's
[dataset](README.md#the-dataset) and data-source sections.

## Style

- TypeScript, strict. No `any` unless you explain it.
- Follow what is already in the file. There is no separate style guide.
- Comments should explain *why*, not restate the code. The existing codebase is
  heavily commented in that spirit; match it.

## Changelog

There is a player-facing changelog at `src/content/changelog.md`, rendered at
`/changelog`. If your change is something a player would notice, add an entry
in the same PR. Internal work (refactors, build fixes, caching) does not belong
there.

## Security

Do not file security problems as issues. See [SECURITY.md](SECURITY.md).
