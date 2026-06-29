<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git workflow

Always commit and push changes directly to `main`. Do not create feature branches or open pull requests for your own work — we're moving fast and have few users, so the PR overhead isn't worth it. (Only branch when the user explicitly asks for it.)

# Changelog

There's a public, player-facing changelog at `src/content/changelog.md`, rendered at `/changelog`. Maintain it proactively: when you ship a change worth a player's attention, add it as part of the same change — don't wait to be asked.

What belongs there:
- **Player-facing changes only.** Describe what a player can see or do, in their words. Never list internal/technical work — refactors, cache keys, the enrichment pipeline, deploy plumbing, lint/build fixes. Translate to a benefit or omit.
- **Skip the too-small stuff.** Copy/wording tweaks and pixel nudges are below the bar — leave them out entirely. When unsure, omit.

Format:
- Newest day on top. One `## <Month D, YYYY>` heading per day.
- Under each day, group items by `### 🔥 New Features`, then `### 🐛 Bug fixes`, then `### 💅 Nits` — in that order. Only include the categories that have items.
- `-` bullets; bold a short lead-in on notable items. Keep it concise and lightly playful.
