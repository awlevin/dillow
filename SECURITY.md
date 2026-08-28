# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub:
[**Report a vulnerability**](https://github.com/awlevin/dillow/security/advisories/new)
(Security → Advisories → Report a vulnerability).

If private advisories are not enabled on the repo, contact the owner
([@awlevin](https://github.com/awlevin)) directly instead of filing an issue.

Please include what you did, what happened, and what you expected. A proof of
concept helps. Give a reasonable window for a fix before publishing.

Dillow is a hobby project with no SLA. Expect a reply within a week or so.

## Scope

In scope:

- Anything that reveals the hidden price of a home a player has not finished.
- Anything that lets a caller spend the project's third-party API quota.
- Anything that lets a caller write to, wipe, or forge leaderboard or room state.
- Access to `/api/admin`, `/api/refresh` or `/api/enrich` without the secret.

Out of scope:

- The daily home is deterministic by design (`hash(dayKey) + offset`). Anyone
  who runs the app locally knows every answer. That is a property of the data
  model, not a bug.
- Anonymous player ids are client-generated (`crypto.randomUUID()`). There are
  no accounts and no authentication, so impersonating another display name on a
  leaderboard is expected and not a vulnerability.
- Missing rate limits on gameplay endpoints — known, tracked, low value.

## Supported versions

Only the deployed `main` branch is supported.
