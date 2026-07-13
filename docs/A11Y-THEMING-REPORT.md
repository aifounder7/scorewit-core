# Preview-stop report — a11y fixes + team-theming exploration (2026-07-13)

**Branch:** `scorewit-core` @ `a11y-theming` — commits `055fc98` (A2 fixes),
`1686c8b` (T1 mocks), plus this docs commit (report + runbook + screenshots).
**Not pushed, not tagged.** Deploys via `docs/RUNBOOK-v0.11.0-a11y.md` AFTER the July-21
v0.10.1 legal wave. T2 (theming shell code) NOT built — waits for explicit go.

---

## A1 — Audit (before)

Lighthouse 2026-07-13, mobile, production:

| site | perf | a11y | best-practices | a11y failures |
|---|---|---|---|---|
| www.scorewit.com | 0.99 | **0.89** | 1.0 | `color-contrast` (span.max, #sub, .meta .e, .meta .t, footer, footer a ×3), `landmark-one-main` |
| gridiron.scorewit.com | 0.96 | **0.88** | 1.0 | `color-contrast` (same minus footer links — that pack styles them), `landmark-one-main` |

Report-only (non-a11y): gridiron CLS 0.121 (perf 0.96). Soccer: nothing.

Root cause is two shared tokens + one missing rule, not eight elements:

| token/pair | value | measured (needs 4.5) | where it shows |
|---|---|---|---|
| `--text3` on `--bg` | `#55555C` | **2.64 ✗** | score "/600", subtitle, era/topic labels, footer |
| `--text3` on `--elev` | | **2.44 ✗** | card labels, stat labels |
| `--text3` on `--surface` | | **2.14 ✗** | ttag year, cred tournament line |
| `--text2` on `--surface` | `#87878F` | **4.44 ✗** | cred best-finish line |
| soccer `footer a` | *(no rule)* | UA default ✗ | Twemoji/Privacy/Terms links |
| `--incorrect` on `--elev` | `#E8364F` | **4.36 ✗** | "+0 · missed" reveal (PSI never saw it — bonus catch) |
| SEO `--faint` (all 3 surfaces) | `#6E6E77` | **3.87/3.58/3.36 ✗** | eyebrow, stat labels, th, .src, footer on every SEO page |
| `.meta .d` (accents, all 5 packs) | various | 6.6–8.7 ✓ | measured, no change needed |

## A2 — Fixes (after)

**Token values** (pack-side at re-pin; global literal replacement, see runbook):

| token | old | new | bg / elev / surface |
|---|---|---|---|
| `--text2` | `#87878F` | `#9A9AA3` | 7.00 / 6.47 / 5.67 ✓ (= SEO `--muted` — one gray family app+SEO) |
| `--text3` | `#55555C` | `#84848D` | 5.27 / 4.87 / — ✓ (shell no longer renders text3 on surface) |
| `--incorrect` | `#E8364F` | `#EA4058` | 4.62 on elev ✓ (minimal hue-true nudge) |
| SEO `--faint` | `#6E6E77` | `#84848D` | 5.27 / 4.87 / 4.58 ✓ (core-side, in `055fc98`) |

Hierarchy stays three distinguishable grays (`#EDEDEF` / `#9A9AA3` /
`#84848D`), with faint landing 4.87 on cards — the governing surface was
`--elev`, not the page bg. The two faint-on-chip uses (`.ttag .yr`,
`.credtt`) move to `--text2`; size (11px) keeps their hierarchy.

**Core shell (in `055fc98`):** `<main>` landmark, `<nav aria-label>` tab bar,
`h1` brand, persistent sr-only `h2` view title (covers pack-overridden views
— gridiron's custom Today flow included), visible `h2`s for Stats/team/
matchup, `aria-label` on all guess inputs + team search, toast
`role=status`, progress dots `aria-hidden`, `footer a{color:var(--text2)}`.
Assent line (7.00 ✓ at 13px) and Settings sublabel (4.87 ✓ at 12px)
re-measured against the new tokens. Tap targets already pass (≥24px).

**The guarantee is now computed:** `src/contrast.ts` + a build-time gate in
`renderAppHtml`/`renderNotFoundHtml` — 29 token×surface pairs (4.5:1 text,
3:1 UI borders); a below-AA palette **fails the build** listing each pair
with its measured ratio. Negative-tested on a real pack build. Unit tests
incl. garbage inputs (`contrast.test.ts`); full core suite + typecheck green.

**Acceptance (local builds, temp clones at deployed main, Lighthouse
accessibility, mobile):**

| state | soccer | gridiron |
|---|---|---|
| daily (fresh) | **1.0** | **1.0** |
| finished round | **1.0** | **1.0** |
| stats (+settings card) | **1.0** | **1.0** |
| My Team | **1.0** | **1.0** |
| SEO page | **1.0** | **1.0** |
| 404 | **1.0** | **1.0** (after fixing the pack's hardcoded `#55555C` footer literal — now in the runbook's replacement table) |

**Byte-identical harness:** v0.10.0-baseline → a11y builds diff in exactly
`index.html`/`preview.html` (enumerated shell diff, runbook §3), `404.html`
(palette values), and every SEO page (the one `--faint` line). `data/`
artifacts, flags, manifest, sitemap untouched (soccer matchday date-window
noted as the known exception). Core diff `888b658..055fc98` touches no
pipeline/generator code.

Screenshots: `docs/a11y-report-assets/` (before-prod vs after-local, all
audited states).

## T1 — Team theming (mocks only, nations only)

Open locally — self-contained, real shell CSS on the new palette, real
validated artifact data:

- `mocks/team-theming/default.html` — unthemed England (comparison)
- `mocks/team-theming/england.html` — the hard case (white/red)
- `mocks/team-theming/brazil.html`, `argentina.html`, `germany.html`
- `mocks/team-theming/netherlands.html` — the tricolor-gradient case
- `mocks/team-theming/nation-colors.json` — editorial table (flag-spec band
  colors + AA-verified display accents, provenance per FIREWALL.md)
- `mocks/team-theming/validate-nations.ts` — the build-fails-below-AA
  validator (`npx tsx mocks/team-theming/validate-nations.ts` — all 5 pass,
  every themed pair 5.69–14.68)
- `mocks/team-theming/DESIGN.md` — degrade paths (allowlist fallback,
  hue-faithful lightening, band inset for near-shell stripes), reduced-motion
  stance (no animation in v1), and the accent-scope recommendation:
  **banner + full tab accent** via the one `--team`/`--teamDim` override
  (argued in the doc). Both mock a11y spot-checks (England, Netherlands)
  score 1.0.

Franchise packs deferred (trade dress). **T2 not built** — no founder go
possible before this review; per instructions it ships only on explicit go.

## Founder decisions / flags (none block the deploy)

1. **Live content bug, not this lane:** `scorewit.com/blog/t20-world-cup-from-nan`
   is live (title "The T20 World Cup from NaN") — the editionYear NaN pattern
   in the umbrella blog generator on extra-time main. The SEO-wave session
   owns pack-side; flagging so it doesn't fall between lanes.
2. Gridiron CLS 0.121 (report-only, perf 0.96).
3. Netherlands accent: hue-faithful lightened cobalt `#7DA4E8`. Oranje
   `#FF8200` is the fan color but off-flag-spec — your call if you prefer it.
4. Mock scope choice shown: tab CHIP stays Scorewit teal (chrome = identity);
   flip to themed is a one-liner if you prefer.
5. box-box's override chunks keep `div` view titles (no violation; optional
   h2 one-liners next time it's touched).
