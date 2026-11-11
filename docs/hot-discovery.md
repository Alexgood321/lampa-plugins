# SURS Hot Discovery 4.3: Evidence-backed hot releases

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

**Current actual source**: TMDB API. Optional MDBList enrichments and optional lists work only if a working key and source IDs are configured. No independent public-audience, pirate-service viewing, JustWatch or Kinopoisk metrics are invented. A TMDB popularity score is **not** a stream count.

## Discovery

Up to 260 detailed records, selected in round-robin lanes rather than only the top TMDB Trending titles. Sources include day/week Trending, 0–60-day release discovery (both newest and popular), US first digital release and verified TV returning seasons; then older 550-day discovery lanes. Always check US involvement, excluded genres, poster and real release dates. A reissue does not reset the film's effective age; a new verified season does reset the season age, but **not** its status as a returning show. No future episodes/specials are counted as a season premiere.

## Evidence before ranking

1. Normal path: Bayesian-corrected TMDB quality >=7.2/10 and >=100 TMDB votes.
2. **Buzz breakout**: corrected quality >=6.55, >=100 votes, release in the last 60 days, top-12 day trend plus top-35 week trend with sufficient popularity percentile, or top-8 day trend plus measured growth >=0.65 and popularity >=75th percentile. Allows genuinely discussed mixed-review releases while excluding a one-off small sample.
3. Very early, sparsely rated works can pass only with strong independent IMDb evidence via configured MDBList and day/week trending. No key means no exception.
4. New seasons must have a verified, already aired regular episode. If season-level rating evidence is missing, apply the existing stricter high-confidence season proxy rules.
5. Profoundly weak or unverified items are excluded, regardless of marketing. No placeholder/synthetic titles.

The source-quality measure is a floor and quality ranking input, **not** the main definition of what's hot.

## Ranking model: 4.3

Compute the following independently:

- **Attention**: normalized TMDB day/week Trending ranks and within-media-type popularity percentile. Long-running high-rated series without current trends receive little attention credit.
- **Quality**: Bayesian-adjusted TMDB score and (when actually available) properly weighted IMDb/critic data; the confidence and source count are recorded.
- **Freshness**: smooth decay within *non-overlapping priority periods*: 0–60, 61–120, 121–365 and 366–550 days. Original movie premiere and first digital premiere cannot be used to relabel an old film as new.
- **Momentum**: observed daily (1 day) and multi-day (3/7/14) popularity and voting change from GitHub history. Zero history means *no* momentum weight, not fake equal points for every item.

| Signal | Without observed history | With observed history |
|---|---:|---:|
| Current audience attention | 57% | 44% |
| Bayesian quality | 29% | 28% |
| Freshness inside priority period | 14% | 14% |
| Actual momentum | 0% | 14% |

Scores are normalized within a recency period, then shaped into 0–100 Hot priority scores. The goal is discoverability, **not** a real viewing-count or a numeric TMDB/Kinopoisk rating.

After the initial ranking, apply a small contextual diversity penalty and a conditional limit on returning seasons (max three in top 10, six in top 20, twelve across the top 40 **when enough new titles are available**). At most two mixed-review 'breakouts' in top 10 if strong other candidates exist. Original movies and brand-new series can share the shelf. Never fabricate or pad to 40; fewer are acceptable if quality/composition constraints demand it.

Visible Hot scores are made monotonically descending to match the final display order. The underlying unadjusted score, selected track, attention, momentum, applied weights, age, genre and source diagnostics remain in the JSON for audit.

## Pipeline, safety, comparison

- Output remains `data/hot-discovery.json` (schema 1), and daily observations are appended to `data/hot-discovery-history.json`.
- A new algorithm name publishes a new top immediately even if an earlier top was published that day; subsequent runs collect history but keep the visible ranking stable for the day.
- If authentication fails, a serious upstream outage occurs, or the valid set drops below twelve, the publishing job fails. The previous verified JSON remains available in Git.
- Run `node --check scripts/hot-discovery.cjs`, `node --test tests/hot-discovery.test.cjs`, `node scripts/build-surs.cjs --check` and `node tests/surs-smoke.cjs` before merge. Compare the actual first 10/20 and the ratio of returning series versus standalone movies and new shows.
- Rollback: revert the builder PR or restore its previous committed JSON.

This implementation is a testable heuristic, not an independently calibrated prediction model. A multi-week retrospective and true cross-platform engagement sources would improve calibration when they are available.
