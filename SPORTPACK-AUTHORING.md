# Authoring a new sport as a SportPack

A sport plugs into `@scorewit/core` as a `SportPack<M, E, T, C, DS, V>` — match
shape, edition key (number- or string-keyed, never normalized), topic union,
provenance-check union, dataset shape, coverage/meta shape. The core runs
`ingest → generate → validate → render` and emits the single-file app; the
pack owns every fact, derivation, label, and editorial choice.

**The firm rule: new sports are authored FROM the shared shell and must need
ZERO `clientJs.shellPatches`.** Patches are a migration-only escape hatch for
pre-existing hand-forked shells (both existing packs are now patch-free). If
the shell can't express something, add an optional soccer-defaulted token or
chunk to the core — don't patch bytes.

## The pipeline contract

- `ingest(env)` → `{ tournaments, meta }`; the core writes both to
  `pipeline/dataset/`. Compute coverage pack-side (your `V` shape is opaque
  to the core).
- `loadDataset(raw)` rehydrates `tournaments.json`; `feedsTrivia(m)` gates
  which matches may produce facts.
- **Determinism:** all generators share ONE seeded rng and run in
  `pack.generators` **insertion order**; selection order is separately
  `config.quotas`. Both orders are part of the byte-stable bank — never
  reorder them casually. No `Math.random` anywhere.
- `checks` (per check kind) re-derive every answer with logic INDEPENDENT of
  the generators' helpers; `questionGuards` covers per-question gates (era
  labels, attribution, in-progress-edition restrictions); `validateGuards`
  covers whole-artifact guards (per-entity/matchday re-derivation, giveaway
  guards, unplayed-fixture firewalls, regression cases).
- Optional hooks: `bankExtras` (extra bank JSON fields), `matchdayAnchor`
  (pin the build date to dataset metadata when there are no unplayed
  fixtures, making the whole build a pure function of the dataset),
  `validateSuccessMessage`, `finalizeHtml(html, 'preview' | 'site')`.

## Bank composition target (opt-in: `bankTarget`)

Unset = quota-only selection, byte-for-byte. When set, generate tops the bank
up from pools' beyond-quota surplus — deterministic, id-deduped, rotating
across pools, bounded by `topUp.perPoolCap` (max EXTRA per pool) — to reach
`size` and to satisfy minimum `difficulty` floors (< 1 = proportion of size,
>= 1 = count), repairing the most-deficient tier first with ties breaking
toward easy. The quota-selected base is unchanged; top-up only appends.

```ts
bankTarget: { size: 300, difficulty: { easy: 0.30 }, topUp: { perPoolCap: 8 } }
```

**Honesty rule:** difficulty comes from the pack's `tier()` on REAL facts. The
engine STEERS toward the target and guarantees size only where surplus exists
— it cannot fabricate easy questions. An unmet floor warns loudly (or exits
non-zero with `strict: true`, before writing artifacts): that is a SIGNAL to
add recognizable easy-tier archetypes (sport-archetype-catalog, Tier 1), not a
bug to pad over. The daily 2/2/2 round selection is untouched — this shapes
BANK composition only.

## SEO pre-render (opt-in: `seoPages`)

Unset = nothing emitted, app byte-identical. When set, the render stage wraps
each pack-rendered `SeoPage` (path/title/description/h1/JSON-LD/bodyHtml,
optional dataset-derived `lastmod`) in the shared crawlable template — unique
≤60 title, ≤160 description, canonical `APP_URL/<path>`, OG tags, one H1, the
pack's trade-dress footer, a CTA into the app — and writes it as a NEW file
`site/<path>.html`, plus `sitemap.xml` and `robots.txt`. ADDITIVE ONLY: the
app shell and existing artifacts are untouched.

Emit-time gates throw on route/reserved-path collisions, over-length or
duplicate titles, thin/doorway bodies, and stray `<h1>`s. Non-negotiables the
pack owns: every fact re-derived from the frozen dataset and CITED like the
app; completeness-gate — only entities with complete data get a page;
descriptive-use naming only. Use safe path prefixes (e.g. `wc/`, `team/`,
`records/`) — cleanUrls serves `/<path>` from `site/<path>.html` with no
rewrite changes. Verify every emit with the content-seo skill's
`scripts/seo_check.py`.

### The page design language (structured fields — all optional)

The shared template implements the Scorewit page look: branded topbar with a
sport-accent speed line, big display H1, hero stat cards, chips, an accent
callout, the fact-checked trust badge, a strong CTA, and the muted trade-dress
footer. Theming is per sport: the accent is parsed from the brand palette's
`--accent` token (override via `pack.seoConfig.accent`); set the CTA label via
`pack.seoConfig.cta` (e.g. `"Play today&rsquo;s F1 round &rarr;"`). Pages stay
fast by construction — system font stack, inline CSS, no JS, no images beyond
inline/flag SVGs. The only exception is the explicit analytics opt-in below;
non-opting pages remain byte-identical and JavaScript-free.

A page that supplies only `bodyHtml` renders as before (restyled). The
structured fields (see `SeoPage`) fill in the rest of the language:
`eyebrowHtml` (entity type + flag), `subtitleHtml` (key qualifier in `<b>`),
`premiseNote` (the "current through <date>" accent pill, plain text), `lead`
(the insight paragraph — see below), `heroStats` (1–4 big cards, ≤1 `hero`),
`chips` (plain-text pills), `callout` (left-accent key facts), `trustNote`
(the dashed fact-checked badge, with the source link). Emit gates enforce:
plain-text fields carry no markup; raw inline fields carry no `<h1>`/`<script>`.

### Crawlable-page analytics (opt-in: `seoConfig.analytics`)

SEO analytics is separate and opt-in because the static pages otherwise carry
no JavaScript. It loads the same cookieless Plausible site as the app, retains
normal pageview measurement, honors `<storagePrefix>.analyticsOff`, and emits
one `seo_play_clicked` event when a same-origin link enters the app, Practice
or an explicitly configured quiz hub. Ordinary archive-to-archive and
external navigation do not emit.

```ts
seoConfig: {
  analytics: {
    provider: 'plausible',
    domain: 'scorewit.com', // must exactly match pack.analytics.domain
    quizHubPaths: ['/f1/quiz'], // optional; normalized root-absolute paths
  },
}
```

Every emitted page in an opted-in pack must set `pageTemplate` to one approved
low-cardinality value. Current family mapping:

| page family | `pageTemplate` |
| --- | --- |
| Footyphoria season / club / H2H / record | `season` / `club` / `head_to_head` / `records` |
| F1 season / driver / constructor / circuit | `season` / `driver` / `constructor` / `circuit` |
| F1 calendar / record / quiz hub | `calendar` / `records` / `quiz` |
| F1 match or Grand Prix detail / next race | `race` / `next_race` |
| umbrella legal page | `legal` |

The complete enum is exported as `SEO_PAGE_TEMPLATES`. Destinations are fixed
to `app`, `practice`, and `quiz_hub` (`SEO_PLAY_DESTINATIONS`). Core derives
the app root and Practice route; `quizHubPaths` is the only author-supplied
destination list. The event payload is exactly
`{ sport, page_template, destination }`: never a raw path, URL, entity slug,
search query, link text or date. A bad enum, path, domain or missing template
fails the build. Without `seoConfig.analytics`, even a `pageTemplate` field is
byte-inert.

### The insight engine (human framing, firewall-clean)

Raw stats are inert ("242 starts, 71 wins"); the `lead` gives them meaning
("wins nearly one race in three") — but framings are COMPUTED, never
hand-written. Author an `InsightTemplate<Stats>[]` library per entity type
(the question-generator pattern applied to prose):

```ts
{ id: 'win_rate',
  predicate: (s) => s.wins >= 10 && oneInN(s.wins, s.starts) !== null,
  render: (s) => { const r = oneInN(s.wins, s.starts)!;
                   return `Wins ${r.hedge} one race in ${numberWord(r.n)}.`; },
  weight: 80 }
```

`composeLead(stats, library)` fires ONLY templates whose thresholds pass,
ranks by weight, and joins the top lines into the paragraph. In validate, call
`verifyLead(statsIndependent, library, page.lead)` with stats the VALIDATOR
re-derived from the dataset — it recomposes and demands byte-equality, so
every fired predicate, number, and phrase re-derives; a witty line can never
smuggle an unverified fact. **Read FIREWALL.md before adding any helper both
sides touch**: derivations must never be shared between emit and validate
(byte-equality is only meaningful when the sides compute independently);
shared pure formatters need isolated unit tests + ground-truth pins. Voice rules (see VOICE.md): wit is
threshold-EARNED; degrade respectfully (a zero-win entity gets its genuine
angle, never snark); rounded figures always hedged (`oneInN` returns the
hedge); precise stat cards + citation still render beneath the lead.

## Engagement analytics (opt-in: `analytics`)

Unset = the shell renders **byte-identically** (the original inline Vercel
Web Analytics wiring) and no new events are emitted. When set, the shell loads
the provider's cookieless script and fires anonymous custom events.

**Privacy stance (non-negotiable — it's the brand): NO cookies, NO persistent
tracking ID, NO fingerprinting, NO PII.** Events are aggregate counters with
tiny, non-identifying payloads; reminder records are a separately consented functional service and never join these
analytics. Do not describe the whole service as storing no personal data once
optional push credentials are supported. Pick a provider that is itself cookieless and
stores no PII — Plausible is the recommended default (cookieless, no-PII,
hashes and rotates rather than storing IPs, supports custom events).

```ts
analytics: { provider: 'plausible', domain: 'yourquiz.example' }
```

Providers: `'plausible'` (requires `domain`), `'vercel'` (keeps the existing
insights script, new event names), `'custom'` (requires `endpoint`; events go
as first-party JSON beacons, no third-party script at all).

**Events** (client-side, in the shell; `sport` = `pack.id`):

| event | props | fired when |
| --- | --- | --- |
| `round_started` | `sport` | the first answer of a daily round is submitted, once per sport/day |
| `round_completed` | `sport`, `streak_length` (`1`/`2-6`/`7-29`/`30+`), `num_correct` (0–6) | the daily round is finished (once per day) |
| `returning_round_completed` | `sport`, `gap_bucket` (`1`/`2-6`/`7+`) | completion follows an earlier local-day completion |
| `result_shared` | `sport`, `streak_length` bucket | the Share button is used |
| `share-visit` | `sport` | an inbound `#s` share marker is consumed |
| `practice_played` | `sport` | a Practice question is answered |

`round_started` never fires for a pageview, restored completed round,
Practice answer, team-feed quiz or matchup mini-quiz. Two local-only values —
`<storagePrefix>.analyticsStartedDay` and
`<storagePrefix>.analyticsLastCompletedDay` — contain only day keys, enforcing
reload-safe start and return semantics without an identifier. No raw day key
is sent; returns expose only the three-value gap bucket. Existing namespaced
game history is also considered when locating the most recent earlier local
completion, so a returning player is not treated as new just because the
event contract was added later.

The two pre-existing shell events (`team_picked {team}`, `pick_made {pick}`)
keep flowing through the same `track()` — equally anonymous.

The **streak_length distribution is the cookieless retention proxy**: a rising
share of `7-29`/`30+` streaks = retention, derivable with zero tracking ID.
See METRICS.md for what is (and honestly is NOT) derivable. Activation is one
config line per pack plus the provider account — no core change.

**Analytics-off switch (v0.10.0, automatic when `analytics` is set):** the
Stats panel gains a Settings card with a "Don't count me in analytics"
checkbox. It sets `<storagePrefix>.analyticsOff` in localStorage; `track()`
checks the flag before EVERY event on every provider, and the head loader
skips fetching the provider script entirely when the flag is set (for
Plausible the official `plausible_ignore` flag is mirrored too, so an
already-loaded script stops auto-pageviews immediately). This is the
objection mechanism the umbrella privacy page promises (CNIL sheet 16 / UK
DUAA statistics exception). Unset analytics = no card, no flag, byte-identical.

**Terms-assent line (v0.10.0, always rendered):** a conspicuous
"By playing you agree to the Terms" line under the play area, linking
`termsUrl` (default: the umbrella `https://www.scorewit.com/terms` every sibling
footer already links). In-flow assent per the 2025 case law — a footer-only
terms link is routinely unenforceable browsewrap. Override `pack.termsUrl`
only if the pack's canonical terms live elsewhere.

## Serving under a path prefix (opt-in: `config.basePath`, v0.15.0)

A pack served under a sub-path of a larger origin (e.g. `/f1` on
`www.scorewit.com`) sets BOTH:

- `config.basePath: '/f1'` — prefixes every root-relative emission: head
  asset links, the client router's route maps (incl. the hardcoded daily
  `/`), the tab routes, the PWA manifest `start_url`, and the SEO template's
  `/` links;
- `brand.appUrl: 'https://www.scorewit.com/f1'` — the FULL public URL
  including the prefix; it keeps driving every absolute emission (canonical,
  og:url/og:image, sitemap `<loc>`s, robots' Sitemap line, share text). The
  build fails unless `appUrl` ends with `basePath`.

Path-hosted app roots use the non-trailing-slash `basePath` form everywhere
that identifies or links the app itself: canonical, sitemap root, app/SEO
home links, play CTA, and PWA `start_url`; the manifest explicitly scopes the
installed app to that same prefix. Child routes and assets keep their normal
slash separator. This matches the shared-origin router's effective URL and
prevents every SEO page from linking through a root redirect.

The build then GATES every emitted page (app shell, 404, every SEO page)
against root-relative leaks: any `href="/…"`/`src="/…"` that escapes the
prefix fails the build — on a shared origin that link lands on a different
product. Pack-side copy must therefore carry the prefix itself:
`notFoundActionsHtml`, SEO bodyHtml internal links, flag/medal `src`s, the
`spotlight` chunk's `hubPath`, and any relative asset `src` in client chunks
(relative srcs break on the bare `/f1` path — root-absolutize them with the
prefix). The default/`vercel` analytics head is root-relative
(`/_vercel/…`) and is rejected by the gate by design — use `plausible` (or
`custom` with an absolute endpoint).

Serving model: the origin's front-door repo rewrites `/f1/:path*` to this
pack's deployment WITH THE PREFIX STRIPPED (`/:path*`), so the pack's site
TREE keeps its unprefixed file layout (and its own vercel.json route
rewrites keep their unprefixed sources) while every URL in the CONTENT
carries the prefix. `basePath` unset = byte-identical output — that is the
hard gate, covered by src/base-path.test.ts.

## Post-round continue strip (family standard: `family`, v0.16.0)

Without the shared `footer` option, the result screen renders a compact strip
under the share module: the OTHER family games as chips (played-today ✓ where same-origin storage allows,
unplayed first) plus a link to the portfolio hub. Configure it on the shell:

```ts
family: {
  heading: 'More Scorewit',
  hub: { url: 'https://www.scorewit.com/', label: 'All games →' },
  games: [ // the six siblings — NOT self (validated); hub-canonical data
    { name: 'Box-Box', url: 'https://www.scorewit.com/f1', storagePrefix: 'scorewitf1' },
    // …
  ],
}
```

Names/URLs/prefixes must mirror the hub's `automation/portfolio.json` — the
strip reads a sibling's `${storagePrefix}.history[todayKey()]` exactly the way
the front door does, and only when the sibling URL is same-origin (cross-origin
chips just say "play"). All copy comes from this config; URLs are validated to
a plain absolute-https shape at render time. Links only — no autoplay, no
nagging. This is the FAMILY DEFAULT, not an experiment opt-in: every Scorewit
pack sets it (unset renders an empty hidden container and exists only so a
fresh scaffold builds before its family wiring lands). Covered by
src/family-continue.test.ts, including a vm run of the shipped inline code.

## Post-answer entity links (opt-in: `entityLinks`, v0.16.1)

Set `entityLinks: (ds) => ({ entities, pairs? })` to make entity mentions in
POST-ANSWER surfaces link the pack's own SEO pages. `entities` maps display
names — exactly as they appear in validated fact strings — to `SeoPage.path`
targets (`'club/arsenal-fc'`); `pairs` maps sorted `'A|B'` name-pairs to the
pair's head-to-head page. The DESIGN RULE is absolute: links render only on
post-answer surfaces (reveal facts, panels, settled-result rows) — NEVER
inside an unanswered question or its options; core tests assert the question
surface is anchor-free and that the spoiler-free share text stays plain.

Mechanics (the chipIcons precedent, applied to the shell): the validated fact
string is NEVER edited — the shell's `linkFact(s)` wraps matched mentions in
same-tab `<a class="elink">` at display time (longest name wins, word
boundaries gate, one link per mention; a bare `1-2` score token BETWEEN a
known pair's two names links the h2h page). Stripping the anchors recovers
`esc(s)` byte-for-byte. The pipeline existence-guards every target against
the emitted SEO page set (requires `seoPages`; a missing target renders as
plain text, never a dead link), and hrefs are basePath-prefixed. Pack chunks
(teamCards / todayCards / renderToday) may call `linkFact(...)` themselves to
light up panel and settled-results surfaces — same rules apply. Styling is
the subtle tier: inherited color (AA by construction), dotted underline,
solid on hover. Covered by src/entity-links.test.ts.

## The app-shell surface

The shell owns the engine (daily selection, scoring, streak/stats, practice,
share, routing). You supply values; everything defaults to the first pack's
(soccer's) exact strings so defaults are always safe.

**Injected client-JS chunks** (`clientJs`) — the sport-varying presentation:

| chunk         | must define                                   |
| ------------- | --------------------------------------------- |
| `consts`      | any lookup tables your decorations need       |
| `decorations` | `teamLabel(name, hero?)`, `slLabel(scoreline)`|
| `teamCards`   | `teamInsightsHtml(team)`                      |
| `todayCards`  | `fixtureHtml(f)`, `pickRecordHtml()` (+ any helpers they use — keep helpers IN the chunk) |
| `teamHelpers`?| `editionLabel(ed)`, `placementWord(p)`        |
| `eraLabel`?   | `eraLabel(e)` for the Practice era chips      |
| `renderToday`?| the whole Today-tab flow, when your sport's calendar differs (fixtures vs. latest-results vs. empty) |
| `renderTeam`? | the whole My-Team flow incl. its picker, when the follow model differs (e.g. F1 follows a driver AND a constructor); must define `renderTeam()` |
| `shareLine`?  | statement block inside `buildShareText()` (after streak, before URL) — push onto `lines`. SPOILER RULE: never question content; only strings already in a validator-checked artifact (e.g. the followed entity's `insightLine`). Unset = incumbent share text, byte-identical |

**Opt-in: `teamTheming`** (nations only — franchise colors are trade dress,
deferred): `{ nations: { "<artifact team name>": { band, accent, onAccent,
inset?, vband? } } }`. Unset = byte-identical shell. Set = the followed
nation's My-Team tab gains a decorative flag band + nation-tinted banner
(name, flag, the validated `insightLine`) and the `--team`/`--teamDim` pair
swaps to the nation's display accent. The table is EDITORIAL DATA (mark
provenance per FIREWALL.md; identity/kit colors, flag-derived default,
hue-faithful lightened where a spec color fails); every rendered pair is
AA-gated at build time and the build fails below threshold. Nations absent
from the table render unthemed (allowlist). Requires the standard My-Team
flow (build error with a `renderTeam` override). If your `teamCards` chunk
renders its own insight-lead card, gate it on
`typeof NATION_THEME!=='undefined'&&NATION_THEME[t.name]` so the banner and
the card don't both carry the line.

**Opt-in: `numericPills`** (tap-only numeric questions): set `numericPills:
true` on the pack and generate gives every `closest_guess` question a
4-option pill set — the true answer + 3 wrong-by-design distractors — and
the shell renders those questions as tappable pills instead of the typed
input (daily, practice, My-Team, and matchup quizzes alike). Synthesis is
deterministic per question (`hashString(id) ^ config.seed`, NOT the shared
generator rng), so opting in adds `options` fields and changes nothing else
in the bank. Distractors match the answer's granularity (0.5-step for
half-point answers), sit strictly outside `scoring.fullPointsWithin` (so
exactly one pill scores 100 — the validate harness enforces this plus
distinctness and non-negativity as independent constraints), and scale with
`zeroBeyond`; scoring is untouched, so near pills keep banded partial
credit. Unset = bank byte-identical, typed input renders as before.

**Opt-in: `calendarSpotlight`** (event-week banner + guaranteed venue
question): set `calendarSpotlight: { activeHtml, upcomingText, upcomingHref?, quiz? }` on
the pack AND supply a `clientJs.spotlight` chunk defining
`spotlightInfo(fixture)` over your matchday fixture shape (return `null` or
`{ event, venue, hubPath, start, end, quizIds }` — see
`CalendarSpotlightConfig` in types.ts). The daily tab then carries a
deterministic banner: inside the `[start, end]` window it links the venue's
SEO hub (`activeHtml`, placeholders `{event}`/`{venue}`); before it, a
countdown (`upcomingText`, `{event}`/`{days}`) that becomes a full-banner link
when `upcomingHref` supplies a plain root-absolute destination; after `end` it hides until
the refresh rolls the artifact to the next fixture. With `quiz: { min,
badge }` set, a daily round inside the window carries EXACTLY ONE
venue-tied question (from the fixture's `quizIds` pool): none landing
naturally swaps the round's LAST slot for a seeded pick (badge chip
rendered on it); a surplus natural pick yields its slot to its bucket
permutation's next non-tied question; a pool under `min` skips silently.
This CHANGES the daily round on event days by design — everything is a
pure function of the day-key clock + committed artifacts, so every visitor
on the same day key still gets the same six. Unset = shell byte-identical,
selection untouched.

**Tokens** (all optional, soccer-defaulted):

- `brand`: `paletteCss`, `themeColor`, `onAccent` (button text colors),
  `recordGridCols` (record-grid columns), `resultLineCss` (result-row
  layout), `extraCss` (appended to the stylesheet), `notFoundPaletteCss`.
  Palette colors are editorial data, but the accessibility guarantee is
  COMPUTED: `renderAppHtml` refuses to build when any token×surface pair the
  stylesheet renders falls below WCAG AA (4.5:1 text, 3:1 UI borders) — see
  `src/contrast.ts` for the exact contract. The house gray ramp that passes
  everywhere is `--text:#EDEDEF --text2:#9A9AA3 --text3:#84848D` on
  `--bg:#0C0C0E/--elev:#161619/--surface:#222228` (and `#EA4058` for
  `--incorrect`); if you deviate, pick values that measure, don't eyeball.
- `copy`: title/meta/OG/Twitter, `subInitial`, `footerHtml`, `resultNote`,
  `teamPickerBanner`, `todayIntro?`/`todayNoMatches?` (omit if you override
  `renderToday`), `tabLabels?`, route titles, `bankRefreshNote`,
  `manifestDescription?`, 404 heading/body/actions/`notFoundExtraCss?`.
- `config`: `storagePrefix` (localStorage namespace), `epochUtcArgs` (daily
  clock epoch), `routes?` (tab paths — keep `assets.siteFiles` host rewrites
  in lockstep).
- `assets`: `files`, `copies`, `dirs` (e.g. flag SVGs), `siteFiles?`
  (e.g. a generated vercel.json).

## Optional consumer copy

`copy.topicLabels` maps internal topic keys to plain-text display labels. It
does not rename topics in the bank. When configured, every topic present in
`data.bank.questions` must have its own non-empty label or the build fails
with the missing topic names. Extra labels are allowed for topics absent
from a rotating bank. Unknown runtime keys retain the legacy fallback;
leaving the option unset preserves all previous behavior.
`copy.dailyReturnCue` adds a note only to completed daily rounds:

```ts
dailyReturnCue: {
  upcoming: 'Next daily round: {date} at midnight (your local time).',
  available: 'A newer daily round is ready. Reload this page to play.',
}
```

The date is the local calendar day after the completed round, matching
`todayKey()` (not UTC midnight). Local calendar construction handles DST;
the available note applies once that midnight has passed. There is no timer,
notification, new event, or automatic round rollover. Both options unset
keep the rendered shell byte-identical. Keep labels and cue copy pack-owned.

## Checklist for a new pack

1. Dataset first: ingest + normalize + coverage; commit `pipeline/dataset/`.
2. Types: extend `Tournament<M, E>`/`Dataset<M, E>`; define `Topic`/`Check`.
3. Generators + quotas; then the INDEPENDENT `checks`/guards; validate green.
4. App shell: set tokens + write the four chunks. No shellPatches.
5. Determinism proof: build twice from the same dataset — byte-identical.
6. Hygiene: no sport facts in core, ODC/data licences honored pack-side,
   identity rules per the repo's CLAUDE.md.

## Shared footer (opt-in: `footer`)

Supply a `FooterConfig` as `pack.footer`. Core uses it for both game and
reference pages; omit it to retain the legacy `copy.footerHtml` bytes. The
contract contains the home URL, wordmark, labels, visible trust/privacy text,
disclaimer paragraphs, copyright line, utility links and credits. Each credit
line is an array of text or `{ text, url }` links; the renderer escapes all
text and validates HTTPS destinations. No raw HTML, scripts or collapsed text.

Add `markUrl` and `description` to each existing `family.games` entry. These
are footer-only presentation data. Keep the current game excluded as before.
Use existing pack marks and current public names. `markUrl` accepts an HTTPS image URL or
a base64 SVG image URL for marks embedded at build time. `renderFooter(config)` without a family
renders the homepage's band-only variant. Include `FOOTER_CSS` once in custom
page templates using that variant. The shell and SEO templates do this for you.

With both `footer` and `family` configured, the approved tile shelf remains
visible before and after a round, including restored results. The shell omits
the legacy `#continue` pill container so sibling navigation appears only once.
The shelf keeps its configured order and descriptions, without played badges.
Consumers without a shared shelf retain the legacy strip and played-state
behavior. Terms assent stays in place. Every footer element stays visible,
including credits and non-affiliation notices. Copyright and refresh wording are supplied by the
pack, not derived from the render clock. Preserve each source's full notice.


## Notification foundation (v0.21.0, disabled by default)

### Mirrored service contract v1

Status: disabled implementation of brief 0027 Amendments A, B and C (design approved 2026-09-26). Do not activate clients or start
briefs 0028/0029 until this contract is founder-merged. No deployed service URL
is assumed. Platform clients consume this document; changes require a new review.

## API

HTTPS JSON only, maximum request body 8 KiB, no cookies. Production web Origin
is exactly `https://www.scorewit.com`. CORS is not authentication. Transport
credentials are never logged. All responses disable caching.

- `POST /v1/subscriptions`: `{transport: "webpush" | "apns", credential,
  games: [pack], hour: 0..23, tz: IANA,
  app: {platform: "android" | "ios" | "web", version: string}}`.
  Credential is a PushSubscription JSON object (endpoint and keys) or a 64-hex
  APNs token. Returns 201 `{id, secret}`. Keep that pair on the device only.
- `PATCH /v1/subscriptions/{id}`: `Authorization: Bearer <secret>`, JSON with
  one or more of games/hour/tz. Order of games determines the first named game.
  Returns 204, 400 for invalid input, 401 for wrong credentials, 404 if removed.
- `DELETE /v1/subscriptions/{id}`: either the management secret or `Authorization: Bearer <stop.token>`
  from a delivered reminder. Stop tokens authorize DELETE only. Idempotent 204,
  including when already deleted or activation is disabled. Atomically writes a
  14-day random-id tombstone, then removes the credential, record and index.
  Repeated DELETE refreshes that tombstone lifetime.
- `GET /v1/status`: `{version: "1.0.0", packs: [pack], transports: [...]}`.
  Packs come only from successfully fetched, schema-valid published state files.
  Clients must filter options against this list. It is not a promise that each
  listed pack has a ready round for every local date.

400 invalid request; 403 disallowed Origin;
429 registration budget exhausted; 503 disabled/unconfigured/unavailable/capacity.
Do not expose backend details, tokens or request bodies in error responses.

Supported pack identifiers: `f1`, `worldcup`, `footyphoria`, `cricket`,
`gridiron`, `baseball`, `superover`. These match URL roots, not analytics aliases.

## Storage and at-most-once delivery

One record per subscription contains only transport, credential, games, hour,
tz, app, createdAt, lastSentOn and consecutiveFailures. The random id
is the key. The management secret is HMAC-derived from the id and an environment
secret, so it is not stored. Redis also holds a credential SHA-256-to-id index,
the set of active ids, a reverse index for deletion, an expiring random-id stop marker, the runtime
send switch, and one expiring aggregate registration counter. None
contains IPs, browser user agents, page history, scores or device fingerprints.
Deleting a subscription removes its credential, preference record and indexes;
the random-id tombstone expires 14 days after its latest off request.

The atomic credential index permits one active record for a web push endpoint
or APNs token. Shared-origin clients use the same local handle and root service
worker `/notify-sw.js` with scope `/`, including the TWA. Never register separate
per-game worker scopes: that would create extra endpoints and reminders.
Workers are generated per pack for consistency; the root copy is canonical.

"Device" in this contract means this subscription context. Separate browser
profiles and an iOS native app cannot be recognized as one physical phone without
adding an identifier. We do not fingerprint or link them, and do not claim that
deduplication. Token replacement is DELETE then a fresh subscription after user
consent; it is not silent registration. POST with the same credential updates
the existing record and returns the same handle. Possession of that credential
is required. Updates preserve createdAt, lastSentOn and consecutiveFailures,
so repeated registration never resets the daily cap.

Hourly jobs atomically compare and reserve lastSentOn **before** provider I/O.
Despite its legacy brief name, this is the last attempt date, not proof of
receipt. Concurrent cron executions, DST's repeated hour and ambiguous provider
timeouts cannot retry the same subscription/date. A crash after reservation may
lose a reminder. We favor at-most-once attempts over possible duplicate messages.
Preferences are compare-and-set updates so they cannot overwrite this reservation.
Changing time zone cannot send on a local date less than or equal to the last
reserved date. After reserving, each send checks the runtime switch and re-reads the record
immediately before provider I/O. A missing, changed or stopped record skips.
CAS cannot resurrect a tombstone. A message already handed to the provider
cannot be recalled; a final-read-to-send race also remains. Never promise zero
arrivals after an off request or a retroactive cancellation.

An hourly run compares local wall-clock minutes to the chosen hour. It is due
from that hour through exactly three hours later, inclusive, on the same local
date. A later minute or an earlier hour skips without reserving. This catches a
missed run and a spring-forward missing hour, but never wraps yesterday's reminder
into today. The last reserved date must be earlier than today's local date.
Fractional-offset zones are checked on their local offset minute: with a top-of-
UTC-hour scheduler, half-hour zones are checked at :30, quarter-hour zones at :15
or :45. Provider delivery remains approximate, not guaranteed at that minute.

A schema-valid published window must include the local date, inclusively. Missing,
malformed, expired or future windows produce no message and no reservation. One
message names the first ready selected pack and counts the other ready packs.
English fixed templates only; no locale is sent or stored. The ISO date and
weekday use the subscriber's zone. Click URLs are fixed game roots with only
`?src=push`, never a subscription identifier.

The initial service caps active subscriptions at 500 and anonymous registrations
at 30 per minute, without storing IPs. Delivery uses 20 concurrent requests,
8-second provider timeouts and a 300-second function budget. Capacity must be
explicitly reviewed before increasing the cap; do not silently drop scan pages.

Delete on web push 404/410, APNs Unregistered/410/BadDeviceToken, explicit DELETE,
or five consecutive failed delivery attempts. A successful send resets failures.
Web push TTL and APNs expiration are zero to avoid queued yesterday notifications.
The web worker additionally rejects a payload whose date is stale in its given tz.
The native iOS client must apply the same rule when processing in-app delivery.

## Published state

Each pack publishes `/<pack>/state.json`:
`{pack, builtOn: "YYYY-MM-DD", readyThrough: "YYYY-MM-DD", cadence: "nightly" | "three-a-week" | "weekly"}`.
The build date is UTC, with an explicit date override for reproducible tests.
The end date is computed by the pack build's validator: it runs the actual emitted
selector for every consecutive date, including Racing event-week substitutions.
Cadence sets a finite scan budget of 2 days ahead (nightly), 4 (three-a-week), or 8
(weekly), covering the normal refresh gap plus an ahead-of-UTC date. The budget is
not an attestation. Only checked dates can enter the contiguous window; a failing
date stops the scan. The build fails if today and tomorrow cannot both be verified.
The service requires readyThrough to be at least builtOn plus one day and rejects
the old date/roundReady schema. A local date outside the window still skips. This
certifies selectable rounds from the committed bank, not new source-data ingestion
or a promise about future rebuilds.

## Browser and native client boundary

Core `notifications` defaults off. When explicitly enabled, it exposes consent
only after completing a Daily round, never on arrival, the hub, or during play.
Not now and permission denial suppress offers for 30 days in shared local storage.
Settings live in Stats on game modes, reference pages and the hub, with Turn
off reminders first. Only enabled builds include the controls. Existing
subscribers can reach them without playing; unsubscribed arrivals are never
shown an offer. Controls permit hour/game edits and DELETE. On a later page visit, an existing
subscriber whose device zone differs gets one authenticated PATCH containing only
`{tz}`. No consent, credential refresh or other preference update is automatic.
Successful PATCH updates the local zone; failure retains it for the next visit.
Re-rendering does not repeat the request. Unsubscribed visitors send nothing. Failed DELETE persists the pending off request and credentials, shows
"Turning off, will retry", and retries on subsequent visits with exponential
backoff capped at one hour. Retry now bypasses the delay. Only HTTP 204 permits
"Reminders are off". The worker persists deletion-only capabilities and pending
requests in IndexedDB (not the Cache API). A delivered reminder refreshes its
capability; a pending request is retried without displaying another reminder.
Expired capabilities cannot delete; the UI keeps pending state and the visitor
can use device notification settings. Storage must work before subscribing.

Native plugin contract, implemented by brief 0029:
`window.ScorewitNativeNotifications.requestPermissionAndToken()` returns a Promise
of `{permission: "granted" | "denied", token?: string}`. Invoke the native permission
prompt only in this user-triggered method. On a notification tap, navigate only to
an allowlisted HTTPS Scorewit game root with `?src=push` inside the web view.
The core listener consumes that marker, emits `push_opened {pack}` through the
existing cookieless track function, then removes it. The first visible bar says "Reminders are on. Turn Off"
when a local handle or recovered capability exists. Without either, it says
"Manage your reminders" and directs the visitor to the notification action or
device settings, never fabricating a subscription or an authenticated off call. Never forward native tokens
to analytics. Native token registration and capabilities must not prompt at launch.

Android requires no native notification code. Test Chrome/TWA delivery and click
routing on physical devices before enabling; website tests cannot prove it.

## Release gates

Founder supplies Vercel/Upstash projects and environment secrets. The initial
trigger is an external QStash hourly schedule on its free tier, with an authenticated
GET to `/api/index?job=send`; no Vercel cron is configured. See SCHEDULER.md for
exact settings and secret handling. Paid scheduling is a later founder decision.
No purchase or provisioning is performed by this implementation. The canonical Optional reminders privacy section is the four-paragraph,
270-word Amendment C text in core src/legal.ts. It summarizes this contract;
the detailed delivery, retry and recovery limits here remain unchanged. Service and client flags stay off until merged contract,
configured secrets, KV and
provider integration tests, and next-day physical-device delivery checks pass.
Brief 0028 starts after the contract merges; 0029 after contract and APNs transport
merge. Store listing and association-file identity data come from the founder.


## Approved notification presentation and stop payload

Two actions, in order: `stop` labelled **Turn Off**, then `play` labelled
**Play**. Equal prominence. Browser notification actions use native OS layout;
web code cannot set equal pixel widths, pill radii or force two visible actions.
The approved HTML board expresses the intended balance, not a browser styling
API. Body tap and Play open the allowlisted game. Turn Off dismisses and DELETEs
in the background; it never opens the game or invents a system confirmation.

Both transports carry `stop: {id, token}`. The token is
`stop1.<expiry-unix-seconds>.<base64url-HMAC-SHA256>` over
`stop-v1:<id>:<expiry>` using SUBSCRIPTION_SIGNING_SECRET, valid for 14 days.
Do not log, put in URLs, analytics, or expose it to third-party code. It cannot
PATCH or fetch settings. The worker's service origin is fixed at build time from
the enabled NotifyConfig, never trusted from a push. Configure the same origin
in the native app. Disabled workers will not display pushes.

Web payloads include the first game's icon path and a monochrome badge. Core
emits notification-badge.png, and the worker uses an allowlisted game's
icon-192.png. APNs includes `aps.category = SCOREWIT_REMINDER`,
`aps.mutable-content = 1`, `stop`, `url`, `date`, `tz`, and the game icon path.

Brief 0029 implements the native handlers, category actions and optional image
service extension. It also implements an interactive notification content
extension for the approved equal-width rounded buttons on one horizontal row.
Use Turn Off then Play, equal weight and contrast. Prevent duplicate system
actions beneath custom controls. Native fallback rows remain system-controlled.
The iOS handlers must persist a failed DELETE with backoff and retry on launch;
never depend on a web view being open. The bridge adds optional
`getReminderState(): Promise<{id,token,pending?,confirmedOff?,nextAttemptAt?}|null>`
and `confirmRemindersOff(id): Promise<void>` to synchronize native recovery and
confirmation with the shared page controls, without prompting at launch.

Data clearing/reinstallation may remove the worker, pending outbox and/or
subscription. A signed token is useful only if a surviving handler receives it.
Test that prerequisite on each physical device; do not claim universal recovery
from uninstall or cleared browser data. A stop token older than 14 days cannot
recover a lost management handle. Device-level permission controls remain the
fallback. No notification handler can guarantee a network request offline.

## Runtime global stop

In the Redis console, set `scorewit:notify:v1:global-send-state` to `stopped`
to halt subsequent send attempts independently of deploys. Only the exact value
`enabled` permits sends; missing values and read errors fail closed. This check
runs at job start and just before each provider call. DELETE still works. A
request already passed to a provider cannot be recalled. REMINDERS_ENABLED is
a separate deployment activation gate, not the incident-response switch.
