/**
 * Deterministic, keyless checks for the streak/stats model (streak.ts). Feeds
 * synthetic histories to the pure functions and asserts the streak, best-streak
 * and histogram behaviour. No browser, no dataset.
 *
 *   npx tsx src/streak.test.ts
 *   # if tsx fails in a sandbox (esbuild), compile + run:
 *   #   npx tsc -p tsconfig.json && node --input-type=module ...  
 *
 * Prints a line per case; exits non-zero on any failure.
 */

import assert from 'node:assert/strict';
import {
  computeStats,
  currentStreak,
  ROUND_MAX,
  type DayResult,
  type History,
} from './streak';

function day(date: string, score: number): DayResult {
  // grid content is irrelevant to streak/stats maths; keep it plausible.
  return { date, score, grid: [score >= ROUND_MAX ? 100 : 0] };
}
function hist(...dates: Array<[string, number]>): History {
  const h: History = {};
  for (const [d, s] of dates) h[d] = day(d, s);
  return h;
}

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n        ${(e as Error).message}`);
  }
}

console.log('Streak/stats model — synthetic histories (no LLM, no dataset)\n');

// 3 consecutive days ending today -> currentStreak 3.
check('3 consecutive days incl. today -> currentStreak 3', () => {
  const h = hist(['2026-03-01', 600], ['2026-03-02', 300], ['2026-03-03', 400]);
  assert.equal(currentStreak(h, '2026-03-03'), 3);
});

// Today not yet played, but yesterday + 2 before -> streak counts back from yesterday.
check('today unplayed, 3 before it -> currentStreak 3 (falls back to yesterday)', () => {
  const h = hist(['2026-03-01', 600], ['2026-03-02', 300], ['2026-03-03', 400]);
  assert.equal(currentStreak(h, '2026-03-04'), 3);
});

// A gap breaks the streak: only days back-to-back from the end count.
check('a gap breaks the current streak', () => {
  // 03-01, 03-02 then GAP (no 03-03), then 03-04, 03-05; today = 03-05.
  const h = hist(['2026-03-01', 600], ['2026-03-02', 600], ['2026-03-04', 600], ['2026-03-05', 600]);
  assert.equal(currentStreak(h, '2026-03-05'), 2); // only 03-04, 03-05
});

// Today unplayed AND yesterday unplayed -> streak 0.
check('today and yesterday both unplayed -> currentStreak 0', () => {
  const h = hist(['2026-03-01', 600], ['2026-03-02', 600]);
  assert.equal(currentStreak(h, '2026-03-10'), 0);
});

// bestStreak picks the LONGEST past run, even if the current run is shorter.
check('bestStreak picks the longest past run', () => {
  // run A: 03-01..03-04 (4). gap. run B: 03-10..03-11 (2, current).
  const h = hist(
    ['2026-03-01', 100], ['2026-03-02', 100], ['2026-03-03', 100], ['2026-03-04', 100],
    ['2026-03-10', 100], ['2026-03-11', 100]
  );
  const s = computeStats(h);
  assert.equal(s.bestStreak, 4);
  assert.equal(currentStreak(h, '2026-03-11'), 2);
});

// Month boundary is still consecutive (calendar days, not naive string compare).
check('month boundary stays consecutive', () => {
  const h = hist(['2026-03-30', 100], ['2026-03-31', 100], ['2026-04-01', 100]);
  assert.equal(currentStreak(h, '2026-04-01'), 3);
  assert.equal(computeStats(h).bestStreak, 3);
});

// Histogram buckets by hundreds; 600 lands in the top "500+" bucket.
check('histogram buckets correctly', () => {
  const h = hist(
    ['2026-03-01', 0],    // bucket 0
    ['2026-03-02', 99],   // bucket 0
    ['2026-03-03', 100],  // bucket 1
    ['2026-03-04', 350],  // bucket 3
    ['2026-03-05', 599],  // bucket 5
    ['2026-03-06', 600]   // bucket 5 (clamped)
  );
  const s = computeStats(h);
  assert.deepEqual(s.histogram, [2, 1, 0, 1, 0, 2]);
  assert.equal(s.played, 6);
});

// Average score rounds.
check('avgScore averages and rounds; empty history is all zeros', () => {
  const h = hist(['2026-03-01', 100], ['2026-03-02', 201]); // (100+201)/2 = 150.5 -> 151
  assert.equal(computeStats(h).avgScore, 151);
  const empty = computeStats({});
  assert.deepEqual(empty, { played: 0, avgScore: 0, bestStreak: 0, histogram: [0, 0, 0, 0, 0, 0] });
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${8 - failures}/8 streak cases passed.`);
if (failures) {
  console.error(`STREAK TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
