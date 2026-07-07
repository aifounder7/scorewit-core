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

**Tokens** (all optional, soccer-defaulted):

- `brand`: `paletteCss`, `themeColor`, `onAccent` (button text colors),
  `recordGridCols` (record-grid columns), `resultLineCss` (result-row
  layout), `extraCss` (appended to the stylesheet), `notFoundPaletteCss`.
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
