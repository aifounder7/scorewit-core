import { hashString, mulberry32, shuffle } from './rng';
import type { Question } from './types';

/**
 * One pooled question of a SCOPED quiz. `options` is present only when the
 * giveaway guard swapped a scoped-entity distractor out of the stored
 * question's option set; the canonical bank question is otherwise rendered
 * verbatim by the client.
 */
export interface ScopedQuizEntry {
  id: string;
  /** Guard-adjusted option set (same length/answer position as the original). */
  options?: string[];
}

/** Pack-supplied hooks that make the guard sport-aware. */
export interface ScopedPoolHooks<T extends string, C> {
  /** Editorial alias fold (variant label -> canonical name); identity if none. */
  canon(name: string): string;
  /** Replacement candidates for a question, UNSHUFFLED and UNFILTERED — the
   *  same pool the pack's option builder draws from (e.g. entities appearing
   *  in the question's own edition). */
  candidatesFor(q: Question<T, C>): string[];
  /** Whether a candidate label is a real entity (filters placeholder tokens). */
  isEligible(name: string): boolean;
}

/**
 * Giveaway guard for SCOPED quiz pools. A scoped quiz is labelled with the
 * entity(ies) it features ("featuring X or Y"), so a multiple-choice question
 * whose OPTIONS include a scoped entity leaks a hint: the label either
 * telegraphs the answer (scoped entity IS the answer) or traps the player into
 * picking it (scoped entity is a wrong option). Per question, canon-comparing
 * options/answer to the scope on both sides:
 *   - scoped entity is the ANSWER      → EXCLUDE (the label hands it over);
 *   - scoped entity is a DISTRACTOR    → SWAP it for another candidate and
 *     KEEP the question — unless the question TEXT names that entity, where
 *     removing it from the options would break the question → EXCLUDE;
 *   - closest_guess has no entity options → always KEEP.
 * The swap adjusts only this scoped PRESENTATION; the stored bank question is
 * untouched. Replacement choice is deterministic (seeded by question id +
 * scope) so artifacts are reproducible run-to-run.
 */
export function guardScopedPool<T extends string, C>(
  pool: Question<T, C>[],
  scopeNames: string[],
  hooks: ScopedPoolHooks<T, C>
): ScopedQuizEntry[] {
  const { canon, candidatesFor, isEligible } = hooks;
  const scope = new Set(scopeNames.map(canon));
  const out: ScopedQuizEntry[] = [];
  for (const q of pool) {
    if (q.type !== 'multiple_choice') {
      out.push({ id: q.id });
      continue;
    }
    const answer = q.answer as string;
    if (scope.has(canon(answer))) continue; // true giveaway — exclude
    const options = [...(q.options ?? [])];
    const offending = options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => o !== answer && scope.has(canon(o)));
    if (!offending.length) {
      out.push({ id: q.id });
      continue;
    }
    // A scoped distractor the question text names cannot be swapped away
    // without breaking the question — exclude instead.
    if (offending.some(({ o }) => q.text.includes(o))) continue;

    // Replacement candidates: the pack's pool for this question, excluding
    // scoped entities, the answer, names in the text and existing options.
    const rng = mulberry32(hashString(q.id + '|' + [...scope].sort().join('|')));
    const candidates = shuffle(rng, candidatesFor(q)).filter(
      (c) =>
        isEligible(c) &&
        !scope.has(canon(c)) &&
        canon(c) !== canon(answer) &&
        !q.text.includes(c)
    );
    const taken = new Set(options.map(canon));
    let swapped = true;
    for (const { i } of offending) {
      const repl = candidates.find((c) => !taken.has(canon(c)));
      if (!repl) {
        swapped = false; // pool too small — drop this one question
        break;
      }
      taken.add(canon(repl));
      options[i] = repl;
    }
    if (swapped) out.push({ id: q.id, options });
  }
  return out;
}
