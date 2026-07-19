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
inline/flag SVGs — keep them that way.

A page that supplies only `bodyHtml` renders as before (restyled). The
structured fields (see `SeoPage`) fill in the rest of the language:
`eyebrowHtml` (entity type + flag), `subtitleHtml` (key qualifier in `<b>`),
`premiseNote` (the "current through <date>" accent pill, plain text), `lead`
(the insight paragraph — see below), `heroStats` (1–4 big cards, ≤1 `hero`),
`chips` (plain-text pills), `callout` (left-accent key facts), `trustNote`
(the dashed fact-checked badge, with the source link). Emit gates enforce:
plain-text fields carry no markup; raw inline fields carry no `<h1>`/`<script>`.

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
tiny, non-identifying payloads; the footer claim ("no personal data, no
cookies") stays 100% true. Pick a provider that is itself cookieless and
stores no PII — Plausible is the recommended default (cookieless, no-PII,
hashes and rotates rather than storing IPs, supports custom events).

```ts
analytics: { provider: 'plausible', domain: 'yourquiz.example' }
```

Providers: `'plausible'` (requires `domain`), `'vercel'` (keeps the existing
insights script, new event names), `'custom'` (requires `endpoint`; events go
as first-party JSON beacons, no third-party script at all).

**Events** (client-side, in the shell; `sport` = `pack.id`):

| event             | props                                                        | fired when                       |
| ----------------- | ------------------------------------------------------------ | -------------------------------- |
| `round_completed` | `sport`, `streak_length` (`1`/`2-6`/`7-29`/`30+`), `num_correct` (0–6) | the daily round is finished (once per day) |
| `result_shared`   | `sport`, `streak_length` bucket                               | the Share button is used         |
| `practice_played` | `sport`                                                       | a practice question is answered  |

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
`termsUrl` (default: the umbrella `https://scorewit.com/terms` every sibling
footer already links). In-flow assent per the 2025 case law — a footer-only
terms link is routinely unenforceable browsewrap. Override `pack.termsUrl`
only if the pack's canonical terms live elsewhere.

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
question): set `calendarSpotlight: { activeHtml, upcomingText, quiz? }` on
the pack AND supply a `clientJs.spotlight` chunk defining
`spotlightInfo(fixture)` over your matchday fixture shape (return `null` or
`{ event, venue, hubPath, start, end, quizIds }` — see
`CalendarSpotlightConfig` in types.ts). The daily tab then carries a
deterministic banner: inside the `[start, end]` window it links the venue's
SEO hub (`activeHtml`, placeholders `{event}`/`{venue}`); before it, a
countdown (`upcomingText`, `{event}`/`{days}`); after `end` it hides until
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

## Checklist for a new pack

1. Dataset first: ingest + normalize + coverage; commit `pipeline/dataset/`.
2. Types: extend `Tournament<M, E>`/`Dataset<M, E>`; define `Topic`/`Check`.
3. Generators + quotas; then the INDEPENDENT `checks`/guards; validate green.
4. App shell: set tokens + write the four chunks. No shellPatches.
5. Determinism proof: build twice from the same dataset — byte-identical.
6. Hygiene: no sport facts in core, ODC/data licences honored pack-side,
   identity rules per the repo's CLAUDE.md.
