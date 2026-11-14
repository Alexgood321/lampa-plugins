# SURS Hot Discovery 4.5: рейтинги качества и подтверждённая популярность

Hot Discovery is the primary American films-and-TV discovery shelf in SURS Pro. Its job is a short, fresh, interesting **what to watch next** collection, not a list of the highest lifetime ratings. Existing Lampa clients accept its unchanged JSON schema 1.

## What has been researched

The following are **methodological references**, not hidden API integrations or claims to have reverse-engineered proprietary algorithms:

- Kinopoisk popular list: movie/title page visits and on-site searches, refreshed daily (https://www.kinopoisk.ru/lists/movies/popular/). Kinopoisk Pro's broader series-interest index incorporates aggregated searches/browsing and weekly signals (https://www.kinopoisk.ru/media/article/4007018/).
- Filmix: separate filters by date, popularity, visits and comments (https://filmix.gg/viewing); exact weighting unknown.
- HDrezka-like current catalogue: independent UI filters for 3-day TOP, discussed, ratings and recent additions; exact ranking implementation is not public (https://hdrezka.plus/).
- JustWatch: user watchlist adds, streaming offer clicks, 'seen' actions, 24-hour, 7-day and 30-day windows (https://www.justwatch.com/us/streaming-charts); access to the underlying provider data is not assumed.
- Trakt: 24-hour actual watching actions; not incorporated without verified contractual/API access (https://developer.trakt.tv/).
- TMDB: different Popularity and Trending indices, with votes/page views/watchlist/favourite activity and shorter trending windows (https://developer.themoviedb.org/docs/popularity-and-trending).
- Letterboxd/IMDb: Bayesian or weighted quality ratings rather than raw small-sample averages. No direct data is used without an appropriate permitted source.

**Current required source**: TMDB API. MDBList and Kinopoisk Unofficial are optional. They are *used only when valid keys are present* in Actions secrets and the returned title is verified by exact identity. Absence of a key or an identity match cannot masquerade as a third rating. Public feed diagnostics record per-source coverage. No JustWatch/Kinopoisk audience-viewing statistics are invented. TMDB popularity is not a stream count.

## Configure three ratings safely

- `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY`: required existing GitHub Actions secret.
- `MDBLIST_API_KEY`: optional secret. Builder reads IMDb ratings by TMDB ID and verifies the returned TMDB ID. Max 50 detailed lookups per scheduled run (400 per day if all 8 runs occur).
- `KINOPOISK_API_KEY`: optional secret for Kinopoisk Unofficial API, read via `X-API-KEY`. The builder first gets the exact IMDb ID from TMDB's `external_ids`, then requests `GET /api/v2.2/films?imdbId=tt...`, and only accepts the returned row if its IMDb ID matches exactly. Max 45 requests per scheduled run (360 per day). Provider's currently published new-user cap is 500/day. Never search merely by localized title.
- KP API may also expose a mirrored IMDb score. Preserve its provenance and prefer MDBList IMDb when both are available. It remains **one IMDb rating**, never two independent signals.
- Never place secrets in the JSON, test fixtures, command line or output.

Missing optional keys are not fatal. The feed explicitly reports `sources.mdblist=false`, `sources.kinopoisk=false` and zero usable ratings where appropriate. Do not describe it as "three-source verified" until diagnostics confirm all three.


## New in 4.5: verified external demand, no fabricated views

The Kinopoisk Unofficial API documents `GET /api/v2.2/films/collections?type=TOP_POPULAR_ALL&page=N`. Its public collection is an **ordered popularity list**, not a count of streams, visits or searches. We fetch a maximum of **3 pages × 20 IDs** once per UTC day using the existing `KINOPOISK_API_KEY`. IDs are matched *only* against previously verified Kinopoisk film IDs from the exact IMDb-ID lookup.

- Persist a small daily `popular` section in the existing `data/hot-discovery-kp-cache.json` (no extra secrets, no separate API account). Cache freshness: up to 36 hours; stale results give no bonus.
- Candidate present in the top-60 gets a normalized rank strength. When the candidate **also** has a real TMDB daily or weekly Trending rank, the maximum incremental attention bonus is `0.16 × rankStrength`. Without TMDB Trending, the maximum is `0.10 × rankStrength`, not a two-source confirmation.
- A missing title, failed response, missing KP rating, or expired list gets zero additional bonus, **not a penalty**. This prevents inflating Russian-market popularity assumptions for new/obscure US premieres.
- The original 45% attention/35% cross-source quality/15% measured momentum/5% freshness model remains intact. The Kinopoisk signal is **inside** attention, not an extra fifth bucket and does not double-count freshness.
- The public feed includes per-card `surs_hot_kinopoisk_popularity_rank`, `surs_hot_external_demand_bonus`, `surs_hot_cross_source_interest` and diagnostics `external_demand`. Clients continue to accept schema 1.
- The Kinopoisk Unofficial collection may lag Kinopoisk's first-party `/lists/movies/popular/` page. We state its provenance explicitly and do not claim they are identical.

**Not integrated:** Filmix and HDrezka have no verified stable public demand API, and copying their page counters would risk interpreting uncertain site metrics as real streams. Trakt's current API policy prohibits redistributing a community dataset to power another product's ranking. JustWatch requires authorized API access. Those are future integrations only after verifying permitted, reliable data access.

Reference: https://kinopoiskapiunofficial.tech/documentation/api/ (TOP_POPULAR_ALL), https://developer.trakt.tv/docs/api-use-policy

## Discovery

Up to 260 detailed records, selected in round-robin lanes rather than only the top TMDB Trending titles. Sources include day/week Trending, 0–60-day release discovery (both newest and popular), US first digital release and verified TV returning seasons; then older 550-day discovery lanes. Always check US involvement, excluded genres, poster and real release dates. A reissue does not reset the film's effective age; a new verified season does reset the season age, but **not** its status as a returning show. No future episodes/specials are counted as a season premiere.

## Evidence before ranking

1. Normal path: Bayesian-corrected TMDB quality >=7.2/10 and >=100 TMDB votes.
2. **Buzz breakout**: corrected quality >=6.55, >=100 votes, release in the last 60 days, top-12 day trend plus top-35 week trend with sufficient popularity percentile, or top-8 day trend plus measured growth >=0.65 and popularity >=75th percentile. Allows genuinely discussed mixed-review releases while excluding a one-off small sample.
3. Very early, sparsely rated works can pass only with strong independent IMDb evidence via configured MDBList and day/week trending. No key means no exception.
4. New seasons must have a verified, already aired regular episode. If season-level rating evidence is missing, apply the existing stricter high-confidence season proxy rules.
5. Profoundly weak or unverified items are excluded, regardless of marketing. No placeholder/synthetic titles.

The source-quality measure is a floor and quality ranking input, **not** the main definition of what's hot.

## Ranking model: 4.5

Compute the following independently:

- **Attention**: normalized TMDB day/week Trending ranks and within-media-type popularity percentile, with a small evidence-backed external Kinopoisk Popular rank bonus when a verified exact-ID match exists. Long-running high-rated series without current trends receive little attention credit.
- **Quality**: Bayesian-adjusted TMDB, IMDb and KP with vote-count priors (140, 300, 180 respectively) and normalized weights (32/36/32 among available ratings). Missing sources do not become a zero rating. Critic ratings are retained in source metadata but **not** treated as a fourth mandatory vote.
- **Consensus bonus**: only for sufficiently sampled HIGH ratings (at least 7.2/10) that agree. Three sources within 0.75 points: +0.38 quality points; two sources within 0.6: +0.16. Three agreeing low ratings (6/10) get no bonus. New seasons never inherit a consensus bonus from lifetime whole-show ratings. A large disagreement receives no bonus and is labeled `disputed` (not automatically discarded).

- **Freshness**: smooth decay within *non-overlapping priority periods*: 0–60, 61–120, 121–365 and 366–550 days. Original movie premiere and first digital premiere cannot be used to relabel an old film as new.
- **Momentum**: observed 1/3/7/14-day TMDB popularity and voting changes. The 15% growth component is enabled only once at least a 3-day period exists. A lone 1-day sample remains diagnostic, not confirmed growth. No fabricated momentum when history is absent.

| Signal | Without observed history | With observed history |
|---|---:|---:|
| Current audience attention | 55% | 45% |
| Bayesian cross-source quality | 40% | 35% |
| Freshness inside priority period | 5% | 5% |
| Confirmed multi-day momentum | 0% | 15% |

Scores are normalized within a recency period, then shaped into 0–100 Hot priority scores. The goal is discoverability, **not** a real viewing-count or a numeric TMDB/Kinopoisk rating.

After the initial ranking, apply a small contextual diversity penalty and a conditional limit on returning seasons (max three in top 10, six in top 20, twelve across the top 40 **when enough new titles are available**). At most two mixed-review 'breakouts' in top 10 if strong other candidates exist. Original movies and brand-new series can share the shelf. Never fabricate or pad to 40; fewer are acceptable if quality/composition constraints demand it.

Visible Hot scores are made monotonically descending to match the final display order. The underlying unadjusted score, selected track, attention, momentum, applied weights, age, genre and source diagnostics remain in the JSON for audit.

## Pipeline, safety, comparison

- Output remains `data/hot-discovery.json` (schema 1), and daily observations are appended to `data/hot-discovery-history.json`.
- Public `data/hot-discovery-audit.json` records **up to 200 real candidates** from the TMDB discovery pipeline, their mapped independent ratings (if available), confidence/consensus, rejection reason and whether they entered the top 40. The audit is not a fabricated benchmark and is generated using the same data as the live ranking. Enrichment coverage varies with configured provider keys and per-run call budgets.
- A new algorithm name publishes a new top immediately even if an earlier top was published that day; subsequent runs collect history but keep the visible ranking stable for the day.
- If authentication fails, a serious upstream outage occurs, or the valid set drops below twelve, the publishing job fails. The previous verified JSON remains available in Git.
- Run `node --check scripts/hot-discovery.cjs`, `node --test tests/hot-discovery.test.cjs`, `node scripts/build-surs.cjs --check` and `node tests/surs-smoke.cjs` before merge. Compare the actual first 10/20 and the ratio of returning series versus standalone movies and new shows.
- Rollback: revert the builder PR or restore its previous committed JSON.

This implementation is a testable heuristic, not an independently calibrated prediction model. A multi-week retrospective and true cross-platform engagement sources would improve calibration when they are available.
