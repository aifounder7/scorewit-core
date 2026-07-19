/**
 * Deterministic, keyless checks for the numeric-pill synthesizer
 * (numeric-pills.ts). Property checks over representative answer/scoring
 * regimes plus a hard determinism pin.
 *
 *   npx tsx src/numeric-pills.test.ts
 *
 * Prints a line per case; exits non-zero on any failure.
 */

import assert from 'node:assert/strict';
import { numericPillOptions, type NumericPillInput } from './numeric-pills';

let cases = 0;
function ok(name: string) {
  cases++;
  console.log(`ok - ${name}`);
}

function props(q: NumericPillInput, seed: number, name: string) {
  const opts = numericPillOptions(q, seed);
  const nums = opts.map(Number);
  const ans = Number(q.answer);
  const fpw = q.scoring?.fullPointsWithin ?? 0;
  const g = Number.isInteger(ans) ? 1 : 0.5;
  assert.equal(opts.length, 4, `${name}: 4 options`);
  assert.equal(new Set(opts).size, 4, `${name}: distinct`);
  assert.ok(nums.every(Number.isFinite), `${name}: numeric`);
  assert.ok(nums.every((n) => n >= 0), `${name}: non-negative`);
  assert.equal(nums.filter((n) => n === ans).length, 1, `${name}: answer exactly once`);
  for (const n of nums)
    if (n !== ans)
      assert.ok(Math.abs(n - ans) > fpw, `${name}: distractor ${n} outside full-points band`);
  assert.ok(
    nums.every((n) => Math.round(n / g) * g === n),
    `${name}: on the ${g}-grid`
  );
  // determinism: a second call is byte-equal
  assert.deepEqual(numericPillOptions(q, seed), opts, `${name}: deterministic`);
  ok(name);
  return opts;
}

// ---- determinism pin: a known question's full option set, order included.
// If this moves, every deployed bank's pills would move — treat as a tripwire.
const pinned = props(
  { id: 'wc-team-goals-brazil-1970', answer: 6, scoring: { fullPointsWithin: 0, zeroBeyond: 4 } },
  7,
  'small-count spread'
);
assert.deepEqual(pinned, ['5', '1', '4', '6'], 'pin: exact option set for seed 7');
ok('determinism pin');

// ---- regimes seen across the seven banks
props({ id: 'final-goals-zero', answer: 0, scoring: { fullPointsWithin: 0, zeroBeyond: 4 } }, 7, 'answer 0 (one-sided spread)');
props({ id: 'f1-title-margin-1984', answer: 0.5, scoring: { fullPointsWithin: 1, zeroBeyond: 20 } }, 7, 'fractional answer (0.5 grid)');
props({ id: 'ws-crowd-1959', answer: 73977, scoring: { fullPointsWithin: 5000, zeroBeyond: 25000 } }, 7, 'large value, wide band');
props({ id: 'extra-innings-tight', answer: 12, scoring: { fullPointsWithin: 1, zeroBeyond: 3 } }, 7, 'tight band');
props({ id: 'titles-small', answer: 1, scoring: { fullPointsWithin: 0, zeroBeyond: 3 } }, 7, 'answer 1 near floor');
props({ id: 'no-scoring-default', answer: 10 }, 7, 'missing scoring falls back to default band');

// ---- seed / id independence: different id or seed → different draw stream
// (not a strict requirement per-case, but across a sweep the answer must not
// sit at a fixed position or always be the min/median/max).
const positions = new Set<number>();
let mins = 0, maxs = 0;
for (let i = 0; i < 40; i++) {
  const q = { id: `sweep-${i}`, answer: 20, scoring: { fullPointsWithin: 1, zeroBeyond: 10 } };
  const opts = numericPillOptions(q, 7).map(Number);
  positions.add(opts.indexOf(20));
  const sorted = [...opts].sort((a, b) => a - b);
  if (sorted[0] === 20) mins++;
  if (sorted[3] === 20) maxs++;
}
assert.ok(positions.size >= 3, 'answer position varies across the sweep');
assert.ok(mins < 40 && maxs < 40, 'answer is not structurally the min or max');
assert.ok(mins > 0 || maxs > 0, 'answer is sometimes an extreme (no always-middle tell)');
ok('anti-guessability sweep');

// ---- non-numeric answer throws (multiple_choice questions never reach this)
assert.throws(() => numericPillOptions({ id: 'bad', answer: 'France' }, 7));
ok('non-numeric answer rejected');

console.log(`numeric-pills: ${cases} cases OK`);
