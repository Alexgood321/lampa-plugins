# SURS Hot Discovery 4.2 (SURS Pro 4.0.4+)

Status: PRIMARY. Hot Discovery is the only main US recommendation shelf. The old Smart US 3.9.26 shelf and its client-side engine were removed in SURS Pro 4.0.3; the client can read the same feed schema 1 without an update.

## Data pipeline

- Requires `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` in GitHub Actions secrets.
- Optional `MDBLIST_API_KEY` secret enriches up to 50 candidates with IMDb/Metacritic. Without that key, the algorithm uses TMDB alone and never invents independent ratings.
- Optional `MDBLIST_LIST_IDS` repository variable lists real numeric list IDs for additional candidate discovery. IDs are not guessed.
- Fetches TMDB day/week Trending, Discover, first US digital premieres, and genuine new TV seasons; up to 260 detailed candidate checks. Recent 60-day discover, digital and season lanes are sampled first to prevent older trends from filling the detail budget.
- Validates US origin/production, blocked genres, poster presence and release evidence. A film's US digital premiere is its **first** US type-4 date, not a more recent re-release. TMDB's film release types: 2 limited theatrical, 3 theatrical, 4 digital.
- TV season summaries must be confirmed against the season details endpoint and a regular episode that has actually aired. Season premiere is the earliest aired regular episode in that season, not its latest episode.
- Historical candidate window: 550 days. Films whose original date is more than 730 days ago remain excluded from rerelease promotion. Older series MAY enter if a current season was verified against aired episodes.
- **Freshness is a priority, not a hard exclusion.** All qualified titles can remain in the catalogue, but newest releases get the first positions. For films the age used for ranking is the **older of original release date and eligible US digital release date**. Digital reissues do not reset a film's priority. For TV series use the first premiere of the current verified season, if applicable, not the first episode of the original series.

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

Freshness is a **dominant ranking dimension** within the 550-day eligibility window. Each candidate receives a disjoint score band based on its effective release age, with the quality/interest/growth relevance score applied WITHIN its band:

| Effective premiere age | Priority | Visible Hot score band |
|---|---|---|
| 0–60 days | First: current hot releases | 75–99.5 |
| 61–120 days | Second: recent catalogue | 50–74.5 |
| 121–365 days | Third: older strong releases | 25–49.5 |
| 366+ days | Last: older still-discussed titles | 0–24.5 |

Therefore an old, very highly rated movie cannot rank second ahead of good titles from the last two months. Quality still gates entry at 7.2 with 100 votes; no weak content is added just to fill the list. Score ranges never overlap, so the visible Hot score matches the actual descending order.

Growth has no assigned contribution for a candidate without valid historical observations, rather than a fabricated neutral contribution. JSON exposes `surs_hot_rank_age` and `surs_hot_recency_tier` on each card, and a `selected_by_recency` breakdown in diagnostics. The existing Lampa feed schema stays 1.

## Publishing and rollback

- GitHub Actions runs every 3 hours, stores one historical snapshot per UTC day and publishes a stable daily top 40. A **new algorithm revision publishes on the same day** so fixes do not wait until midnight. The next client cache refresh loads it; clients with a still-valid cached 4.1 feed can continue showing that feed until their next fetch.
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
