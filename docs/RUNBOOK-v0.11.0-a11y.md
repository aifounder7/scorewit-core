# Runbook addendum — v0.11.0 (a11y shell + palette gate + team theming)

**Core branch:** `a11y-theming` (off `888b658` = v0.10.0). Commits:
`055fc98` (A2: WCAG-AA shell + computed palette gate), `1686c8b` (T1 mocks),
`af42402` (docs), `380c844` (T2: opt-in My-Team nation theming),
`5ec300f` (gate fix: accent-on-surface pair), plus the final docs commit.
**Pack branches (unpushed, in-repo):** `extra-time@team-theming` and
`cover-drive@team-theming` — each ONE commit carrying pin `#v0.11.0` + the
REQUIRED palette bump + the theming opt-in (85/25-nation identity tables).
**Nothing is pushed or tagged anywhere.** This wave tags **v0.11.0** and
lands **AFTER** the legal wave's v0.10.1 re-pins deploy on **2026-07-21**
(v0.10.1 is reserved for that wave — never reuse it here).

**WORKING-TREE NOTE for the July-21 operator:** the scorewit-core checkout
was left on `a11y-theming`, and the tree carries an UNCOMMITTED
`src/legal.ts` modification that belongs to the LEGAL wave (the v0.10.1
date-true-up WIP — LEGAL_EFFECTIVE_DATE 2026-07-13 + the approved comment
fix). Do NOT commit it into this wave and do NOT discard it; it is the
legal session's work product. Worktrees for the pack branches live under
the (ephemeral) session scratchpad — the BRANCHES are in the pack repos
themselves; prune stale worktree metadata with `git worktree prune` if the
scratch dirs are gone.

**Ride-along candidate:** the SEO W0+W1 deploy (~July 22) re-pins every pack
anyway — fold this wave into it **iff** the conflict check in step 0 passes;
otherwise run this as its own pass right after. **Merge order per themed
pack (extra-time, cover-drive): SEO branch first, then `team-theming`** —
the theming commit touches `pipeline/src/{app,pack,theme}.ts` + package.json
+ docs/ only (no site/, no data/), so it merges cleanly after an SEO wave
that rebuilds site/.

Every step below is mechanical; the ONLY escalation path is a non-empty
conflict check (step 0) or a rebase conflict (step 1) — stop and ask Jay.

---

## 0. Preconditions (verify, don't assume)

- [ ] Date ≥ 2026-07-21 **and** the v0.10.1 legal wave is DEPLOYED (all five
      packs pinned `#v0.10.1`, live sites show the approved copy).
- [ ] Conflict check per pack (soccer/cricket/F1/baseball/gridiron/IPL):
      `git diff main..<seo-branch> -- pipeline/src/app.ts pipeline/src/pack.ts package.json`
      → **must be empty** (the SEO waves shouldn't touch the app chunk file,
      the pack wiring, or the pin). Non-empty for any pack ⇒ do NOT ride
      along; run this wave as its own pass after the SEO merges, and re-run
      this check then.
- [ ] Themed packs only: confirm `git log extra-time/team-theming` /
      `cover-drive/team-theming` each show exactly one theming commit.

## 1. Core: rebase, version, tag, push

```
cd ~/side-projects/scorewit-core
git checkout a11y-theming && git rebase main   # main now carries v0.10.1
# expected: clean (v0.10.1 touches src/legal.ts copy + LEGAL_EFFECTIVE_DATE
# only; this branch touches render/app.ts, render/seo.ts, contrast, tests,
# mocks/, docs/ — no file overlap). Any conflict ⇒ STOP, ask Jay.
npm test && npx tsc -p tsconfig.json --noEmit
# bump "version" in package.json to 0.11.0, commit as:
#   chore: v0.11.0 — WCAG-AA shell, computed palette gate, landmarks
git checkout main && git merge --ff-only a11y-theming
git tag v0.11.0
# identity preflight (pseudonymous-side-project), then push main + tag
```

## 2a. Themed packs (extra-time, cover-drive) — merge the prepared branch

The `team-theming` branch already carries pin + palette bump + theming in
one verified commit. On each:

a. Clean-tree preflight (site/data churn from the SEO merge is fine —
   committed state only).
b. `git merge team-theming` (after the SEO branch, per the merge order
   above). A conflict in any file ⇒ STOP, ask Jay.
c. `npm install` (not `ci`) — resolves `#v0.11.0`, updates package-lock;
   include the lock update in the deploy commit.
d. Continue at step 2c-verify below (build, diff-scope, push). Expected
   diff ADDS the theming chunk (NATION_THEME const + themed renderTeam +
   theme CSS + the gated lead card) on top of the §3 shell diff.
e. Live spot-check additionally: follow a nation (e.g. Netherlands /
   India), confirm the themed banner + accent, and that PSI on /my-team
   stays 100.

## 2b. Non-themed packs (F1, baseball, gridiron, IPL) — pin + palette bump

v0.11.0's palette gate **hard-fails** on the old grays, so the pin bump and
the palette edit must land in the SAME commit. In each pack repo, on the
branch that's deploying:

a. Clean-tree preflight; pack tests green before touching anything.

b. `package.json`: `"@scorewit/core": "github:aifounder7/scorewit-core#v0.11.0"`,
   then `npm install` (not `ci`).

c. **Global literal replacement** in `pipeline/src/app.ts` (ALL occurrences —
   paletteCss, notFoundPaletteCss, AND the hardcoded 404-footer literal in
   notFoundExtraCss that cricket/F1/baseball/gridiron carry):

   | old       | new       | what it is                     |
   |-----------|-----------|--------------------------------|
   | `#87878F` | `#9A9AA3` | `--text2` (secondary gray)     |
   | `#55555C` | `#84848D` | `--text3` (faint gray)         |
   | `#E8364F` | `#EA4058` | `--incorrect` (reveal red)     |

   Guard (must print `0`):
   `grep -c '#55555C\|#87878F\|#E8364F' pipeline/src/app.ts`

d. Rebuild WITHOUT ingest: `npx tsx pipeline/src/generate.ts && npx tsx
   pipeline/src/validate.ts && npx tsx pipeline/src/preview.ts`; then
   `npm test` and `npm run typecheck`.

e. Diff-scope verify (`git status` / `git diff --stat site`): expected
   changes are **exactly**
   - `site/index.html` + `preview.html`: the enumerated shell diff below;
   - `site/404.html`: palette values only (+ the footer literal where the
     pack has one);
   - every SEO page: the one-line `--faint:#6E6E77 → #84848D`;
   - **nothing else** — `data/` artifacts, `flags/`, `manifest.webmanifest`,
     `sitemap.xml`, `robots.txt` byte-identical (exception: soccer's
     `data/matchday.soccer.json` may drift by its date window — that is the
     known windowing, not this wave).

f. Commit (pin + palette in one), identity preflight, push (push-is-deploy).

g. Live spot-check per pack: PSI or local Lighthouse (mobile, accessibility)
   on `/` and `/404.html` → accessibility **100**, `landmark-one-main` and
   `color-contrast` both passing.

## 2c. Verify + push (all six packs)

Steps d–g of the original per-pack flow apply to every pack: rebuild
without ingest, tests + typecheck, diff-scope verify, identity preflight,
push, live PSI spot-check (a11y 100 on / and /404.html).

## 3. Enumerated expected shell diff (v0.10.1-build → v0.11.0-build)

Markup: brand lockup `div → h1.brand`; tab bar `div → nav[aria-label="Game
modes"]`; content wrapped in `<main>`; persistent sr-only `h2#viewtitle`
before `#stage` (setMode updates it); `#progress` gains `aria-hidden`;
toast gains `role=status aria-live=polite`; Stats/team/matchup titles
`div.name → h2.name`; all four guess inputs + team search gain `aria-label`.
CSS: `margin:0` on `.brand` / `.statshead .name` / `.teamhead .name`;
`.ttag .yr` and `.credtt` move `--text3 → --text2`; new `footer
a{color:var(--text2)}` and `.sr{…}` rules. Palette lines: the three values
from step 2c. JS: the two `viewtitle` lines in setMode. Nothing else.

## 4. Rollback

Per pack: revert the single pin+palette commit and push. Core: the tag is
additive; nothing depends on it until a pack pins it.

## Deferred / follow-ups (not this wave)

- box-box overrides `renderTeam`/`renderToday` with its own chunk markup —
  its My-Team/Today view titles stay `div`s (no heading-order violation, but
  no per-view `h2` either). Optional one-line chunk edits next time box-box
  is touched.
- T2 team theming SHIPPED into v0.11.0 on the 2026-07-13 founder go
  (identity-colors amendment applied). Franchise packs stay deferred
  (trade dress). box-box CANNOT opt in as-is: its renderTeam override is a
  build error with teamTheming (by design — v1 requires the standard flow).
- The packs' redundant `footer a{color:var(--text2)}` extraCss lines are now
  duplicated by the shell rule — harmless; drop opportunistically.
