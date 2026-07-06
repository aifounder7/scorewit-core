import type { Rng } from './rng';

/**
 * The generic contract between the engine and a sport. A sport plugs in as a
 * `SportPack`; the core knows nothing about any sport's rules, teams, or
 * facts — every derivation, label, and editorial choice lives in the pack.
 *
 * Generic over:
 *   M  — the pack's match/entity shape (whatever its dataset stores per event)
 *   E  — the edition key (number- or string-keyed; the core never normalizes)
 *   T  — the pack's topic union (question archetypes)
 *   C  — the pack's provenance-check union (machine-readable re-derivation spec)
 *   DS — the pack's dataset shape (defaults to the generic Dataset<M, E>)
 *   V  — the pack's coverage/meta shape (dataset/meta.json; defaults to the
 *        standard Coverage<E>, but a pack may key coverage however its sport
 *        needs — the core only round-trips it)
 */

// ---------- Base keys ----------

export type EditionKey = string | number;
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'multiple_choice' | 'closest_guess';
export type ValidationError = string;

/** Every provenance check names its kind and the edition it re-derives from. */
export interface CheckBase<E extends EditionKey = EditionKey> {
  kind: string;
  edition: E;
}

// ---------- Question schema (shared bank format across packs) ----------

export interface Question<T extends string = string, C = CheckBase> {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  answer: string | number;
  unit?: string;
  scoring?: { fullPointsWithin: number; zeroBeyond: number };
  difficulty: Difficulty;
  era: string;
  topic: T;
  revealFact: string;
  citation: { label: string; urls: string[] };
  provenance: { endpoints: string[]; computation: string; check: C };
}

// ---------- Dataset shapes (committed to pipeline/dataset) ----------

export interface Tournament<M, E extends EditionKey = EditionKey> {
  edition: E;
  /** Human tournament label, when the pack's dataset carries one. */
  name?: string;
  /** Whole tournament finished (safe for aggregate claims). */
  complete: boolean;
  matches: M[];
}

export interface Dataset<M, E extends EditionKey = EditionKey> {
  tournaments: Tournament<M, E>[];
  byEdition: Map<E, Tournament<M, E>>;
}

/** dataset/meta.json — coverage boundary, embedded in the bank. */
export interface Coverage<E extends EditionKey = EditionKey> {
  /** Latest edition present in the dataset (may be in progress). */
  maxEdition: E;
  /** Last fully-completed edition (safe for aggregate claims). */
  completedThrough: E;
  /** Most recent played match date in the dataset. */
  maxMatchDate: string;
  editions: E[];
}

// ---------- Filesystem layout ----------

/** Directory layout of a pack repo; built with defaultPaths(root). */
export interface PipelinePaths {
  root: string;
  /** Generated artifacts (questions/teams/matchday JSON). */
  dataDir: string;
  /** The committed canonical dataset (tournaments.json + meta.json). */
  datasetDir: string;
  /** pipeline/ — packs keep their upstream cache under here. */
  pipelineDir: string;
  /** Deployable static site output. */
  siteDir: string;
  /** Committed brand/flag assets copied into the site. */
  assetsDir: string;
  /** Convenience local preview build (usually gitignored). */
  previewFile: string;
}

// ---------- Pack-provided configuration ----------

export interface PackConfig<T extends string = string> {
  /** Questions per daily round (documentation of the selection policy). */
  dailyCount: number;
  /** Artifact filename infix: data/questions.<suffix>.json etc. */
  artifactSuffix: string;
  /** Timezone the daily clock is anchored to (informational; builds use UTC). */
  timezone: string;
  /** Seed for the deterministic bank shuffle. */
  seed: number;
  /** Per-topic caps, in selection order; pools are taken then topped up. */
  quotas: [T, number][];
  /** localStorage key prefix for the app shell's user-local state. */
  storagePrefix: string;
  /** Day-key epoch of the daily clock, as Date.UTC args (e.g. "2026,0,1"). */
  epochUtcArgs: string;
  /** Tab route paths (History API + host rewrites). Defaults:
   *  /today, /practice, /my-team. */
  routes?: { today: string; practice: string; team: string };
}

/** Winner-perspective result derivation over the pack's match type. */
export interface ResultDeriver<M> {
  winnerName(m: M): string | null;
  loserName(m: M): string | null;
  margin(m: M): number;
  /** Human scoreline from the winner's perspective. */
  text(m: M): string;
}

export interface IngestEnv {
  paths: PipelinePaths;
}

export interface IngestResult<M, E extends EditionKey, V = Coverage<E>> {
  tournaments: Tournament<M, E>[];
  meta: V;
}

/** Minimal shape the core needs from the per-entity artifact (for logging). */
export interface TeamsArtifactLike {
  teams: unknown[];
}

/** Minimal shape the core needs from the matchday artifact (for logging). */
export interface MatchdayArtifactLike {
  generatedFor: string;
  days: { fixtures: unknown[] }[];
}

/** Everything the pack's artifact guards may need during validate. */
export interface ValidateContext<
  M,
  E extends EditionKey,
  T extends string,
  C,
  DS extends Dataset<M, E> = Dataset<M, E>,
  V = Coverage<E>
> {
  ds: DS;
  coverage: V;
  questions: Question<T, C>[];
  qById: Map<string, Question<T, C>>;
  paths: PipelinePaths;
}

// ---------- The pack interface ----------

export interface SportPack<
  M,
  E extends EditionKey,
  T extends string,
  C extends CheckBase<E>,
  DS extends Dataset<M, E> = Dataset<M, E>,
  V = Coverage<E>
> {
  id: string;
  brand: import('./render/app').Brand;
  copy: import('./render/app').AppCopy;
  clientJs: import('./render/app').PackClientJs;
  assets: import('./render/app').AssetSpec;
  config: PackConfig<T>;

  /** Pull the upstream source and return the normalized dataset + coverage.
   *  The core writes both to paths.datasetDir. */
  ingest(env: IngestEnv): Promise<IngestResult<M, E, V>>;
  /** Turn the parsed tournaments.json back into the pack's dataset shape. */
  loadDataset(raw: unknown): DS;
  /** Whether a match may feed trivia (e.g. it has actually been played). */
  feedsTrivia(m: M): boolean;
  result: ResultDeriver<M>;
  tier(edition: E, topic: T): Difficulty;

  /** One generator per topic. NOTE: invoked in insertion order with a single
   *  shared Rng, so the record's key order is part of the deterministic output. */
  generators: Record<T, (ds: DS, rng: Rng) => Question<T, C>[]>;

  /** Per-check-kind INDEPENDENT re-derivation: return [] when the question's
   *  answer re-derives cleanly from the dataset, else the mismatch messages.
   *  Deliberately does not share the generators' helpers. */
  checks: Record<string, (q: Question<T, C>, ds: DS) => ValidationError[]>;
  /** Per-question gates that aren't kind-specific (era label, in-progress
   *  edition restrictions for aggregate topics, attribution requirements, ...). */
  questionGuards(q: Question<T, C>, ds: DS, coverage: V): ValidationError[];
  /** Whole-artifact guards (per-entity + matchday re-derivation, giveaway
   *  guards, unplayed-fixture firewalls, regression cases). */
  validateGuards(ctx: ValidateContext<M, E, T, C, DS, V>): ValidationError[];
  /** Success line printed when validation passes (a default is provided). */
  validateSuccessMessage?(count: number): string;

  /** The app-side coverage block embedded in the bank JSON. */
  bankCoverage(meta: V): unknown;
  /** Extra top-level fields spliced into the bank JSON between `coverage`
   *  and `questions` (e.g. a sport-specific coverage block). */
  bankExtras?(meta: V): Record<string, unknown>;
  /** Per-entity insights artifact (teams/players/...). */
  team(ds: DS, questions: Question<T, C>[], coverage: V): TeamsArtifactLike;
  /** Date-windowed fixtures artifact, anchored on the build date. */
  matchday(ds: DS, coverage: V, questions: Question<T, C>[], today: string): MatchdayArtifactLike;
  /** The matchday anchor day-key. Default: the build's UTC date. A pack whose
   *  dataset carries no unplayed fixtures can pin this to dataset metadata so
   *  the whole build stays a pure function of the dataset. */
  matchdayAnchor?(ds: DS, coverage: V): string;
  /** Final per-target pass over the rendered app HTML (e.g. rewriting an
   *  asset base path that differs between the repo-root preview file and the
   *  deployed site). Default: identity. */
  finalizeHtml?(html: string, target: 'preview' | 'site'): string;
}

/** Loosest pack binding the pipeline functions accept. */
export type AnySportPack = SportPack<any, any, any, any, any, any>;
