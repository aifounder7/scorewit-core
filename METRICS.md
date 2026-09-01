# Metrics — what the cookieless events can (and cannot) tell you

The opt-in `analytics` config (see SPORTPACK-AUTHORING.md) emits anonymous,
aggregate events per app:

- `round_started { sport }` on the first submitted answer of a daily round;
- `round_completed { sport, streak_length, num_correct }` once that round is
  complete (`streak_length`: `1`/`2-6`/`7-29`/`30+`; `num_correct`: 0–6);
- `returning_round_completed { sport, gap_bucket }` when the completed round
  follows an earlier local completion (`gap_bucket`: `1`/`2-6`/`7+` local
  calendar days);
- `result_shared { sport, streak_length }` and `share-visit { sport }` for the
  outbound/inbound share loop; and
- `practice_played { sport }` for each answered Practice question.

No cookies, persistent tracking ID, raw date, URL, entity, query or PII are
sent. Two namespaced, local-only day-key values enforce once-per-day start and
most-recent completion semantics; they never leave the browser. Events cannot
be backfilled, although an existing local game history can establish that a
new completion is a return.

## Derivable today (zero tracking ID)

- **DAU / usage volume** — daily count of `round_completed` per sport (one
  per finished round per device per day, by construction). Provider pageviews
  give reach; `round_completed` gives *engaged* daily players.
- **Daily activation** — `round_completed / round_started`, per sport. A page
  view is reach, not a start: the start fires only when the first daily answer
  is submitted. Practice, team feeds and matchup mini-quizzes are excluded.
- **Weekly returning round completions (north-star for brief 0015)** — the
  seven-day sum of `returning_round_completed`, per sport. This counts
  anonymous return play-days, not accounts or cross-device people. The
  `gap_bucket` mix distinguishes next-day, 2–6-day and 7+-day returns.
- **Share rate** (the viral-loop health metric) —
  `result_shared / round_completed`, per sport and per streak bucket (do
  long-streak players share more?).
- **Retention proxy: the streak-length distribution** — the share of
  `round_completed` events in the `7-29` and `30+` buckets. A player can only
  emit `30+` by returning ~30 consecutive days, so a rising 7+/30+ share IS
  retention, measured without any user identifier. Track it week over week.
- **Difficulty pulse** — the `num_correct` distribution (a drifting-too-hard
  or too-easy bank shows up here before reviews do).
- **Practice depth** — `practice_played / round_completed` as an
  engaged-audience signal.
- **Share-loop yield** — `share-visit / result_shared`, per sport. The inbound
  marker is the existing `#s` share fragment; it is removed from the address
  bar immediately after the sport-scoped event is attempted.
- **SEO-to-play activation** — when `seoConfig.analytics` is enabled,
  crawlable pages retain normal Plausible pageviews and emit
  `seo_play_clicked { sport, page_template, destination }` only for links to
  the app, Practice or an explicitly configured quiz hub. Archive-to-archive
  links do not count. The properties are enums, never raw paths or slugs.

## The honest limit

True D1/D7/D30 **cohort** retention needs a stable per-user identifier, which
this stance deliberately refuses; it becomes possible only with accounts — a
later, Stage-2 decision. Until then the streak-length distribution is the
stand-in: it measures *consecutive-day* return (stricter than D7), it is
device-local (a cleared localStorage or second device resets the streak, so it
UNDERcounts retention), and it has no per-cohort dimension. Treat levels as
conservative and trends as the signal.

`returning_round_completed` improves the early-return denominator without
changing that limit: it reports a return completion and a coarse local-day
gap, but cannot join events into people or cohorts. A cleared browser or
second device remains a new anonymous history.

## Activation (per pack)

One line in the pack definition once the provider account exists:

```ts
analytics: { provider: 'plausible', domain: '<the app domain>' }
```

then rebuild + deploy. Account step: create the site in Plausible with that
domain (no key needed — the script is keyed by `data-domain`). The
daily-game-retention skill's `retention_metrics.py` can compute cohort metrics
later if/when accounts (Stage 2) ever land.

For crawlable-page measurement, also label each `SeoPage.pageTemplate` and
opt in with the same Plausible domain:

```ts
seoConfig: {
  analytics: {
    provider: 'plausible',
    domain: '<the app domain>',
    quizHubPaths: ['/sport/quiz'], // optional; root-absolute play hubs only
  },
}
```

Core derives `sport`, the namespaced analytics-off key, app root and Practice
destination. It rejects a mismatched app/SEO Plausible domain.
