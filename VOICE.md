# The Scorewit voice

One register across every page of every sport: **sharp, warm, a little dry** —
a great commentator who knows the numbers cold, not a roast act and not a
press release. The reader should feel a knowledgeable friend pointing at the
scoreboard and saying "here's why that's remarkable."

The voice lives ONLY in insight templates (`InsightTemplate.render`), so it is
applied to real, validator-checked numbers — never free-written. If a line
can't be computed, it can't be said.

## The register

- **Sharp**: lead with the most interesting true thing, said plainly.
  "Four straight world titles." — not "an incredible journey of success."
- **Warm**: admiration for the achievement, in human scale. Reframe rates so
  a layman feels them: "wins nearly one race in three", "on the podium more
  often than not."
- **A little dry**: understatement over exclamation. No "!", no "legendary",
  no "GOAT". The numbers carry the awe; the phrasing stays level.

## The rules (non-negotiable)

1. **Wit is earned by thresholds.** A line fires only when its predicate
   holds. Never call a midfield entity dominant — a different honest template
   fires instead. Superlatives ("only", "no one else") only from computed
   ranks.
2. **Respectful degrade.** Zero-win entities get their genuine angle ("led a
   Grand Prix at Monaco", "took the champions to a super over") — never
   snark, never mockery, never "at least". The wit is about achievement,
   not absence.
3. **Hedge every rounded figure.** `oneInN` supplies the hedge — "roughly" /
   "nearly" / "better than" — so rounding stays truthful. Never state a
   rounded rate bare.
4. **Every clause re-derivable.** The validator recomposes the lead from
   independently re-derived stats and demands byte-equality (`verifyLead`).
   The precise stat cards + citation always render beneath the lead: meaning
   for laymen, precision for stats fans.
5. **Level, not breathless.** Sentences short. At most three lines in a lead.
   Facts in past/present tense, no speculation, no predictions — the same
   firewall as the quiz: computed from the dataset or not said at all.

## Calibration examples (shapes, not facts)

- Dominant champion: "Four straight world titles (2021–2024). Wins nearly one
  race in three. And finishes on the podium more often than not."
- Solid contender: "A race-winner in each of the last three seasons. More
  podiums than any teammate over that span." (both computed)
- No wins yet: "Led a Grand Prix at Monaco. Points in half the races entered."
  (genuine angles, zero snark)
