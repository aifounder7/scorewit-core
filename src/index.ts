// @scorewit/core — sport-agnostic engine for Scorewit daily trivia apps.
// A sport plugs in as a SportPack (see types.ts); the core runs the
// deterministic ingest → generate → validate → render pipeline and emits the
// single-file app.

export * from './types';
export { hashString, mulberry32, pick, shuffle, type Rng } from './rng';
export {
  computeStats,
  currentStreak,
  dayNumber,
  keyFromDayNumber,
  MAX_POINTS,
  ROUND_MAX,
  ROUND_QUESTIONS,
  type DayResult,
  type History,
  type Stats,
} from './streak';
export { mcOptions } from './generators/shared';
export {
  composeLead,
  moreOftenThanNot,
  numberWord,
  oneInN,
  verifyLead,
  type ComposedLead,
  type ComposeOptions,
  type FiredInsight,
  type InsightTemplate,
  type OneInN,
} from './insights';
export { selectBank, type BankSelection } from './bank';
export {
  assertContrast,
  blendOverHex,
  checkAppPaletteContrast,
  checkNationThemeContrast,
  checkNotFoundPaletteContrast,
  contrastRatio,
  hexToRgb,
  relativeLuminance,
  type ContrastCheck,
  type NationTheme,
  type Rgb,
} from './contrast';
export {
  renderRobots,
  renderSeoPage,
  renderSitemap,
  writeSeoSite,
  type SeoRenderConfig,
} from './render/seo';
export { numericPillOptions, type NumericPillInput } from './numeric-pills';
export { guardScopedPool, type ScopedPoolHooks, type ScopedQuizEntry } from './scoped-quiz';
export { LEGAL_CONTACT, LEGAL_EFFECTIVE_DATE, legalSeoPages } from './legal';
export {
  artifactPaths,
  datasetPaths,
  defaultPaths,
  loadCommittedDataset,
  runGenerate,
  runIngest,
  runPipeline,
  runRender,
  runValidate,
} from './pipeline';
export { runValidateHarness } from './validate/harness';
export { runRefresh, type RefreshOptions, type RefreshStep } from './refresh';
export {
  loadInlineSvg,
  renderAppHtml,
  renderNotFoundHtml,
  writeSite,
  type AppCopy,
  type AppShellConfig,
  type AssetSpec,
  type Brand,
  type PackClientJs,
} from './render/app';
