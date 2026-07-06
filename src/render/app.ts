import fs from 'node:fs';
import path from 'node:path';
import type { PipelinePaths } from '../types';

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
  /** Banner above the entity picker. */
  teamPickerBanner: string;
  /** First-visit banner on the Today tab. */
  todayIntro: string;
  /** Prefix of the "no fixtures today (<date>)." banner. */
  todayNoMatches: string;
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
  config: { storagePrefix: string; epochUtcArgs: string };
  data: { bank: unknown; teams: unknown; matchday: unknown };
  /** Final per-target pass over the app HTML (default: identity). */
  finalizeHtml?: (html: string, target: 'preview' | 'site') => string;
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
<!-- Vercel Web Analytics (cookieless; official static-HTML snippet). The queue
     stub makes window.va safe to call before/without the script loading. -->
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>
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
  .brand{font-weight:700;letter-spacing:-.02em;font-size:20px;display:flex;align-items:center;gap:9px}
  .brand small{color:var(--text2);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-left:2px}
  .brandmark{display:inline-flex}
  .brandmark svg{width:27px;height:27px;display:block}
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
  .row{display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:10px}
  .final{text-align:center;padding:24px 0}
  .final .big{font-size:44px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
  .final .big small{font-size:20px;color:var(--text3)}
  .squares{font-size:22px;letter-spacing:3px;margin:14px 0}
  .note{color:var(--text3);font-size:12px;margin-top:10px}
  .sharebox{display:none;white-space:pre;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    background:var(--elev);border:1px solid var(--surface);border-radius:10px;padding:12px 14px;
    margin:12px auto 0;max-width:320px;color:var(--text);font-size:15px;text-align:left;user-select:all;line-height:1.45}
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
  .teamhead .name{font-size:22px;font-weight:700;letter-spacing:-.01em}
  .linkbtn{appearance:none;background:transparent;border:0;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;padding:0}
  .linkbtn:hover{color:var(--text)}
  .picker-search{width:100%;background:var(--elev);border:1px solid var(--surface);color:var(--text);font-size:15px;padding:12px 14px;border-radius:12px;margin:6px 0 12px}
  .teamlist{display:flex;flex-wrap:wrap;gap:8px}
  .teamlist .fchip{cursor:pointer}
  .teamlist .fchip:hover{background:var(--hover);color:var(--text)}
  .card{background:var(--elev);border:1px solid var(--surface);border-radius:12px;padding:14px 16px;margin:12px 0}
  .card h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:700}
  .reclist{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center;margin-bottom:8px}
  .reclist .num{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
  .reclist .lab{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)}
  .recmeta{font-size:12px;color:var(--text2);font-variant-numeric:tabular-nums}
  .resline{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--surface)}
  .resline:first-of-type{border-top:0}
  .resline .sl{font-size:14px}
  .resline .ed{font-size:11px;color:var(--text3);white-space:nowrap}
  .resline a{color:var(--team);font-size:11px;text-decoration:underline;text-underline-offset:2px;cursor:pointer;margin-left:8px}
  .titles{display:flex;flex-wrap:wrap;gap:6px}
  .ttag{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--surface);color:var(--text);display:inline-flex;gap:6px;align-items:center}
  .ttag a{color:var(--team);text-decoration:underline;text-underline-offset:2px;cursor:pointer;font-size:11px}
  .ttag .yr{color:var(--text3);font-variant-numeric:tabular-nums}
  .empty{color:var(--text3);font-size:13px}
  .subnav{display:flex;gap:6px;margin:14px 0 4px}
  .subnav .tab{font-size:12px;padding:6px 14px}
  .subnav .tab.active{background:var(--teamDim);border-color:var(--team);color:var(--team)}
  /* ---- Daily streak + stats ---- */
  .streakbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0 2px;min-height:26px}
  .streakchip{display:inline-flex;align-items:center;gap:6px;background:var(--accentDim);color:var(--accent);font-size:13px;font-weight:700;padding:4px 12px;border-radius:999px}
  .final .streakchip{margin:6px auto 2px}
  .statshead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 12px}
  .statshead .name{font-size:22px;font-weight:700;letter-spacing:-.01em}
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
  .credtt{font-size:11px;color:var(--text3);font-variant-numeric:tabular-nums;margin-top:4px}
  .pickem{margin-top:10px;padding-top:10px;border-top:1px solid var(--surface)}
  .pklabel{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);font-weight:700;margin-bottom:6px}
  .pkrow{display:flex;gap:8px}
  .pkbtn{flex:1;appearance:none;background:var(--bg);border:1.5px solid var(--surface);color:var(--text2);padding:9px 10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}
  .pkbtn:hover{background:var(--hover);color:var(--text)}
  .pkbtn.on{background:var(--todayDim);border-color:var(--today);color:var(--today)}
  .pkhint{font-size:11px;color:var(--text3);margin-top:6px}
  .h3sub{font-weight:600;text-transform:none;letter-spacing:0;color:var(--text3)}
  /* ---- Footer (non-affiliation disclaimer) ---- */
  footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--surface);
    color:var(--text3);font-size:11px;line-height:1.6}
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
  .toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="brandmark">__BRANDMARK__</span>__APPNAME__ <small>Daily trivia</small></div>
    <div class="score" id="score">0<span class="max"> / 600</span></div>
  </header>
  <div class="tabs" id="tabs">
    <button class="tab active" data-mode="daily">Daily</button>
    <button class="tab" data-mode="today">Today</button>
    <button class="tab" data-mode="practice">Practice</button>
    <button class="tab" data-mode="team">My Team</button>
  </div>
  <div class="sub" id="sub">__SUBINITIAL__</div>
  <div class="streakbar" id="streakbar" style="display:none"></div>
  <div class="progress" id="progress"></div>
  <div id="stage"></div>
  __FOOTERHTML__
</div>
<div class="toast" id="toast"></div>
<script>
const BANK = __BANK__;
const TEAMS = __TEAMS__;
const MATCHDAY = __MATCHDAY__;
const APP_NAME = "__APPNAME__";
const APP_URL = "__APPURL__";
__PACKCONSTS__

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
function selectDaily(bank,key){const d=dayNumber(key);const take=takeForDay(d);const pools={};for(const q of bank.questions){const k=q.difficulty+'/'+q.type;(pools[k]=pools[k]||[]).push(q);}const out=[];for(const tier of TIERS){for(const type of TYPES){const k=tier+'/'+type;const n=take[k];if(!n)continue;const pool=(pools[k]||[]).slice().sort((a,b)=>a.id<b.id?-1:1);const seed=(hashString(k)^bank.seed)>>>0;const perm=shuffle(mulberry32(seed),pool);const start=consumedBefore(k,d);for(let i=0;i<n;i++)out.push(perm[(start+i)%perm.length]);}}return out;}

// ---- ported from src/game/scoring.ts ----
const MAX_POINTS=100;
function scoreAnswer(q,resp){if(q.type==='multiple_choice'){const ok=resp===q.answer;return{points:ok?100:0,correct:ok};}const guess=Number(resp);const ans=Number(q.answer);const s=q.scoring||{fullPointsWithin:0,zeroBeyond:10};const diff=Math.abs(guess-ans);if(!isFinite(diff))return{points:0,correct:false};if(diff<=s.fullPointsWithin)return{points:100,correct:true};if(diff>=s.zeroBeyond)return{points:0,correct:false};return{points:Math.round(100*(s.zeroBeyond-diff)/(s.zeroBeyond-s.fullPointsWithin)),correct:false};}

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
const stage=document.getElementById('stage');
const scoreEl=document.getElementById('score');
const progEl=document.getElementById('progress');
const subEl=document.getElementById('sub');

function start(){
  const key=currentDailyKey();
  questions=selectDaily(BANK,key); idx=0; total=0; results=[];
  subEl.textContent='Round for '+key+' — same six for everyone';
  enterDaily();
}
// Decide play-vs-result for today: a finished day shows its saved result; an
// unfinished day plays (resuming from the current question).
function enterDaily(){
  statsOpen=false;
  const key=currentDailyKey();
  const h=loadHistory();
  if(h[key]){ total=h[key].score; results=h[key].grid.slice(); idx=questions.length; renderProgress(); renderResult(); }
  else { renderProgress(); render(); }
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

// ---- Vercel Web Analytics custom events (cookieless, non-PII) ----
// Guarded: no-ops when analytics is unavailable (offline / local / script
// blocked) and never throws. Event data is minimal and non-identifying.
function track(name,data){try{if(typeof window.va==='function')window.va('event',{name:name,data:data||{}});}catch(e){}}

__PACKDECOR__

function render(){
  if(idx>=questions.length){finishDaily();return;}
  updateStreakBar();
  const q=questions[idx];
  let html=chip(q)+'<div class="q">'+esc(q.text)+'</div>';
  if(q.type==='multiple_choice'){
    html+='<div class="opts">'+q.options.map((o,i)=>'<button class="opt" data-i="'+i+'">'+teamLabel(o)+'</button>').join('')+'</div>';
  }else{
    html+='<div class="cg"><input id="cg" type="number" inputmode="numeric" placeholder="your guess" /><span class="unit">'+esc(q.unit||'')+'</span><button class="btn" id="cgsubmit">Guess</button></div>';
  }
  html+='<div id="reveal"></div>';
  stage.innerHTML=html;
  if(q.type==='multiple_choice'){
    stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answer(q.options[+b.dataset.i]);});
  }else{
    const inp=stage.querySelector('#cg');
    const go=()=>{if(inp.value!=='')answer(Number(inp.value));};
    stage.querySelector('#cgsubmit').onclick=go;
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
    inp.focus();
  }
  renderProgress();
}

function answer(resp){
  const q=questions[idx];
  const sc=scoreAnswer(q,resp);
  total+=sc.points; results.push(sc.points);
  const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  // lock options
  if(q.type==='multiple_choice'){
    stage.querySelectorAll('button.opt').forEach(b=>{b.disabled=true;const v=q.options[+b.dataset.i];if(v===q.answer)b.classList.add('correct');else if(v===resp)b.classList.add('wrong');});
  }else{
    stage.querySelector('#cg').disabled=true;stage.querySelector('#cgsubmit').disabled=true;
  }
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  const last=idx+1>=questions.length;
  document.getElementById('reveal').innerHTML=
    '<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+
    '<div class="fact">'+esc(q.revealFact)+'</div>'+
    '<a href="'+q.citation.urls[0]+'" target="_blank" rel="noopener noreferrer">↗ '+esc(q.citation.label)+'</a>'+
    '<div class="row"><span></span><button class="btn" id="next">'+(last?'See results':'Next question')+'</button></div></div>';
  document.getElementById('next').onclick=()=>{idx++;renderProgress();render();};
  // Robust source link: open a new tab; if a sandboxed frame blocks that, navigate directly.
  const src=document.querySelector('#reveal a');
  if(src){src.addEventListener('click',e=>{e.preventDefault();const href=src.getAttribute('href');const w=window.open(href,'_blank','noopener');if(!w){window.location.href=href;}});}
  renderProgress();
}

function buildShareText(streak){
  // Spoiler-free: one square per question, score, streak, link. No question content.
  const grid=results.map(p=>p>=100?'🟩':p>0?'🟨':'🟥').join('');
  const lines=[APP_NAME+' '+currentDailyKey(), grid+' '+total+'/'+(questions.length*100)];
  if(streak>1) lines.push('🔥 '+streak+'-day streak');
  if(APP_URL) lines.push(APP_URL);
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
// Persist today's result once, the moment the round is completed, then show it.
function finishDaily(){
  const key=currentDailyKey();
  const h=loadHistory();
  if(!h[key]){
    h[key]={date:key,score:total,grid:results.slice()}; saveHistory(h);
    // score bucket only (e.g. "500-600") — never anything identifying
    const b=Math.min(Math.floor(total/100),5);
    track('daily_completed',{score_bucket:(b*100)+'-'+((b+1)*100)});
  }
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
    '<pre class="sharebox" id="sharebox"></pre></div>';
  document.getElementById('statsbtn').onclick=renderStats;
  document.getElementById('share').onclick=async()=>{
    track('shared');
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
  let html='<div class="statshead"><div class="name">Stats</div><button class="linkbtn" id="statsback">← Back to Daily</button></div>'+
    '<div class="statrow">'+statBox('Played',s.played)+statBox('Avg score',s.avgScore)+statBox('Streak',streak)+statBox('Best streak',s.bestStreak)+'</div>'+
    '<div class="card"><h3>Score distribution</h3><div class="hist">'+
      s.histogram.map((c,i)=>'<div class="histcol"><div class="histn">'+(c>0?c:'')+'</div>'+
        '<div class="histtrack"><div class="histbar'+(c>0?' on':'')+'" style="height:'+(c/maxB*100)+'%"></div></div>'+
        '<div class="histlab">'+labels[i]+'</div></div>').join('')+'</div>'+
      (s.played===0?'<div class="empty" style="margin-top:8px">Play your first daily round to start the chart.</div>':'')+
    '</div>';
  stage.innerHTML=html;
  document.getElementById('statsback').onclick=()=>{statsOpen=false;enterDaily();};
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
  const daily=m==='daily';
  document.getElementById('sub').style.display=daily?'':'none';
  document.getElementById('progress').style.display=daily?'':'none';
  document.getElementById('score').style.visibility=daily?'visible':'hidden';
  if(daily){enterDaily();}else if(m==='today'){renderToday();}else if(m==='practice'){renderPractice();}else{renderTeam();}
  updateStreakBar();
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
    if(pq.type==='multiple_choice'){html+='<div class="opts">'+pq.options.map((o,i)=>'<button class="opt" data-i="'+i+'">'+teamLabel(o)+'</button>').join('')+'</div>';}
    else{html+='<div class="cg"><input id="pcg" type="number" inputmode="numeric" placeholder="your guess" /><span class="unit">'+esc(pq.unit||'')+'</span><button class="btn practice" id="pcgsubmit">Guess</button></div>';}
    html+='<div id="preveal"></div>';
  }else{
    const n=practicePool().length;
    html+='<button class="btn practice" id="pdraw">'+(n>0?('Draw a question ('+n+')'):'No questions match')+'</button>';
  }
  stage.innerHTML=html;
  stage.querySelectorAll('.fchip').forEach(b=>{b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v;pf[k]=v===''?null:v;pq=null;plast=null;renderPractice();};});
  const draw=document.getElementById('pdraw'); if(draw)draw.onclick=drawPractice;
  if(pq){
    if(pq.type==='multiple_choice'){stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answerPractice(pq.options[+b.dataset.i]);});}
    else{const inp=stage.querySelector('#pcg');const go=()=>{if(inp.value!=='')answerPractice(Number(inp.value));};document.getElementById('pcgsubmit').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});inp.focus();}
  }
}
function answerPractice(resp){
  const q=pq;const sc=scoreAnswer(q,resp);const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  if(q.type==='multiple_choice'){stage.querySelectorAll('button.opt').forEach(b=>{b.disabled=true;const v=q.options[+b.dataset.i];if(v===q.answer)b.classList.add('correct');else if(v===resp)b.classList.add('wrong');});}
  else{stage.querySelector('#pcg').disabled=true;stage.querySelector('#pcgsubmit').disabled=true;}
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  document.getElementById('preveal').innerHTML='<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+
    '<div class="fact">'+esc(q.revealFact)+'</div>'+
    '<a href="'+q.citation.urls[0]+'" target="_blank" rel="noopener noreferrer">↗ '+esc(q.citation.label)+'</a>'+
    '<div class="row"><span></span><button class="btn practice" id="pnext">Another one</button></div></div>';
  document.getElementById('pnext').onclick=drawPractice;
  const src=document.querySelector('#preveal a'); if(src){src.addEventListener('click',e=>{e.preventDefault();const href=src.getAttribute('href');const w=window.open(href,'_blank','noopener');if(!w){window.location.href=href;}});}
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
function bindSrcLinks(root){
  (root||document).querySelectorAll('a[href]').forEach(a=>{
    if(a.dataset.bound)return; a.dataset.bound='1';
    a.addEventListener('click',e=>{e.preventDefault();const h=a.getAttribute('href');const w=window.open(h,'_blank','noopener');if(!w)window.location.href=h;});
  });
}
__PACKTEAMHELPERS__

function renderTeam(){
  const fav=getFavTeam();
  if(!fav){ renderTeamPicker(); return; }
  const t=TEAM_BY_NAME[fav];
  let html='<div class="teamhead"><div class="name">'+teamLabel(t.name,true)+'</div>'+
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
    '<input class="picker-search" id="psearch" type="text" placeholder="Search teams…" value="'+esc(teamSearch)+'" />'+
    '<div class="teamlist">'+
      list.map(t=>'<button class="fchip" data-team="'+esc(t.name)+'">'+teamLabel(t.name)+'</button>').join('')+
    '</div>'+
    (list.length?'':'<div class="empty">No teams match “'+esc(teamSearch)+'”.</div>');
  stage.innerHTML=html;
  const inp=document.getElementById('psearch');
  inp.oninput=()=>{ teamSearch=inp.value; const pos=inp.selectionStart; renderTeamPicker(); const ni=document.getElementById('psearch'); ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(e){} };
  stage.querySelectorAll('.teamlist .fchip').forEach(b=>{b.onclick=()=>{ setFavTeam(b.dataset.team); teamView='insights'; teamSearch=''; renderTeam(); };});
}

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
    if(tq.type==='multiple_choice'){html+='<div class="opts">'+tq.options.map((o,i)=>'<button class="opt" data-i="'+i+'">'+teamLabel(o)+'</button>').join('')+'</div>';}
    else{html+='<div class="cg"><input id="tcg" type="number" inputmode="numeric" placeholder="your guess" /><span class="unit">'+esc(tq.unit||'')+'</span><button class="btn team" id="tcgsubmit">Guess</button></div>';}
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
  if(tq.type==='multiple_choice'){stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answerTeam(t,tq.options[+b.dataset.i]);});}
  else{const inp=stage.querySelector('#tcg');const go=()=>{if(inp.value!=='')answerTeam(t,Number(inp.value));};document.getElementById('tcgsubmit').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});inp.focus();}
}
function answerTeam(t,resp){
  const q=tq;const sc=scoreAnswer(q,resp);const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  if(q.type==='multiple_choice'){stage.querySelectorAll('button.opt').forEach(b=>{b.disabled=true;const v=q.options[+b.dataset.i];if(v===q.answer)b.classList.add('correct');else if(v===resp)b.classList.add('wrong');});}
  else{stage.querySelector('#tcg').disabled=true;stage.querySelector('#tcgsubmit').disabled=true;}
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  document.getElementById('treveal').innerHTML='<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+
    '<div class="fact">'+esc(q.revealFact)+'</div>'+
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
  let html='<div class="teamhead"><div class="name" style="font-size:18px">'+teamLabel(f.team1)+' v '+teamLabel(f.team2)+'</div><button class="linkbtn" id="mdback">← Back to Today</button></div>';
  if(!pool.length){
    stage.innerHTML=html+'<div class="card"><div class="empty">No bank questions feature '+teamLabel(f.team1)+' or '+teamLabel(f.team2)+' yet. __BANKREFRESHNOTE__</div></div>';
    document.getElementById('mdback').onclick=()=>{mdQuizMid=null;renderToday();};return;
  }
  html+='<div class="tdbanner2">'+pool.length+' question'+(pool.length===1?'':'s')+' featuring '+teamLabel(f.team1)+' or '+teamLabel(f.team2)+' · unlimited, no streak or score</div>';
  if(mdq){
    html+=chip(mdq)+'<div class="q">'+esc(mdq.text)+'</div>';
    if(mdq.type==='multiple_choice')html+='<div class="opts">'+mdq.options.map((o,i)=>'<button class="opt" data-i="'+i+'">'+teamLabel(o)+'</button>').join('')+'</div>';
    else html+='<div class="cg"><input id="mdcg" type="number" inputmode="numeric" placeholder="your guess" /><span class="unit">'+esc(mdq.unit||'')+'</span><button class="btn today" id="mdcgs">Guess</button></div>';
    html+='<div id="mdrev"></div>';
  }else{
    html+='<button class="btn today" id="mddraw">Draw a question ('+pool.length+')</button>';
  }
  stage.innerHTML=html;
  document.getElementById('mdback').onclick=()=>{mdQuizMid=null;mdq=null;mdlast=null;renderToday();};
  const draw=document.getElementById('mddraw'); if(draw)draw.onclick=()=>drawMatchupQ(f);
  if(mdq){
    if(mdq.type==='multiple_choice')stage.querySelectorAll('button.opt').forEach(b=>{b.onclick=()=>answerMatchup(f,mdq.options[+b.dataset.i]);});
    else{const inp=stage.querySelector('#mdcg');const go=()=>{if(inp.value!=='')answerMatchup(f,Number(inp.value));};document.getElementById('mdcgs').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go();});inp.focus();}
  }
}
function answerMatchup(f,resp){
  const q=mdq;const sc=scoreAnswer(q,resp);const cls=sc.points>=100?'ok':sc.points>0?'partial':'no';
  if(q.type==='multiple_choice')stage.querySelectorAll('button.opt').forEach(b=>{b.disabled=true;const v=q.options[+b.dataset.i];if(v===q.answer)b.classList.add('correct');else if(v===resp)b.classList.add('wrong');});
  else{stage.querySelector('#mdcg').disabled=true;stage.querySelector('#mdcgs').disabled=true;}
  const ansLine=q.type==='closest_guess'?('You guessed '+resp+' · answer '+q.answer+' '+(q.unit||'')):'';
  document.getElementById('mdrev').innerHTML='<div class="reveal"><div class="pts '+cls+'">+'+sc.points+(sc.correct?' · spot on':sc.points>0?' · close':' · missed')+'</div>'+
    (ansLine?'<div class="note">'+esc(ansLine)+'</div>':'')+'<div class="fact">'+esc(q.revealFact)+'</div>'+
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
const ROUTE_FOR_MODE={daily:'/',today:'/today',practice:'/practice',team:'/my-team'};
const MODE_FOR_ROUTE={'/':'daily','/today':'today','/practice':'practice','/my-team':'team'};
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

const DEFAULT_ON_ACCENT = {
  accent: '#06121f',
  practice: '#0c0a1a',
  team: '#04181b',
  today: '#2a0c19',
};

const DEFAULT_BANK_REFRESH_NOTE = 'The bank refreshes as the tournament plays on.';


/** The app shell with every token filled in. */
export function renderAppHtml(cfg: AppShellConfig): string {
  const { brand, copy, client, config, data } = cfg;
  let tpl = HTML;
  for (const [find, replace] of client.shellPatches ?? []) {
    const n = tpl.split(find).length - 1;
    if (n !== 1) {
      throw new Error(`shellPatch must match exactly once (matched ${n}): ${find.slice(0, 80)}`);
    }
    tpl = tpl.split(find).join(replace);
  }
  return tpl.replace('__BANK__', JSON.stringify(data.bank))
    .replace('__TEAMS__', JSON.stringify(data.teams))
    .replace('__MATCHDAY__', JSON.stringify(data.matchday))
    // split/join = replace-all (tsconfig lib predates String.replaceAll)
    .split('__PACKCONSTS__').join(client.consts)
    .split('__PACKDECOR__').join(client.decorations)
    .split('__PACKTEAMCARDS__').join(client.teamCards)
    .split('__PACKTODAYCARDS__').join(client.todayCards)
    .split('__PACKTEAMHELPERS__').join(client.teamHelpers ?? DEFAULT_TEAM_HELPERS)
    .split('__ERALABEL__').join(client.eraLabel ?? DEFAULT_ERA_LABEL)
    .split('__RENDERTODAY__').join(client.renderToday ?? DEFAULT_RENDER_TODAY)
    .split('__BTNTEXTPRACTICE__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).practice)
    .split('__BTNTEXTTEAM__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).team)
    .split('__BTNTEXTTODAY__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).today)
    .split('__BTNTEXT__').join((brand.onAccent ?? DEFAULT_ON_ACCENT).accent)
    .split('__BANKREFRESHNOTE__').join(copy.bankRefreshNote ?? DEFAULT_BANK_REFRESH_NOTE)
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
    .split('__TODAYINTRO__').join(copy.todayIntro)
    .split('__TODAYNONE__').join(copy.todayNoMatches)
    .split('__TITLETODAY__').join(copy.titleToday)
    .split('__TITLEPRACTICE__').join(copy.titlePractice)
    .split('__TITLETEAM__').join(copy.titleTeam)
    .split('__APPURL__').join(brand.appUrl);
}

/** Branded 404 — served by the host for any unmatched route. Self-contained
 *  and minimal: same theme + inlined mark as the app, noindex, root-absolute
 *  URLs so it renders correctly at any request depth. */
export function renderNotFoundHtml(cfg: AppShellConfig): string {
  return NOT_FOUND_HTML.split('__APPNAME__').join(cfg.brand.appName)
    .split('__BRANDMARK__').join(cfg.brand.markSvg)
    .split('__THEMECOLOR__').join(cfg.brand.themeColor)
    .split('__NFPALETTE__').join(cfg.brand.notFoundPaletteCss)
    .split('__BTNTEXT__').join((cfg.brand.onAccent ?? DEFAULT_ON_ACCENT).accent)
    .split('__NFEXTRACSS__').join(cfg.copy.notFoundExtraCss ?? '')
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
  const html = renderAppHtml(cfg);
  const finalize = cfg.finalizeHtml ?? ((h: string) => h);
  fs.writeFileSync(paths.previewFile, finalize(html, 'preview'));

  fs.mkdirSync(paths.siteDir, { recursive: true });
  fs.writeFileSync(path.join(paths.siteDir, 'index.html'), finalize(html, 'site'));
  fs.writeFileSync(path.join(paths.siteDir, '404.html'), renderNotFoundHtml(cfg));

  // PWA manifest — generated so the name/colors stay in lockstep with the
  // brand constants (add-to-home-screen installability).
  const manifest = {
    name: cfg.brand.appName,
    short_name: cfg.brand.appName,
    description: cfg.copy.manifestDescription ?? cfg.copy.metaDescription,
    start_url: '/',
    display: 'standalone',
    background_color: cfg.brand.themeColor,
    theme_color: cfg.brand.themeColor,
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
