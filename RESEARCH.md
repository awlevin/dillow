# Dillow — Real Estate Price-Guessing Game: Research Notes

_Last updated: 2026-06-22_

## The concept
A daily web game: users are shown a property (photos, location, beds/baths/sqft, year built — basically a Zillow-style listing card with the price hidden) and they guess the price.

## The single most important design constraint: PHOTOS
For a "guess the Zillow price" game, the make-or-break field is **listing photos** plus an **asking/sold price**. This splits the API world into two camps:

1. **Public-records / property-data APIs** (RentCast, ATTOM, Realie, HouseCanary, Bridge Public Records) — great for beds/baths/sqft/year built/lot size/tax value, cheap or free, but **usually NO good listing photos** and prices are estimates/assessments, not the live list price.
2. **Listing-feed APIs** (MLS/RESO Web API, Realtor.com RapidAPI wrappers, scrapers) — these have the **photos + actual list/sold price** you want, but are either license-gated or live in legal/ToS gray areas.

You will likely need a *listing* source for photos, even if you enrich with a property-data source.

---

## API options, ranked for this use case

### Tier 1 — Best practical starting points

**RentCast** — https://www.rentcast.io/api · docs: https://developers.rentcast.io/reference
- **Free tier: 50 API calls/month**, no credit card, no contract. Paid scales by volume.
- 140M+ property records; on-demand property characteristics (beds, baths, sqft, year built, lot size, type), value & rent estimates, comps, and **active/inactive sale + rental listings** in all 50 states.
- ⚠️ **Photos are weak/absent** — it's primarily a data API, not a photo/listing-card API. Good for the *facts*, not the *pictures*.
- **Best use here:** the structured data layer + the actual list price. Pair with a photo source.

**Realtor.com via RapidAPI** (several community wrappers: `realtor16`, `realty-in-us`/apidojo, `realtor-search`, `us-realtor`)
- These wrap Realtor.com and **DO return high-quality photos + list price + full property details** — closest thing to "everything on Zillow."
- Free tiers are small (e.g. ~10 calls/month on some) but cheap paid tiers exist.
- ⚠️ **Reliability/legal caveat:** these are third-party marketplace actors. They can break or disappear when the seller stops maintaining them, and they ride on Realtor.com data (ToS/redistribution risk). Fine for a prototype; risky as a long-term foundation.
- RapidAPI collection: https://rapidapi.com/collection/best-real-estate-apis

### Tier 2 — Cheap property data (no/weak photos)

**Realie** — https://www.realie.ai/info/most-affordable-property-data-api
- **Free tier + paid from $50/month.** Cheapest nationwide parcel data (competitors start ~$350/mo). Data-focused; not a photo source.

**ATTOM** — https://www.attomdata.com/solutions/property-data-api/
- **30-day free trial**, no card. Then custom/quote pricing (~$95/mo entry per third parties). 150–160M properties, very deep data (assessments, tax, sales history, schools, hazards). Enterprise-grade facts; not a listing-photo source.

**HouseCanary** — https://www.housecanary.com/blog/real-estate-api
- Free test API keys in their Developer Center. 75+ data points, valuations, even image-recognition on property condition. Data/valuation focused.

### Tier 3 — Scraper/aggregator APIs (have photos, but ToS gray area)

**Apify Real Estate / Zillow actors** — https://apify.com/api/real-estate-api
- Free to try, no card. Returns prices, GPS, living/land area, beds/baths, full address, **and photos**. Scraped data — review ToS; good for prototyping a content pipeline.

**RealtyAPI** — https://www.realtyapi.io/
- Unified layer over Zillow/Redfin/Realtor/Airbnb/Apartments.com through one API. Convenient; scraped/aggregated, same ToS caveats.

**APISCRAPY** — https://apiscrapy.com/real-estate-api/ — free scraped data from Zillow/Realtor/MLS/Trulia. Lowest reliability/legitimacy.

---

## The "real estate license" path (you mentioned friends with credentials)

This is the **legitimate, photo-included, redistributable** route — and your friend's license actually unlocks it.

- **MLS / RESO Web API / IDX** is the official pipeline. To get a feed, a licensed broker/agent must sign an **IDX agreement** with their MLS. Then you (the developer) get RESO Web API credentials (client ID, secret, OData endpoint). The feed **includes a `photos` array + live list price + all property fields.** Connecting takes ~15 min once the agreement exists.
  - Background: https://mlsimport.com/what-are-idx-mls-rets-and-reso-api/
  - Developer tooling (makes RESO/RETS easy): **SimplyRETS** — https://simplyrets.com/idx-developer-api (has a sandbox/test dataset you can build against *before* lining up a real MLS feed).

- **Bridge Interactive** (Zillow Group) — https://www.bridgeinteractive.com/developers/bridge-api/
  - **$0 from Zillow**, but **invite-only / application required**, and you must qualify (MLS-affiliated brokerage, IDX vendor, or approved partner). Gives normalized MLS data + Zillow Public Records (~148M properties). Does **not** expose the Zestimate.

> **Bottom line on licensing:** If a friend with a license signs an IDX agreement with their local MLS, you get a clean, legal, photo-rich feed via RESO Web API (often through SimplyRETS). This is the most sustainable foundation if the game gets real traction. Note: MLS feeds are typically **regional**, and IDX has display rules (attribution, can't show certain off-market data) — worth reading the specific MLS's IDX policy.

---

## Recommended path for Dillow

1. **Prototype now (this week):** Build the content pipeline against a **RapidAPI Realtor wrapper** or **Apify** (you get photos + price + details immediately), OR use **SimplyRETS' free sandbox** for clean RESO-shaped test data. Hardcode/cache a pool of ~100 properties so you're not hitting rate limits live during play.
2. **Enrich/validate** facts with **RentCast free tier** if you want a second source for price/characteristics.
3. **If it takes off:** move to the **license/IDX → RESO Web API** route via a friend's credentials for a legitimate, photo-rich, redistributable feed.

**Key architectural note:** Because every photo-bearing source has rate limits or ToS friction, **pre-fetch and cache a daily/weekly batch of properties into your own DB + object storage** rather than calling any API at play-time. This also makes the game deterministic (everyone sees the same property) and fast.

---

## Game format ideas (initial brain-dump — to expand later)

1. **Wordle-style daily (single property):** One property per day, everyone worldwide gets the same one. You guess the price; feedback shows how close (e.g. "your guess is 12% too high" / hot-cold bands). Limited guesses (e.g. 4 tries narrowing in). Shareable emoji-grid result ("🟩 within 5%!") drives virality. _This is the strongest hook — closest to Wordle's proven loop._

2. **Global closest-guess + delayed leaderboard:** Everyone guesses today's property; results & the winner (closest guess) are revealed the *next* day along with the answer. Daily and all-time leaderboards. Creates a "come back tomorrow" loop and water-cooler suspense.

3. _(placeholder — other ideas you have to add)_

### Format details worth deciding later
- **Scoring:** absolute % error, log-error (fairer across price ranges), or banded points. Log/percentage error strongly recommended so a $5M mansion and a $200k condo are scored fairly.
- **Difficulty modes:** "local" (properties in your state/city) vs "global/random"; or a "hard mode" with fewer hints (no sqft, no photos).
- **Streaks & stats:** daily streak counter, average error, best guess — classic retention mechanics.
- **Multiple rounds:** e.g. 5 properties/day, sum your error — more engagement per session than a single guess.
- **Social/competitive:** private leagues with friends, share-cards, head-to-head.
- **Reveal screen:** after guessing, show the real Zillow-style listing + a fun fact (price history, days on market) as the payoff.

---

## Sources
- RentCast API — https://www.rentcast.io/api · https://developers.rentcast.io/reference
- Realie (cheapest property data) — https://www.realie.ai/info/most-affordable-property-data-api
- ATTOM Property Data API — https://www.attomdata.com/solutions/property-data-api/
- HouseCanary — https://www.housecanary.com/blog/real-estate-api
- Best Real Estate APIs (ScrapingBee) — https://www.scrapingbee.com/blog/best-real-estate-apis-for-developers/
- RapidAPI real estate collection — https://rapidapi.com/collection/best-real-estate-apis
- Apify Real Estate API — https://apify.com/api/real-estate-api
- RealtyAPI (unified) — https://www.realtyapi.io/
- Zillow Group Developers — https://www.zillowgroup.com/developers/
- Bridge Interactive (Zillow Group data) — https://www.bridgeinteractive.com/developers/bridge-api/
- Zillow Public Records API — https://www.zillowgroup.com/developers/api/public-data/public-records-api/
- IDX / MLS / RETS / RESO Web API explainer — https://mlsimport.com/what-are-idx-mls-rets-and-reso-api/
- SimplyRETS (RESO/RETS dev tooling + sandbox) — https://simplyrets.com/idx-developer-api
