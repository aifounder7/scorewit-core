import fs from 'node:fs';
import path from 'node:path';
import type { AnalyticsConfig, CalendarSpotlightConfig, PipelinePaths } from '../types';
import {
  assertContrast,
  checkAppPaletteContrast,
  checkNationThemeContrast,
  checkNotFoundPaletteContrast,
  hexToRgb,
  type NationTheme,
} from '../contrast';
import {
  assertNoRootRelativeLeaks,
  assertValidBasePath,
  replaceExactlyOnce,
} from './base-path';
import {
  almanacNotFoundCss,
  almanacNotFoundPaletteCss,
  almanacPaletteCss,
  almanacShellCss,
  ALMANAC_ON_ACCENT,
  ALMANAC_TOKENS,
  RESULT_GLYPHS,
  type AlmanacTheme,
} from '../theme-almanac';

/**
 * The single-file app shell. Emits a standalone, dependency-free HTML page
 * that plays the daily six-question round (plus Today / Practice / My Team
 * modes), PARAMETERIZED by the pack's { brand, copy, clientJs, config } so the
 * engine itself carries no sport facts, names, or editorial choices.
 *
 * The shell owns the engine: daily selection, scoring, streak/stats,
 * practice mode, scoped-quiz plumbing, share, routing. The pack owns the
 * presentation of ITS artifacts: option decorations (e.g. flag icons), the
 * per-entity insight cards, and the matchday fixture cards — supplied as raw
 * client-JS chunks spliced into fixed injection points, plus plain copy
 * strings for every sport-facing label.
 *
 * The inline script hand-ports rng/selection/scoring/streak from the typed
 * node-side modules — keep those blocks in lock-step with their sources.
 */

export interface Brand {
  appName: string;
  /** Public launch URL — used in the share footer and social meta. */
  appUrl: string;
  /** Master mark SVG, inlined into the header lockup (see loadInlineSvg). */
  markSvg: string;
  themeColor: string;
  /** CSS custom-property declarations of the app palette (the :root body). */
  paletteCss: string;
  /** CSS custom-property declarations of the 404 page palette. */
  notFoundPaletteCss: string;
  /** Text colors used ON the accent-filled buttons (dark-on-accent).
   *  Defaults to the standard palette's values. */
  onAccent?: { accent: string; practice: string; team: string; today: string };
  /** Columns of the entity record grid (.reclist) — e.g. P/W/D/L is 4,
   *  P/W/L/T/NR is 5. Default 4. */
  recordGridCols?: number;
  /** The .resline result-row CSS block — override for a different result-line
   *  layout (e.g. a two-line scoreline + note). Default: single-row layout. */
  resultLineCss?: string;
  /** Extra CSS appended at the end of the shell stylesheet. Default: none. */
  extraCss?: string;
}

/** One sibling game on the post-round continue strip. */
export interface FamilyGame {
  /** Display name, exactly as the portfolio hub names the game. */
  name: string;
  /** Absolute canonical URL of the sibling (e.g. https://www.scorewit.com/f1). */
  url: string;
  /** The sibling's localStorage prefix — the strip reads
   *  `${prefix}.history[todayKey()]` (same-origin only) for played state. */
  storagePrefix: string;
}

/** The post-round "continue" strip under the share module: the OTHER family
 *  games (self excluded — validated) with today's played/unplayed state where
 *  same-origin storage allows, unplayed first, plus a link to the portfolio
 *  hub. The family standard — every Scorewit pack sets it. Links only: no
 *  autoplay, no nagging; all copy comes from this config, never invented. */
export interface FamilyConfig {
  heading: string;
  hub: { url: string; label: string };
  games: FamilyGame[];
}

export interface AppCopy {
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
  /** Initial Daily-tab caption (replaced by the round line once started). */
  subInitial: string;
  /** Full <footer>…</footer> element (disclaimers, licences, analytics note). */
  footerHtml: string;
  /** Note under the final score. */
  resultNote: string;
  /** Optional consumer-facing names for internal question topic keys. Plain
   *  text only; when set, every topic in the emitted bank must be labelled.
   *  Unknown runtime keys keep the legacy underscore-to-space fallback. */
  topicLabels?: Record<string, string>;
  /** Daily result only. `upcoming` contains exactly one {date}, replaced by
   *  the next local YYYY-MM-DD date. No countdown, tracking or reset changes.
   *  `available` is shown if that local midnight has already passed. */
  dailyReturnCue?: { upcoming: string; available: string };
  /** Banner above the entity picker. */
  teamPickerBanner: string;
  /** First-visit banner on the Today tab (used by the standard renderToday;
   *  a pack overriding clientJs.renderToday may omit it). */
  todayIntro?: string;
  /** Prefix of the "no fixtures today (<date>)." banner (see todayIntro). */
  todayNoMatches?: string;
  /** Tab display names. Defaults: Daily / Today / Practice / My Team. */
  tabLabels?: { daily: string; today: string; practice: string; team: string };
  /** document.title suffixes per routed tab. */
  titleToday: string;
  titlePractice: string;
  titleTeam: string;
  notFoundHeading: string;
  notFoundBody: string;
  /** The 404 page's action links (raw HTML, root-absolute hrefs). */
  notFoundActionsHtml: string;
  /** "when does the bank change" note used in empty quiz-pool states. */
  bankRefreshNote?: string;
  /** PWA manifest description (defaults to metaDescription). */
  manifestDescription?: string;
  /** Extra CSS lines appended to the 404 page's stylesheet (e.g. a footer). */
  notFoundExtraCss?: string;
}

/** Raw client-JS chunks the pack supplies (see the injection points below). */
export interface PackClientJs {
  /** Pack constants (e.g. decoration lookup tables), inlined after APP_URL. */
  consts: string;
  /** Must define teamLabel(name, hero?) and slLabel(scoreline) — the shell
   *  calls both to decorate option/entity labels and stored scorelines. */
  decorations: string;
  /** Must define teamInsightsHtml(team) over the per-entity artifact. */
  teamCards: string;
  /** Must define fixtureHtml(f) and pickRecordHtml() over the matchday
   *  artifact. */
  todayCards: string;
  /** Optional overrides for smaller sport-varying pieces; each defaults to
   *  the standard implementation. */
  /** Defines editionLabel(ed)/placementWord(p) used by the entity cards. */
  teamHelpers?: string;
  /** Defines eraLabel(e) for the Practice-mode era chips. */
  eraLabel?: string;
  /** The renderToday() function — the Today tab's top-level flow (fixtures
   *  vs. latest-results vs. empty states varies by sport calendar). */
  renderToday?: string;
  /** The renderTeam() flow INCLUDING its entity picker — override when the
   *  sport's follow model differs from one-team-of-one-kind (e.g. F1 follows
   *  a driver AND a constructor). Must define renderTeam(); the default
   *  defines renderTeam() + renderTeamPicker() over the single favTeam slot.
   *  The fixed shell still provides teamQuizHtml/wireTeamQuiz/drawTeamQuestion
   *  and TEAM_BY_NAME for any override to reuse. */
  renderTeam?: string;
  /** Optional extra share-text line(s): a JS statement block run inside
   *  buildShareText() after the streak line and before the app URL — push
   *  onto `lines` (e.g. the followed entity's validated insight line from
   *  the teams artifact). SPOILER RULE: never question content, and only
   *  strings that already sit in a validator-checked artifact — the share
   *  sheet is a fact surface like any other. Default: none (share text
   *  byte-identical to the incumbent shell). */
  shareLine?: string;
  /** SHARE V2 (opt-in; mutually exclusive with shareLine): the share sheet
   *  becomes exactly three lines —
   *    {icon} Scorewit {shareName} #{roundNumber}
   *    {grid} {score}/600 · {rankTitle}
   *    🔥 Day {streak} · beat me: scorewit.com/{path}#s
   *  Grid glyphs are the unified tiers (🟢/🟡/⭕ — the wrong glyph is the
   *  RING, matching the on-page pip). roundNumber counts from the pack's
   *  daily epoch (epochUtcArgs = daily key #1) using the shell's existing
   *  day clock — no new clocks. rankLadder maps the round score to a title:
   *  bands 0-119 / 120-239 / 240-359 / 360-479 / 480-600, with EXACTLY 600
   *  upgrading to the 6th (perfect) title; the end-of-round card shows the
   *  same earned title. The URL is the scheme-less appUrl with the #s
   *  share-visit fragment. Unset = the incumbent share text, byte-identical. */
  shareV2?: {
    /** The identity word(s) after "Scorewit" ("World Cup", "F1", ...). */
    shareName: string;
    /** Emoji prefix — the pack's hub-card icon(s). */
    shareIcon: string;
    /** Exactly 6 titles, worst → perfect. Editorial copy: founder-approved. */
    rankLadder: string[];
  };
  /** calendarSpotlight accessor (required when the opt-in is set): must
   *  define spotlightInfo(fixture) over the pack's matchday fixture shape —
   *  see CalendarSpotlightConfig in types.ts for the returned object. */
  spotlight?: string;
  /** Byte-precise escape hatch: exact-match [find, replace] edits applied to
   *  the shell template before token substitution. Each pair MUST match
   *  exactly once or the render throws. Use for migrating a hand-forked
   *  shell without genericizing one-off comment/CSS drift; prefer the
   *  first-class tokens and chunks above for anything structural. */
  shellPatches?: [string, string][];
}

/** Files copied from assetsDir into the deployed site. */
export interface AssetSpec {
  /** Copied verbatim, same relative name (icons, og image, ...). */
  files: string[];
  /** [from, to] pairs for renamed copies. */
  copies: [string, string][];
  /** [fromDir, toDir] directory copies (flat, e.g. decoration SVGs). */
  dirs: [string, string][];
  /** [name, content] files written into the site dir (e.g. a host routing
   *  config generated in lockstep with the shell's routes). */
  siteFiles?: [string, string][];
}

export interface AppShellConfig {
  brand: Brand;
  copy: AppCopy;
  client: PackClientJs;
  config: {
    storagePrefix: string;
    epochUtcArgs: string;
    routes?: { today: string; practice: string; team: string };
    /** Opt-in serving prefix (see PackConfig.basePath / render/base-path.ts).
     *  Unset = the shell renders byte-identically. */
    basePath?: string;
  };
  data: { bank: unknown; teams: unknown; matchday: unknown };
  /** Final per-target pass over the app HTML (default: identity). */
  finalizeHtml?: (html: string, target: 'preview' | 'site') => string;
  /** Post-round continue strip (see FamilyConfig above). Unset renders
   *  `const FAMILY=null` and an empty, display:none container — but unset is
   *  a transition state, not a supported profile: every family pack sets it. */
  family?: FamilyConfig;
  /** Opt-in post-answer entity links (see EntityLinkMap below): matched
   *  entity mentions in post-answer fact/insight surfaces gain subtle
   *  same-tab links to the pack's SEO pages. The map arriving here must
   *  already be existence-guarded (guardEntityLinks) against the emitted
   *  page set — the pipeline does this. Unset = `const ENTITYLINKS=null`
   *  and linkFact degrades to esc(). */
  entityLinks?: EntityLinkMap;
  /** Opt-in cookieless engagement events (see AnalyticsConfig in types.ts).
   *  Unset = the shell renders byte-identically (the original inline Vercel
   *  wiring) and no new events are emitted. */
  analytics?: AnalyticsConfig;
  /** The `sport` event prop (pack.id). Only read when analytics is set. */
  sport?: string;
  /** Opt-in calendar spotlight (see CalendarSpotlightConfig in types.ts).
   *  Unset = the shell renders byte-identically and the daily selection is
   *  untouched. Requires client.spotlight. */
  calendarSpotlight?: CalendarSpotlightConfig;
  /** Href of the terms-assent line rendered under the play area ("By playing
   *  you agree to the Terms") — the conspicuous in-flow notice case law
   *  demands (footer-only browsewrap is routinely unenforceable). Defaults to
   *  the umbrella terms URL every sibling pack's footer already links. */
  termsUrl?: string;
  /** Opt-in light theme (the "Almanac hybrid" paper skin — see
   *  theme-almanac.ts). Set = the shell swaps to the almanac palette,
   *  component chrome, and system rounded-sans stack, with the sport's
   *  resolved accent driving chips, pips, links, buttons, and the PLAYED
   *  stamp. Unset = the incumbent dark shell renders byte-identically
   *  (fixture-tested) — rollback per pack is deleting the opt-in. */
  theme?: AlmanacTheme;
  /** Opt-in "yesterday's round" shell link, rendered under the terms-assent
   *  line (e.g. into the pack's archive). Unset = byte-identical shell. */
  yesterdayLink?: { href: string; label: string };
  /** Opt-in team theming for the My Team tab (NATIONS ONLY — franchise
   *  colors are trade dress and stay deferred). Unset = the shell renders
   *  byte-identically. Set = the followed nation's tab gains a decorative
   *  flag band + nation-tinted banner (name, flag, the validated artifact
   *  insightLine) and the --team/--teamDim accent pair swaps to the nation's
   *  AA-verified display accent. Colors are editorial data; every rendered
   *  pair is gated at build time (checkNationThemeContrast) — the build
   *  FAILS below WCAG AA. Nations absent from the table render unthemed
   *  (allowlist, never derived). Requires the standard My-Team flow
   *  (incompatible with clientJs.renderTeam). No animation: the only motion
   *  on the tab stays the existing reduced-motion-gated flag wave. */
  teamTheming?: { nations: Record<string, NationTheme> };
}

/** Read an SVG asset and inline it (comments and newlines stripped). */
export function loadInlineSvg(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n/g, '');
}

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__TITLE__</title>
<meta name="description" content="__METADESC__" />
<link rel="canonical" href="__APPURL__/" />
<link rel="icon" href="icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<link rel="manifest" href="manifest.webmanifest" />
<meta name="theme-color" content="__THEMECOLOR__" />
<meta property="og:title" content="__OGTITLE__" />
<meta property="og:description" content="__OGDESC__" />
<meta property="og:type" content="website" />
<meta property="og:url" content="__APPURL__" />
<meta property="og:image" content="__APPURL__/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="__TWTITLE__" />
<meta name="twitter:description" content="__TWDESC__" />
<meta name="twitter:image" content="__APPURL__/og.png" />
__ANALYTICSHEAD__
<style>
  :root{
__PALETTE__
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;line-height:1.5}
  .wrap{max-width:560px;margin:0 auto;padding:24px 20px 64px}
  header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
  .brand{margin:0;font-weight:700;letter-spacing:-.02em;font-size:20px;display:flex;align-items:center;gap:9px}
  .brand small{color:var(--text2);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-left:2px}
  .brandmark{display:inline-flex}
  .brandmark svg{width:27px;height:27px;display:block}
  /* brief 0005: long app names (e.g. "Scorewit Super Over") plus the tagline
     and score counter wrap into 3 independent lines under ~480px; drop the
     tagline and let the header itself wrap so it never exceeds 2 lines. */
  @media (max-width:480px){header{flex-wrap:wrap;row-gap:6px}.brand small{display:none}}
  .sub{color:var(--text3);font-size:12px;margin-bottom:20px}
  .progress{display:flex;gap:4px;margin:18px 0 10px}
  .dot{height:4px;flex:1;border-radius:2px;background:var(--surface)}
  .dot.done{background:var(--accent)} .dot.active{background:var(--hover)}
  .score{font-variant-numeric:tabular-nums;font-weight:700;font-size:16px}
  .score .max{color:var(--text3);font-weight:600}
  .meta{display:flex;gap:14px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px}
  .meta .d{color:var(--accent);font-weight:700}.meta .e{color:var(--text3);font-weight:600}.meta .t{color:var(--text3);margin-left:auto}
  .q{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:6px 0 18px}
  .opts{display:flex;flex-direction:column;gap:10px}
  button.opt{appearance:none;text-align:left;background:var(--elev);border:1px solid var(--surface);
    color:var(--text);padding:14px 16px;border-radius:12px;font-size:15px;cursor:pointer;transition:.12s}
  button.opt:hover{background:var(--hover)}
  button.opt:disabled{cursor:default}
  button.opt.correct{background:var(--correctDim);border-color:var(--correct)}
  button.opt.wrong{background:var(--incorrectDim);border-color:var(--incorrect)}
  .cg{display:flex;gap:10px;align-items:center}
  .cg input{flex:1;background:var(--elev);border:1px solid var(--surface);color:var(--text);
    font-size:16px;padding:13px 16px;border-radius:12px;font-variant-numeric:tabular-nums}
  .cg .unit{color:var(--text3);font-size:13px}
  .btn{appearance:none;background:var(--accent);color:__BTNTEXT__;border:0;font-weight:700;
    padding:13px 18px;border-radius:12px;font-size:15px;cursor:pointer}
  .btn.ghost{background:var(--surface);color:var(--text)}
  .reveal{margin-top:18px;padding:16px;border-radius:12px;background:var(--elev);border:1px solid var(--surface)}
  .reveal .pts{font-weight:700;font-size:14px}
  .reveal .pts.ok{color:var(--correct)} .reveal .pts.partial{color:var(--partial)} .reveal .pts.no{color:var(--incorrect)}
  .reveal .fact{margin:8px 0 10px;color:var(--text)}
  .reveal a{display:inline-block;margin-top:8px;color:var(--accent);font-size:13px;font-weight:600;
    text-decoration:underline;text-underline-offset:2px;cursor:pointer}
  .reveal a:hover{opacity:.85}
  /* Post-answer entity links (opt-in; absent = no .elink is ever rendered).
     Subtle tier: inherit the surrounding text color (AA by construction),
     dotted underline firming to solid on hover/focus; same-tab navigation. */
  a.elink{display:inline;margin:0;padding:0;color:inherit;font-size:inherit;font-weight:inherit;
    text-decoration:underline;text-decoration-style:dotted;text-decoration-thickness:1px;text-underline-offset:2px}
  a.elink:hover,a.elink:focus-visible{text-decoration-style:solid}
  .row{display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:10px}
  .final{text-align:center;padding:24px 0}
  .final .big{font-size:44px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
  .final .big small{font-size:20px;color:var(--text3)}
  .squares{font-size:22px;letter-spacing:3px;margin:14px 0}
  .note{color:var(--text3);font-size:12px;margin-top:10px}
  .sharebox{display:none;white-space:pre;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    background:var(--elev);border:1px solid var(--surface);border-radius:10px;padding:12px 14px;
    margin:12px auto 0;max-width:320px;color:var(--text);font-size:15px;text-align:left;user-select:all;line-height:1.45}
  /* Post-round continue strip — visually subordinate to the share module. */
  .continue{margin:26px auto 0;padding-top:16px;border-top:1px solid var(--surface);max-width:420px}
  .continue:empty{display:none}
  .continue .chead{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text3);margin-bottom:10px}
  .continue .crow{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
  .continue .cchip{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid var(--surface);
    border-radius:999px;color:var(--text);font-size:13px;font-weight:600;text-decoration:none}
  .continue .cchip span{color:var(--accent);font-size:11px;font-weight:700}
  .continue .cchip.done{opacity:.55}
  .continue .cchip.done span{color:var(--text2)}
  .continue .chub{display:inline-block;margin-top:12px;color:var(--text2);font-size:12px}
  .tabs{display:flex;gap:6px;margin:14px 0 2px}
  .tab{appearance:none;background:transparent;border:1px solid var(--surface);color:var(--text2);
    padding:7px 16px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer}
  .tab.active{background:var(--accentDim);border-color:var(--accent);color:var(--accent)}
  .tab[data-mode="practice"].active{background:var(--practiceDim);border-color:var(--practice);color:var(--practice)}
  .pbanner{background:var(--practiceDim);color:var(--practice);font-size:12px;font-weight:600;padding:12px 14px;border-radius:12px;margin:10px 0 16px}
  .filters{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}
  .flabel{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3)}
  .chiprow{display:flex;flex-wrap:wrap;gap:8px}
  .fchip{appearance:none;background:var(--elev);border:1.5px solid transparent;color:var(--text2);padding:5px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer}
  .fchip.on{background:var(--practiceDim);border-color:var(--practice);color:var(--practice)}
  .btn.practice{background:var(--practice);color:__BTNTEXTPRACTICE__}
  /* ---- Fav-team mode ---- */
  .tab[data-mode="team"].active{background:var(--teamDim);border-color:var(--team);color:var(--team)}
  .btn.team{background:var(--team);color:__BTNTEXTTEAM__}
  .tbanner{background:var(--teamDim);color:var(--team);font-size:12px;font-weight:600;padding:12px 14px;border-radius:12px;margin:10px 0 16px}
  .teamhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 4px}
  .teamhead .name{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em}
  .linkbtn{appearance:none;background:transparent;border:0;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;padding:0}
  .linkbtn:hover{color:var(--text)}
  .picker-search{width:100%;background:var(--elev);border:1px solid var(--surface);color:var(--text);font-size:15px;padding:12px 14px;border-radius:12px;margin:6px 0 12px}
  .teamlist{display:flex;flex-wrap:wrap;gap:8px}
  .teamlist .fchip{cursor:pointer}
  .teamlist .fchip:hover{background:var(--hover);color:var(--text)}
  .card{background:var(--elev);border:1px solid var(--surface);border-radius:12px;padding:14px 16px;margin:12px 0}
  .card h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:700}
  .reclist{display:grid;grid-template-columns:repeat(__RECLISTCOLS__,1fr);gap:6px;text-align:center;margin-bottom:8px}
  .reclist .num{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
  .reclist .lab{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)}
  .recmeta{font-size:12px;color:var(--text2);font-variant-numeric:tabular-nums}
__RESLINECSS__
  .resline a{color:var(--team);font-size:11px;text-decoration:underline;text-underline-offset:2px;cursor:pointer;margin-left:8px}
  .titles{display:flex;flex-wrap:wrap;gap:6px}
  .ttag{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--surface);color:var(--text);display:inline-flex;gap:6px;align-items:center}
  .ttag a{color:var(--team);text-decoration:underline;text-underline-offset:2px;cursor:pointer;font-size:11px}
  .ttag .yr{color:var(--text2);font-variant-numeric:tabular-nums}
  .empty{color:var(--text3);font-size:13px}
  .subnav{display:flex;gap:6px;margin:14px 0 4px}
  .subnav .tab{font-size:12px;padding:6px 14px}
  .subnav .tab.active{background:var(--teamDim);border-color:var(--team);color:var(--team)}
  /* ---- Daily streak + stats ---- */
  .streakbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0 2px;min-height:26px}
  .streakchip{display:inline-flex;align-items:center;gap:6px;background:var(--accentDim);color:var(--accent);font-size:13px;font-weight:700;padding:4px 12px;border-radius:999px}
  .final .streakchip{margin:6px auto 2px}
  .statshead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 12px}
  .statshead .name{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em}
  .statrow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
  .statbox{flex:1 1 45%;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--elev);border:1px solid var(--surface);padding:14px;border-radius:12px}
  .statval{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
  .statlab{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)}
  .hist{display:flex;gap:8px;height:140px;align-items:flex-end;margin-top:6px}
  .histcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
  .histn{font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums;min-height:14px}
  .histtrack{flex:1;width:100%;display:flex;align-items:flex-end}
  .histbar{width:100%;background:var(--surface);border-radius:4px}
  .histbar.on{background:var(--accent);min-height:3px}
  .histlab{font-size:11px;color:var(--text3);font-variant-numeric:tabular-nums}
  /* ---- Today tab (fixtures + head-to-head + mini-quiz + pick'em) ---- */
  .tab[data-mode="today"].active{background:var(--todayDim);border-color:var(--today);color:var(--today)}
  .btn.today{background:var(--today);color:__BTNTEXTTODAY__}
  .tdbanner{background:var(--todayDim);color:var(--today);font-size:12px;font-weight:600;padding:12px 14px;border-radius:12px;margin:10px 0 14px}
  .tdbanner2{background:var(--todayDim);color:var(--today);font-size:12px;font-weight:600;padding:10px 14px;border-radius:12px;margin:8px 0 14px}
  .daylabel{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:700;margin:16px 0 6px}
  .fixture{background:var(--elev);border:1px solid var(--surface);border-radius:14px;padding:14px 16px;margin:10px 0}
  .fxhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}
  .matchup{font-size:18px;font-weight:700;letter-spacing:-.01em}
  .matchup .vs{color:var(--text3);font-weight:600;font-size:13px;margin:0 4px}
  .fxround{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);white-space:nowrap}
  .tbdnote{color:var(--text3);font-size:13px;margin-top:4px}
  .wdl{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;text-align:center;margin:6px 0}
  .wdl .w{font-weight:700}.wdl .n{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
  .wdl .lab{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)}
  .credrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
  .cred{background:var(--surface);border-radius:10px;padding:10px 12px}
  .credname{font-weight:700;font-size:14px;margin-bottom:4px}
  .credline{font-size:13px;color:var(--text);min-height:0}
  .credline2{font-size:12px;color:var(--text2);margin-top:2px}
  .credtt{font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums;margin-top:4px}
  .pickem{margin-top:10px;padding-top:10px;border-top:1px solid var(--surface)}
  .pklabel{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);font-weight:700;margin-bottom:6px}
  .pkrow{display:flex;gap:8px}
  .pkbtn{flex:1;appearance:none;background:var(--bg);border:1.5px solid var(--surface);color:var(--text2);padding:9px 10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}
  .pkbtn:hover{background:var(--hover);color:var(--text)}
  .pkbtn.on{background:var(--todayDim);border-color:var(--today);color:var(--today)}
  .pkhint{font-size:11px;color:var(--text3);margin-top:6px}
  .h3sub{font-weight:600;text-transform:none;letter-spacing:0;color:var(--text3)}
  /* ---- Terms assent (conspicuous, in-flow, adjacent to the play surface —
          NOT footer-gray browsewrap; see legal.ts + the hardening report) ---- */
  .assent{margin-top:36px;color:var(--text2);font-size:13px;text-align:center}
  .assent a{color:var(--accent);font-weight:600;text-decoration:underline;text-underline-offset:2px}
  .assent a:hover{opacity:.85}
  /* ---- Footer (non-affiliation disclaimer) ---- */
  footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--surface);
    color:var(--text3);font-size:11px;line-height:1.6}
  footer a{color:var(--text2)}
  /* ---- Visually-hidden (screen-reader-only) heading text ---- */
  .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
  /* ---- Waving flag icons (static images; hero-only optional motion) ---- */
  .flg{height:1em;width:1em;vertical-align:-.12em;margin-right:.32em}
  @media (prefers-reduced-motion:no-preference){
    .flg-hero{animation:flgwave 5s ease-in-out infinite;transform-origin:15% 60%;display:inline-block}
    @keyframes flgwave{0%,100%{transform:none}50%{transform:rotate(-2deg) skewY(1.5deg)}}
  }
  /* ---- Toast (share confirmation) ---- */
  .toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(8px);
    background:var(--surface);color:var(--text);font-size:13px;font-weight:600;
    padding:10px 18px;border-radius:999px;border:1px solid var(--hover);
    box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;transition:.25s;pointer-events:none;z-index:10}
  .toast.on{opacity:1;transform:translateX(-50%) translateY(0)}__EXTRACSS__
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1 class="brand"><span class="brandmark">__BRANDMARK__</span>__APPNAME__ <small>Daily trivia</small></h1>
    <div class="score" id="score">0<span class="max"> / 600</span></div>
  </header>
  <nav class="tabs" id="tabs" aria-label="Game modes">
    <button class="tab active" data-mode="daily">__TABDAILY__</button>
    <button class="tab" data-mode="today">__TABTODAY__</button>
    <button class="tab" data-mode="practice">__TABPRACTICE__</button>
    <button class="tab" data-mode="team">__TABTEAM__</button>
  </nav>
<main>
  <h2 class="sr" id="viewtitle">__TABDAILY__</h2>
  <div class="sub" id="sub">__SUBINITIAL__</div>
  <div class="streakbar" id="streakbar" style="display:none"></div>
  <div class="progress" id="progress" aria-hidden="true"></div>
  <div id="stage"></div>
  <div class="assent">By playing you agree to the <a href="__TERMSURL__">Terms</a></div>__YESTERDAY__
</main>
  __FOOTERHTML__
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
const BANK = __BANK__;
const TEAMS = __TEAMS__;
const MATCHDAY = __MATCHDAY__;
const APP_NAME = "__APPNAME__";
const APP_URL = "__APPURL__";
const FAMILY = __FAMILY__;
const ENTITYLINKS = __ENTITYLINKS__;
__PACKCONSTS____THEMECONSTS__

// ---- ported from src/game/rng.ts ----
function mulberry32(seed){let a=seed>>>0;return function(){a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function hashString(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;}
function shuffle(rng,items){const out=items.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}

// ---- ported from src/game/selection.ts ----
const EPOCH_UTC=Date.UTC(__EPOCHARGS__);
const TIERS=['easy','medium','hard'];
const TYPES=['multiple_choice','closest_guess'];
function dayNumber(key){const [y,m,d]=key.split('-').map(Number);return Math.max(0,Math.round((Date.UTC(y,m-1,d)-EPOCH_UTC)/86400000));}
function dateKeyFromDayNum(n){const d=new Date(EPOCH_UTC+n*86400000);return d.toISOString().slice(0,10);}
function todayKey(d=new Date()){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const da=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+da;}
function takeForDay(d){const e=d%2===0;return{'easy/multiple_choice':e?1:2,'easy/closest_guess':e?1:0,'medium/multiple_choice':1,'medium/closest_guess':1,'hard/multiple_choice':e?2:1,'hard/closest_guess':e?0:1};}
function consumedBefore(key,d){const even=Math.floor((d+1)/2);const odd=Math.floor(d/2);switch(key){case 'medium/multiple_choice':case 'medium/closest_guess':return d;case 'easy/closest_guess':return even;case 'easy/multiple_choice':return 2*d-even;case 'hard/closest_guess':return odd;case 'hard/multiple_choice':return 2*d-odd;}}
function selectDaily(bank,key){const d=dayNumber(key);const take=takeForDay(d);const pools={};for(const q of bank.questions){const k=q.difficulty+'/'+q.type;(pools[k]=pools[k]||[]).push(q);}const out=[];for(const tier of TIERS){for(const type of TYPES){const k=tier+'/'+type;const n=take[k];if(!n)continue;const pool=(pools[k]||[]).slice().sort((a,b)=>a.id<b.id?-1:1);const seed=(hashString(k)^bank.seed)>>>0;const perm=shuffle(mulberry32(seed),pool);const start=consumedBefore(k,d);for(let i=0;i<n;i++)out.push(perm[(start+i)%perm.length]);}}__DAILYSWAP__return out;}

// ---- ported from src/game/scoring.ts ----
const MAX_POINTS=100;
function scoreAnswer(q,resp){if(q.type==='multiple_choice'){const ok=resp===q.answer;return{points:ok?100:0,correct:ok};}const guess=Number(resp);const ans=Number(q.answer);const s=q.scoring||{fullPointsWithin:0,zeroBeyond:10};const diff=Math.abs(guess-ans);if(!isFinite(diff))return{points:0,correct:false};if(diff<=s.fullPointsWithin)return{points:100,correct:true};if(diff>=s.zeroBeyond)return{points:0,correct:false};return{points:Math.round(100*(s.zeroBeyond-diff)/(s.zeroBeyond-s.fullPointsWithin)),correct:false};}
// ---- tap-only pills: a closest_guess question WITH options renders as pills
// ---- (banks built with numericPills); one without keeps the typed input.
function hasPills(q){return q.type==='multiple_choice'||!!q.options;}
// Numeric pills carry the bare value: the question text states the quantity,
// and per-value unit grammar ("1 goals") has no safe cross-sport fix.
function pillsHtml(q){return '<div class="opts">'+q.options.map((o,i)=>'<button class="opt" data-i="'+i+'">'+(q.type==='multiple_choice'?teamLabel(o):esc(o))+'</button>').join('')+'</div>';}
function pillValue(q,o){return q.type==='multiple_choice'?o:Number(o);}
function lockPills(q,resp){const ans=q.type==='multiple_choice'?q.answer:Number(q.answer);stage.querySelectorAll('button.opt').forEach(b=>{b.disabled=true;const v=pillValue(q,q.options[+b.dataset.i]);if(v===ans)b.classList.add('correct');else if(v===resp)b.classList.add('wrong');});}

// ---- ported from streak.ts (daily streak + stats; user-local, no facts) ----
// Per-day score is the round aggregate on a 0..600 scale (six questions × 100).
// dayNumber/dateKeyFromDayNum above are the SAME day-key clock the daily round
// uses to pick questions — the streak reuses them, there is no second clock.
const HISTORY_KEY='__STOREPREFIX__.history';
function loadHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY))||{};}catch(e){return{};}}
function saveHistory(h){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(h));}catch(e){}}
function currentStreak(history,todayK){
  let d=dayNumber(todayK);
  if(!history[dateKeyFromDayNum(d)])d-=1;       // today unplayed: count back from yesterday
  let s=0; while(history[dateKeyFromDayNum(d)]){s++;d-=1;} return s;
}
function computeStats(history){
  const rs=Object.values(history);
  const played=rs.length;
  const avgScore=played===0?0:Math.round(rs.reduce((s,r)=>s+r.score,0)/played);
  const histogram=[0,0,0,0,0,0];
  for(const r of rs)histogram[Math.min(Math.floor(r.score/100),5)]++;
  const days=Object.keys(history).map(k=>dayNumber(k)).sort((a,b)=>a-b);
  let bestStreak=0,run=0;
  for(let i=0;i<days.length;i++){run=(i>0&&days[i]===days[i-1]+1)?run+1:1;if(run>bestStreak)bestStreak=run;}
  return {played,avgScore,bestStreak,histogram};
}

// ---- UI ----
let dayNum=dayNumber(todayKey());
let questions=[], idx=0, total=0, results=[];
let statsOpen=false;
function currentDailyKey(){return dateKeyFromDayNum(dayNum);}
const PROGRESS_KEY='__STOREPREFIX__.progress';
function clearDailyProgress(){try{localStorage.removeItem(PROGRESS_KEY);}catch(e){}}
function saveDailyProgress(revealed,response){
  const p={date:currentDailyKey(),questionIds:questions.map(q=>q.id),idx:idx,total:total,results:results.slice(),revealed:!!revealed};
  if(revealed)p.response=response;
  try{localStorage.setItem(PROGRESS_KEY,JSON.stringify(p));}catch(e){}
}
function validDailyProgress(p){
  if(!p||typeof p!=='object')return false;
  const ids=questions.map(q=>q.id);
  const sameIds=Array.isArray(p.questionIds)&&p.questionIds.length===ids.length&&p.questionIds.every((id,i)=>id===ids[i]);
  const validIdx=Number.isInteger(p.idx)&&p.idx>=0&&p.idx<=questions.length&&(!p.revealed||p.idx<questions.length);
  const validResults=Array.isArray(p.results)&&p.results.length===p.idx+(p.revealed?1:0)&&p.results.every(n=>Number.isInteger(n)&&n>=0&&n<=MAX_POINTS);
  const validTotal=Number.isInteger(p.total)&&validResults&&p.total===p.results.reduce((sum,n)=>sum+n,0);
  const validResponse=!p.revealed||typeof p.response==='string'||(typeof p.response==='number'&&isFinite(p.response));
  const validReveal=!p.revealed||(validIdx&&validResults&&validResponse&&scoreAnswer(questions[p.idx],p.response).points===p.results[p.idx]);
  return p.date===currentDailyKey()&&typeof p.revealed==='boolean'&&sameIds&&validIdx&&validResults&&validTotal&&validReveal;
}
function loadDailyProgress(){
  try{
    const raw=localStorage.getItem(PROGRESS_KEY);if(!raw)return null;
    const p=JSON.parse(raw);if(!validDailyProgress(p))throw new Error('invalid progress');
    return p;
  }catch(e){clearDailyProgress();return null;}
}
const stage=document.getElementById('stage');
const scoreEl=document.getElementById('score');
const progEl=document.getElementById('progress');
const subEl=document.getElementById('sub');

function start(){
  const key=currentDailyKey();
  questions=selectDaily(BANK,key);
  subEl.textContent='Round for '+key+' — same six for everyone';
  enterDaily();__SPOTLIGHTHOOK__
}
// Decide play-vs-result for today: a finished day shows its saved result; an
// unfinished day plays (resuming from the current question).
function enterDaily(){
  statsOpen=false;
  const key=currentDailyKey();
  const h=loadHistory();
  if(h[key]){
    clearDailyProgress(); total=h[key].score; results=h[key].grid.slice(); idx=questions.length;
    renderProgress(); renderResult();
  }else{
    const p=loadDailyProgress();
    if(p){idx=p.idx;total=p.total;results=p.results.slice();}
    else{idx=0;total=0;results=[];}
    renderProgress(); render();
    if(p&&p.revealed)renderDailyReveal(questions[idx],p.response,scoreAnswer(questions[idx],p.response));
  }
  updateStreakBar();
}
function updateStreakBar(){
  const bar=document.getElementById('streakbar');
  if(!bar)return;
  if(mode!=='daily'||statsOpen){bar.style.display='none';return;}
  const streak=currentStreak(loadHistory(),currentDailyKey());
  bar.style.display='flex';
  bar.innerHTML=(streak>0?'<span class="streakchip">🔥 '+streak+'-day streak</span>':'<span></span>')+
    '<button class="linkbtn" id="openstats">Stats ↗</button>';
  document.getElementById('openstats').onclick=renderStats;
}
function renderProgress(){
  progEl.innerHTML='';
  for(let i=0;i<questions.length;i++){const d=document.createElement('div');d.className='dot'+(i<idx?' done':'')+(i===idx?' active':'');progEl.appendChild(d);}
  scoreEl.innerHTML=total+'<span class="max"> / '+(questions.length*100)+'</span>';
}
function chip(q){return '<div class="meta"><span class="d">'+q.difficulty+'</span><span class="e">'+q.era+'</span><span class="t">'+q.topic.replace(/_/g,' ')+'</span></div>';}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

// ---- Post-answer entity links (opt-in; ENTITYLINKS null = plain esc()) ----
// Render-layer wrapping ONLY: the validated fact string is never edited —
// matched entity mentions are wrapped in same-tab <a class="elink"> at
// display time (longest name wins, word-boundary-gated, one link per
// mention), and a bare score token BETWEEN the two entities of a known pair
// links the pair's head-to-head page. Question text and options never pass
// through linkFact — they keep the plain esc() path.
const ELINK_NAMES=ENTITYLINKS?Object.keys(ENTITYLINKS.entities).sort((a,b)=>b.length-a.length):[];
function elinkEdge(c){return !c||!/[A-Za-z0-9]/.test(c);}
function linkFact(s){
  s=String(s);
  if(!ENTITYLINKS)return esc(s);
  const hits=[];
  for(const n of ELINK_NAMES){
    let i=0;
    while((i=s.indexOf(n,i))!==-1){
      const j=i+n.length;
      if(elinkEdge(s[i-1])&&elinkEdge(s[j])&&!hits.some(h=>i<h.end&&j>h.start))hits.push({start:i,end:j,name:n});
      i=j;
    }
  }
  hits.sort((a,b)=>a.start-b.start);
  const links=hits.map(h=>({start:h.start,end:h.end,href:ENTITYLINKS.entities[h.name]}));
  const pairs=ENTITYLINKS.pairs||{};
  for(let k=0;k+1<hits.length;k++){
    const m=/^(\s+)(\d+[–-]\d+)\s+$/.exec(s.slice(hits[k].end,hits[k+1].start));
    if(!m)continue;
    const href=pairs[[hits[k].name,hits[k+1].name].sort().join('|')];
    if(!href)continue;
    const at=hits[k].end+m[1].length;
    links.push({start:at,end:at+m[2].length,href:href});
  }
  links.sort((a,b)=>a.start-b.start);
  let out='',pos=0;
  for(const l of links){
    out+=esc(s.slice(pos,l.start))+'<a class="elink" href="'+l.href+'">'+esc(s.slice(l.start,l.end))+'</a>';
    pos=l.end;
  }
  return out+esc(s.slice(pos));
}

__ANALYTICSJS__

__PACKDECOR____SPOTLIGHTJS__

function render(){
  if(idx>=questions.length){finishDaily();return;}
  updateStreakBar();
  const q=questions[idx];
  let html=chip(q)+__QBADGE__'<div class="q">'+esc(q.text)+'</div>';
  if(hasPills(q)){
    html+=pillsHtml(q);
  }else{
    html+='<div class="cg"><input id="cg" type="number" inputmode="numeric" placeholder="your guess" aria-label="Your guess" /><span class="unit">'+esc(q.unit||'')+'</span><button class="btn" id="cgsubmit">Guess</button></div>';
  }
  html+='<div id="reveal"></div>';
  stage.innerHTML=html;
  if(hasPills(q)){
    stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answer(pillValue(q,q.options[+b.dataset.i]));});
  }else{
    const inp=stage.querySelector('#cg');
    const go=()=>{if(inp.value!=='')answer(Number(inp.value));};
    stage.querySelector('#cgsubmit').onclick=go;
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
    inp.focus();
  }
  renderProgress();
}

function answer(resp){__TRACKSTART__
  const q=questions[idx];
  const sc=scoreAnswer(q,resp);
  total+=sc.points; results.push(sc.points);
  saveDailyProgress(true,resp);
  renderDailyReveal(q,resp,sc);
  renderProgress();
}

function renderDailyReveal(q,resp,sc){
  const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  // lock options
  if(hasPills(q)){
    lockPills(q,resp);
  }else{
    const inp=stage.querySelector('#cg');inp.value=resp;inp.disabled=true;stage.querySelector('#cgsubmit').disabled=true;
  }
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  const last=idx+1>=questions.length;
  document.getElementById('reveal').innerHTML=
    '<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+
    '<div class="fact">'+linkFact(q.revealFact)+'</div>'+
    '<a href="'+q.citation.urls[0]+'" target="_blank" rel="noopener noreferrer">↗ '+esc(q.citation.label)+'</a>'+
    '<div class="row"><span></span><button class="btn" id="next">'+(last?'See results':'Next question')+'</button></div></div>';
  document.getElementById('next').onclick=()=>{idx++;saveDailyProgress(false);renderProgress();render();};
  // Source link: NATIVE anchor navigation only (target="_blank" +
  // rel="noopener noreferrer" on the markup above). The old "robust" JS
  // handler double-navigated: a scripted open with the 'noopener' feature
  // returns null BY SPEC even on success, so its popup-blocked fallback
  // (assigning the current tab's href) fired on every click and destroyed
  // the in-progress round. Native behavior handles click, Enter, and
  // middle-click with exactly one navigation intent — source-link.test.ts.
}

function buildShareText(streak){
  // Spoiler-free: one square per question, score, streak, link. No question content.
  const grid=results.map(p=>p>=100?'🟩':p>0?'🟨':'🟥').join('');
  const lines=[APP_NAME+' '+currentDailyKey(), grid+' '+total+'/'+(questions.length*100)];
  if(streak>1) lines.push('🔥 '+streak+'-day streak');
__SHARELINE__  if(APP_URL) lines.push(APP_URL);
  return lines.join('\n');
}
// Brief on-screen confirmation (desktop copy gives no native feedback).
let toastTimer=null;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('on'),2200);
}
function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){return navigator.clipboard.writeText(text);}
  return new Promise((res,rej)=>{
    const ta=document.createElement('textarea');ta.value=text;ta.readOnly=true;
    ta.style.position='fixed';ta.style.top='0';ta.style.left='0';ta.style.width='1px';ta.style.height='1px';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    try{ta.setSelectionRange(0,text.length);}catch(e){}
    let ok=false;try{ok=document.execCommand('copy');}catch(e){}
    document.body.removeChild(ta);ok?res():rej();
  });
}
// Post-round continue strip: the sibling games plus the hub, under the share
// module. Played-today state is read the way the front door reads it — the
// sibling's prefix.history[todayKey()] — and only for same-origin siblings
// (cross-origin storage is unreadable by design; those chips show "play").
// Unplayed first (stable within groups), links only: no autoplay, no nagging.
function familyPlayedToday(prefix){
  try{const h=JSON.parse(localStorage.getItem(prefix+'.history'))||{};return !!h[todayKey()];}catch(e){return false;}
}
function renderContinue(){
  if(!FAMILY)return;
  const el=document.getElementById('continue');
  if(!el)return;
  const rows=FAMILY.games.map(g=>{
    let played=false;
    try{if(new URL(g.url,location.href).origin===location.origin)played=familyPlayedToday(g.prefix);}catch(e){}
    return {g:g,played:played};
  });
  rows.sort((a,b)=>(a.played?1:0)-(b.played?1:0));
  el.innerHTML='<div class="chead">'+esc(FAMILY.heading)+'</div>'+
    '<div class="crow">'+rows.map(r=>'<a class="cchip'+(r.played?' done':'')+'" href="'+r.g.url+'">'+esc(r.g.name)+
      '<span>'+(r.played?'✓ played':'play →')+'</span></a>').join('')+'</div>'+
    '<a class="chub" href="'+FAMILY.hub.url+'">'+esc(FAMILY.hub.label)+'</a>';
}
// Persist today's result once, the moment the round is completed, then show it.
function finishDaily(){
  const key=currentDailyKey();
  const h=loadHistory();
  if(!h[key]){
    h[key]={date:key,score:total,grid:results.slice()}; saveHistory(h);
__TRACKROUND__
  }
  clearDailyProgress();
  renderResult();
}
function renderResult(){
  const streak=currentStreak(loadHistory(),currentDailyKey());
  const squares=results.map(p=>p>=100?'🟩':p>0?'🟨':'🟥').join('');
  stage.innerHTML='<div class="final"><div class="big">'+total+'<small> / '+(questions.length*100)+'</small></div>'+
    '<div class="squares">'+squares+'</div>'+
    (streak>0?'<div class="streakchip">🔥 '+streak+'-day streak</div>':'')+
    '<div class="note">__RESULTNOTE__</div>'+
    '<div class="row" style="justify-content:center;gap:10px"><button class="btn" id="share">Share</button><button class="btn ghost" id="statsbtn">Stats</button></div>'+
    '<div class="note" id="shared" style="visibility:hidden">Copied to clipboard</div>'+
    '<pre class="sharebox" id="sharebox"></pre>'+
    '<div class="continue" id="continue"></div></div>';
  document.getElementById('statsbtn').onclick=renderStats;
  document.getElementById('share').onclick=async()=>{
    __TRACKSHARE__
    const text=buildShareText(streak);
    const btn=document.getElementById('share');
    const note=document.getElementById('shared');
    const box=document.getElementById('sharebox');
    // Best-effort native share sheet (mobile); ignore if it rejects (desktop/file://).
    if(navigator.share){ try{ await navigator.share({title:APP_NAME, text}); showToast('Shared'); return; }catch(e){} }
    // Desktop fallback: copy the same spoiler-free text and confirm on screen.
    let copied=false;
    try{ await copyText(text); copied=true; }catch(e){}
    btn.textContent=copied?'Copied!':'Share';
    if(copied){ showToast('Copied to clipboard'); return; }
    // Copy unavailable (permissions/file://): show the text for manual copy.
    note.textContent='Select and copy your result:';
    note.style.visibility='visible';
    box.textContent=text;
    box.style.display='block';
  };
  renderContinue();
  updateStreakBar();
  renderProgress();
}
// Stats panel — Played / Avg / Streak / Best streak + score distribution.
// Mirrors box-box/src/app/stats.tsx. Reachable from the Daily screen.
function statBox(label,value){return '<div class="statbox"><div class="statval">'+value+'</div><div class="statlab">'+label+'</div></div>';}
function renderStats(){
  statsOpen=true; updateStreakBar();
  const h=loadHistory();
  const s=computeStats(h);
  const streak=currentStreak(h,currentDailyKey());
  const labels=['0','100','200','300','400','500+'];
  const maxB=Math.max(s.histogram[0],s.histogram[1],s.histogram[2],s.histogram[3],s.histogram[4],s.histogram[5],1);
  let html='<div class="statshead"><h2 class="name">Stats</h2><button class="linkbtn" id="statsback">← Back to Daily</button></div>'+
    '<div class="statrow">'+statBox('Played',s.played)+statBox('Avg score',s.avgScore)+statBox('Streak',streak)+statBox('Best streak',s.bestStreak)+'</div>'+
    '<div class="card"><h3>Score distribution</h3><div class="hist">'+
      s.histogram.map((c,i)=>'<div class="histcol"><div class="histn">'+(c>0?c:'')+'</div>'+
        '<div class="histtrack"><div class="histbar'+(c>0?' on':'')+'" style="height:'+(c/maxB*100)+'%"></div></div>'+
        '<div class="histlab">'+labels[i]+'</div></div>').join('')+'</div>'+
      (s.played===0?'<div class="empty" style="margin-top:8px">Play your first daily round to start the chart.</div>':'')+
    '</div>';
  stage.innerHTML=html;
__ANALYTICSSETTINGS__  document.getElementById('statsback').onclick=()=>{statsOpen=false;enterDaily();};
  renderProgress();
}

// ---- Practice mode (unlimited, filterable; no streak/score) ----
let mode='daily';
const ERAS=[...new Set(BANK.questions.map(q=>q.era))].sort();
let pf={difficulty:null,era:null}, pq=null, plast=null;
__ERALABEL__
function practicePool(){return BANK.questions.filter(q=>(!pf.difficulty||q.difficulty===pf.difficulty)&&(!pf.era||q.era===pf.era));}
function setMode(m){
  mode=m;
  statsOpen=false;
  document.querySelectorAll('#tabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.mode===m));
  const vt=document.getElementById('viewtitle');
  if(vt){const tb=document.querySelector('#tabs .tab[data-mode="'+m+'"]');if(tb)vt.textContent=tb.textContent;}
  const daily=m==='daily';
  document.getElementById('sub').style.display=daily?'':'none';
  document.getElementById('progress').style.display=daily?'':'none';
  document.getElementById('score').style.visibility=daily?'visible':'hidden';
  if(daily){enterDaily();}else if(m==='today'){renderToday();}else if(m==='practice'){renderPractice();}else{renderTeam();}
  updateStreakBar();__SPOTLIGHTHOOK__
}
function fchips(kind,values){
  const cur=pf[kind];
  let h='<button class="fchip'+(cur===null?' on':'')+'" data-k="'+kind+'" data-v="">all</button>';
  for(const v of values){const lab=kind==='era'?eraLabel(v):v;h+='<button class="fchip'+(cur===v?' on':'')+'" data-k="'+kind+'" data-v="'+v+'">'+esc(lab)+'</button>';}
  return h;
}
function drawPractice(){const pool=practicePool();if(!pool.length){pq=null;renderPractice();return;}const elig=pool.length>1?pool.filter(q=>q.id!==plast):pool;pq=elig[Math.floor(Math.random()*elig.length)];plast=pq.id;renderPractice();}
function renderPractice(){
  let html='<div class="pbanner">Practice — unlimited questions · no streak, no score</div>'+
    '<div class="filters"><div class="flabel">Difficulty</div><div class="chiprow">'+fchips('difficulty',['easy','medium','hard'])+'</div>'+
    '<div class="flabel">Era</div><div class="chiprow">'+fchips('era',ERAS)+'</div></div>';
  if(pq){
    html+=chip(pq)+'<div class="q">'+esc(pq.text)+'</div>';
    if(hasPills(pq)){html+=pillsHtml(pq);}
    else{html+='<div class="cg"><input id="pcg" type="number" inputmode="numeric" placeholder="your guess" aria-label="Your guess" /><span class="unit">'+esc(pq.unit||'')+'</span><button class="btn practice" id="pcgsubmit">Guess</button></div>';}
    html+='<div id="preveal"></div>';
  }else{
    const n=practicePool().length;
    html+='<button class="btn practice" id="pdraw">'+(n>0?('Draw a question ('+n+')'):'No questions match')+'</button>';
  }
  stage.innerHTML=html;
  stage.querySelectorAll('.fchip').forEach(b=>{b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v;pf[k]=v===''?null:v;pq=null;plast=null;renderPractice();};});
  const draw=document.getElementById('pdraw'); if(draw)draw.onclick=drawPractice;
  if(pq){
    if(hasPills(pq)){stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answerPractice(pillValue(pq,pq.options[+b.dataset.i]));});}
    else{const inp=stage.querySelector('#pcg');const go=()=>{if(inp.value!=='')answerPractice(Number(inp.value));};document.getElementById('pcgsubmit').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});inp.focus();}
  }
}
function answerPractice(resp){__TRACKPRACTICE__
  const q=pq;const sc=scoreAnswer(q,resp);const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  if(hasPills(q)){lockPills(q,resp);}
  else{stage.querySelector('#pcg').disabled=true;stage.querySelector('#pcgsubmit').disabled=true;}
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  document.getElementById('preveal').innerHTML='<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+
    '<div class="fact">'+linkFact(q.revealFact)+'</div>'+
    '<a href="'+q.citation.urls[0]+'" target="_blank" rel="noopener noreferrer">↗ '+esc(q.citation.label)+'</a>'+
    '<div class="row"><span></span><button class="btn practice" id="pnext">Another one</button></div></div>';
  document.getElementById('pnext').onclick=drawPractice;
  // Source link: native anchor navigation only — same double-navigation fix
  // as the daily reveal (see the note in answer()).
}

// ---- Fav-team mode (team pick in localStorage; insights + team-filtered feed) ----
// Every fact rendered here comes from TEAMS, computed from the dataset in
// generate.ts (see team.ts). The browser never derives a record or scoreline.
const TEAM_KEY='__STOREPREFIX__.favTeam';
const TEAM_BY_NAME={}; for(const t of TEAMS.teams)TEAM_BY_NAME[t.name]=t;
const Q_BY_ID={}; for(const q of BANK.questions)Q_BY_ID[q.id]=q;
let teamView='insights';      // 'insights' | 'quiz'
let teamSearch='';
let tq=null, tlast=null;      // current team-feed question
function getFavTeam(){
  let n=null; try{n=localStorage.getItem(TEAM_KEY);}catch(e){}
  return (n&&TEAM_BY_NAME[n])?n:null;
}
function setFavTeam(n){ try{localStorage.setItem(TEAM_KEY,n);}catch(e){} track('team_picked',{team:n}); }
function clearFavTeam(){ try{localStorage.removeItem(TEAM_KEY);}catch(e){} }
function srcLink(s){ return '<a href="'+s.url+'" target="_blank" rel="noopener noreferrer">source ↗</a>'; }
// bindSrcLinks: RETIRED to a compatibility no-op (pack todayCards/teamCards
// still call it). It used to graft the same double-navigating handler as the
// old reveal code onto every candidate anchor — a scripted open with the
// 'noopener' feature returns null BY SPEC, so the popup-blocked fallback
// fired on every click and navigated the game tab away. Citation anchors all
// carry target="_blank" rel="noopener noreferrer" from srcLink()/the reveal
// templates; internal links (.elink and friends) are same-tab by design —
// native anchor behavior is correct for both, with exactly one navigation
// intent per activation (click, Enter, middle-click).
function bindSrcLinks(root){}
__PACKTEAMHELPERS__

__RENDERTEAM__

__PACKTEAMCARDS__

// ---- Team-filtered feed (questions the dataset computes this team into) ----
// Pool entries come giveaway-guarded from generate.ts (guardScopedPool in
// team.ts): a question whose answer is the scoped team is excluded, and a
// scoped-team distractor arrives already swapped via e.options. The browser
// only renders the entry — it never adjusts an option set itself.
function qref(e){const q=Q_BY_ID[e.id];if(!q)return null;return e.options?Object.assign({},q,{options:e.options}):q;}
function teamPool(t){ return t.quiz.map(qref).filter(Boolean); }
function teamQuizHtml(t){
  const pool=teamPool(t);
  if(!pool.length)return '<div class="card"><div class="empty">No questions in today’s bank involve '+teamLabel(t.name)+' yet. __BANKREFRESHNOTE__</div></div>';
  let html='<div class="tbanner">'+pool.length+' question'+(pool.length===1?'':'s')+' featuring '+teamLabel(t.name)+' · unlimited, no streak or score</div>';
  if(tq){
    html+=chip(tq)+'<div class="q">'+esc(tq.text)+'</div>';
    if(hasPills(tq)){html+=pillsHtml(tq);}
    else{html+='<div class="cg"><input id="tcg" type="number" inputmode="numeric" placeholder="your guess" aria-label="Your guess" /><span class="unit">'+esc(tq.unit||'')+'</span><button class="btn team" id="tcgsubmit">Guess</button></div>';}
    html+='<div id="treveal"></div>';
  }else{
    html+='<button class="btn team" id="tdraw">Draw a '+teamLabel(t.name)+' question ('+pool.length+')</button>';
  }
  return html;
}
function drawTeamQuestion(t){
  const pool=teamPool(t); if(!pool.length){tq=null;renderTeam();return;}
  const elig=pool.length>1?pool.filter(q=>q.id!==tlast):pool;
  tq=elig[Math.floor(Math.random()*elig.length)]; tlast=tq.id; renderTeam();
}
function wireTeamQuiz(t){
  const draw=document.getElementById('tdraw'); if(draw)draw.onclick=()=>drawTeamQuestion(t);
  if(!tq)return;
  if(hasPills(tq)){stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answerTeam(t,pillValue(tq,tq.options[+b.dataset.i]));});}
  else{const inp=stage.querySelector('#tcg');const go=()=>{if(inp.value!=='')answerTeam(t,Number(inp.value));};document.getElementById('tcgsubmit').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});inp.focus();}
}
function answerTeam(t,resp){
  const q=tq;const sc=scoreAnswer(q,resp);const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  if(hasPills(q)){lockPills(q,resp);}
  else{stage.querySelector('#tcg').disabled=true;stage.querySelector('#tcgsubmit').disabled=true;}
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  document.getElementById('treveal').innerHTML='<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+
    '<div class="fact">'+linkFact(q.revealFact)+'</div>'+
    '<a href="'+q.citation.urls[0]+'" target="_blank" rel="noopener noreferrer">↗ '+esc(q.citation.label)+'</a>'+
    '<div class="row"><span></span><button class="btn team" id="tnext">Another one</button></div></div>';
  document.getElementById('tnext').onclick=()=>drawTeamQuestion(t);
  bindSrcLinks(document.getElementById('treveal'));
}

// ---- Today mode (fixtures + head-to-head + mini-quiz + pick'em) ----
// Everything rendered here comes from MATCHDAY, computed from the dataset in
// generate.ts (see matchday.ts) and validated by validate.ts. The browser never
// derives a fact and NEVER predicts: it only renders facts from PLAYED matches,
// records the user's pick locally, and grades it against the validated result.
const PICKS_KEY='__STOREPREFIX__.picks';
function loadPicks(){try{return JSON.parse(localStorage.getItem(PICKS_KEY))||{};}catch(e){return{};}}
function savePicks(p){try{localStorage.setItem(PICKS_KEY,JSON.stringify(p));}catch(e){}}
function clientUtcDay(){return new Date().toISOString().slice(0,10);}   // UTC day-key (pick metadata only)
// Device-LOCAL day-key for choosing which fixtures are "today" — local Date
// components, NOT toISOString() (UTC), so evening-US users don't see tomorrow.
// No geolocation; the browser clock is the source of truth.
function clientLocalDay(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// "Wed 1 Jul" in the device locale, from a YYYY-MM-DD key (local-midnight safe).
function fmtDay(key){const p=key.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});}
let mdQuizMid=null, mdq=null, mdlast=null;
function fixtureById(mid){for(const d of MATCHDAY.days)for(const f of d.fixtures)if(f.matchId===mid)return f;return null;}

__PACKTODAYCARDS__
__RENDERTODAY__
// ---- Per-matchup mini-quiz (pool built in matchday.ts: questions the dataset
//      computes either team into, giveaway-guarded against BOTH fixture teams
//      so the "featuring X or Y" label can't telegraph or trap an answer) ----
function matchupPool(f){ return (f.quiz||[]).map(qref).filter(Boolean); }
function drawMatchupQ(f){const pool=matchupPool(f);if(!pool.length)return;const elig=pool.length>1?pool.filter(q=>q.id!==mdlast):pool;mdq=elig[Math.floor(Math.random()*elig.length)];mdlast=mdq.id;renderMatchupQuiz();}
function renderMatchupQuiz(){
  const f=fixtureById(mdQuizMid);
  if(!f){mdQuizMid=null;renderToday();return;}
  const pool=matchupPool(f);
  let html='<div class="teamhead"><h2 class="name" style="font-size:18px">'+teamLabel(f.team1)+' v '+teamLabel(f.team2)+'</h2><button class="linkbtn" id="mdback">← Back to Today</button></div>';
  if(!pool.length){
    stage.innerHTML=html+'<div class="card"><div class="empty">No bank questions feature '+teamLabel(f.team1)+' or '+teamLabel(f.team2)+' yet. __BANKREFRESHNOTE__</div></div>';
    document.getElementById('mdback').onclick=()=>{mdQuizMid=null;renderToday();};return;
  }
  html+='<div class="tdbanner2">'+pool.length+' question'+(pool.length===1?'':'s')+' featuring '+teamLabel(f.team1)+' or '+teamLabel(f.team2)+' · unlimited, no streak or score</div>';
  if(mdq){
    html+=chip(mdq)+'<div class="q">'+esc(mdq.text)+'</div>';
    if(hasPills(mdq))html+=pillsHtml(mdq);
    else html+='<div class="cg"><input id="mdcg" type="number" inputmode="numeric" placeholder="your guess" aria-label="Your guess" /><span class="unit">'+esc(mdq.unit||'')+'</span><button class="btn today" id="mdcgs">Guess</button></div>';
    html+='<div id="mdrev"></div>';
  }else{
    html+='<button class="btn today" id="mddraw">Draw a question ('+pool.length+')</button>';
  }
  stage.innerHTML=html;
  document.getElementById('mdback').onclick=()=>{mdQuizMid=null;mdq=null;mdlast=null;renderToday();};
  const draw=document.getElementById('mddraw'); if(draw)draw.onclick=()=>drawMatchupQ(f);
  if(mdq){
    if(hasPills(mdq))stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answerMatchup(f,pillValue(mdq,mdq.options[+b.dataset.i]));});
    else{const inp=stage.querySelector('#mdcg');const go=()=>{if(inp.value!=='')answerMatchup(f,Number(inp.value));};document.getElementById('mdcgs').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});inp.focus();}
  }
}
function answerMatchup(f,resp){
  const q=mdq;const sc=scoreAnswer(q,resp);const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  if(hasPills(q))lockPills(q,resp);
  else{stage.querySelector('#mdcg').disabled=true;stage.querySelector('#mdcgs').disabled=true;}
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  document.getElementById('mdrev').innerHTML='<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+'<div class="fact">'+linkFact(q.revealFact)+'</div>'+
    '<a href="'+q.citation.urls[0]+'" target="_blank" rel="noopener noreferrer">↗ '+esc(q.citation.label)+'</a>'+
    '<div class="row"><span></span><button class="btn today" id="mdnext">Another one</button></div></div>';
  document.getElementById('mdnext').onclick=()=>drawMatchupQ(f);
  bindSrcLinks(document.getElementById('mdrev'));
}

// ---- Client-side routing (History API): each tab is a real path so shared
//      links and bookmarks open the right view (site/vercel.json rewrites the
//      sub-paths to the app shell). The route only selects the TAB — sub-state
//      (fav-team pick, Today's local-date logic, a resumed round) is untouched.
//      pushState is guarded to http(s) so the offline file:// preview keeps
//      working, and only fires on a real path change. The Vercel insights
//      script auto-tracks pushState/popstate, so each route change registers
//      as a pageview without a manual va('pageview') call.
const ROUTE_FOR_MODE={daily:'/',today:'__ROUTETODAY__',practice:'__ROUTEPRACTICE__',team:'__ROUTETEAM__'};
const MODE_FOR_ROUTE={'/':'daily','__ROUTETODAY__':'today','__ROUTEPRACTICE__':'practice','__ROUTETEAM__':'team'};
const BASE_TITLE=document.title;
const TITLE_FOR_MODE={daily:BASE_TITLE,
  today:APP_NAME+' — __TITLETODAY__',
  practice:APP_NAME+' — __TITLEPRACTICE__',
  team:APP_NAME+' — __TITLETEAM__'};
function modeForPath(p){return MODE_FOR_ROUTE[String(p||'').replace(/\/+$/,'')||'/']||'daily';}
function syncRoute(m,push){
  document.title=TITLE_FOR_MODE[m]||BASE_TITLE;
  if(!push)return;
  const path=ROUTE_FOR_MODE[m]||'/';
  try{if(/^https?:$/.test(location.protocol)&&location.pathname!==path)history.pushState({mode:m},'',path);}catch(e){}
}
window.addEventListener('popstate',()=>{const m=modeForPath(location.pathname);syncRoute(m,false);if(m!==mode)setMode(m);});
document.querySelectorAll('#tabs .tab').forEach(t=>{t.onclick=()=>{setMode(t.dataset.mode);syncRoute(t.dataset.mode,true);};});
start();
const initialMode=modeForPath(location.pathname);
if(initialMode!=='daily')setMode(initialMode);
syncRoute(initialMode,false);
</script>
</body>
</html>`;

const NOT_FOUND_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__APPNAME__ — Page not found</title>
<meta name="robots" content="noindex" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="theme-color" content="__THEMECOLOR__" />
<style>
  :root{__NFPALETTE__}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;line-height:1.5;
    min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  main{max-width:400px;text-align:center}
  .brandmark svg{width:64px;height:64px;display:block;margin:0 auto 8px}
  .name{font-weight:700;letter-spacing:-.02em;font-size:18px;margin-bottom:26px}
  .name small{color:var(--text2);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-left:4px}
  h1{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0 0 10px}
  p{color:var(--text2);font-size:15px;margin:0 0 26px}
  .btn{display:inline-block;background:var(--accent);color:__BTNTEXT__;font-weight:700;
    padding:13px 22px;border-radius:12px;font-size:15px;text-decoration:none}
  .alt{display:block;margin-top:16px;color:var(--accent);font-size:13px;font-weight:600;
    text-decoration:underline;text-underline-offset:2px}
  .alt:hover,.btn:hover{opacity:.9}__NFEXTRACSS__
</style>
</head>
<body>
<main>
  <span class="brandmark">__BRANDMARK__</span>
  <div class="name">__APPNAME__ <small>Daily trivia</small></div>
  <h1>__NFHEADING__</h1>
  <p>__NFBODY__</p>
  __NFACTIONS__
</main>
</body>
</html>`;

// ---------- Standard implementations of the optional client-JS pieces ----------

const DEFAULT_TEAM_HELPERS = String.raw`function editionLabel(ed){
  const cov=TEAMS.coverage;
  return ed>cov.completedThrough?(ed+' (in progress)'):String(ed);
}
function placementWord(p){ return p==='champion'?'Champion':p==='runner-up'?'Runner-up':'Third place'; }`;

const DEFAULT_ERA_LABEL = String.raw`function eraLabel(e){const dec=Math.floor(BANK.coverage.maxSeason/10)*10;return e===(dec+'s')?(dec+'–'+BANK.coverage.maxSeason):e;}`;

const DEFAULT_RENDER_TODAY = String.raw`function renderToday(){
  if(mdQuizMid){renderMatchupQuiz();return;}
  const today=clientLocalDay();   // LOCAL date — never UTC (see clientLocalDay)
  const day=MATCHDAY.days.find(d=>d.date===today);
  const next=MATCHDAY.days.filter(d=>d.date>today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  let html=(loadPicks()&&Object.keys(loadPicks()).length?'':'<div class="tdbanner">__TODAYINTRO__</div>')+pickRecordHtml();
  if(day&&day.fixtures.length){
    html+='<div class="daylabel">Today · '+esc(fmtDay(today))+'</div>'+day.fixtures.map(fixtureHtml).join('');
  }else{
    html+='<div class="tdbanner">__TODAYNONE__ ('+esc(fmtDay(today))+').</div>';
    if(next)html+='<div class="daylabel">Next up · '+esc(fmtDay(next.date))+'</div>'+next.fixtures.map(fixtureHtml).join('');
    else html+='<div class="empty">No upcoming fixtures in the current window — check back after the next refresh.</div>';
  }
  stage.innerHTML=html;
  stage.querySelectorAll('button[data-quiz]').forEach(b=>{b.onclick=()=>{mdQuizMid=b.dataset.quiz;mdq=null;mdlast=null;renderToday();};});
  stage.querySelectorAll('button[data-pick]').forEach(b=>{b.onclick=()=>{
    const p=loadPicks(),mid=b.dataset.mid,val=b.dataset.pick;
    if(p[mid]&&p[mid].pick===val)delete p[mid]; else {p[mid]={pick:val,date:clientUtcDay()};track('pick_made',{pick:val});}
    savePicks(p); renderToday();
  };});
  bindSrcLinks(stage);
}`;

/** The standard My-Team flow: one followed entity of one kind, picked from a
 *  flat searchable list. Overridable via clientJs.renderTeam for sports whose
 *  follow model differs (kept byte-identical to the original inline block). */
const DEFAULT_RENDER_TEAM = String.raw`function renderTeam(){
  const fav=getFavTeam();
  if(!fav){ renderTeamPicker(); return; }
  const t=TEAM_BY_NAME[fav];
  let html='<div class="teamhead"><h2 class="name">'+teamLabel(t.name,true)+'</h2>'+
    '<button class="linkbtn" id="changeteam">Change team</button></div>'+
    '<div class="subnav" id="tsub">'+
      '<button class="tab'+(teamView==='insights'?' active':'')+'" data-tv="insights">Insights</button>'+
      '<button class="tab'+(teamView==='quiz'?' active':'')+'" data-tv="quiz">Team quiz</button>'+
    '</div>';
  if(teamView==='insights')html+=teamInsightsHtml(t);
  else html+=teamQuizHtml(t);
  stage.innerHTML=html;
  document.getElementById('changeteam').onclick=()=>{ teamSearch=''; renderTeamPicker(); };
  stage.querySelectorAll('#tsub .tab').forEach(b=>{b.onclick=()=>{teamView=b.dataset.tv;tq=null;tlast=null;renderTeam();};});
  if(teamView==='quiz')wireTeamQuiz(t);
  bindSrcLinks(stage);
}

function renderTeamPicker(){
  const q=teamSearch.trim().toLowerCase();
  const list=TEAMS.teams.filter(t=>!q||t.name.toLowerCase().includes(q));
  let html='<div class="tbanner">__TEAMPICKERBANNER__</div>'+
    '<input class="picker-search" id="psearch" type="text" placeholder="Search teams…" aria-label="Search teams" value="'+esc(teamSearch)+'" />'+
    '<div class="teamlist">'+
      list.map(t=>'<button class="fchip" data-team="'+esc(t.name)+'">'+teamLabel(t.name)+'</button>').join('')+
    '</div>'+
    (list.length?'':'<div class="empty">No teams match “'+esc(teamSearch)+'”.</div>');
  stage.innerHTML=html;
  const inp=document.getElementById('psearch');
  inp.oninput=()=>{ teamSearch=inp.value; const pos=inp.selectionStart; renderTeamPicker(); const ni=document.getElementById('psearch'); ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(e){} };
  stage.querySelectorAll('.teamlist .fchip').forEach(b=>{b.onclick=()=>{ setFavTeam(b.dataset.team); teamView='insights'; teamSearch=''; renderTeam(); };});
}`;

/** The themed My-Team flow (used ONLY when cfg.teamTheming is set): the
 *  DEFAULT_RENDER_TEAM flow with a nation-themed wrapper when the followed
 *  team has a NATION_THEME entry — a decorative flag band, a nation-tinted
 *  banner carrying the validated artifact insightLine, and the one-token
 *  --team/--teamDim/--onTeam override that shifts every incumbent accent
 *  surface on the tab. A nation absent from the table renders the incumbent
 *  markup (allowlist fallback). All colors arrive baked from the build-
 *  validated table — the browser never derives one. */
const THEMED_RENDER_TEAM = String.raw`function renderTeam(){
  const fav=getFavTeam();
  if(!fav){ renderTeamPicker(); return; }
  const t=TEAM_BY_NAME[fav];
  const th=NATION_THEME[t.name]||null;
  const head='<div class="teamhead"><h2 class="name">'+teamLabel(t.name,true)+'</h2>'+
    '<button class="linkbtn" id="changeteam">Change team</button></div>';
  const subnav='<div class="subnav" id="tsub">'+
      '<button class="tab'+(teamView==='insights'?' active':'')+'" data-tv="insights">Insights</button>'+
      '<button class="tab'+(teamView==='quiz'?' active':'')+'" data-tv="quiz">Team quiz</button>'+
    '</div>';
  const body=teamView==='insights'?teamInsightsHtml(t):teamQuizHtml(t);
  let html;
  if(th){
    html='<div class="nation" style="--team:'+th.a+';--teamDim:'+th.d+';--onTeam:'+th.o+'">'+
      '<div class="natband'+(th.i?' inset':'')+'" style="background:'+th.g+'" aria-hidden="true"></div>'+
      '<div class="natbanner">'+head+
        (t.insightLine?'<div class="natlead">'+esc(t.insightLine)+'</div>':'')+
      '</div>'+subnav+body+'</div>';
  }else{
    html=head+subnav+body;
  }
  stage.innerHTML=html;
  document.getElementById('changeteam').onclick=()=>{ teamSearch=''; renderTeamPicker(); };
  stage.querySelectorAll('#tsub .tab').forEach(b=>{b.onclick=()=>{teamView=b.dataset.tv;tq=null;tlast=null;renderTeam();};});
  if(teamView==='quiz')wireTeamQuiz(t);
  bindSrcLinks(stage);
}

function renderTeamPicker(){
  const q=teamSearch.trim().toLowerCase();
  const list=TEAMS.teams.filter(t=>!q||t.name.toLowerCase().includes(q));
  let html='<div class="tbanner">__TEAMPICKERBANNER__</div>'+
    '<input class="picker-search" id="psearch" type="text" placeholder="Search teams…" aria-label="Search teams" value="'+esc(teamSearch)+'" />'+
    '<div class="teamlist">'+
      list.map(t=>'<button class="fchip" data-team="'+esc(t.name)+'">'+teamLabel(t.name)+'</button>').join('')+
    '</div>'+
    (list.length?'':'<div class="empty">No teams match “'+esc(teamSearch)+'”.</div>');
  stage.innerHTML=html;
  const inp=document.getElementById('psearch');
  inp.oninput=()=>{ teamSearch=inp.value; const pos=inp.selectionStart; renderTeamPicker(); const ni=document.getElementById('psearch'); ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(e){} };
  stage.querySelectorAll('.teamlist .fchip').forEach(b=>{b.onclick=()=>{ setFavTeam(b.dataset.team); teamView='insights'; teamSearch=''; renderTeam(); };});
}`;

/** Stylesheet block for the themed tab (appended before the pack's extraCss
 *  ONLY when teamTheming is set — an unset pack's stylesheet is untouched). */
const THEME_CSS = String.raw`
  /* ---- Team theming (opt-in; nations only; decorative band + tinted banner) ---- */
  .natband{height:6px;border-radius:3px;margin:10px 0 0}
  .natband.inset{box-shadow:inset 0 0 0 1px var(--surface)}
  .natbanner{background:var(--teamDim);border-radius:0 0 12px 12px;padding:14px 16px 15px;margin:0 0 4px}
  .natbanner .teamhead{margin:0 0 8px}
  .natlead{font-size:15px;line-height:1.5;font-weight:600;color:var(--text)}
  .nation .btn.team{color:var(--onTeam)}`;

/** Bake the validated nation table into the client-side lookup: the rgba
 *  banner tint and the band gradient are precomputed HERE, at build time —
 *  the browser only ever reads finished strings. */
function themeChunks(theming: AppShellConfig['teamTheming']): { consts: string; css: string } {
  if (!theming) return { consts: '', css: '' };
  const baked: Record<string, { a: string; d: string; o: string; g: string; i?: 1 }> = {};
  for (const [name, n] of Object.entries(theming.nations)) {
    const rgb = hexToRgb(n.accent)!; // parseability already gated
    const dir = n.vband ? '90deg' : '180deg';
    const len = n.band.length;
    const stops = n.band
      .map((c, i) => `${c} ${((i / len) * 100).toFixed(1)}% ${(((i + 1) / len) * 100).toFixed(1)}%`)
      .join(', ');
    baked[name] = {
      a: n.accent,
      d: `rgba(${rgb.join(',')},0.14)`,
      o: n.onAccent,
      g: `linear-gradient(${dir}, ${stops})`,
      ...(n.inset ? { i: 1 as const } : {}),
    };
  }
  const consts =
    `\n// ---- Team theming (editorial nation colors, AA-gated at build; see\n` +
    `//      teamTheming on the pack). Keys are artifact team names; a name\n` +
    `//      with no entry renders unthemed — an allowlist, not a derivation. ----\n` +
    `const NATION_THEME=${JSON.stringify(baked)};`;
  return { consts, css: THEME_CSS };
}

const DEFAULT_ON_ACCENT = {
  accent: '#06121f',
  practice: '#0c0a1a',
  team: '#04181b',
  today: '#2a0c19',
};

const DEFAULT_BANK_REFRESH_NOTE = 'The bank refreshes as the tournament plays on.';

const DEFAULT_TAB_LABELS = { daily: 'Daily', today: 'Today', practice: 'Practice', team: 'My Team' };

const DEFAULT_ROUTES = { today: '/today', practice: '/practice', team: '/my-team' };

const DEFAULT_RECORD_GRID_COLS = 4;

/** Single-row result line (scoreline left, note/source right). */
const DEFAULT_RESLINE_CSS = String.raw`  .resline{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--surface)}
  .resline:first-of-type{border-top:0}
  .resline .sl{font-size:14px}
  .resline .ed{font-size:11px;color:var(--text3);white-space:nowrap}`;

// The two Today-tab copy defaults below are the ORIGINAL SOCCER VALUES —
// kept as defaults so the first pack stays byte-identical; any sport that
// uses the standard renderToday should set its own copy.todayIntro /
// copy.todayNoMatches rather than inherit these.
const DEFAULT_TODAY_INTRO =
  'Today’s World Cup fixtures with validated head-to-head history, each side’s record, a matchup quiz, and a personal pick’em. Saved on this device only — no account, no server.';
const DEFAULT_TODAY_NO_MATCHES = 'No World Cup matches today';

// Assent-line default: the umbrella terms URL that every sibling pack's
// footer already links (the umbrella app serves the same page at this URL).
const DEFAULT_TERMS_URL = 'https://www.scorewit.com/terms';

// ---------- Post-round continue strip (see FamilyConfig) ----------

// Family URLs are emitted into href attributes unescaped — hold them to a
// shape that cannot break out of the attribute or downgrade the scheme.
const FAMILY_URL_RE = /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9/_-]*)?$/;

// Canonical continue-strip display labels, keyed by the sibling's URL path.
// The strip names the SPORT, not the pack codename — "Box-Box", "Cover Drive",
// "Fall Classic" are internal chips, not explanations. These strings QUOTE the
// founder's copy deck (content/hub-copy.json on extra-time main, the naming
// AUTHORITY): each is a card's `sport` line, verified against the deck on
// 2026-08-05. This table only mirrors the deck; the deck decides, not this
// table — if the two ever disagree, that is a halt-and-report condition, never
// a silent pick here. A pack supplies its own FamilyGame.name (kept for its
// validation contract), but the display label the user sees comes from HERE.
const FAMILY_LABELS: Record<string, string> = {
  '/worldcup': 'Soccer · World Cup',
  '/f1': 'Formula 1',
  '/footyphoria': 'English Football',
  // Backwards-compatible for packs pinned before brief 0014. Public links
  // should use /footyphoria; the origin owns the permanent /topflight move.
  '/topflight': 'English Football',
  '/cricket': 'Cricket · World Cup',
  '/gridiron': 'American Football',
  '/baseball': 'Baseball',
  '/superover': 'T20 Cricket · India',
};

/** The sport-first display label for a sibling, derived from its URL path.
 *  Fail-closed: the continue strip names only the seven portfolio games, so an
 *  unmapped path is a build-time error — never a silent fallback to a codename
 *  (a codename leaking to users is exactly the bug this table closes). Adding
 *  an eighth game means adding it to FAMILY_LABELS in the same change. */
function familyLabel(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
  const label = FAMILY_LABELS[path];
  if (!label) {
    throw new Error(
      `family: no canonical label for path "${path}" (from "${url}") — the continue ` +
        `strip names only the seven portfolio games; add it to FAMILY_LABELS`
    );
  }
  return label;
}

/** The `const FAMILY = …` client value: validated JSON, or "null" when unset. */
function familyConsts(family: FamilyConfig | undefined, storagePrefix: string): string {
  if (!family) return 'null';
  if (!family.heading.trim()) throw new Error('family: empty heading');
  if (!family.hub.label.trim()) throw new Error('family: empty hub.label');
  if (!FAMILY_URL_RE.test(family.hub.url)) {
    throw new Error(`family: hub.url must be a plain absolute https URL, got "${family.hub.url}"`);
  }
  if (!family.games.length) throw new Error('family: games must be non-empty');
  for (const g of family.games) {
    if (!g.name.trim() || !g.storagePrefix.trim()) {
      throw new Error(`family: empty name/storagePrefix in games`);
    }
    if (!FAMILY_URL_RE.test(g.url)) {
      throw new Error(`family ${g.name}: url must be a plain absolute https URL, got "${g.url}"`);
    }
    if (g.storagePrefix === storagePrefix) {
      throw new Error(`family ${g.name}: the pack itself must not be in games (self is excluded)`);
    }
  }
  return JSON.stringify({
    heading: family.heading,
    hub: family.hub,
    // Display name is the canonical sport-first label (see FAMILY_LABELS), not
    // the pack-supplied codename — the strip explains, it does not tag.
    games: family.games.map((g) => ({ name: familyLabel(g.url), url: g.url, prefix: g.storagePrefix })),
  });
}

// ---------- Opt-in post-answer entity links (see SportPack.entityLinks) ----------

/** Pack-supplied map from entity display names — exactly as they appear in
 *  validated fact/insight strings — to the pack's SEO page paths (SeoPage.path
 *  coordinates: root-relative, no leading slash). `pairs` keys are the two
 *  display names sorted and joined with '|'; the value is the pair's
 *  head-to-head page path. */
export interface EntityLinkMap {
  entities: Record<string, string>;
  pairs?: Record<string, string>;
}

/** Existence guard: keep only entries whose target is an emitted SEO page
 *  path. An unresolvable entity renders as plain text — never a dead link. */
export function guardEntityLinks(
  map: EntityLinkMap,
  emittedPaths: Set<string>
): EntityLinkMap {
  const keep = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).filter(([, p]) => emittedPaths.has(p)));
  return {
    entities: keep(map.entities),
    ...(map.pairs ? { pairs: keep(map.pairs) } : {}),
  };
}

// Entity paths are emitted into href attributes unescaped — hold them to the
// SeoPage.path shape (root-relative page path; no scheme/host/query/quote).
const ENTITY_PATH_RE = /^[a-z0-9][A-Za-z0-9/_-]*$/;

/** The `const ENTITYLINKS = …` client value: validated JSON with hrefs
 *  prefixed under basePath, or "null" when unset. Pair keys are re-sorted
 *  defensively so the client's sorted lookup always hits. */
function entityLinksConsts(
  links: EntityLinkMap | undefined,
  basePath: string | undefined
): string {
  if (!links) return 'null';
  const prefix = basePath ?? '';
  const ser = (o: Record<string, string>, what: string, sortKey: boolean) => {
    const out: Record<string, string> = {};
    for (const [name, p] of Object.entries(o)) {
      if (!name.trim()) throw new Error(`entityLinks: empty ${what} name`);
      if (!ENTITY_PATH_RE.test(p)) {
        throw new Error(
          `entityLinks ${what} "${name}": path must be a plain root-relative page path, got "${p}"`
        );
      }
      const key = sortKey ? name.split('|').sort().join('|') : name;
      out[key] = `${prefix}/${p}`;
    }
    return out;
  };
  // <-escape so a name can never terminate the inline <script>.
  return JSON.stringify({
    entities: ser(links.entities, 'entity', false),
    pairs: ser(links.pairs ?? {}, 'pair', true),
  }).replace(/</g, '\\u003c');
}


// ---------- Opt-in cookieless engagement analytics (see AnalyticsConfig) ----------
// The five DEFAULT_ANALYTICS_* strings below are the ORIGINAL inline wiring,
// byte-for-byte: with cfg.analytics unset the shell renders exactly as before
// (the pre-existing Vercel snippet + daily_completed/shared events). Setting
// analytics swaps the provider script and emits the anonymous engagement
// events (start / completion / return / share / practice) instead — still
// NO cookie, NO tracking id, NO PII, ever.

const DEFAULT_ANALYTICS_HEAD = String.raw`<!-- Vercel Web Analytics (cookieless; official static-HTML snippet). The queue
     stub makes window.va safe to call before/without the script loading. -->
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>`;

const DEFAULT_ANALYTICS_JS = String.raw`// ---- Vercel Web Analytics custom events (cookieless, non-PII) ----
// Guarded: no-ops when analytics is unavailable (offline / local / script
// blocked) and never throws. Event data is minimal and non-identifying.
function track(name,data){try{if(typeof window.va==='function')window.va('event',{name:name,data:data||{}});}catch(e){}}`;

const DEFAULT_TRACK_ROUND = String.raw`    // score bucket only (e.g. "500-600") — never anything identifying
    const b=Math.min(Math.floor(total/100),5);
    track('daily_completed',{score_bucket:(b*100)+'-'+((b+1)*100)});`;

const DEFAULT_TRACK_SHARE = `track('shared');`;

const DEFAULT_TRACK_PRACTICE = '';

// The analytics-off switch (CNIL/UK "objection mechanism" — see legal.ts):
// one localStorage flag, checked before ANY event on every provider. The
// provider script is only injected when the flag is unset, so an opted-out
// visit makes zero analytics requests of any kind.
const ANOFF_CHECK = `(function(){try{return localStorage.getItem('__STOREPREFIX__.analyticsOff')==='1';}catch(e){return false;}})()`;

const PLAUSIBLE_HEAD = (domain: string) => `<!-- Plausible Analytics (cookieless, no PII; anonymous aggregate events only).
     The queue stub makes window.plausible safe to call before/without the script loading.
     The loader honors the analytics-off switch: opted out = the script is never fetched. -->
<script>window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
if(!${ANOFF_CHECK}){var s=document.createElement('script');s.defer=true;s.setAttribute('data-domain','${domain}');s.src='https://plausible.io/js/script.js';document.head.appendChild(s);}</script>`;

const VERCEL_HEAD = `<!-- Vercel Web Analytics (cookieless). The queue stub makes window.va safe to
     call before/without the script loading. The loader honors the analytics-off
     switch: opted out = the script is never fetched. -->
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
if(!${ANOFF_CHECK}){var s=document.createElement('script');s.defer=true;s.src='/_vercel/insights/script.js';document.head.appendChild(s);}</script>`;

const CUSTOM_HEAD = `<!-- Cookieless event beacon (first-party endpoint; no third-party script, no cookies, no PII). -->`;

// Settings card (Stats panel) — the toggle the privacy page promises. Inline
// styles only: the shared stylesheet must not change for analytics-unset apps.
const SETTINGS_CARD_JS = `  // Settings — the analytics-off switch the privacy page promises: stops even
  // the anonymous aggregate counts from this browser (all providers).
  stage.insertAdjacentHTML('beforeend','<div class="card"><h3>Settings</h3>'+
    '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">'+
    '<input type="checkbox" id="anoff"'+(analyticsOff()?' checked':'')+' style="margin:3px 0 0;accent-color:var(--accent)" />'+
    '<span style="font-size:14px">Don&#39;t count me in analytics'+
    '<br /><span style="color:var(--text3);font-size:12px">Analytics here are cookieless and anonymous either way; this switch stops even those aggregate counts from this browser.</span></span></label></div>');
  document.getElementById('anoff').onchange=e=>setAnalyticsOff(e.target.checked);
`;

/** The shell substitutions for a given analytics config (or its absence). */
/** Calendar-spotlight chunks (opt-in; every piece '' when unset so the shell
 *  renders byte-identically). The runtime logic ships ONLY for adopters:
 *  spotlightState/spotlightHtml/renderSpotlight (banner) and, when cfg.quiz
 *  is set, raceWeekAdjust/raceWeekBadge (the guaranteed venue question).
 *  Deterministic: pure functions of the daily key + committed artifacts;
 *  the swap's seeded pick reuses the shell's mulberry32/hashString. */
const SPOTLIGHT_CSS =
  '\n  .spot{display:block;margin:10px 0 2px;padding:9px 12px;border:1px solid var(--accent);border-radius:10px;background:var(--accentDim);color:var(--accent);font-size:14px;line-height:1.35;font-weight:600}' +
  '\n  a.spot{text-decoration:none}a.spot:hover{filter:brightness(1.1)}' +
  '\n  .rwchip{display:inline-block;margin:0 0 8px;padding:2px 10px;border:1px solid var(--accent);border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--accent);background:var(--accentDim)}';

function spotlightChunks(cfg: CalendarSpotlightConfig | undefined, client: PackClientJs) {
  if (!cfg) return { js: '', hook: '', dailySwap: '', qBadge: '', css: '' };
  if (cfg.upcomingHref !== undefined && !/^\/(?!\/)[a-z0-9][a-z0-9/_-]*$/.test(cfg.upcomingHref)) {
    throw new Error(
      `calendarSpotlight.upcomingHref must be a plain root-absolute path (got "${cfg.upcomingHref}")`
    );
  }
  // Generate the incumbent div verbatim for adopters that do not opt into a
  // destination. This keeps the new capability genuinely additive.
  const upcomingBanner = cfg.upcomingHref
    ? `const t=${JSON.stringify(cfg.upcomingText)}.split('{event}').join(esc(st.info.event)).split('{days}').join(days);\n  ` +
      `return '<a class="spot" href="'+${JSON.stringify(cfg.upcomingHref)}+'">'+t+'</a>';`
    : `return '<div class="spot">'+${JSON.stringify(cfg.upcomingText)}.split('{event}').join(esc(st.info.event)).split('{days}').join(days)+'</div>';`;
  const bannerJs = `

// ---- calendar spotlight (opt-in): deterministic event-week banner ----
${client.spotlight}
function rwDayNum(k){const p=k.split('-').map(Number);return Date.UTC(p[0],p[1]-1,p[2])/86400000;}
function spotlightState(key){
  let info=null;
  for(const d of MATCHDAY.days){for(const f of d.fixtures){const s=spotlightInfo(f);if(s){info=s;break;}}if(info)break;}
  if(!info||key>info.end)return null;
  if(key>=info.start)return{phase:'active',info:info};
  return{phase:'upcoming',info:info,days:rwDayNum(info.end)-rwDayNum(key)};
}
function spotlightHtml(key){
  const st=spotlightState(key);if(!st)return '';
  if(st.phase==='active'){
    const tpl=st.info.hubPath?${JSON.stringify(cfg.activeHtml)}:${JSON.stringify(cfg.activeTextNoHub ?? cfg.activeHtml)};
    const t=tpl.split('{event}').join(esc(st.info.event)).split('{venue}').join(esc(st.info.venue));
    return st.info.hubPath?'<a class="spot" href="'+st.info.hubPath+'">'+t+'</a>':'<div class="spot">'+t+'</div>';
  }
  const days=st.days===1?'1 day':st.days+' days';
  ${upcomingBanner}
}
function renderSpotlight(){
  const sub=document.getElementById('sub');if(!sub)return;
  let el=document.getElementById('spotbar');
  if(!el){el=document.createElement('div');el.id='spotbar';sub.insertAdjacentElement('afterend',el);}
  const h=mode==='daily'?spotlightHtml(currentDailyKey()):'';
  el.innerHTML=h;el.style.display=h?'':'none';
}`;
  const quizJs = !cfg.quiz
    ? ''
    : `
// ---- guaranteed venue question: during the window the daily six carries
// ---- exactly ONE venue-tied question. No natural pick -> the LAST slot
// ---- (lowest salience; the round's opening flow is preserved) swaps for a
// ---- seeded venue pick; surplus natural picks yield to their own bucket
// ---- permutation's next non-tied question. Pool < min -> silent skip.
let RW_ID=null;
function rwPerm(bank,k){const pool=bank.questions.filter(q=>q.difficulty+'/'+q.type===k).sort((a,b)=>a.id<b.id?-1:1);return shuffle(mulberry32((hashString(k)^bank.seed)>>>0),pool);}
function raceWeekAdjust(out,key,bank){
  RW_ID=null;
  const st=spotlightState(key);
  if(!st||st.phase!=='active'||!st.info.quizIds)return;
  const byId={};for(const q of bank.questions)byId[q.id]=q;
  const pool=st.info.quizIds.map(id=>byId[id]).filter(Boolean).sort((a,b)=>a.id<b.id?-1:1);
  if(pool.length<${JSON.stringify(cfg.quiz.min)})return;
  const tied={};for(const q of pool)tied[q.id]=1;
  const naturals=[];for(let i=0;i<out.length;i++)if(tied[out[i].id])naturals.push(i);
  if(naturals.length===0){
    const used={};for(const q of out)used[q.id]=1;
    const cands=pool.filter(q=>!used[q.id]);
    if(!cands.length)return;
    const r=mulberry32((hashString('raceweek/'+key)^bank.seed)>>>0);
    const pick=cands[Math.floor(r()*cands.length)];
    out[out.length-1]=pick;RW_ID=pick.id;return;
  }
  RW_ID=out[naturals[0]].id;
  for(let j=1;j<naturals.length;j++){
    const i=naturals[j];const q=out[i];const k=q.difficulty+'/'+q.type;
    const perm=rwPerm(bank,k);const used={};for(const x of out)used[x.id]=1;
    let start=0;for(let s=0;s<perm.length;s++)if(perm[s].id===q.id){start=s;break;}
    for(let step=1;step<=perm.length;step++){
      const cand=perm[(start+step)%perm.length];
      if(!tied[cand.id]&&!used[cand.id]){out[i]=cand;break;}
    }
  }
}
function raceWeekBadge(q){return mode==='daily'&&RW_ID&&q.id===RW_ID?'<span class="rwchip">'+${JSON.stringify(cfg.quiz.badge)}+'</span>':'';}`;
  return {
    js: bannerJs + quizJs,
    hook: 'renderSpotlight();',
    dailySwap: cfg.quiz ? 'raceWeekAdjust(out,key,bank);' : '',
    qBadge: cfg.quiz ? 'raceWeekBadge(q)+' : '',
    css: SPOTLIGHT_CSS,
  };
}

function analyticsChunks(a: AnalyticsConfig | undefined, sport: string) {
  if (!a) {
    return {
      head: DEFAULT_ANALYTICS_HEAD,
      js: DEFAULT_ANALYTICS_JS,
      trackStart: '',
      trackRound: DEFAULT_TRACK_ROUND,
      trackShare: DEFAULT_TRACK_SHARE,
      trackPractice: DEFAULT_TRACK_PRACTICE,
      settings: '',
    };
  }
  let head: string;
  let impl: string;
  // plausible: mirror the official plausible_ignore flag so an already-loaded
  // script stops auto-pageviews the moment the switch flips — not next load.
  let mirror = '';
  if (a.provider === 'plausible') {
    if (!a.domain) throw new Error('analytics.provider "plausible" requires analytics.domain');
    head = PLAUSIBLE_HEAD(a.domain);
    impl = `if(typeof window.plausible==='function')window.plausible(name,{props:data||{}});`;
    mirror = `try{v?localStorage.setItem('plausible_ignore','true'):localStorage.removeItem('plausible_ignore');}catch(e){}`;
  } else if (a.provider === 'vercel') {
    head = VERCEL_HEAD;
    impl = `if(typeof window.va==='function')window.va('event',{name:name,data:data||{}});`;
  } else if (a.provider === 'custom') {
    if (!a.endpoint) throw new Error('analytics.provider "custom" requires analytics.endpoint');
    const ep = JSON.stringify(a.endpoint);
    head = CUSTOM_HEAD;
    impl =
      `var b=JSON.stringify({name:name,props:data||{}});` +
      `if(navigator.sendBeacon)navigator.sendBeacon(${ep},b);` +
      `else fetch(${ep},{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:b});`;
  } else {
    throw new Error(`unknown analytics.provider: ${(a as AnalyticsConfig).provider}`);
  }
  const js = `// ---- Engagement events (${a.provider}; cookieless, anonymous, no PII) ----
// Aggregate counters only: no cookie, no tracking id, no fingerprint — the
// payload carries nothing identifying. The streak bucket is the cookieless
// retention proxy. Guarded: no-ops when the provider is unavailable
// (offline / local / script blocked) and never throws.
// The analytics-off switch (Settings, on the Stats panel) is checked before
// EVERY event; the head loader also skips the provider script entirely.
const SPORT=${JSON.stringify(sport)};
const ANOFF_KEY='__STOREPREFIX__.analyticsOff';
// These two local-only values contain day keys and nothing else. They make
// the once-per-round start and most-recent-return semantics survive reloads
// without a cookie, account or analytics identifier.
const AN_STARTED_KEY='__STOREPREFIX__.analyticsStartedDay';
const AN_LAST_COMPLETED_KEY='__STOREPREFIX__.analyticsLastCompletedDay';
function analyticsOff(){try{return localStorage.getItem(ANOFF_KEY)==='1';}catch(e){return false;}}
function setAnalyticsOff(v){try{v?localStorage.setItem(ANOFF_KEY,'1'):localStorage.removeItem(ANOFF_KEY);}catch(e){}${mirror}}
function streakBucket(s){return s>=30?'30+':s>=7?'7-29':s>=2?'2-6':'1';}
function track(name,data){if(analyticsOff())return;try{${impl}}catch(e){}}
function analyticsDayKey(k){return typeof k==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(k)&&dateKeyFromDayNum(dayNumber(k))===k;}
function trackDailyStart(key){
  try{if(localStorage.getItem(AN_STARTED_KEY)===key)return;localStorage.setItem(AN_STARTED_KEY,key);}catch(e){}
  track('round_started',{sport:SPORT});
}
function previousDailyCompletion(history,key){
  let best='';
  try{const k=localStorage.getItem(AN_LAST_COMPLETED_KEY);if(analyticsDayKey(k)&&k<key)best=k;}catch(e){}
  for(const k of Object.keys(history||{}))if(analyticsDayKey(k)&&k<key&&(!best||k>best))best=k;
  return best||null;
}
function returnGapBucket(previous,key){const n=dayNumber(key)-dayNumber(previous);return n>=7?'7+':n>=2?'2-6':'1';}
function trackDailyCompletion(history,key,numCorrect,streak){
  const previous=previousDailyCompletion(history,key);
  track('round_completed',{sport:SPORT,streak_length:streakBucket(streak),num_correct:numCorrect});
  if(previous)track('returning_round_completed',{sport:SPORT,gap_bucket:returnGapBucket(previous,key)});
  try{localStorage.setItem(AN_LAST_COMPLETED_KEY,key);}catch(e){}
}
// Share-visit (SHARE V2): a bare #s fragment marks an inbound shared link —
// count it once with the low-cardinality sport only, then clean the address bar.
if(location.hash==='#s'){track('share-visit',{sport:SPORT});try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}}`;
  return {
    head,
    js,
    trackStart: `\n  if(results.length===0)trackDailyStart(currentDailyKey());`,
    trackRound:
      `    // anonymous aggregates only — buckets, correct count, sport; no id\n` +
      `    trackDailyCompletion(h,key,results.filter(p=>p>=100).length,currentStreak(h,key));`,
    trackShare: `track('result_shared',{sport:SPORT,streak_length:streakBucket(streak)});`,
    trackPractice: `track('practice_played',{sport:SPORT});`,
    settings: SETTINGS_CARD_JS,
  };
}

/** The app shell with every token filled in. Refuses (throws) when the
 *  pack's palette fails WCAG AA on any pair the stylesheet renders — the
 *  accessibility guarantee is computed at build time (see src/contrast.ts). */
/** The brand the render actually uses: the pack's own brand, or — when the
 *  almanac theme is set — the same brand with the palette, 404 palette,
 *  theme color, and on-accent text swapped to the theme's paper tokens.
 *  Everything else (name, URL, mark, grid shape, extraCss) stays the
 *  pack's. Theme unset = the exact same object (byte-identical path). */
export function effectiveBrand(cfg: AppShellConfig): Brand {
  const t = cfg.theme;
  if (!t) return cfg.brand;
  if (t.name !== 'almanac') {
    throw new Error(`theme: unknown theme "${(t as { name: string }).name}" (only 'almanac' exists)`);
  }
  return {
    ...cfg.brand,
    themeColor: ALMANAC_TOKENS.paper,
    paletteCss: almanacPaletteCss(t.accent),
    notFoundPaletteCss: almanacNotFoundPaletteCss(t.accent),
    onAccent: ALMANAC_ON_ACCENT,
  };
}

const YESTERDAY_HREF_RE = /^(https:\/\/[a-z0-9.-]+)?\/[A-Za-z0-9/_-]*$/;

/** The opt-in "yesterday's round" link block + its CSS — both empty strings
 *  when unset, so the tokens erase with zero residue. */
function yesterdayParts(y: AppShellConfig['yesterdayLink']): { html: string; css: string } {
  if (!y) return { html: '', css: '' };
  if (!y.label.trim()) throw new Error('yesterdayLink: empty label');
  if (/[<>]/.test(y.label)) throw new Error('yesterdayLink: label is plain text — markup is not allowed');
  if (!YESTERDAY_HREF_RE.test(y.href)) {
    throw new Error(`yesterdayLink: href must be a root-absolute path or https URL (got "${y.href}")`);
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return {
    html: `\n  <div class="ylink"><a href="${esc(y.href)}">${y.label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</a></div>`,
    css:
      '\n  .ylink{margin-top:14px;text-align:center;font-size:13px}' +
      '\n  .ylink a{color:var(--text2);font-weight:600;text-decoration:underline;text-underline-offset:2px}' +
      '\n  .ylink a:hover{color:var(--text)}',
  };
}

export function renderAppHtml(cfg: AppShellConfig): string {
  const { copy, client, config, data } = cfg;
  const brand = effectiveBrand(cfg);
  const basePath = config.basePath;
  if (basePath !== undefined) assertValidBasePath(basePath, brand.appUrl);
  assertContrast(
    checkAppPaletteContrast(brand.paletteCss, brand.onAccent ?? DEFAULT_ON_ACCENT),
    'app shell'
  );
  if (cfg.teamTheming) {
    if (client.renderTeam) {
      throw new Error(
        'teamTheming requires the standard My-Team flow — remove the clientJs.renderTeam override or the theming opt-in'
      );
    }
    assertContrast(
      checkNationThemeContrast(cfg.teamTheming.nations, brand.paletteCss),
      'team theming'
    );
  }
  if (cfg.calendarSpotlight && !client.spotlight) {
    throw new Error(
      'calendarSpotlight requires a clientJs.spotlight chunk defining spotlightInfo(fixture)'
    );
  }
  const theme = themeChunks(cfg.teamTheming);
  const analytics = analyticsChunks(cfg.analytics, cfg.sport ?? '');
  const spotlight = spotlightChunks(cfg.calendarSpotlight, client);
  const yesterday = yesterdayParts(cfg.yesterdayLink);
  let tpl = HTML;
  // Optional presentation only. Absent settings leave the incumbent shell
  // byte-identical; question objects, scoring and day selection stay intact.
  const plainCopy = (s: string, field: string) => {
    if (typeof s !== 'string' || !s.trim() || /[<>]/.test(s)) {
      throw new Error(`${field}: expected non-empty plain text`);
    }
  };
  if (copy.topicLabels) {
    for (const [key, label] of Object.entries(copy.topicLabels)) {
      plainCopy(key, 'topicLabels key');
      plainCopy(label, 'topicLabels label');
    }
    // Opted-in packs must not silently ship an unlabelled new bank topic.
    // Keep the client fallback for unexpected runtime values and leave
    // unconfigured packs entirely untouched (including opaque bank inputs).
    const bank = data.bank as { questions?: unknown } | null;
    if (!bank || !Array.isArray(bank.questions)) {
      throw new Error('topicLabels: expected a bank.questions array');
    }
    const topics = bank.questions.map((q: unknown, i: number) => {
      const topic = (q as { topic?: unknown } | null)?.topic;
      if (typeof topic !== 'string' || !topic.trim()) {
        throw new Error(`topicLabels: question ${i} has no valid topic`);
      }
      return topic;
    });
    const missing = [...new Set(topics)].filter(topic =>
      !Object.prototype.hasOwnProperty.call(copy.topicLabels, topic)).sort();
    if (missing.length) {
      throw new Error(`topicLabels: missing labels for bank topics: ${missing.join(', ')}`);
    }
    const labels = JSON.stringify(copy.topicLabels).replace(/</g, '\\u003c');
    tpl = replaceExactlyOnce(tpl, "function chip(q){", `const TOPIC_LABELS=${labels};\nfunction topicLabel(q){return Object.prototype.hasOwnProperty.call(TOPIC_LABELS,q.topic)?TOPIC_LABELS[q.topic]:q.topic.replace(/_/g,' ');}\nfunction chip(q){`, 'consumer topic labels');
    tpl = replaceExactlyOnce(tpl, "+q.topic.replace(/_/g,' ')+", '+esc(topicLabel(q))+', 'escaped topic label');
  }
  if (copy.dailyReturnCue) {
    const cue = copy.dailyReturnCue;
    plainCopy(cue.upcoming, 'dailyReturnCue.upcoming');
    plainCopy(cue.available, 'dailyReturnCue.available');
    if (cue.upcoming.split('{date}').length !== 2) {
      throw new Error('dailyReturnCue.upcoming: expected exactly one {date}');
    }
    const js = `const DAILY_RETURN_CUE=${JSON.stringify(cue).replace(/</g, '\\u003c')};
function nextDailyDate(key){const p=key.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]+1);}
function dailyReturnHtml(now=new Date()){
  if(mode!=='daily')return '';
  const next=nextDailyDate(currentDailyKey());
  const message=now>=next?DAILY_RETURN_CUE.available:DAILY_RETURN_CUE.upcoming.replace('{date}',todayKey(next));
  return '<div class="note daily-return">'+esc(message)+'</div>';
}
`;
    tpl = replaceExactlyOnce(tpl, 'function renderResult(){', js + 'function renderResult(){', 'daily return cue helpers');
    tpl = replaceExactlyOnce(tpl, "'<div class=\"note\">__RESULTNOTE__</div>'+", "'<div class=\"note\">__RESULTNOTE__</div>'+dailyReturnHtml()+", 'daily result cue');
  }
  // OPT-IN basePath: rewrite the template's root-anchored emissions with the
  // exact-once discipline — BEFORE pack shellPatches, so a patch that anchors
  // on the pre-rewrite text fails loudly instead of double-editing. Unset =
  // the template text is untouched (existing patch anchors stay valid).
  if (basePath) {
    const edits: [string, string, string][] = [
      [
        `<link rel="canonical" href="__APPURL__/"`,
        `<link rel="canonical" href="__APPURL__"`,
        'app canonical root',
      ],
      [
        `<link rel="icon" href="icon.svg"`,
        `<link rel="icon" href="${basePath}/icon.svg"`,
        'head icon link',
      ],
      [
        `<link rel="apple-touch-icon" href="apple-touch-icon.png"`,
        `<link rel="apple-touch-icon" href="${basePath}/apple-touch-icon.png"`,
        'head apple-touch-icon link',
      ],
      [
        `<link rel="manifest" href="manifest.webmanifest"`,
        `<link rel="manifest" href="${basePath}/manifest.webmanifest"`,
        'head manifest link',
      ],
      [
        `const ROUTE_FOR_MODE={daily:'/',`,
        `const ROUTE_FOR_MODE={daily:'${basePath}',`,
        'daily route',
      ],
      [
        `const MODE_FOR_ROUTE={'/':'daily',`,
        `const MODE_FOR_ROUTE={'${basePath}':'daily',`,
        'daily route (reverse map)',
      ],
    ];
    for (const [find, replace, what] of edits) {
      tpl = replaceExactlyOnce(tpl, find, replace, what);
    }
  }
  // SHARE V2 (opt-in via client.shareV2): replace the whole incumbent
  // buildShareText with the three-line format. Runs BEFORE the theme edits
  // (the incumbent 🟩🟨🟥 bytes are the anchor) and BEFORE pack shellPatches
  // — a patch anchoring the retired share code fails loudly, which is the
  // desired signal that its seam has been superseded. Unset = untouched.
  const v2 = client.shareV2;
  if (v2) {
    if (client.shareLine) {
      throw new Error('shareV2 and shareLine are mutually exclusive (v2 is exactly three lines)');
    }
    if (!v2.shareName?.trim()) throw new Error('shareV2.shareName must be a non-empty string');
    if (!v2.shareIcon?.trim()) throw new Error('shareV2.shareIcon must be a non-empty string');
    if (!Array.isArray(v2.rankLadder) || v2.rankLadder.length !== 6 || v2.rankLadder.some((r) => !r?.trim())) {
      throw new Error('shareV2.rankLadder must be exactly 6 non-empty strings (worst → perfect)');
    }
    // Scheme-less share URL: the pack's appUrl minus scheme and www.
    const shareUrl = brand.appUrl.replace(/^https?:\/\/(www\.)?/, '');
    tpl = replaceExactlyOnce(
      tpl,
      `function buildShareText(streak){
  // Spoiler-free: one square per question, score, streak, link. No question content.
  const grid=results.map(p=>p>=100?'🟩':p>0?'🟨':'🟥').join('');
  const lines=[APP_NAME+' '+currentDailyKey(), grid+' '+total+'/'+(questions.length*100)];
  if(streak>1) lines.push('🔥 '+streak+'-day streak');
__SHARELINE__  if(APP_URL) lines.push(APP_URL);
  return lines.join('\\n');
}`,
      `// ---- SHARE V2 (see share-v2.test.ts) — three spoiler-free lines:
// identity + round number, tier grid + score + earned rank title, streak
// day + scheme-less link carrying the #s share-visit fragment. Round #1 =
// the pack's daily epoch; the shell's existing day clock, no new clocks.
const SHARE_NAME=${JSON.stringify(v2.shareName)};
const SHARE_ICON=${JSON.stringify(v2.shareIcon)};
const RANKS=${JSON.stringify(v2.rankLadder)};
const SHARE_URL=${JSON.stringify(shareUrl)};
function roundNumber(){return dayNumber(currentDailyKey())+1;}
function rankTitle(sc){return sc>=600?RANKS[5]:RANKS[Math.min(4,Math.floor(sc/120))];}
function buildShareText(streak){
  const grid=results.map(p=>p>=100?'${RESULT_GLYPHS.correct}':p>0?'${RESULT_GLYPHS.partial}':'${RESULT_GLYPHS.wrong}').join('');
  return SHARE_ICON+' Scorewit '+SHARE_NAME+' #'+roundNumber()+'\\n'+
    grid+' '+total+'/'+(questions.length*100)+' · '+rankTitle(total)+'\\n'+
    '🔥 Day '+streak+' · beat me: '+SHARE_URL+'#s';
}
// ---- end SHARE V2 ----`,
      'shareV2 buildShareText'
    );
    // The end-of-round card shows the same earned title, above the streak chip.
    tpl = replaceExactlyOnce(
      tpl,
      `(streak>0?'<div class="streakchip">`,
      `'<div class="ranktitle">'+rankTitle(total)+'</div>'+(streak>0?'<div class="streakchip">`,
      'shareV2 end-of-round rank title'
    );
  }
  // RESULT PIPS unification (rides the almanac theme): the two result
  // surfaces the shell owns swap to the unified traffic tiers — share-line
  // glyphs and the end-of-round pip row (filled disc / filled disc /
  // 2.5px ring; CSS + colors in theme-almanac RESULT_TIERS). Exact-once, and
  // BEFORE pack shellPatches (same rule as basePath) so a patch anchoring
  // the pre-swap text fails loudly. Theme unset = untouched — the
  // byte-identity contract pinned in almanac-theme.test.ts. With shareV2 set
  // the glyph edit is skipped: v2 already emitted the tier glyphs.
  if (cfg.theme) {
    const edits: [string, string, string][] = [
      ...(v2
        ? []
        : ([[
            `const grid=results.map(p=>p>=100?'🟩':p>0?'🟨':'🟥').join('');`,
            `const grid=results.map(p=>p>=100?'${RESULT_GLYPHS.correct}':p>0?'${RESULT_GLYPHS.partial}':'${RESULT_GLYPHS.wrong}').join('');`,
            'share grid glyphs',
          ]] as [string, string, string][])),
      [
        `const squares=results.map(p=>p>=100?'🟩':p>0?'🟨':'🟥').join('');`,
        `const pips=results.map(p=>'<i class="rp '+(p>=100?'ok':p>0?'part':'no')+'"></i>').join('');`,
        'end-of-round pip row',
      ],
      [
        `'<div class="squares">'+squares+'</div>'+`,
        `'<div class="respips" role="img" aria-label="'+results.filter(p=>p>=100).length+' spot on, '+results.filter(p=>p>0&&p<100).length+' close, '+results.filter(p=>!p).length+' missed">'+pips+'</div>'+`,
        'end-of-round pip markup',
      ],
    ];
    for (const [find, replace, what] of edits) {
      tpl = replaceExactlyOnce(tpl, find, replace, what);
    }
  }
  for (const [find, replace] of client.shellPatches ?? []) {
    const n = tpl.split(find).length - 1;
    if (n !== 1) {
      throw new Error(`shellPatch must match exactly once (matched ${n}): ${find.slice(0, 80)}`);
    }
    tpl = tpl.split(find).join(replace);
  }
  // Tab routes: prefixed under basePath (unset = the same object, byte-identical).
  const baseRoutes = config.routes ?? DEFAULT_ROUTES;
  const routes = basePath
    ? {
        today: basePath + baseRoutes.today,
        practice: basePath + baseRoutes.practice,
        team: basePath + baseRoutes.team,
      }
    : baseRoutes;
  return tpl.replace('__BANK__', JSON.stringify(data.bank))
    .replace('__TEAMS__', JSON.stringify(data.teams))
    .replace('__MATCHDAY__', JSON.stringify(data.matchday))
    // split/join = replace-all (tsconfig lib predates String.replaceAll)
    .split('__ANALYTICSHEAD__').join(analytics.head)
    .split('__ANALYTICSJS__').join(analytics.js)
    .split('__TRACKSTART__').join(analytics.trackStart)
    .split('__TRACKROUND__').join(analytics.trackRound)
    .split('__TRACKSHARE__').join(analytics.trackShare)
    .split('__TRACKPRACTICE__').join(analytics.trackPractice)
    .split('__ANALYTICSSETTINGS__').join(analytics.settings)
    .split('__TERMSURL__').join(cfg.termsUrl ?? DEFAULT_TERMS_URL)
    .split('__FAMILY__').join(familyConsts(cfg.family, config.storagePrefix))
    // Post-answer entity links (unset = null; linkFact degrades to esc()).
    .split('__ENTITYLINKS__').join(entityLinksConsts(cfg.entityLinks, basePath))
    .split('__PACKCONSTS__').join(client.consts)
    .split('__PACKDECOR__').join(client.decorations)
    .split('__PACKTEAMCARDS__').join(client.teamCards)
    .split('__PACKTODAYCARDS__').join(client.todayCards)
    .split('__PACKTEAMHELPERS__').join(client.teamHelpers ?? DEFAULT_TEAM_HELPERS)
    .split('__ERALABEL__').join(client.eraLabel ?? DEFAULT_ERA_LABEL)
    .split('__RENDERTODAY__').join(client.renderToday ?? DEFAULT_RENDER_TODAY)
    // Before __TEAMPICKERBANNER__: the default team flow embeds that token.
    // Theming set (and no override — gated above) swaps in the themed flow.
    .split('__RENDERTEAM__').join(client.renderTeam ?? (cfg.teamTheming ? THEMED_RENDER_TEAM : DEFAULT_RENDER_TEAM))
    .split('__THEMECONSTS__').join(theme.consts)
    // Default '' erases the token — the incumbent share text, byte-identical.
    .split('__SHARELINE__').join(client.shareLine ?? '')
    // Calendar spotlight (all '' when the opt-in is unset — byte-identical).
    .split('__SPOTLIGHTJS__').join(spotlight.js)
    .split('__SPOTLIGHTHOOK__').join(spotlight.hook)
    .split('__DAILYSWAP__').join(spotlight.dailySwap)
    .split('__QBADGE__').join(spotlight.qBadge)
    .split('__BTNTEXTPRACTICE__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).practice)
    .split('__BTNTEXTTEAM__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).team)
    .split('__BTNTEXTTODAY__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).today)
    .split('__BTNTEXT__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).accent)
    .split('__BANKREFRESHNOTE__').join(copy.bankRefreshNote ?? DEFAULT_BANK_REFRESH_NOTE)
    .split('__TABDAILY__').join((copy.tabLabels ?? DEFAULT_TAB_LABELS).daily)
    .split('__TABTODAY__').join((copy.tabLabels ?? DEFAULT_TAB_LABELS).today)
    .split('__TABPRACTICE__').join((copy.tabLabels ?? DEFAULT_TAB_LABELS).practice)
    .split('__TABTEAM__').join((copy.tabLabels ?? DEFAULT_TAB_LABELS).team)
    .split('__ROUTETODAY__').join(routes.today)
    .split('__ROUTEPRACTICE__').join(routes.practice)
    .split('__ROUTETEAM__').join(routes.team)
    .split('__RECLISTCOLS__').join(String(brand.recordGridCols ?? DEFAULT_RECORD_GRID_COLS))
    .split('__RESLINECSS__').join(brand.resultLineCss ?? DEFAULT_RESLINE_CSS)
    .split('__YESTERDAY__').join(yesterday.html)
    .split('__EXTRACSS__').join(
      (cfg.theme ? almanacShellCss() : '') +
        // SHARE V2: the earned rank title on the end-of-round card (accent is
        // AA-gated on every rendered pair like all palette colors).
        (v2 ? '\n  .ranktitle{font-size:15px;font-weight:800;color:var(--accent);margin:2px 0 8px}\n' : '') +
        theme.css + spotlight.css + yesterday.css + (brand.extraCss ?? '')
    )
    .split('__APPNAME__').join(brand.appName)
    .split('__BRANDMARK__').join(brand.markSvg)
    .split('__THEMECOLOR__').join(brand.themeColor)
    .split('__PALETTE__').join(brand.paletteCss)
    .split('__EPOCHARGS__').join(config.epochUtcArgs)
    .split('__STOREPREFIX__').join(config.storagePrefix)
    .split('__TITLE__').join(copy.title)
    .split('__METADESC__').join(copy.metaDescription)
    .split('__OGTITLE__').join(copy.ogTitle)
    .split('__OGDESC__').join(copy.ogDescription)
    .split('__TWTITLE__').join(copy.twitterTitle)
    .split('__TWDESC__').join(copy.twitterDescription)
    .split('__SUBINITIAL__').join(copy.subInitial)
    .split('__FOOTERHTML__').join(copy.footerHtml)
    .split('__RESULTNOTE__').join(copy.resultNote)
    .split('__TEAMPICKERBANNER__').join(copy.teamPickerBanner)
    .split('__TODAYINTRO__').join(copy.todayIntro ?? DEFAULT_TODAY_INTRO)
    .split('__TODAYNONE__').join(copy.todayNoMatches ?? DEFAULT_TODAY_NO_MATCHES)
    .split('__TITLETODAY__').join(copy.titleToday)
    .split('__TITLEPRACTICE__').join(copy.titlePractice)
    .split('__TITLETEAM__').join(copy.titleTeam)
    .split('__APPURL__').join(brand.appUrl);
}

/** Branded 404 — served by the host for any unmatched route. Self-contained
 *  and minimal: same theme + inlined mark as the app, noindex, root-absolute
 *  URLs so it renders correctly at any request depth. */
export function renderNotFoundHtml(cfg: AppShellConfig): string {
  const brand = effectiveBrand(cfg);
  assertContrast(
    checkNotFoundPaletteContrast(
      brand.notFoundPaletteCss,
      (brand.onAccent ?? DEFAULT_ON_ACCENT).accent
    ),
    '404 page'
  );
  const basePath = cfg.config.basePath;
  let tpl = NOT_FOUND_HTML;
  if (basePath) {
    assertValidBasePath(basePath, brand.appUrl);
    tpl = replaceExactlyOnce(
      tpl,
      `<link rel="icon" href="/icon.svg"`,
      `<link rel="icon" href="${basePath}/icon.svg"`,
      '404 icon link'
    );
    tpl = replaceExactlyOnce(
      tpl,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png"`,
      `<link rel="apple-touch-icon" href="${basePath}/apple-touch-icon.png"`,
      '404 apple-touch-icon link'
    );
  }
  return tpl.split('__APPNAME__').join(brand.appName)
    .split('__BRANDMARK__').join(brand.markSvg)
    .split('__THEMECOLOR__').join(brand.themeColor)
    .split('__NFPALETTE__').join(brand.notFoundPaletteCss)
    .split('__BTNTEXT__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).accent)
    .split('__NFEXTRACSS__').join((cfg.theme ? almanacNotFoundCss() : '') + (cfg.copy.notFoundExtraCss ?? ''))
    .split('__NFHEADING__').join(cfg.copy.notFoundHeading)
    .split('__NFBODY__').join(cfg.copy.notFoundBody)
    .split('__NFACTIONS__').join(cfg.copy.notFoundActionsHtml);
}

/**
 * Emit the deployable site: the app shell (both the local preview file and
 * site/index.html), the branded 404, a PWA manifest kept in lockstep with the
 * brand constants, and the pack's static assets.
 */
export function writeSite(
  cfg: AppShellConfig,
  assets: AssetSpec,
  paths: PipelinePaths
): { htmlBytes: number } {
  const brand = effectiveBrand(cfg);
  const html = renderAppHtml(cfg);
  const finalize = cfg.finalizeHtml ?? ((h: string) => h);
  fs.writeFileSync(paths.previewFile, finalize(html, 'preview'));

  fs.mkdirSync(paths.siteDir, { recursive: true });
  const siteHtml = finalize(html, 'site');
  const notFoundHtml = renderNotFoundHtml(cfg);
  // basePath gate: a prefixed pack must never ship a root-relative link that
  // escapes its prefix — on the shared origin it would land on a DIFFERENT
  // product (see render/base-path.ts). Pack copy (404 actions, footer) that
  // still says href="/practice" fails the build here.
  const basePath = cfg.config.basePath;
  if (basePath) {
    assertNoRootRelativeLeaks(siteHtml, basePath, 'app shell (site/index.html)');
    assertNoRootRelativeLeaks(notFoundHtml, basePath, '404 page (site/404.html)');
  }
  fs.writeFileSync(path.join(paths.siteDir, 'index.html'), siteHtml);
  fs.writeFileSync(path.join(paths.siteDir, '404.html'), notFoundHtml);

  // PWA manifest — generated so the name/colors stay in lockstep with the
  // brand constants (add-to-home-screen installability).
  const manifest = {
    name: brand.appName,
    short_name: brand.appName,
    description: cfg.copy.manifestDescription ?? cfg.copy.metaDescription,
    // Under a basePath the app installs from (and scopes to) its prefix; the
    // explicit id preserves the pre-migration installed-app identity, whose
    // former trailing-slash start_url supplied the default identity. Icon
    // srcs stay relative — they resolve against the manifest's own URL.
    ...(basePath ? { id: `${basePath}/` } : {}),
    start_url: basePath || '/',
    ...(basePath ? { scope: basePath } : {}),
    display: 'standalone',
    background_color: brand.themeColor,
    theme_color: brand.themeColor,
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
  fs.writeFileSync(
    path.join(paths.siteDir, 'manifest.webmanifest'),
    JSON.stringify(manifest, null, 2)
  );

  // Pack-generated site files (e.g. host routing config for the shell's routes).
  for (const [name, content] of assets.siteFiles ?? []) {
    fs.writeFileSync(path.join(paths.siteDir, name), content);
  }

  // Pack assets (committed under assetsDir) copied into the deployed site so
  // the head/manifest paths resolve on the host.
  for (const f of assets.files) {
    fs.copyFileSync(path.join(paths.assetsDir, f), path.join(paths.siteDir, f));
  }
  for (const [from, to] of assets.copies) {
    fs.copyFileSync(path.join(paths.assetsDir, from), path.join(paths.siteDir, to));
  }
  for (const [fromDir, toDir] of assets.dirs) {
    const src = path.join(paths.assetsDir, fromDir);
    const dst = path.join(paths.siteDir, toDir);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      fs.copyFileSync(path.join(src, f), path.join(dst, f));
    }
  }
  return { htmlBytes: html.length };
}
