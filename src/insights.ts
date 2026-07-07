import type { ValidationError } from './types';

/**
 * The INSIGHT ENGINE: human framing for SEO pages, firewall-clean.
 *
 * Raw stats are inert ("242 starts, 71 wins"); laymen need meaning ("wins
 * nearly one race in three; on the podium more often than not"). Insight
 * templates are the question-generator pattern applied to prose: each is a
 * DETERMINISTIC function of independently-computed entity stats —
 *
 *   predicate(stats)  — the threshold gate: does the data actually support
 *                       this line? Wit must be EARNED (never call a midfield
 *                       driver dominant — a different honest template fires);
 *   render(stats)     — the phrasing. The voice lives here, applied to real
 *                       numbers; rounded figures must be HEDGED (see oneInN);
 *   weight            — interestingness; the highest-weighted fired lines
 *                       lead. Ties break by library order.
 *
 * composeLead fires ONLY the templates whose predicates pass and joins the
 * top lines into the page's lead paragraph. verifyLead is the VALIDATOR HOOK:
 * given stats the validator re-derived from the dataset (independently of the
 * emit path), it recomposes the lead and demands byte-equality — so every
 * clause of a fired framing (threshold, number, phrasing) is re-derived, and
 * a witty line can never smuggle an unverified fact. Precise stat cards +
 * citation still render beneath the lead: meaning for laymen, precision for
 * stats fans, every clause checkable.
 */

export interface InsightTemplate<S> {
  /** Stable id (used in validator error messages). */
  id: string;
  /** Fire only when the data genuinely supports the line. */
  predicate(stats: S): boolean;
  /** The sentence(s); called only when predicate(stats) is true. */
  render(stats: S): string;
  /** Interestingness — higher-weighted fired lines lead the paragraph. */
  weight: number | ((stats: S) => number);
}

export interface FiredInsight {
  id: string;
  text: string;
}

export interface ComposedLead {
  /** The lead paragraph: the top fired lines, joined in weight order. */
  lead: string;
  /** Every template that fired (pre-cap), in weight order. */
  fired: FiredInsight[];
}

export interface ComposeOptions {
  /** Max lines composed into the lead (default 3). */
  max?: number;
}

/**
 * Fire the gated templates, rank by interestingness, compose the lead.
 * Deterministic: same stats + same library (order included) = same paragraph.
 */
export function composeLead<S>(
  stats: S,
  templates: InsightTemplate<S>[],
  opts: ComposeOptions = {}
): ComposedLead {
  const max = opts.max ?? 3;
  const seen = new Set<string>();
  const fired: (FiredInsight & { w: number; i: number })[] = [];
  templates.forEach((t, i) => {
    if (seen.has(t.id)) throw new Error(`insight library: duplicate template id "${t.id}"`);
    seen.add(t.id);
    if (!t.predicate(stats)) return;
    const text = t.render(stats).trim();
    if (!text) throw new Error(`insight "${t.id}": render() returned an empty line`);
    if (!/[.!?…]$/.test(text)) {
      throw new Error(`insight "${t.id}": lines must be full sentences (got "${text.slice(-20)}")`);
    }
    const w = typeof t.weight === 'function' ? t.weight(stats) : t.weight;
    fired.push({ id: t.id, text, w, i });
  });
  fired.sort((a, b) => b.w - a.w || a.i - b.i);
  return {
    lead: fired.slice(0, max).map((f) => f.text).join(' '),
    fired: fired.map(({ id, text }) => ({ id, text })),
  };
}

/**
 * THE VALIDATOR HOOK. `stats` must be the validator's own INDEPENDENT
 * re-derivation from the dataset (not the emit path's object). Recomposes the
 * lead and demands byte-equality with what the page shipped — verifying every
 * fired predicate, every number, and the exact phrasing in one check.
 */
export function verifyLead<S>(
  stats: S,
  templates: InsightTemplate<S>[],
  lead: string,
  opts: ComposeOptions = {}
): ValidationError[] {
  let expected: ComposedLead;
  try {
    expected = composeLead(stats, templates, opts);
  } catch (e) {
    return [`insight lead: recomposition threw — ${(e as Error).message}`];
  }
  if (expected.lead === lead) return [];
  return [
    `insight lead: does not re-derive from the dataset.\n` +
      `  expected: ${JSON.stringify(expected.lead)}\n` +
      `  shipped:  ${JSON.stringify(lead)}\n` +
      `  (fired: ${expected.fired.map((f) => f.id).join(', ') || 'none'})`,
  ];
}

// ---------- Hedged-rate helpers (shared voice mechanics) ----------
// Rounded figures are ALWAYS hedged so rounding stays truthful; encoding the
// hedge choice here keeps it consistent across every pack's templates.

export interface OneInN {
  n: number;
  /** 'better than' = actual rate beats 1/n; 'nearly' = just under; 'roughly' = on it. */
  hedge: 'roughly' | 'nearly' | 'better than';
}

/**
 * Reframe count/total as a hedged "one in N": 71 wins / 242 starts ->
 * { n: 3, hedge: 'nearly' } ("wins nearly one race in three"). Returns null
 * when the ratio doesn't round cleanly (relative tolerance, default 15%) or
 * N < 2 — the template's predicate should then simply not fire.
 */
export function oneInN(count: number, total: number, tolerance = 0.15): OneInN | null {
  if (!(count > 0) || !(total > 0) || count > total) return null;
  const ratio = total / count;
  const n = Math.round(ratio);
  if (n < 2) return null;
  if (Math.abs(ratio - n) / n > tolerance) return null;
  const hedge = ratio < n * 0.98 ? 'better than' : ratio > n * 1.02 ? 'nearly' : 'roughly';
  return { n, hedge };
}

/** Strictly better than half: 129 podiums / 242 starts -> true
 *  ("on the podium more often than not"). */
export function moreOftenThanNot(count: number, total: number): boolean {
  return total > 0 && count / total > 0.5;
}

/** Small counts read better as words: 3 -> "three", 15 -> "15". */
export function numberWord(n: number): string {
  const words = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  ];
  return Number.isInteger(n) && n >= 0 && n < words.length ? words[n] : String(n);
}
