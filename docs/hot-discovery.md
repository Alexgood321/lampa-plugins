# SURS Hot Discovery 4.0 (SURS Pro 4.0.3)

Status: PRIMARY. Hot Discovery is the only primary US recommendation shelf. The legacy client-side “Лучшие новинки США” (Smart US) has been retired; its catalog, settings, source code and automatic loader were removed in 4.0.3. Old saved MAIN profiles are migrated without losing other shelves or their ordering. Explicit Hot disable/removal is preserved.

## Setup

Required GitHub Actions secret: TMDB_READ_ACCESS_TOKEN (or TMDB_API_KEY).
Optional secret: MDBLIST_API_KEY. Without this, IMDb/critic ratings are not filled in.
Optional variable: MDBLIST_LIST_IDS, comma-separated list IDs; no guessed identifiers.
Missing TMDB credentials fail the workflow; the previous valid feed stays published.

Generated JSON: https://raw.githubusercontent.com/Alexgood321/lampa-plugins/main/data/hot-discovery.json
GitHub Actions collects historical observations on a schedule; the public top 40 is published once per UTC day.

## Current algorithm and caveats

Candidate sources: TMDB Trending (day/week), Discover, US digital releases, returning TV seasons, and optional MDBList.
Eligibility: US involvement, excluded genres, confirmed non-future premiere within 550 days, posters, minimum adjusted TMDB quality and vote threshold. Streaming availability is not currently proven by the feed.
Ranking: Bayesian-adjusted TMDB quality, TMDB interest, 3/7/14-day popularity change once history accumulates, and premiere freshness. Experimental weights 55/25/10/10. Up to 40 cards. Season ratings use episode votes when adequate, otherwise an explicit provisional series-wide proxy.
Known limitations: the current vote floor is permissive (8 votes); independent IMDb/critic ratings require an MDBList key; TMDB interest is not actual playback; title display year can differ from ranked premiere. This algorithm should be evaluated and refined without creating unverified quality or audience signals.

## Verification

Build: `node scripts/build-surs.cjs --check`
Client regression: `node tests/surs-smoke.cjs`
Builder unit tests: `node --test tests/hot-discovery.test.cjs`
Rollback: revert the SURS Pro release commit or restore a previous My Store-pinned version; Hot can also be disabled manually.
