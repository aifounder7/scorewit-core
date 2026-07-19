import { hashString, mulberry32, shuffle } from './rng';

/** The slice of a Question the pill synthesizer reads. */
export interface NumericPillInput {
  id: string;
  answer: string | number;
  scoring?: { fullPointsWithin: number; zeroBeyond: number };
}

/**
 * Deterministic pill options for a closest_guess question: the true answer +
 * 3 wrong-by-design distractors, as strings, seeded-shuffled. Seeded from the
 * question id ^ bank seed — deliberately NOT the shared generator rng, so
 * opting in adds `options` fields and changes nothing else in the bank.
 *
 * Distractor rules:
 *  - granularity matches the answer (integers; 0.5 steps for half-point
 *    answers, e.g. F1's shared-drive era) — never fractions the sport
 *    doesn't produce;
 *  - every distractor sits strictly OUTSIDE scoring.fullPointsWithin, so
 *    exactly one pill can score 100 (near pills keep banded partial credit —
 *    that is the closest_guess identity, unchanged);
 *  - offset magnitudes scale with the question's own scoring band
 *    (zeroBeyond), which already encodes per-archetype plausibility;
 *  - never negative; all four values distinct;
 *  - each offset's direction is a fresh seeded draw, so the true answer is
 *    not structurally the min, median, or max of the spread.
 */
export function numericPillOptions(q: NumericPillInput, bankSeed: number): string[] {
  const ans = Number(q.answer);
  if (!Number.isFinite(ans)) throw new Error(`numericPills: non-numeric answer on ${q.id}`);
  const s = q.scoring ?? { fullPointsWithin: 0, zeroBeyond: 10 };
  const g = Number.isInteger(ans) ? 1 : 0.5;
  const rng = mulberry32((hashString(q.id) ^ bankSeed) >>> 0);

  // Smallest legal offset: the first g-multiple strictly beyond the
  // full-points band. Largest: a bit past zeroBeyond (some pills score
  // partial, some zero), widened only if a tight grid runs dry.
  const minOff = Math.floor(s.fullPointsWithin / g) * g + g;
  let maxOff = Math.max(minOff + 3 * g, Math.ceil((s.zeroBeyond * 1.2) / g) * g);

  const values = new Set<number>([ans]);
  let stale = 0;
  while (values.size < 4) {
    if (++stale > 200) {
      maxOff *= 2;
      stale = 0;
    }
    const steps = Math.floor((maxOff - minOff) / g) + 1;
    const off = minOff + g * Math.floor(rng() * steps);
    const cand = rng() < 0.5 ? ans - off : ans + off;
    if (cand < 0 || values.has(cand)) continue;
    values.add(cand);
  }

  return shuffle(rng, [...values]).map(String);
}
