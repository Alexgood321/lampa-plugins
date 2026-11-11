# SURS Hot Discovery 4.0

Status: SHADOW. The working SURS 3.9.26 shelf remains untouched. In SURS Pro 4.0.2 the Hot shelf is enabled by default for new MAIN profiles and migrated into existing MAIN profiles with SURS navigation. It remains an independent experimental shelf and can be disabled.

## Setup

Repository: Settings / Secrets and variables / Actions.

Required secret: TMDB_READ_ACCESS_TOKEN from your own TMDB account. Alternatively use TMDB_API_KEY.
Optional secret: MDBLIST_API_KEY. Without this, no IMDb/critic scores are invented.
Optional variable: MDBLIST_LIST_IDS, comma-separated numerical IDs of selected MDBList lists, to add independent discovery candidates.

Go to Actions / SURS Hot Discovery builder / Run workflow. Without a TMDB secret the workflow fails with a clear error and does not manufacture data.

Source snapshots run every 3 hours (UTC); the public top-40 refreshes once per UTC day to avoid intraday reshuffling. The job publishes JSON using the scoped GitHub Actions token; no VPS or new subscription.

Public data URL:
https://raw.githubusercontent.com/Alexgood321/lampa-plugins/main/data/hot-discovery.json

## Discovery and ranking

- TMDB Trending day/week, Discover date/popularity/rating, US digital premieres, returning TV seasons.
- No quality-vote floor during initial search. Verify US origin/production and actual dates before scoring.
- Digital US release date for movies when confirmed, otherwise theatrical/primary; real season premiere for TV.
- Per-season episode rating only when at least 30 votes, else season-wide rating treated as a provisional series proxy.
- Bayes quality + interest + measured 3–14-day growth + smooth freshness. Experimental weights: 55/25/10/10, not a claimed optimum.
- Optional MDBList enriches ratings and, with explicit list IDs, adds independent candidates.
- Historical snapshots in repo for 31 days; growth explicitly compares 3/7/14-day observations when available, with a neutral fallback for missing history.
- Publish 12–40 verified unique cards only; failed API calls cannot replace previous valid data.
- Order always follows descending visible score. Previous position is used only for exactly equal scores.

## Safety and rollout

The old SURS "Лучшие новинки США" remains unchanged. Hot is an additional default-enabled test shelf for shadow comparison. Manual disabling/removal must be preserved, and customized profiles without SURS navigation are not modified. Do not promote until side-by-side validation for 30 days. Kinopoisk stays in the original client-side shelf; no unauthorized API is added to the server. Simkl and Trakt are not integrated pending their licensing conditions.

Offline test: node --test tests/hot-discovery.test.cjs.
Full regression: node scripts/build-surs.cjs --check && node tests/surs-smoke.cjs.

Rollback: disable the additional Hot shelf. JSON data remains recoverable using the Git history. Real iPhone/TV requests require a verified published feed and device validation.
