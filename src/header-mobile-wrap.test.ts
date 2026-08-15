/**
 * Brief 0005: mobile header wrap. At a 390px viewport, the game-shell header
 * (wordmark+tagline, score counter) had no narrow-viewport handling, so long
 * app names (e.g. "Scorewit Super Over", "Scorewit Top Flight") wrapped into
 * a jumbled 3-line stack before any content is visible. Fix: a narrow-width
 * media query on the shared `header` rule (present in every render, themed
 * or not — the bug reproduces either way) drops the tagline and lets the
 * header wrap, capping it at 2 lines regardless of app-name length.
 *
 * Synthetic pack, pure string assertions on the emitted shell — no network,
 * no browser (screenshot verification against real pack app names happens
 * out-of-band, see the brief's delivery PR).
 */
import assert from 'node:assert/strict';
import { renderAppHtml, type AppShellConfig } from './render/app';

const PALETTE = `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`;

function cfg(appName: string, theme?: AppShellConfig['theme']): AppShellConfig {
  return {
    brand: {
      appName,
      appUrl: 'https://fixture.test',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
      paletteCss: PALETTE,
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
    ...(theme ? { theme } : {}),
  };
}

const NARROW_RULE = '@media (max-width:480px){header{flex-wrap:wrap;row-gap:6px}.brand small{display:none}}';

// The rule ships in the base stylesheet, so it's present regardless of theme
// and regardless of app name — one fix point, not a per-pack patch.
for (const [label, name, theme] of [
  ['short name, unthemed', 'FixtureWit', undefined],
  ['long name, unthemed', 'Scorewit Super Over', undefined],
  ['long name, almanac', 'Scorewit Top Flight', { name: 'almanac', accent: 'soccer' }],
] as const) {
  const html = renderAppHtml(cfg(name, theme as AppShellConfig['theme']));
  assert.ok(html.includes(NARROW_RULE), `${label}: narrow-width header rule present`);
  assert.equal(
    html.split(NARROW_RULE).length,
    2,
    `${label}: narrow-width header rule appears exactly once`
  );
  // The tagline stays in the markup (SEO/accessibility) — only hidden via
  // the narrow-width CSS, never stripped from the DOM.
  assert.ok(html.includes('<small>Daily trivia</small>'), `${label}: tagline still renders in markup`);
}

// The base (non-media) header rule is untouched — this fix is purely
// additive at the narrow breakpoint, not a rewrite of the row layout.
const base = renderAppHtml(cfg('FixtureWit'));
assert.ok(
  base.includes('header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}'),
  'base header rule unchanged outside the narrow breakpoint'
);

console.log('header-mobile-wrap.test: all assertions passed');
