# Team theming — T1 design notes (nations only, mock stage)

**Concept.** When a player follows a team, the **My Team tab only** adopts a
team-colored treatment: a flag-band + nation-tinted banner at the top (team
name, waving flag, one validated insight line from the teams artifact) and an
accent shift on that tab's surfaces. The app's identity stays Scorewit — the
header, tab chips, and every other tab keep the house palette. The team is a
guest, not a re-skin.

**Scope: NATIONS ONLY in v1** (extra-time + cover-drive). Franchise packs
(baseball / gridiron / F1 / IPL) are explicitly deferred — club and franchise
colors are trade dress and need their own review.

## How it works (no shell code yet — this is the T2 contract)

- Everything is **editorial data**: `nation-colors.json` carries, per nation,
  the flag-spec **band** colors (decorative only) and a display **accent** +
  **onAccent** for text/interactive use. Provenance is the published flag
  specs — the same family as the bundled Twemoji-derived flag SVGs.
- Rendering is **one CSS-variable override**: the themed wrapper sets
  `--team`/`--teamDim` to the nation accent; every incumbent `--team` surface
  (subnav active chip, in-card source links, ttag links, quiz button) follows
  with zero new selectors. The banner is `--teamDim` over the page bg — the
  same dim-tint pattern the shell already uses. The flag band is a static
  `linear-gradient` of the spec colors (horizontal stripes for
  Germany/Netherlands/Argentina, vertical segments for England/Brazil).
- **The accessibility guarantee is computed, never eyeballed and never at
  runtime**: `validate-nations.ts` (built on `src/contrast.ts`, the same gate
  that now protects the shell palette) measures every themed pair — accent on
  bg / on cards / on the tinted banner, `--text` on the banner, dark button
  text on accent — and **fails the build** below WCAG AA. Run:
  `npx tsx mocks/team-theming/validate-nations.ts`.

## Mocks (self-contained, real shell CSS + real artifact data)

`default.html` (unthemed England — the incumbent rendering, for comparison),
`england.html` (the hard case: white/red), `brazil.html`, `argentina.html`,
`germany.html`, `netherlands.html` (the tricolor-gradient case). Open locally;
no network needed (flags inlined as data URIs). Insight lines, records,
finishes and results are the real validated artifact values from the
2026-07-13 extra-time build on the new AA palette.

## Degrade paths

1. **Unknown nation / not in the table** → renders UNTHEMED (incumbent teal).
   The table is an allowlist; theming is never derived from image pixels or
   guessed at runtime. (T2 unit test: unknown nation → byte-identical default.)
2. **Flag color too dark for the shell** (St George red 3.47:1, Dutch cobalt
   2.15:1): the display accent keeps the flag hue and lightens only until it
   measures — the true spec color still appears, but only in the decorative
   band. If no hue-faithful accent can reach AA (hypothetical near-black
   flag), the nation falls back to unthemed rather than shipping a lie of a
   color. The validator enforces this: below-AA entries fail the build.
3. **Flag color too close to the shell** (Germany's black stripe on the
   near-black bg): band stripes that would vanish get a 1px `--surface` inset
   ring (`.natband.inset`) so the band still reads as a flag. White is never
   used as an accent (indistinguishable from `--text`); it stays band-only.

## Reduced motion

**No animation in v1.** The band is static; the only motion on the tab is the
existing `.flg-hero` flag wave, which already sits behind
`prefers-reduced-motion: no-preference`. Nothing new to gate.

## Accent scope — recommendation: banner + full tab accent (not banner-only)

Swap the `--team`/`--teamDim` **pair** on the My Team tab root, not just the
banner:

- It is one token override, riding the shell's existing `--team` contract —
  the contrast validator covers every affected surface with zero new pairs,
  and T2 stays a small opt-in chunk.
- Banner-only leaves the incumbent teal on the subnav chip, source links and
  quiz button directly beneath a nation-colored banner: two competing accents
  on one screen reads as a bug, not restraint.
- The data stays neutral: record-grid **numerals and labels remain
  `--text`/`--text3`** — only interactive/accent surfaces shift, so the tab
  is "England-flavored Scorewit", not an England app. Chrome (header, tab
  chips, other tabs) is untouched.

## T2 sketch (only on explicit founder go)

Opt-in `pack.teamTheming = { nations: <table> }`; unset ⇒ the shell renders
**byte-identically** (token erased, like every other opt-in). Core validates
the table at build time through `src/contrast.ts` (unknown nation, missing or
unparseable colors, below-AA accents → enumerated failures). Unit tests over
garbage inputs + the per-pack byte-identical harness with enumerated diffs.
