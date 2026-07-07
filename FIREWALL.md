# The firewall: "computed or not said" — and its one structural blind spot

Every fact a Scorewit product ships (quiz answers, reveal facts, artifacts,
SEO framings) is computed from the committed dataset and RE-DERIVED by a
validator before it can ship. The re-derivation guarantee has one structural
blind spot: **logic shared between the emit path and the validator**. When
both sides run the same buggy helper, they agree byte-for-byte on the same
wrong output, and the equality guard passes.

## The worked example (cover-drive `6b1f930`)

The cricket coverage pill rendered **"the T20 World Cup from NaN"**. The year
parser stripped *leading non-digits* from the edition key — fine for
`"odi-2003"` → `2003`, but `"t20-2024"` starts with `t` followed by digits,
so only the `t` was stripped: `Number("20-2024")` = `NaN`. The same parser
also sat inside the chip sorter, silently degrading "chronological" to
alphabetical. **The validator never fired**, because emit and validate shared
the parser: both sides computed `NaN`, byte-equality held, and the bug
shipped to production pages.

## The rule

Classify every helper the firewall touches as one of two kinds:

**DERIVATION** — anything that computes a FACT or STAT from primitives:
wins, titles, records, ranks, margins, W/L/T tallies, streaks, membership
("which entities does this question involve"), pick candidates, coverage
boundaries. The validator MUST re-derive these on its **own code path** from
primitives (raw match/result rows, standings tables) — never by calling an
emit-path helper, and never through the emit path's convenience indexes
(pre-aggregated careers, byCircuit/byKey maps) when a primitive scan exists.
That independence is the ONLY reason byte-equality means anything. **Any
derivation shared between emit and validate is a firewall hole — de-share
it.**

**PURE FORMATTER** — a total, side-effect-free string/number transform with
no fact content: `editionYear(key) → int`, `numberWord`, `oneInN`'s
rounding+hedge policy, a sort comparator, a key formatter (`matchId`), a URL
builder, an innings-line layout. These MAY be shared (and often MUST be —
the compared strings have to be formatted identically), but ONLY under all
three of:

1. **trivially correct** — small enough to verify by reading;
2. **isolated unit tests** — the function tested directly (normal +
   boundary + garbage inputs; malformed input throws or is handled
   explicitly, never a silent NaN), not only through the byte-equality
   guard;
3. **ground-truth regression pins** — a few hardcoded known-correct values
   asserted against the real committed dataset (cricket coverage = ODI from
   2003 / T20 from 2007; Brazil = five World Cup titles; the F1 Drivers'
   record = seven), so a shared-helper regression trips a test even when
   byte-equality cannot. A pin that fires when the source legitimately
   changes is a feature — update it deliberately.

Editorial DATA (alias maps like `canon`, flag lookups, quota tables) may
also be shared: those are decisions, not derivations — there is no
independent way to re-derive a decision, and sharing them cannot hide a
compute bug. Mark them as such where they're imported.

The insight engine itself (`composeLead`/`verifyLead` and the pack
`compose*Fields`) is a shared formatter *by design*: it renders phrasing
over a stats object. The guarantee comes from the STATS being derived
independently on each side — which is why a pack's `checks.ts` builds its
own `indep*Stats` from primitives and never imports the emit path's stats
builders.

## Review checklist for any firewall change

- New helper used by both `seo.ts`/`generate`-side and `checks.ts`? Classify
  it in the file header comment. Derivation → write the validator its own.
- New shared formatter? Add its isolated tests + at least one ground-truth
  pin in the pack's `insights.test.ts` before shipping.
- Eyeball the rendered output of anything a shared formatter touches — the
  guard will not do it for you.
