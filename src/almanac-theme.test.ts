/**
 * The "Almanac hybrid" (DAYLIGHT) light theme — opt-in isolation and the
 * theme render itself.
 *
 * Cases:
 *   - theme UNSET → the incumbent dark surfaces are BYTE-IDENTICAL to the
 *     pre-theme core: sha256 of the rendered app shell, 404, and an SEO page
 *     from a fixture pack equal the baselines recorded at v0.16.1
 *     (origin/main eae60bb). This is the rollback contract: a pack that
 *     never opts in — or deletes the opt-in — ships the exact bytes it
 *     shipped before this PR existed.
 *   - theme SET → the paper palette + almanac component chrome render, one
 *     accent drives every mode, and the shell's existing WCAG gate keeps
 *     running (colors are still editorial data; the guarantee is computed).
 *   - the yesterday-link slot: unset erases with zero residue; set renders
 *     the link; garbage hrefs/labels throw.
 *   - SEO pages: almanac chrome swaps the stylesheet + masthead only —
 *     JSON-LD and the body (the answer-first extraction surface) are
 *     byte-identical between dark and almanac renders of the same page.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderAppHtml, renderNotFoundHtml, type AppShellConfig } from './render/app';
import { renderSeoPage, type SeoRenderConfig } from './render/seo';
import type { SeoPage } from './types';
import { ALMANAC_ACCENTS, ALMANAC_TOKENS, type AlmanacAccentKey } from './theme-almanac';

// ---------- the fixture pack (kept in lock-step with the baseline script) ----------

const DARK_PALETTE = `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`;

function fixtureCfg(): AppShellConfig {
  return {
    brand: {
      appName: 'FixtureWit',
      appUrl: 'https://fixture.test',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
      paletteCss: DARK_PALETTE,
      notFoundPaletteCss: '--bg:#0C0C0E;--text:#EDEDEF;--text2:#9A9AA3;--accent:#4E9CF5',
    },
    copy: {
      title: 'Fixture', metaDescription: 'fixture meta', ogTitle: 'og', ogDescription: 'og',
      twitterTitle: 'tw', twitterDescription: 'tw', subInitial: 'sub',
      footerHtml: '<footer>No personal data, no cookies.</footer>',
      resultNote: 'note', teamPickerBanner: 'banner',
      titleToday: 'Today', titlePractice: 'Practice', titleTeam: 'My Team',
      notFoundHeading: 'Not found', notFoundBody: 'Gone.', notFoundActionsHtml: '<a href="/">home</a>',
    },
    client: {
      consts: '// fixture consts',
      decorations: 'function teamLabel(n){return n;}function slLabel(s){return s;}',
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards: 'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
    },
    config: { storagePrefix: 'fixture', epochUtcArgs: '2024, 0, 1' },
    data: { bank: { count: 0, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
  };
}

const seoPage: SeoPage = {
  path: 'fixture/page',
  title: 'Fixture page title',
  description: 'Fixture page description for the byte-identity baseline.',
  h1: 'Fixture heading',
  bodyHtml: `<h2>Section</h2><p>${'Substantive fixture body content. '.repeat(10)}</p>`,
  jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'Fixture' },
};

function seoCfg(theme?: SeoRenderConfig['theme']): SeoRenderConfig {
  const c = fixtureCfg();
  return {
    brand: c.brand,
    copy: c.copy,
    routes: { today: '/today', practice: '/practice', team: '/my-team' },
    ...(theme ? { theme } : {}),
  };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------- 1. opt-in isolation: non-opting packs are byte-identical ----------

// Baselines: sha256 of the same fixture rendered by the PRE-THEME core
// (origin/main eae60bb = v0.16.1 + entity links). A deliberate shell change
// updates these hashes IN ITS OWN PR; this test failing means the almanac
// work leaked into the incumbent bytes.
const BASELINE_APP = '087271e823968c578830febe747bc528c751608bd31783037e3bbf0cb001dde6';
const BASELINE_404 = 'e2ae1142fe0d04afb412ee521959aac1d5e522c2fec58d3ad6433f51ae4fb888';
const BASELINE_SEO = 'bf88b71fbabf4233fc4d63447a4da3b9dabd4d40d25b108bbe02f3c5833f1a98';

assert.equal(sha(renderAppHtml(fixtureCfg())), BASELINE_APP, 'app shell must stay byte-identical when theme is unset');
assert.equal(sha(renderNotFoundHtml(fixtureCfg())), BASELINE_404, '404 must stay byte-identical when theme is unset');
assert.equal(sha(renderSeoPage(seoPage, seoCfg())), BASELINE_SEO, 'SEO page must stay byte-identical when theme is unset');

// The yesterday-link token erases with zero residue.
const plain = renderAppHtml(fixtureCfg());
assert.ok(!plain.includes('__YESTERDAY__'), 'unset yesterday token must erase');
assert.ok(!plain.includes('ylink'), 'unset yesterday link leaves no residue');

// ---------- 2. the almanac render ----------

function almanacCfg(accent: AlmanacAccentKey): AppShellConfig {
  return { ...fixtureCfg(), theme: { name: 'almanac', accent } };
}

const lit = renderAppHtml(almanacCfg('soccer'));
assert.ok(lit.includes(`--bg:${ALMANAC_TOKENS.paper}`), 'paper background token');
assert.ok(lit.includes(`--elev:${ALMANAC_TOKENS.card}`), 'card token');
assert.ok(lit.includes(`--bdr:${ALMANAC_TOKENS.border}`), 'border token');
assert.ok(lit.includes('==== Almanac (DAYLIGHT) light theme ===='), 'component chrome present');
assert.equal(lit.split('==== Almanac (DAYLIGHT) light theme ====').length, 2, 'component chrome exactly once');
assert.ok(lit.includes('content:"PLAYED "'), 'the PLAYED stamp carries the final score');
assert.ok(lit.includes(`<meta name="theme-color" content="${ALMANAC_TOKENS.paper}" />`), 'theme-color follows the paper');
// One accent drives every mode.
const soccer = ALMANAC_ACCENTS.soccer.resolved;
for (const tok of ['--accent', '--practice', '--team', '--today']) {
  assert.ok(lit.includes(`${tok}:${soccer}`), `${tok} carries the sport accent`);
}
// The 404 follows the theme.
const nf = renderNotFoundHtml(almanacCfg('soccer'));
assert.ok(nf.includes(`--bg:${ALMANAC_TOKENS.paper}`), '404 paper palette');

// Unknown theme name / accent throw loudly.
assert.throws(
  () => renderAppHtml({ ...fixtureCfg(), theme: { name: 'noir' } as unknown as AppShellConfig['theme'] }),
  /unknown theme/
);
assert.throws(() => renderAppHtml(almanacCfg('rugby' as AlmanacAccentKey)), /unknown accent key/);

// ---------- 3. the yesterday-link slot ----------

const y = renderAppHtml({
  ...fixtureCfg(),
  yesterdayLink: { href: '/wc/2022', label: "Yesterday's round: the 2022 final" },
});
assert.ok(
  y.includes(`<div class="ylink"><a href="/wc/2022">Yesterday's round: the 2022 final</a></div>`),
  'yesterday link renders'
);
assert.ok(y.includes('.ylink{'), 'yesterday link CSS rides the opt-in');
assert.throws(
  () => renderAppHtml({ ...fixtureCfg(), yesterdayLink: { href: 'javascript:alert(1)', label: 'x' } }),
  /href must be/
);
assert.throws(
  () => renderAppHtml({ ...fixtureCfg(), yesterdayLink: { href: '/ok', label: '<b>markup</b>' } }),
  /plain text/
);

// ---------- 4. SEO pages: chrome-only swap ----------

const darkSeo = renderSeoPage(seoPage, seoCfg());
const litSeo = renderSeoPage(seoPage, seoCfg({ name: 'almanac', accent: 'cricket' }));
assert.ok(litSeo.includes(ALMANAC_TOKENS.paper), 'SEO page paper chrome');
assert.ok(litSeo.includes('Score<span class="wit">wit</span>') === false, 'non-Scorewit fixture name renders plain');
// JSON-LD and the body are byte-identical across the two chromes.
const jsonLdOf = (h: string) => /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(h)?.[1];
assert.equal(jsonLdOf(litSeo), jsonLdOf(darkSeo), 'JSON-LD untouched by the theme');
assert.ok(litSeo.includes(seoPage.bodyHtml), 'answer-first body untouched by the theme');
// The masthead treatment on a real Scorewit brand name.
const scorewitCfg = seoCfg({ name: 'almanac', accent: 'cricket' });
scorewitCfg.brand = { ...scorewitCfg.brand, appName: 'Scorewit Cricket' };
const witSeo = renderSeoPage(seoPage, scorewitCfg);
assert.ok(witSeo.includes('Score<span class="wit">wit</span> <span class="qual">Cricket</span>'), 'Score|wit masthead');

// ---------- 5. the accessibility pass ----------

// Every accent renders (the shell's WCAG gate throws below AA — rendering
// IS the guarantee), and the three spec'd usage gates hold on the resolved
// tones: (a) accent text on paper AND card >= 4.5; (b) white on accent
// >= 4.5 (chips are small bold text — body standard, not large-text 3:1);
// (c) stamp ink on card >= 3.
import { contrastRatio } from './contrast';
const PAPER = ALMANAC_TOKENS.paper;
const CARD = ALMANAC_TOKENS.card;
for (const key of Object.keys(ALMANAC_ACCENTS) as AlmanacAccentKey[]) {
  const { given, resolved } = ALMANAC_ACCENTS[key];
  renderAppHtml(almanacCfg(key)); // gate runs inside — throws on any AA miss
  assert.ok(contrastRatio(resolved, PAPER) >= 4.5, `${key}: accent on paper >= 4.5`);
  assert.ok(contrastRatio(resolved, CARD) >= 4.5, `${key}: accent on card >= 4.5`);
  assert.ok(contrastRatio('#ffffff', resolved) >= 4.5, `${key}: white on accent >= 4.5`);
  assert.ok(contrastRatio(resolved, CARD) >= 3, `${key}: stamp ink on card >= 3`);
  // Tone-only discipline: hue fixed within hex-quantization rounding (<1°).
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  };
  assert.ok(Math.abs(hue(given) - hue(resolved)) < 1, `${key}: hue is fixed (tone-only darkening)`);
}
// The faded token: text surfaces carry the 4.5 tone; the raw spec value
// stays a >=3:1 non-text ring on card (the pip outline).
assert.ok(contrastRatio(ALMANAC_TOKENS.fadedText, PAPER) >= 4.5, 'fadedText holds 4.5 on paper');
assert.ok(contrastRatio(ALMANAC_TOKENS.faded, CARD) >= 3, 'faded ring holds 3 on card');
// State is never color-alone: filled pips vs bordered rings (shape), and the
// PLAYED stamp is text.
assert.ok(lit.includes('.dot{height:9px;width:9px;flex:0 0 9px;border-radius:50%;background:transparent;border:1.5px solid var(--faded)}'), 'empty pip is a ring');
assert.ok(lit.includes('.dot.done{background:var(--accent);border-color:var(--accent)}'), 'filled pip is a disc');
// Visible keyboard focus + reduced-motion guard ride the theme.
assert.ok(lit.includes('button:focus-visible,a:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--text);outline-offset:2px}'), 'focus rings');
assert.ok(lit.includes('@media (prefers-reduced-motion:reduce)'), 'reduced-motion guard');

// ---------- 6. result pips (RESULT PIPS unification) ----------

import { RESULT_GLYPHS, RESULT_TIERS } from './theme-almanac';

// Themed: the share grid speaks traffic tiers and the end-of-round card
// renders the unified pip row — no legacy square glyphs anywhere.
const GLYPH_MAP = `p>=100?'${RESULT_GLYPHS.correct}':p>0?'${RESULT_GLYPHS.partial}':'${RESULT_GLYPHS.wrong}'`;
assert.ok(lit.includes(`const grid=results.map(p=>${GLYPH_MAP}).join('');`), 'themed share grid uses 🟢/🟡/🔴');
assert.ok(!lit.includes('🟩') && !lit.includes('🟨') && !lit.includes('🟥'), 'no legacy squares in the themed shell');
assert.ok(!lit.includes('class="squares"'), 'themed end-of-round card drops the emoji squares');
assert.ok(lit.includes('class="respips"'), 'themed end-of-round card renders the pip row');
assert.ok(lit.includes(`.rp.ok{background:${RESULT_TIERS.correct}}`), 'correct tier: filled soccer-green disc');
assert.ok(lit.includes(`.rp.part{background:${RESULT_TIERS.partial}}`), 'partial tier: filled T20-gold disc');
assert.ok(
  lit.includes(`.rp.no{background:transparent;border:2.5px solid ${RESULT_TIERS.wrong}}`),
  'wrong tier: 2.5px F1-red RING, no fill'
);
// SHARE V2 pip tuning: 12px pips, 8px gap; the two FILLED tiers must stay
// separable in grayscale — luminance-contrast floor between the fills (the
// resolved amber sits as light as the >= 3 gate allows for exactly this).
assert.ok(lit.includes('.rp{width:12px;height:12px'), '12px end-of-round pips');
assert.ok(lit.includes('.respips{display:flex;gap:8px'), '8px pip gap');
assert.ok(
  contrastRatio(RESULT_TIERS.correct, RESULT_TIERS.partial) >= 1.15,
  'green and amber fills must not merge in grayscale (luminance floor)'
);
// The pip row keeps a text channel (role="img" label in the reveal voice).
assert.ok(lit.includes(`role="img" aria-label=`), 'pip row carries an accessible label');
// Unthemed: the incumbent glyphs and squares — byte-identity is pinned in
// section 1; this is the explicit statement of what that pin protects.
assert.ok(plain.includes(`p>=100?'🟩':p>0?'🟨':'🟥'`), 'unthemed shell keeps the square glyphs');
assert.ok(!plain.includes('respips') && !plain.includes('.rp.ok'), 'pip component leaves no unthemed residue');
// Contrast: every tier value is a non-text state marker — >= 3:1 on paper
// AND card (the ring-red-on-paper gate from the brief measures here too).
for (const [tier, v] of Object.entries(RESULT_TIERS)) {
  assert.ok(contrastRatio(v, PAPER) >= 3, `${tier} pip >= 3:1 on paper`);
  assert.ok(contrastRatio(v, CARD) >= 3, `${tier} pip >= 3:1 on card`);
}

console.log('almanac-theme.test: all assertions passed');
