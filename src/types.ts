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

/**
 * OPT-IN bank composition target (unset = quota selection exactly as before).
 *
 * When set, generate tops the bank up from pools' beyond-quota surplus —
 * deterministically, id-deduped, quality-capped — to reach a target SIZE and
 * to steer toward minimum DIFFICULTY shares (especially an easy floor so
 * casual players aren't scared off).
 *
 * HONESTY RULE: difficulty is assigned by the pack's tier() on REAL facts.
 * The engine STEERS toward the target and guarantees size only where surplus
 * exists — it does not and cannot fabricate easy questions. An unmet easy
 * floor is a SIGNAL to add recognizable easy-tier archetypes (see the
 * sport-archetype-catalog skill's Tier-1 patterns), not a bug.
 */
export interface BankTarget {
  /** Target total bank size. Quota-selected questions are never removed —
   *  if the quotas already exceed this, nothing is trimmed. */
  size: number;
  /** MINIMUM per-tier shares (floors, not exact targets). A value < 1 is a
   *  proportion of `size`; a value >= 1 is an absolute count. */
  difficulty?: { easy?: number; medium?: number; hard?: number };
  /** Quality cap: the max EXTRA questions any single pool may contribute
   *  beyond its quota during top-up, so no archetype dominates the bank.
   *  Unset = uncapped. */
  topUp?: { perPoolCap: number };
  /** If true, an unmet floor/size EXITS non-zero (before writing artifacts)
   *  instead of warning loudly. */
  strict?: boolean;
}

/**
 * OPT-IN cookieless engagement analytics (unset = nothing changes: the shell
 * renders byte-identically and no new events are emitted).
 *
 * PRIVACY STANCE (non-negotiable — it's the brand): NO cookies, NO persistent
 * tracking ID, NO fingerprinting, NO PII. The shell emits AGGREGATE, anonymous
 * custom events only — tiny payloads with nothing identifying attached — so
 * the footer claim ("no personal data, no cookies") stays 100% true. Pick a
 * provider that is itself cookieless and stores no PII (Plausible is the
 * recommended default).
 *
 * Events emitted when set (see SPORTPACK-AUTHORING.md + METRICS.md):
 *   round_completed  { sport, streak_length: '1'|'2-6'|'7-29'|'30+', num_correct: 0..6 }
 *   result_shared    { sport, streak_length: bucket as above }
 *   practice_played  { sport }
 * The streak-length bucket distribution is the cookieless RETENTION PROXY —
 * a rising share of 7+/30+ streaks means retention, with zero tracking ID.
 */
export interface AnalyticsConfig {
  provider: 'plausible' | 'vercel' | 'custom';
  /** plausible: the site's data-domain (e.g. "extratime.example"). Required. */
  domain?: string;
  /** custom: the collection URL events are POSTed to as JSON beacons. Required. */
  endpoint?: string;
}

/**
 * OPT-IN calendar spotlight (unset = the shell renders byte-identically and
 * the daily selection is untouched).
 *
 * The pack's clientJs.spotlight chunk must define spotlightInfo(fixture) over
 * its own matchday-artifact fixture shape, returning null or:
 *   { event:   display name ("Belgian Grand Prix" — generic names only),
 *     venue:   venue display name,
 *     hubPath: root-absolute path of the venue's SEO hub ("/circuit/spa-..."),
 *     start:   YYYY-MM-DD first day of the event window (first session),
 *     end:     YYYY-MM-DD last day (the event itself),
 *     quizIds: bank question ids the pack's pipeline tied to the venue
 *              (only read when `quiz` is set) }
 *
 * DETERMINISM: banner and swap are pure functions of the shell's existing
 * day-key clock plus the committed matchday/bank artifacts — same output for
 * every visitor on the same day key, nothing predictive (schedule fields
 * only; facts stay validator-derived).
 */
export interface CalendarSpotlightConfig {
  /** Banner text inside the window; placeholders {event}, {venue}. Rendered
   *  inside a link to hubPath. Inline HTML entities allowed. */
  activeHtml: string;
  /** Banner text inside the window when spotlightInfo returns a falsy
   *  hubPath (venue has no SEO hub — e.g. a brand-new circuit): rendered as
   *  plain (non-link) text; placeholders {event}, {venue}. Without it the
   *  activeHtml text renders unlinked — set this when activeHtml's copy
   *  promises a link ("full history →"). */
  activeTextNoHub?: string;
  /** Banner text before the window; placeholders {event}, {days}
   *  ({days} renders "1 day" / "N days"). */
  upcomingText: string;
  /** Optional guaranteed venue question: during the window the daily round
   *  carries exactly ONE venue-tied question. If none lands naturally, the
   *  round's LAST slot (lowest salience — the opening flow is preserved) is
   *  swapped for a seeded pick from the venue pool; surplus natural picks
   *  beyond one yield their slot to their bucket-permutation successor.
   *  Skips silently when the venue pool has fewer than `min` questions.
   *  NOTE: this changes the daily round on event days BY DESIGN. */
  quiz?: {
    /** Minimum venue-tied pool size for the guarantee to engage (e.g. 3). */
    min: number;
    /** Chip text on the guaranteed question, e.g. "🏁 race week". */
    badge: string;
  };
}

/**
 * One pre-rendered, crawlable SEO page (opt-in via pack.seoPages — see the
 * SEO pre-render section of SPORTPACK-AUTHORING.md). ADDITIVE ONLY: pages are
 * written as NEW files under site/ and never touch the app shell.
 *
 * Quality rules are enforced at emit time: every fact in bodyHtml must be
 * derived from the frozen dataset and cited like the app; only entities with
 * COMPLETE data should get a page; no thin/doorway pages; event names
 * descriptive-use only (the shared template appends the pack's footer with
 * its disclaimer + data attribution).
 */
/** One big stat card (see SeoPage.heroStats). Values are short display
 *  strings ("242", "4", "19/22") — the template escapes them. */
export interface SeoHeroStat {
  /** Small uppercase label, e.g. "Starts", "Drivers' titles". */
  label: string;
  /** The huge number. */
  value: string;
  /** At most ONE card may be the accent-tinted hero. */
  hero?: boolean;
}

export interface SeoPage {
  /** URL path under the app root, NO leading slash (e.g. "wc/odi-2023",
   *  "team/india", "records/most-titles"). Must not collide with the app's
   *  client routes or reserved files — the emitter throws if it does. */
  path: string;
  /** Unique across all pages, <= 60 chars. */
  title: string;
  /** <= 160 chars. */
  description: string;
  h1: string;
  /** schema.org JSON-LD (SportsEvent / Dataset / ItemList / QAPage as fits). */
  jsonLd: object;
  /** The substantive, cited content (raw HTML rendered by the pack from the
   *  dataset). The emitter rejects thin bodies. */
  bodyHtml: string;
  ogTitle?: string;
  ogDescription?: string;
  /** YYYY-MM-DD for the sitemap <lastmod> — derive from dataset metadata so
   *  the build stays a pure function of the dataset. */
  lastmod?: string;

  // ---- Optional structured presentation fields (all dataset-computed; the
  // ---- template renders each only when present, so existing pages that
  // ---- supply bodyHtml alone keep working unchanged). Raw-HTML fields are
  // ---- inline-level only — the emitter rejects <h1>/<script> in them.

  /** Small uppercase eyebrow above the H1 (raw inline HTML — may carry a
   *  flag <img>/<span>): "Driver · Netherlands". */
  eyebrowHtml?: string;
  /** Subtitle under the H1 (raw inline HTML; <b> the key qualifier):
   *  "In Formula 1 since 2015 · <b>4× World Champion</b>". */
  subtitleHtml?: string;
  /** The immutable-premises line, styled as a subtle accent pill (plain
   *  text): "Racing in 2026 — figures current through 5 Jul 2026, not final
   *  career records." */
  premiseNote?: string;
  /** The composed insight paragraph (plain text) — compose with the insight
   *  engine (composeLead) and RE-VERIFY in validate with verifyLead, so every
   *  framing re-derives from the dataset. */
  lead?: string;
  /** 1–4 big stat cards; at most one hero. */
  heroStats?: SeoHeroStat[];
  /** Chip row (plain-text items): title years, formats, etc. */
  chips?: string[];
  /** OPT-IN decorative icons for the chip row, parallel to `chips` (same
   *  length; null = no icon for that chip). Raw inline HTML rendered INSIDE
   *  the chip span BEFORE the escaped text — decoration only (aria-hidden
   *  <img>/<span>), so the chip FACT strings stay plain-text and
   *  byte-unchanged for the validators. Rejected when `chips` is absent. */
  chipIcons?: (string | null)[];
  /** Left-accent-border callout (raw inline HTML) for key facts:
   *  "<b>First win</b> <span>— Spanish Grand Prix 2016.</span>" */
  callout?: string;
  /** Trust-badge line (raw inline HTML incl. the source <a>): "Every fact
   *  computed from public race records — <a …>F1DB, CC BY 4.0</a>." */
  trustNote?: string;
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
  /** Opt-in bank size / difficulty-mix target (see BankTarget). Unset keeps
   *  today's quota-only selection byte-for-byte. */
  bankTarget?: BankTarget;
  /** Opt-in cookieless engagement events (see AnalyticsConfig). Unset keeps
   *  the shell byte-for-byte and emits nothing new. */
  analytics?: AnalyticsConfig;
  /** Href of the shell's terms-assent line ("By playing you agree to the
   *  Terms"). Unset = the umbrella terms URL the sibling footers link. */
  termsUrl?: string;
  /** Opt-in My-Team nation theming (see AppShellConfig.teamTheming). Unset
   *  keeps the shell byte-for-byte. The nation table is editorial data;
   *  every rendered pair is AA-gated at build time and the build fails
   *  below threshold. NATIONS ONLY — franchise colors are trade dress. */
  teamTheming?: { nations: Record<string, import('./contrast').NationTheme> };
  /** Opt-in tap-only numeric questions: at generate time every closest_guess
   *  question gets a deterministic 4-pill option set — the true answer + 3
   *  range-aware distractors, seeded per question id (see numeric-pills.ts) —
   *  and the shell renders closest_guess WITH options as tappable pills
   *  instead of the typed input. Scoring is untouched: near pills keep the
   *  banded partial credit. Unset = the bank stays byte-for-byte and the
   *  typed-input path renders exactly as before. */
  numericPills?: boolean;
  /** Opt-in calendar spotlight: a deterministic banner on the daily tab —
   *  "event week" (linking to the venue hub) inside the event window, a
   *  "next event in N days" countdown before it — plus, optionally, a
   *  guaranteed venue-tied question swapped into the daily round during the
   *  window (see CalendarSpotlightConfig / calendar-spotlight.md in
   *  SPORTPACK-AUTHORING.md). Requires a clientJs.spotlight chunk defining
   *  spotlightInfo(fixture) over the pack's matchday artifact. Everything is
   *  a pure function of the day key + the committed matchday/bank artifacts.
   *  Unset = the shell renders byte-identically and the daily selection is
   *  untouched. */
  calendarSpotlight?: CalendarSpotlightConfig;

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
  /** Opt-in SEO pre-render: return crawlable pages computed from the frozen
   *  dataset (see SeoPage). Unset = nothing emitted, app byte-identical. */
  seoPages?(ds: DS): SeoPage[];
  /** UMBRELLA PACK ONLY: emit the canonical /privacy + /terms pages
   *  (src/legal.ts) with the shared template. Exactly one pack — the one on
   *  the scorewit.com root — sets this; every other pack links to the
   *  umbrella URLs (the paths are RESERVED for everyone else). */
  legalPages?: boolean;
  /** Optional SEO page theming: accent (default: parsed from the brand
   *  palette's --accent) and the CTA label (e.g. "Play today&rsquo;s F1
   *  round &rarr;"). */
  seoConfig?: { accent?: string; cta?: string };
}

/** Loosest pack binding the pipeline functions accept. */
export type AnySportPack = SportPack<any, any, any, any, any, any>;
