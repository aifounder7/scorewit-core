# @scorewit/core

Sport-agnostic engine for Scorewit daily trivia apps. A sport plugs in as a
`SportPack`; the core runs the deterministic content pipeline and renders the
single-file web app.

## What it does

```
ingest    → the pack pulls its upstream source and returns a normalized
            dataset + coverage metadata; the core commits them to disk
            (the dataset is the ONLY source of truth for every fact)
generate  → template-generate the question bank and per-entity / matchday
            artifacts from the dataset. Seeded RNG only (mulberry32 +
            FNV-1a string hash), never Math.random — output is
            deterministic given the dataset
validate  → INDEPENDENT re-derivation of every fact from the dataset via
            the pack's per-check-kind functions — not a schema check.
            Fails loudly, exits non-zero
render    → emit the deployable single-file app (HTML shell with the bank,
            artifacts, brand, and copy inlined) plus 404 page and manifest
```

Also included: the streak/stats model (tested), a scoped-quiz giveaway guard,
multiple-choice option plumbing, and a CI refresh wrapper (re-run pipeline,
commit + push only when tracked outputs changed, with an identity preflight).

## The SportPack interface

A pack is generic over its match/entity type `M`, edition key `E`
(number- or string-keyed — no normalization), topic union `T`, and
provenance-check union `C`:

```ts
interface SportPack<M, E extends EditionKey, T extends string, C, DS> {
  id: string;
  brand: Brand;                 // app name/url, mark SVG, palette
  copy: AppCopy;                // tagline, disclaimer, OG/meta, UI strings
  clientJs: PackClientJs;       // sport-owned client render chunks
  assets: AssetSpec;            // files copied into the deployed site
  config: PackConfig<T>;        // dailyCount, artifactSuffix, timezone, seed, quotas
  ingest(env): Promise<{ tournaments: Tournament<M, E>[]; meta: Coverage<E> }>;
  loadDataset(raw): DS;
  feedsTrivia(m: M): boolean;
  result: ResultDeriver<M>;     // winner/loser/margin/scoreline text
  tier(edition: E, topic: T): Difficulty;
  generators: Record<T, (ds: DS, rng: Rng) => Question<T, C>[]>;
  checks: Record<string, (q, ds) => string[]>;   // per-check-kind re-derivation
  questionGuards(q, ds, coverage): string[];     // era / in-progress-edition gates
  validateGuards(ctx): ValidationError[];        // artifact guards + firewalls
  bankCoverage(meta): unknown;                   // coverage block embedded in the bank
  team(ds, questions, coverage): TeamsArtifactLike;
  matchday(ds, coverage, questions, today): MatchdayArtifactLike;
}
```

The core stays free of sport facts: every fact, label, and editorial choice
(alias maps, flags, copy) lives in the pack.

## Usage

```ts
import { defaultPaths, runPipeline } from '@scorewit/core';
import { myPack } from './pack';

await runPipeline(myPack, defaultPaths(rootDir));
// or stage-by-stage: runIngest / runGenerate / runValidate / runRender
```

## Determinism rules

- No `Math.random`; all shuffles route through the seeded `Rng`.
- `generate` output is byte-stable for a given dataset + seed (only
  date-windowed artifacts move with the build date, by design).
- `validate` must re-derive answers with logic independent of the
  generators, so a bug in a shared derivation cannot hide.

## Develop

```
npm install
npm run typecheck
npm test          # streak/stats model cases
```
