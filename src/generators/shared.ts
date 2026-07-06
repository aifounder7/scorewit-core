import type { Rng } from '../rng';
import { shuffle } from '../rng';

/**
 * Build a 4-way option set: the answer plus up to 3 distinct distractors drawn
 * (in priority order) from the supplied pool, then shuffled deterministically.
 * Returns null if fewer than 3 valid distractors exist (caller skips the item).
 */
export function mcOptions(
  rng: Rng,
  answer: string,
  distractorPool: string[],
  count = 4
): string[] | null {
  const seen = new Set([answer]);
  const distractors: string[] = [];
  for (const d of distractorPool) {
    if (seen.has(d)) continue;
    seen.add(d);
    distractors.push(d);
    if (distractors.length === count - 1) break;
  }
  if (distractors.length < count - 1) return null;
  return shuffle(rng, [answer, ...distractors]);
}
