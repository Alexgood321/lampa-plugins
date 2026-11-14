# Hot Discovery 4.13: bounded prioritization of CURRENT demand in top-20

## Why not a forced hot-title quota?

4.12 had 16/20 top positions with some current-interest evidence. Four older returning TV series had good long-running averages but no TMDB Trending, KP Top-60, verified emerging signals or positive measured momentum. Just below the top-20, two one-rating seasons were trending only at rank 40/day and 36/week. Blindly forcing 20/20 interest would substitute weakly rated candidates for independently rated content.

## Conservative editorial choice

Only for choosing positions 1–20, allow a **bounded soft adjustment** when the candidate has explicitly documented `surs_hot_interest_evidence.current_interest_observed === false`:
- Release age <=30d: no penalty because a new launch may not yet have entered Trending.
- 31–60d: half the configured penalty.
- Older than 60d: full penalty, capped at 6.
- If evidence information is missing rather than explicitly negative, never infer a missing interest signal.

The selected editorial adjustment is **adaptive**, never automatically four points. Test the same eligible candidates with 0/2/4/6. Activate the **weakest nonzero strength** only if the top-20 gains at least one additional observed current-interest title, retains at least nine of its original top ten, does not lose more than one three-rating title in top-20, and does not materially increase rank movement. Otherwise publish the **unadjusted order (0)**. The 4.13 real prepublish test found **16/20 in all four variants**, so active strength should be **zero** for that data snapshot. This preserves the 4.12 50/30/15/5 formula, diversity behavior, and the published `surs_hot_score`. `surs_hot_editorial_interest_penalty` and `surs_hot_editorial_diversity_penalty` separately explain any nonzero selected penalty. No forced top-20 quota is introduced.

## Controlled release gate

`diagnostics.editorial_interest_comparison` compares the exact same eligible candidates with no preference (0), light (2), balanced (4) and strong (6) interest penalties. It tracks top-20 confirmed proxy interest, provider coverage, top-10 overlap and rank movement relative to the prior published ordering. The prepublish comparison must prove the chosen variant improves at least one top-20 current-interest count when a nonzero strength is activated. If none improves, production **must use zero**. This is an offline objective function, not proof that viewers prefer the result.

**Limit:** Observed TMDB/KP interest is a proxy and cannot establish play counts, click-through rate or user satisfaction. The objective is internal editorial consistency for a specifically named *Hot Discovery* shelf, not an externally validated relevance improvement.

Revert the squash merge to restore the 4.12 selection. Previous feed JSON remains recoverable from Git.

---

# Hot Discovery 4.12: current-interest evidence for one-rating titles

## Problem

4.11 selected 40 out of 40 eligible titles and 8 cards had only a TMDB rating. Six of these eight had **no position in TMDB Trending day/week, no Kinopoisk Top-60 rank, and no measured positive momentum**. For a shelf specifically named *Hot Discovery*, a high cumulative TMDB average alone is not a confirmation of actual current interest. The algorithm did not force a quota in code, but its existing eligibility rules admitted all 40. Artificially filling the entire shelf is not the objective.

## Admission, without score manipulation

The **existing 50/30/15/5 rank formula is unchanged**. Only candidates with **one sufficiently backed rating source** need a current-interest reason:
- A valid current TMDB Trending (24h/7d; up to position 40), or verified KP Popular Top-60 rank. Both are activity proxies, not real views.
- Or a *recent emerging* release within 30 days, at least 500 TMDB votes and popularity above the 65th percentile among same-type candidates. This prevents excluding freshly launched titles that have yet to enter Trending.
- Or measured **positive** multi-day TMDB momentum (not flat/unknown), growth signal >=0.12, at least 500 TMDB votes, >=65th percentile, age <=120 days.

A single-rating film with none of those signals is withheld as `single_source_interest_unconfirmed`. The missing rating is still treated as **unknown**, not poor. Two- and three-rating titles are not subject to this additional evidence requirement; they retain the existing quality, age and season criteria. This is a conservative editorial choice for a HOT shelf, not proof of lower audience satisfaction with niche titles.

`surs_hot_interest_evidence` records the decision for each selected card. `diagnostics.interest_evidence` provides counts for selected one-rating titles, top-20 current-interest evidence, signal origins and withheld one-rating titles. The rejection also appears in the audit so the loss of candidates is observable.

## Validation

Expanded regression coverage ensures single-rating Trending and emerging titles remain eligible; no popularity score is artificially reduced and multi-rated titles are unaffected. The PR live API dry-run checks that top-10 overlap remains >=8 and all selected one-rating cards have a current demand observation. Comparison is a selection audit, **not** ground-truth viewer engagement. Original source-integrity gate and quota remain in effect.

## Rollback

Revert the squash merge commit to restore 4.11. Previously generated feed/cache data is preserved in Git history.

---

# Hot Discovery 4.11: truthful zero values and upstream completeness

## Correctness repairs
- Previously `toCard()` used expressions like `details.popularity || raw.popularity`. Legitimately observed values of **0** were silently replaced by nonzero discovery values. 4.11 accepts finite numeric values including zero from the current verified detail response, and uses discovery values only when details are absent or invalid. The same applies to `vote_count` and `vote_average`.
- The 4.9/4.10 cache fix correctly allowed falling values in the merged detail result, but the final card constructor could undo the change for zero. The 4.11 test reproduces this exact bug.

## Fail-closed TMDB integrity
- Each actual production invocation verifies nonempty page 1 results for **all four** TMDB Trending lanes: movie/day, movie/week, tv/day and tv/week (at least five items for each). A minimum number of Discover/Recent lanes must also return usable results. This checks raw provider response health, not whether the U.S. shortlist happens to contain those results.
- If any critical lane is absent, malformed or empty, the builder **throws before writing any JSON**. GitHub Actions consequently retains the last successfully published polка, history, ratings cache and quota ledger. The next scheduled invocation can retry. Production CLI sets `strictSourceHealth=true`; the library permits non-strict mode for fixtures lacking one medium.
- Diagnostic `diagnostics.feed_integrity` includes per-lane status and relative change of the top 10, top 20, total retained items and shared rank movement. Major churn **alone** is a warning and is never enough to hide a genuine emerging premiere.
- A previously verified strong TMDB Trending top 10 that suddenly loses all Trending representations is also blocked from replacing the existing feed.

## Boundaries
- No new external providers or changes to demand/quality/growth/freshness weights, KP daily quota, age calculation, editorial choices or SURS client schema.
- TMDB Popularity is not actual playback, and rank stability is not a measure of viewer satisfaction. 4.11 improves the truthfulness and availability of the published recommendation feed, not its measured click-through rate.
- Rollback: revert the squash merge commit; already-published JSON snapshots remain in Git history.

---

# Hot Discovery 4.10: paced KP evidence acquisition

The 4.9 data generator executes every three hours and could make 45 KP API calls per run, exhausting its 210-request daily safety budget long before the end of the UTC day. The new cumulative eight-slot allocation reserves the day's requests for later runs: first UTC 00:00–02:59 slot allows up to 26 requests, next up to a cumulative 52, and so on to 210 by 21:00. Unused earlier allocations roll forward, and manual reruns in the same slot cannot spend the next slot's allowance. Every HTTP attempt and retry remains counted.

Before deciding which fresh ratings to request, the engine now applies valid exact-ID KP/IMDb ratings and verified KP popularity ranks from the existing cache to candidates. This gives the higher priority to titles that have already demonstrated demand rather than sorting the initial preview on TMDB alone.

Expired positive KP entries refresh through their already verified Kinopoisk ID in one detail call; IMDb ID and KP ID MUST BOTH match, otherwise the fallback exact-IMDb search applies. A valid detail can also carry the actual IMDb rating. Missing KP search results are cached more conservatively: currently trending or very recent titles may be rechecked the next UTC day, medium age misses after 2 days, older untrending misses after 4 days. Missing ratings remain unknown, never zero or fabricated.

The active demand-first formula, rating thresholds, selection mechanics, 40-item maximum, TMDB/IMDb/KP sources and schema-1 client contract remain unchanged. New diagnostics include slot and cumulative quota, cache-enriched preview count, verified direct-ID refreshes, and deferred requests. A separate set of integration tests proves direct and mismatched-ID behavior. No device-side telemetry or playback metrics are claimed.

## Validation

Run all existing tests and new KP pacing tests, including the live API GitHub Actions dry-run twice; inspect changed top-40 and any drops in ratings coverage. The deployment retains the last valid JSON if validation fails. The release can be rolled back to the 4.9 builder through Git history.

---

# Hot Discovery 4.9: observable demand and rating evidence

The 4.8 verified TMDB metadata cache could accidentally retain an older, higher `popularity` using `Math.max(prior.popularity, current.popularity)`. This **inflated or froze observed TMDB demand** when a title declined between 3-hour generator runs.

4.9 replaces that merge with `overlayFreshSignals`: finite **current** TMDB discovery popularity, vote count, and vote average override cached values even when lower (or explicitly zero). Missing or invalid current fields retain verified cached metadata but are marked `surs_hot_current_popularity_observed=false` and cannot generate confirmed positive momentum. Fresh detail responses are separately identified as observed when their metric is present.

The ranking weights, country rules, season verification, and remaining API quotas are unchanged. New schema-1-compatible diagnostics report how many selected cards have verifiable ratings from one, two, or three services, including the top 10/20; missing IMDb/KP values are classified by available provider evidence and never guessed or interpreted as a low rating. Per-card `surs_hot_rating_evidence` describes source coverage, **not** calibrated probability of quality.

**Known limitation:** MDBList is optional and currently unavailable if its key is not configured; IMDb's free datasets carry restrictions on reuse and public redistribution. The builder does not scrape IMDb or silently enable a disallowed source. Missing provider ratings can only be filled by an authorized service returning a verified title ID and actual rating/vote count.

Tests: current popularity and vote counts may drop or become zero on a cache hit; a missing current observation is explicitly unknown; actual 4.9 dry run must not change the relative order solely because of this code. Publish only after offline tests and real compare.

---

# SURS Hot Discovery 4.8: API budgets and verified-source caching

## 4.8 goals

Keep the established **4.7 demand-first ranking model and admission rules**, while reducing unnecessary recurring provider calls and making source coverage auditable. No manufactured ratings, views, streaming availability or artificially inflated triple-rating percentage.

- **Kinopoisk**: record a UTC-day request ledger in `data/hot-discovery-kp-cache.json`. Target a conservative 210 logical API requests/day and a hard maximum 45 per generator run, including exact-ID search, detail, popularity pages and verified daily vote observations. This is a safety budget below the provider's advertised default of 500 requests/day for new accounts, not a statement about an individual account's actual quota. The default HTTP transport counts each retry attempt before the network request and refuses retries that would exceed the budget. The persisted ledger represents the generator's attempted KP HTTP requests. Reserve capacity for the daily popular list and a small number of vote observations before exhausting the budget on searches; missing data remains unknown.
- **TMDB**: persist a small explicitly normalized metadata cache at `data/hot-discovery-tmdb-cache.json`. Detail observations have a 9-hour TTL, aired-season metadata a 6-hour TTL, cache retention 36 hours. Trending and discovery pages are **never cached by this mechanism**; their new popularity/vote values can refresh cards. Expired metadata is refetched and every cached result still undergoes US, release-date, genre and season checks. Cached data does not stand in for playback statistics.
- **Diagnostics**: expose per-run TMDB detail/season cache hits and misses, KP daily carried usage, consumed/remaining daily budget, per-run requests and rating calls deferred by quota. The existing triple-rating coverage remains an observation, never a quota enforced by deleting low-coverage titles.
- **Integrity**: SURS schema 1 preserved; separate persistent files are published together by the validated GitHub Actions workflow, including the new TMDB cache. `sameDay` continues to avoid gratuitous homepage reordering.
- **Validation**: unit tests explicitly check daily quota rollover, reservation, cache normalization/expiry, second same-day generation and expired cache regeneration. PR dry-run compares old vs new top-40 and makes an additional same-day generation to confirm TMDB request savings without publishing.

## Limits

The provider's stated daily quota may vary by account. The ledger counts each outbound attempt made by the default transport (including retries), but does not account for other applications using the same token. Mocked transports charge one call per invocation. The TMDB cache shortens repeated work but cannot independently improve unavailable IMDb/KP ratings. No source counts are presented as verified film views.

---

# SURS Hot Discovery 4.7: source-aware, demand-first ranking

## Scope and verification

4.7 replaces the **25-point discontinuous release-age tiers** with smooth freshness, while retaining the published schema-1 card contract and all verified 4.6 API sources. The old model remains recoverable through Git history. This is a change to recommendation ordering, not a claim of measured user satisfaction.

### 4.7.1 — correctness
- A verified **first US release date** takes precedence over a 1–2-day foreign/original-date discrepancy for US premiere age. If the only recorded US event is a very late digital listing more than 45 days after the original release, use the earlier original date rather than reset age. Store original, US and digital dates separately.
- A growth observation is classified as `rising`, `flat`, `falling` or `unknown`. Three-plus days of history confirm **measurement**, not positive growth. Flat, falling and unknown readings earn no positive growth signal.
- `surs_hot_score` is the actual pre-curation model score; `surs_hot_rank` is the editorial order. Small bounded diversity penalties are recorded separately as `surs_hot_editorial_penalty` and never subtracted from public score.

### 4.7.2 — scoring
- Treat TMDB Trending day and week as two correlated observations of **one provider**, not two independent sources. Independent Kinopoisk Popular and verified Kinopoisk movement remain bounded within their existing bonus cap.
- Compute a smooth age factor `exp(-days/145)` with no arbitrary 60/61 or 120/121 cliff. Keep the 45/35/15/5 demand/quality/positive momentum/freshness **baseline** and the documented 55/40/0/5 fallback without a confirmed multi-day momentum observation.
- For titles aged over 180 days require verifiable current audience activity, and for titles older than 365 days stronger combined evidence or a significant new rise. These are **eligibility evidence requirements**, not hard 180-day exclusions or implicit points penalties.
- Returning-season and breakout diversity constraints are soft bounded penalties to editorial position, not rigid quotas or hidden score changes. An exceptional title may legitimately overcome them.

### 4.7.3 — more complete retrieval and audit
- Keep the established first **260** round-robin detail candidates. Inspect up to **60 more** previously overlooked candidates using an additional ranked, movie/TV-balanced pass. All candidates pass the same US, premiere, metadata and quality checks.
- Record verified digital US release metadata; `digital_date_unconfirmed` means **no verified digital date** in TMDB, not that streaming is unavailable.
- Recalculate three candidate-weight variants from the **same already-verified candidate set** (baseline 45/35/15/5; demand 50/30/15/5; fresh 45/30/15/10) and log their top-10 composition, mean age and cross-platform confirmations. This is a descriptive comparison, **not** an independent measure of ranking correctness.
- **Active 4.7 model is demand 50/30/15/5**, with 60/35/0/5 when multi-day growth evidence is missing. In the live PR preview, this candidate set yielded a top-10 with 10/10 TMDB-trending titles and 6/10 titles also in KP TOP, compared with the historical baseline candidate-set 9/10 trending. This is a choice for the *Hot* shelf intent, not proof of user engagement.
- Preserve offline fallback, capped KP calls, separately sourced KP daily history, stable homepage settings, 40-item max and per-day publishing. Run a real API dry-run in the PR CI without pushing data.

### Remaining limits
No real playback metrics, click-through rates or user feedback are ingested. TMDB demand remains a proxy for user activity. Confirmed digital-release dates do not guarantee availability in a third-party player. KPI improvements should only be claimed after observing user behavior or independent relevance labels.

---

# SURS Hot Discovery 4.6: подтверждённая динамика интереса

## New in 4.6: Kinopoisk rank and rating-count momentum

Hot Discovery 4.6 builds on the verified Kinopoisk Unofficial `TOP_POPULAR_ALL` signal introduced in 4.5. It records one dated popularity ranking per UTC day and independently fetched rating-vote totals for a small subset of exact-ID-matched titles. No page clicks, views, streams, ranking changes or vote growth are invented.

- Historical samples are kept for the current day and the previous 14 calendar days, enabling exact **1/3/7/14-day** comparisons only when both dates were actually observed. An absent film or missing day is unknown, never assigned rank 61 or zero. The prior single-day `popular` cache is migrated without backfilling fictitious dates.
- `rating_history` contains **only fresh detail responses** for verified Kinopoisk IDs and IMDb IDs. Up to 12 current TOP candidates are refreshed daily, within the existing global 45-request-per-run KP ceiling. Cached three-day rating values are not treated as new daily observations. Missing vote observations never receive growth credit.
- Rank and vote improvements can slightly increase the independent-KP component **inside the existing attention signal**. An increase is bounded by the original attention bonus cap (**0.16 for a concurrently trending TMDB title; 0.10 without a TMDB trend**). Declines are reported but add no bonus and no penalty; missing history changes nothing.
- The original weighted model remains **45% current attention / 35% quality / 15% measured TMDB momentum / 5% freshness**, or 55/40/0/5 without confirmed TMDB growth. Russian-market KP history is not double-counted in the 15% component.
- Public JSON remains `schema: 1`, compatible with SURS Pro 4.0.8 without a client update. New per-card fields: `surs_hot_kinopoisk_rank_deltas`, `surs_hot_kinopoisk_vote_growth`, `surs_hot_kinopoisk_momentum_bonus`, plus observation timestamps. `diagnostics.external_demand` reports observed sample coverage and dates.
- Before publishing, `diagnostics.comparison` records actual previous/new top-40 overlap, additions, removals, largest rank movement and the two top-10 identity lists. This comparison is computed from the real new ranking, not a fabricated benchmark.
- Existing safe publishing is unchanged: a failed upstream request or a generated feed with under 12 valid titles leaves the prior committed JSON in place. New algorithm identifiers publish once immediately; subsequent same-day runs collect evidence without reshuffling rows.
- Version 4.6 does **not** claim KP site ranks measure real view counts and does **not** add HDRezka, Filmix, Trakt or JustWatch.

Validation: `node --check scripts/hot-discovery.cjs`, `node --check scripts/kp-demand-history.cjs`, `node --test tests/hot-discovery.test.cjs tests/kp-demand-history.test.cjs`.

---


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
