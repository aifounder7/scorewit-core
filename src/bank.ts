import { shuffle, type Rng } from './rng';
import type { BankTarget, Difficulty, Question } from './types';

/**
 * Bank selection: the quota pass (exactly the historical behavior), plus the
 * OPT-IN bankTarget top-up. Pure and deterministic — the only rng consumption
 * is the per-quota-pool shuffle the quota pass has always done, so with
 * bankTarget unset the output is byte-for-byte the pre-bankTarget selection,
 * and with it set the quota-selected base is unchanged and only ADDITIONAL
 * questions are appended (then the caller's final bank shuffle mixes them in).
 *
 * Top-up rules (see BankTarget in types.ts for the honesty rule):
 *   - draws come ONLY from pools' beyond-quota surplus, in each pool's
 *     already-shuffled order, id-deduped against the whole selection;
 *   - a rotating cursor over the quota order spreads draws across pools, and
 *     topUp.perPoolCap bounds any single pool's extra contribution;
 *   - difficulty floors are repaired first (most-deficient tier first; ties
 *     break toward easy), then a tier-agnostic fill brings the bank to size;
 *   - floors given as proportions are resolved against the TARGET size, so
 *     later size-fill draws cannot dilute a met floor.
 */

export interface BankSelection<T extends string, C> {
  selected: Question<T, C>[];
  /** Loud, specific shortfall messages (empty when the target was met). */
  warnings: string[];
  /** True when the size or a difficulty floor remains unmet after top-up. */
  unmet: boolean;
}

const TIERS: Difficulty[] = ['easy', 'medium', 'hard'];

export function selectBank<T extends string, C>(
  pools: Map<string, Question<T, C>[]>,
  quotas: [T, number][],
  rng: Rng,
  bankTarget?: BankTarget
): BankSelection<T, C> {
  const selected: Question<T, C>[] = [];
  const surplus = new Map<T, Question<T, C>[]>();

  // Quota pass — byte-identical to the historical selection (same shuffles,
  // same shortfall warnings), keeping each pool's beyond-quota remainder.
  for (const [topic, quota] of quotas) {
    const pool = shuffle(rng, pools.get(topic) ?? []);
    if (pool.length < quota) {
      console.warn(`pool ${topic}: only ${pool.length} of quota ${quota}`);
    }
    selected.push(...pool.slice(0, quota));
    surplus.set(topic, pool.slice(quota));
  }
  if (!bankTarget) return { selected, warnings: [], unmet: false };

  const target = bankTarget;
  const cap = target.topUp?.perPoolCap ?? Infinity;
  const ids = new Set(selected.map((q) => q.id));
  const takenExtra = new Map<T, number>();
  const tierCount: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const q of selected) tierCount[q.difficulty] += 1;

  // Floors resolve against the TARGET size (< 1 = proportion, >= 1 = count).
  const floors: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const tier of TIERS) {
    const v = target.difficulty?.[tier];
    if (v !== undefined) floors[tier] = v < 1 ? Math.ceil(v * target.size) : Math.floor(v);
  }

  // One deterministic draw: rotate over pools in quota order; within a pool,
  // take the first unused surplus question matching the wanted tier.
  let cursor = 0;
  const order = quotas.map(([topic]) => topic);
  const draw = (tier: Difficulty | null): Question<T, C> | null => {
    for (let step = 0; step < order.length; step++) {
      const topic = order[(cursor + step) % order.length];
      if ((takenExtra.get(topic) ?? 0) >= cap) continue;
      const s = surplus.get(topic)!;
      const idx = s.findIndex((q) => !ids.has(q.id) && (tier === null || q.difficulty === tier));
      if (idx >= 0) {
        const q = s.splice(idx, 1)[0];
        ids.add(q.id);
        takenExtra.set(topic, (takenExtra.get(topic) ?? 0) + 1);
        tierCount[q.difficulty] += 1;
        selected.push(q);
        cursor = (cursor + step + 1) % order.length;
        return q;
      }
    }
    return null;
  };

  // Phase A — repair difficulty floors: most-deficient tier first, ties
  // breaking toward easy (the floor that matters most for casual players).
  const unfillable = new Set<Difficulty>();
  for (;;) {
    const deficits = TIERS.filter((t) => !unfillable.has(t) && tierCount[t] < floors[t]).sort(
      (a, b) => floors[b] - tierCount[b] - (floors[a] - tierCount[a]) || TIERS.indexOf(a) - TIERS.indexOf(b)
    );
    if (!deficits.length) break;
    if (!draw(deficits[0])) unfillable.add(deficits[0]);
  }

  // Phase B — tier-agnostic fill to the target size.
  while (selected.length < target.size && draw(null)) {
    /* draw() appends */
  }

  // Loud, specific shortfall reporting (the honesty rule: an unmet floor is a
  // signal to add archetypes in that tier, not something to fabricate around).
  const warnings: string[] = [];
  for (const tier of TIERS) {
    if (tierCount[tier] < floors[tier]) {
      const wanted = target.difficulty?.[tier];
      const wantedLabel = wanted !== undefined && wanted < 1 ? `${Math.round(wanted * 100)}%` : String(floors[tier]);
      warnings.push(
        `bankTarget: ${tier} floor ${wantedLabel} (${floors[tier]}) not met: ` +
          `${Math.round((tierCount[tier] * 100) / selected.length)}% (${tierCount[tier]}/${selected.length}) — ` +
          `pack needs more ${tier}-tier archetypes (see the sport-archetype-catalog skill's Tier-1 patterns)`
      );
    }
  }
  if (selected.length < target.size) {
    warnings.push(
      `bankTarget: size ${target.size} not met: ${selected.length} — surplus pools exhausted ` +
        `(raise generator output, add archetypes, or lower the target)`
    );
  }
  return { selected, warnings, unmet: warnings.length > 0 };
}
