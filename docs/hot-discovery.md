# SURS Hot Discovery 4.1 (SURS Pro 4.0.3+)

Status: PRIMARY. Hot Discovery is the only main US recommendation shelf. The old Smart US 3.9.26 shelf and its client-side engine were removed in SURS Pro 4.0.3; the client can read the same feed schema 1 without an update.

## Data pipeline

- Requires `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` in GitHub Actions secrets.
- Optional `MDBLIST_API_KEY` secret enriches up to 50 candidates with IMDb/Metacritic. Without that key, the algorithm uses TMDB alone and never invents independent ratings.
- Optional `MDBLIST_LIST_IDS` repository variable lists real numeric list IDs for additional candidate discovery. IDs are not guessed.
- Fetches TMDB day/week Trending, Discover, first US digital premieres, and genuine new TV seasons; up to 260 detailed candidate checks.
- Validates US origin/production, blocked genres, poster presence and release evidence. A film's US digital premiere is its **first** US type-4 date, not a more recent re-release. TMDB's film release types: 2 limited theatrical, 3 theatrical, 4 digital.
- TV season summaries must be confirmed against the season details endpoint and a regular episode that has actually aired. Season premiere is the earliest aired regular episode in that season, not its latest episode.
- Recent-release window: 550 days. Older original films (more than 730 days old) do not become "new" because of reissues.

## Quality eligibility before ranking

- Minimum Bayesian-adjusted quality: **7.2/10**.
- Minimum TMDB evidence: **100 votes**.
- Narrow exception for premieres within 45 days: at least 50 TMDB votes, quality 7.6+, IMDb 7.7+ with 1,000+ IMDb votes, plus top-20 TMDB day/week trending. It is inactive when MDBList is unavailable.
- Returning seasons without reliable episode-level ratings are allowed only when **verified**, within 90 days of the season premiere, and with strong series-level quality (7.7+), 500+ series votes and top-25 day/week trend. These entries remain marked provisional.
- Missing/unverified episode premieres, old-film reissues, weak or poorly supported ratings fail the quality gate. A failure to meet the minimum 12 verified rows means no feed is published. Git retains the previous known-good feed.
- Scores are recommendations, not guarantees of legal streaming availability or user-specific viewing preferences.

## Ranking

Apply the eligibility gates first, then sort by **one visible score**; do not hide an interleaving/shuffle or promote weak movies solely on recency.

| Signal | Growth measurable | No measured growth |
|---|---:|---:|
| Bayesian quality | 60% | 70% |
| Current audience interest (TMDB trends/popularity) | 25% | 30% |
| Observed 3/7/14-day growth | 15% | 0% |

Freshness is a release-date eligibility gate. Growth has no assigned contribution for a candidate without valid historical observations, rather than a fabricated neutral contribution. Metadata includes the per-card applied weights and diagnostic rejection counts.

## Publishing and rollback

- GitHub Actions runs every 3 hours, stores one historical snapshot per UTC day and publishes a stable daily top 40. A **new algorithm revision publishes on the same day** so fixes do not wait until midnight.
- Output: `data/hot-discovery.json`, history: `data/hot-discovery-history.json`. Schema stays 1 for Lampa.
- If TMDB credentials are missing or API failure is substantial, the workflow fails rather than replacing the verified feed with placeholder data.
- Previous revisions are available through the Git history. Revert the builder commit to return to its prior logic; a historical known-good JSON remains available.

## Tests

```bash
node --check scripts/hot-discovery.cjs
node --test tests/hot-discovery.test.cjs
node scripts/build-surs.cjs --check
node tests/surs-smoke.cjs
```
