/**
 * Daily streak + stats — the per-day result model and the pure functions that
 * derive a player's streak and score distribution from it.
 *
 * This file is the CANONICAL, typed, test-covered copy; the app shell
 * (render/app.ts) hand-ports the same logic into its inline browser script
 * (the established pattern there for rng/selection/scoring). Keep the two in
 * lock-step — if you change a rule here, mirror it in the
 * `// ---- ported from streak.ts ----` block of the shell template.
 *
 * This is purely user-local state. No sport facts live here, so it carries no
 * data-integrity / firewall concern — it never touches the deterministic bank.
 */

/** Per-question max points and a full six-question daily round's max. Matches the
 *  shell's scoring (scoreAnswer → 0..100 per question) and the "/ 600" header. */
export const MAX_POINTS = 100;
export const ROUND_QUESTIONS = 6;
export const ROUND_MAX = ROUND_QUESTIONS * MAX_POINTS; // 600

/** One completed daily round, keyed in `History` by its day-key (YYYY-MM-DD).
 *  `score` is the day's aggregate on a 0..ROUND_MAX scale (sum of per-question
 *  points). `grid` is the per-question points (0..100), enough to rebuild the
 *  spoiler-free share squares without storing any question content. */
export interface DayResult {
  date: string;
  score: number;
  grid: number[];
}

export type History = Record<string, DayResult>;

export interface Stats {
  played: number;
  avgScore: number;
  /** Longest run of consecutive calendar days ever recorded. */
  bestStreak: number;
  /** Six 100-point buckets: 0-99, 100-199, ... 500-600. */
  histogram: number[];
}

/**
 * Day-key arithmetic. These mirror the shell's dayNumber / dateKeyFromDayNum
 * (same UTC epoch) so the streak shares the daily round's clock exactly — there
 * is no second clock. The epoch choice is irrelevant to streak adjacency; it is
 * matched only so a key round-trips to itself.
 */
const EPOCH_UTC = Date.UTC(2026, 0, 1);

export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / 86_400_000);
}

export function keyFromDayNumber(n: number): string {
  return new Date(EPOCH_UTC + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Consecutive completed days ending on `todayKey` — or on the day before it if
 * today has not been played yet (so an unfinished today never zeroes a live
 * streak).
 */
export function currentStreak(history: History, todayKey: string): number {
  let d = dayNumber(todayKey);
  if (!history[keyFromDayNumber(d)]) d -= 1;
  let streak = 0;
  while (history[keyFromDayNumber(d)]) {
    streak++;
    d -= 1;
  }
  return streak;
}

/**
 * Played count, average score, best (longest-ever) streak, and the score
 * histogram.
 */
export function computeStats(history: History): Stats {
  const results = Object.values(history);
  const played = results.length;
  const avgScore =
    played === 0 ? 0 : Math.round(results.reduce((s, r) => s + r.score, 0) / played);

  const histogram = new Array<number>(6).fill(0);
  for (const r of results) {
    histogram[Math.min(Math.floor(r.score / 100), 5)]++;
  }

  // Longest run of consecutive calendar days anywhere in the history.
  const days = Object.keys(history)
    .map((k) => dayNumber(k))
    .sort((a, b) => a - b);
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  return { played, avgScore, bestStreak, histogram };
}
