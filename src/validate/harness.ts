import fs from 'node:fs';
import { artifactPaths, loadCommittedDataset } from '../pipeline';
import type {
  CheckBase,
  Dataset,
  EditionKey,
  PipelinePaths,
  Question,
  SportPack,
} from '../types';

/**
 * The validate FRAMEWORK: load the committed dataset + generated bank, run the
 * generic schema/bucket invariants, dispatch every question to the pack's
 * per-check-kind INDEPENDENT re-derivation, then hand the whole context to the
 * pack's artifact guards (per-entity + matchday re-derivation and firewalls).
 * Collects every problem and exits non-zero if any — never fails silently.
 *
 * The re-derivations deliberately do NOT share the generators' helpers, so a
 * bug in a shared derivation can't hide; the harness only owns the plumbing.
 */
export function runValidateHarness<
  M,
  E extends EditionKey,
  T extends string,
  C extends CheckBase<E>,
  DS extends Dataset<M, E>
>(pack: SportPack<M, E, T, C, DS>, paths: PipelinePaths): void {
  const errors: string[] = [];
  const fail = (id: string, msg: string) => errors.push(`[${id}] ${msg}`);

  const { ds, coverage } = loadCommittedDataset(pack, paths);
  const out = artifactPaths(paths, pack.config.artifactSuffix);
  const bank = JSON.parse(fs.readFileSync(out.bank, 'utf8')) as { questions: Question<T, C>[] };
  const qs = bank.questions;

  const ids = new Set<string>();
  const buckets = new Map<string, number>();

  for (const q of qs) {
    if (ids.has(q.id)) fail(q.id, 'duplicate id');
    ids.add(q.id);
    buckets.set(`${q.difficulty}/${q.type}`, (buckets.get(`${q.difficulty}/${q.type}`) ?? 0) + 1);

    // schema-level checks
    if (q.type === 'multiple_choice') {
      if (!q.options || q.options.length !== 4) fail(q.id, 'MC must have 4 options');
      else if (!q.options.includes(q.answer as string)) fail(q.id, 'answer not among options');
      else if (new Set(q.options).size !== 4) fail(q.id, 'duplicate options');
    } else {
      if (typeof q.answer !== 'number') fail(q.id, 'closest_guess answer must be numeric');
      if (!q.scoring) fail(q.id, 'closest_guess missing scoring');
    }

    // pack-level per-question gates (era labels, in-progress restrictions, ...)
    for (const msg of pack.questionGuards(q, ds, coverage)) fail(q.id, msg);

    const c = q.provenance.check;
    if (!ds.byEdition.get(c.edition)) {
      fail(q.id, `unknown edition ${c.edition}`);
      continue;
    }

    // per-check-kind independent re-derivation (pack-side)
    const check = pack.checks[c.kind];
    if (!check) {
      fail(q.id, 'unknown check kind');
      continue;
    }
    for (const msg of check(q, ds)) fail(q.id, msg);
  }

  // daily-selection invariant
  for (const tierName of ['easy', 'medium', 'hard']) {
    for (const type of ['multiple_choice', 'closest_guess']) {
      const k = `${tierName}/${type}`;
      if ((buckets.get(k) ?? 0) < 4) errors.push(`bucket ${k} < 4 (${buckets.get(k) ?? 0})`);
    }
  }

  const qById = new Map(qs.map((q) => [q.id, q]));

  // Whole-artifact guards: independent re-derivation + firewalls, pack-side.
  errors.push(...pack.validateGuards({ ds, coverage, questions: qs, qById, paths }));

  if (errors.length) {
    console.error(`VALIDATION FAILED — ${errors.length} problem(s):`);
    for (const e of errors.slice(0, 50)) console.error('  ' + e);
    process.exit(1);
  }
  console.log(
    `Validated ${qs.length} questions + teams/matchday artifacts: every fact re-derived from the dataset, scoped quiz pools giveaway-free. OK`
  );
}
