# Metrics — what the cookieless events can (and cannot) tell you

The opt-in `analytics` config (see SPORTPACK-AUTHORING.md) emits anonymous,
aggregate events per app: `round_started` (`sport`), `round_completed`
(`sport`, `streak_length` bucket `1`/`2-6`/`7-29`/`30+`, `num_correct` 0–6),
`returning_round_completed` (`sport`, `gap_bucket` `1`/`2-6`/`7+`),
`result_shared` (`sport`, `streak_length` bucket), `practice_played`
(`sport`) and `share-visit` (`sport`). The opt-in SEO renderer config adds
`seo_play_clicked` (`sport`, `page_template`, `destination`) on crawlable
pages. No cookies, no persistent tracking ID, no PII — ever. These events
cannot be backfilled: nothing is known about days before the config is set.

## The growth funnel (brief 0015)

`round_started` → `round_completed` is the activation rate (how many of the
players who start a round finish it). `returning_round_completed`'s
`gap_bucket` distribution is a same-week/same-month return signal that does
NOT require the streak_length distribution's unbroken-chain discipline: a
player who returns after a 5-day gap shows up in `2-6` even though their
streak already reset to 1. `seo_play_clicked` divided by the SEO page's own
Search Console impressions/clicks is the crawl-to-play conversion rate for a
specific discovery surface (a page_template/destination pair); dividing
`round_started` (or `seo_play_clicked` with `destination:"app"`) into
`round_completed` isolates activation from discovery, so a weak week can be
diagnosed as "not enough visitors" vs. "visitors who don't finish."

## Derivable today (zero tracking ID)

- **DAU / usage volume** — daily count of `round_completed` per sport (one
  per finished round per device per day, by construction). Provider pageviews
  give reach; `round_completed` gives *engaged* daily players.
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

## The honest limit

True D1/D7/D30 **cohort** retention needs a stable per-user identifier, which
this stance deliberately refuses; it becomes possible only with accounts — a
later, Stage-2 decision. Until then the streak-length distribution is the
stand-in: it measures *consecutive-day* return (stricter than D7), it is
device-local (a cleared localStorage or second device resets the streak, so it
UNDERcounts retention), and it has no per-cohort dimension. Treat levels as
conservative and trends as the signal.

## Activation (per pack)

One line in the pack definition once the provider account exists:

```ts
analytics: { provider: 'plausible', domain: '<the app domain>' }
```

then rebuild + deploy. Account step: create the site in Plausible with that
domain (no key needed — the script is keyed by `data-domain`). The
daily-game-retention skill's `retention_metrics.py` can compute cohort metrics
later if/when accounts (Stage 2) ever land.
