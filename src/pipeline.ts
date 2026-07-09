import fs from 'node:fs';
import path from 'node:path';
import { selectBank } from './bank';
import { mulberry32, shuffle } from './rng';
import { writeSite } from './render/app';
import { legalSeoPages } from './legal';
import { writeSeoSite } from './render/seo';
import { runValidateHarness } from './validate/harness';
import type {
  AnySportPack,
  CheckBase,
  Coverage,
  Dataset,
  EditionKey,
  PipelinePaths,
  Question,
  SportPack,
} from './types';

/**
 * Stage runners for the deterministic content pipeline. Each stage is
 * independently invocable (so a pack repo can keep one thin npm script per
 * stage) and `runPipeline` chains them:
 *
 *   ingest → loadDataset → generate → validate → render
 *
 * All artifact writes live here so every pack shares one byte-stable
 * serialization (JSON.stringify with two-space indent, fixed key order).
 */

export function defaultPaths(root: string): PipelinePaths {
  return {
    root,
    dataDir: path.join(root, 'data'),
    datasetDir: path.join(root, 'pipeline', 'dataset'),
    pipelineDir: path.join(root, 'pipeline'),
    siteDir: path.join(root, 'site'),
    assetsDir: path.join(root, 'assets'),
    previewFile: path.join(root, 'preview.html'),
  };
}

/** Generated-artifact file paths for a pack's artifactSuffix. */
export function artifactPaths(paths: PipelinePaths, suffix: string) {
  return {
    bank: path.join(paths.dataDir, `questions.${suffix}.json`),
    teams: path.join(paths.dataDir, `teams.${suffix}.json`),
    matchday: path.join(paths.dataDir, `matchday.${suffix}.json`),
  };
}

export function datasetPaths(paths: PipelinePaths) {
  return {
    tournaments: path.join(paths.datasetDir, 'tournaments.json'),
    meta: path.join(paths.datasetDir, 'meta.json'),
  };
}

/** Read the committed dataset + coverage back through the pack. */
export function loadCommittedDataset<
  M,
  E extends EditionKey,
  T extends string,
  C extends CheckBase<E>,
  DS extends Dataset<M, E>,
  V
>(pack: SportPack<M, E, T, C, DS, V>, paths: PipelinePaths): { ds: DS; coverage: V } {
  const dp = datasetPaths(paths);
  const raw = JSON.parse(fs.readFileSync(dp.tournaments, 'utf8')) as unknown;
  const coverage = JSON.parse(fs.readFileSync(dp.meta, 'utf8')) as V;
  return { ds: pack.loadDataset(raw), coverage };
}

// ---------- ingest ----------

export async function runIngest(pack: AnySportPack, paths: PipelinePaths): Promise<void> {
  const { tournaments, meta } = await pack.ingest({ paths });
  const dp = datasetPaths(paths);
  fs.mkdirSync(paths.datasetDir, { recursive: true });
  fs.writeFileSync(dp.tournaments, JSON.stringify(tournaments, null, 2));
  fs.writeFileSync(dp.meta, JSON.stringify(meta, null, 2));
}

// ---------- generate ----------

export function runGenerate<
  M,
  E extends EditionKey,
  T extends string,
  C extends CheckBase<E>,
  DS extends Dataset<M, E>,
  V
>(pack: SportPack<M, E, T, C, DS, V>, paths: PipelinePaths): void {
  const { ds, coverage } = loadCommittedDataset(pack, paths);
  const rng = mulberry32(pack.config.seed);
  const out = artifactPaths(paths, pack.config.artifactSuffix);

  // Pools are generated in the pack's declared generator order with ONE shared
  // rng — that order is part of the deterministic output.
  const pools = new Map<string, Question<T, C>[]>(
    (Object.entries(pack.generators) as [T, (ds: DS, rng: () => number) => Question<T, C>[]][]).map(
      ([topic, gen]) => [topic, gen(ds, rng)]
    )
  );

  // Quota selection + the opt-in bankTarget top-up (see selectBank / BankTarget;
  // with pack.bankTarget unset this is byte-identical to plain quota selection).
  const { selected, warnings, unmet } = selectBank(pools, pack.config.quotas, rng, pack.bankTarget);
  for (const w of warnings) console.warn(w);
  if (unmet && pack.bankTarget?.strict) {
    console.error('bankTarget strict: composition target unmet — failing before writing artifacts.');
    process.exit(1);
  }

  const ids = new Set(selected.map((q) => q.id));
  if (ids.size !== selected.length) throw new Error('Duplicate question ids');

  // Guard the daily-selection invariant: every (tier x type) queue needs >= 4.
  const buckets = new Map<string, number>();
  for (const q of selected) {
    const k = `${q.difficulty}/${q.type}`;
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  for (const tierName of ['easy', 'medium', 'hard']) {
    for (const type of ['multiple_choice', 'closest_guess']) {
      const k = `${tierName}/${type}`;
      const n = buckets.get(k) ?? 0;
      if (n < 4) throw new Error(`Bank bucket ${k} too small for daily selection: ${n} (need >= 4)`);
    }
  }

  const questions = shuffle(rng, selected);
  fs.mkdirSync(path.dirname(out.bank), { recursive: true });
  fs.writeFileSync(
    out.bank,
    JSON.stringify(
      {
        version: 1,
        seed: pack.config.seed,
        count: questions.length,
        coverage: pack.bankCoverage(coverage),
        ...(pack.bankExtras?.(coverage) ?? {}),
        questions,
      },
      null,
      2
    )
  );

  // Per-entity artifact: insights + feed membership, computed from the same
  // dataset and the just-selected bank (giveaway-guarded pack-side).
  const teamsArtifact = pack.team(ds, questions, coverage);
  fs.writeFileSync(out.teams, JSON.stringify(teamsArtifact, null, 2));

  // Matchday artifact: upcoming fixtures windowed on the anchor date (the
  // build's UTC day unless the pack pins it to dataset metadata) so the
  // nightly refresh advances it. All facts are dataset-derived pack-side.
  const today = pack.matchdayAnchor?.(ds, coverage) ?? new Date().toISOString().slice(0, 10);
  const matchdayArtifact = pack.matchday(ds, coverage, questions, today);
  fs.writeFileSync(out.matchday, JSON.stringify(matchdayArtifact, null, 2));

  const by = (f: (q: Question<T, C>) => string) =>
    questions.reduce<Record<string, number>>((acc, q) => {
      acc[f(q)] = (acc[f(q)] ?? 0) + 1;
      return acc;
    }, {});
  console.log(`Wrote ${questions.length} questions to ${path.relative(process.cwd(), out.bank)}`);
  console.log(
    `Wrote ${teamsArtifact.teams.length} team profiles to ${path.relative(process.cwd(), out.teams)}`
  );
  const fixtureCount = matchdayArtifact.days.reduce((s, d) => s + d.fixtures.length, 0);
  console.log(
    `Wrote matchday (${matchdayArtifact.days.length} day(s), ${fixtureCount} fixture(s), ` +
      `from ${matchdayArtifact.generatedFor}) to ${path.relative(process.cwd(), out.matchday)}`
  );
  console.log('by topic:', by((q) => q.topic));
  console.log('by difficulty:', by((q) => q.difficulty));
  console.log('by type:', by((q) => q.type));
  console.log('by tier/type:', Object.fromEntries(buckets));
  console.log('by era:', by((q) => q.era));
}

// ---------- validate ----------

export function runValidate<
  M,
  E extends EditionKey,
  T extends string,
  C extends CheckBase<E>,
  DS extends Dataset<M, E>,
  V
>(pack: SportPack<M, E, T, C, DS, V>, paths: PipelinePaths): void {
  runValidateHarness(pack, paths);
}

// ---------- render ----------

export function runRender(pack: AnySportPack, paths: PipelinePaths): void {
  const out = artifactPaths(paths, pack.config.artifactSuffix);
  const bank = JSON.parse(fs.readFileSync(out.bank, 'utf8'));
  const teams = JSON.parse(fs.readFileSync(out.teams, 'utf8'));
  const matchday = JSON.parse(fs.readFileSync(out.matchday, 'utf8'));
  const { htmlBytes } = writeSite(
    {
      brand: pack.brand,
      copy: pack.copy,
      client: pack.clientJs,
      config: pack.config,
      data: { bank, teams, matchday },
      finalizeHtml: pack.finalizeHtml,
      // Opt-in cookieless engagement events (unset = byte-identical shell).
      analytics: pack.analytics,
      sport: pack.id,
    },
    pack.assets,
    paths
  );
  console.log(
    `Wrote ${path.relative(process.cwd(), paths.previewFile)}, site/index.html and site/404.html ` +
      `(${(htmlBytes / 1024).toFixed(0)} KB, ${bank.count} questions embedded)` +
      (pack.brand.appUrl ? `, APP_URL=${pack.brand.appUrl}` : ', APP_URL unset (no share link yet)')
  );

  // Opt-in SEO pre-render (ADDITIVE ONLY — new files under site/, the app
  // shell above is untouched; packs without the hook emit nothing).
  if (pack.seoPages) {
    const { ds } = loadCommittedDataset(pack, paths);
    const pages = pack.seoPages(ds);
    const { count } = writeSeoSite(
      pages,
      {
        brand: pack.brand,
        copy: pack.copy,
        routes: pack.config.routes ?? { today: '/today', practice: '/practice', team: '/my-team' },
        ...(pack.seoConfig ?? {}),
      },
      paths,
      // Umbrella-only opt-in: the scorewit.com root emits /privacy + /terms
      // from the canonical copy in src/legal.ts; sibling packs link to them.
      pack.legalPages ? legalSeoPages() : []
    );
    console.log(`Wrote ${count} SEO pages + sitemap.xml + robots.txt under site/`);
  }
}

// ---------- the whole pipeline ----------

export async function runPipeline(pack: AnySportPack, paths: PipelinePaths): Promise<void> {
  await runIngest(pack, paths);
  runGenerate(pack, paths);
  runValidate(pack, paths);
  runRender(pack, paths);
}
