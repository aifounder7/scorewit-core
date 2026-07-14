/**
 * Opt-in My-Team nation theming (render/app.ts themeChunks/THEMED_RENDER_TEAM
 * + contrast.ts checkNationThemeContrast). Synthetic pack, pure string
 * assertions on the emitted shell — no network, no browser.
 *
 * Cases:
 *   - theming UNSET → the incumbent shell byte-for-byte around every theming
 *     seam (token erased with zero residue, default My-Team flow verbatim,
 *     no theme CSS/consts anywhere);
 *   - theming SET → the baked NATION_THEME lookup (build-time rgba tint +
 *     band gradient — the browser derives nothing), the themed flow, the
 *     theme CSS exactly once, allowlist runtime fallback;
 *   - the AA gate: below-threshold accents FAIL the build naming the nation
 *     and measured ratio — including near-shell colors (never a silent
 *     fallback to an unvalidated color);
 *   - garbage tables throw: empty, bad band shape, unparseable colors;
 *   - theming + a clientJs.renderTeam override is a build error.
 */
import assert from 'node:assert/strict';
import { renderAppHtml, type AppShellConfig } from './render/app';
import type { NationTheme } from './contrast';

const AA_PALETTE = `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`;

const NATIONS: Record<string, NationTheme> = {
  England: { band: ['#FFFFFF', '#CE1124', '#FFFFFF'], accent: '#F8677A', onAccent: '#2B060B', vband: true },
  Netherlands: { band: ['#AE1C28', '#FFFFFF', '#21468B'], accent: '#FF7900', onAccent: '#241000' },
  'New Zealand': { band: ['#000000', '#FFFFFF'], accent: '#BFC7CE', onAccent: '#16181B', inset: true },
};

function cfg(teamTheming?: AppShellConfig['teamTheming'], renderTeam?: string): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: 'https://example.test',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
      paletteCss: AA_PALETTE,
      notFoundPaletteCss: '--bg:#0C0C0E;--text:#EDEDEF;--text2:#9A9AA3;--accent:#4E9CF5',
    },
    copy: {
      title: 't', metaDescription: 'm', ogTitle: 'o', ogDescription: 'o',
      twitterTitle: 'tw', twitterDescription: 'tw', subInitial: 's',
      footerHtml: '<footer>No personal data, no cookies.</footer>',
      resultNote: 'r', teamPickerBanner: 'b',
      titleToday: 'Today', titlePractice: 'Practice', titleTeam: 'My Team',
      notFoundHeading: 'nf', notFoundBody: 'nf', notFoundActionsHtml: '<a href="/">home</a>',
    },
    client: {
      consts: '// pack consts',
      decorations: 'function teamLabel(n){return n;}function slLabel(s){return s;}',
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards: 'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
      ...(renderTeam ? { renderTeam } : {}),
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    teamTheming,
  };
}

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n        ${(e as Error).message}`);
  }
}

console.log('Opt-in My-Team nation theming — synthetic pack\n');

const THEME_MARKERS = ['NATION_THEME', 'natband', 'natbanner', 'natlead', '--onTeam', 'Team theming'];

check('unset: token erased with zero residue; incumbent flow verbatim; no theme markers', () => {
  const html = renderAppHtml(cfg());
  // the __THEMECONSTS__ seam collapses to the incumbent bytes exactly
  assert.ok(html.includes('// pack consts\n\n// ---- ported from src/game/rng.ts ----'));
  assert.ok(!html.includes('__THEME'));
  // the incumbent (unthemed) My-Team flow, verbatim signature
  assert.ok(html.includes(`let html='<div class="teamhead"><h2 class="name">'+teamLabel(t.name,true)+'</h2>'+`));
  for (const m of THEME_MARKERS) assert.ok(!html.includes(m), `unexpected "${m}" in unset shell`);
});

check('set: baked lookup (build-time rgba + gradient), themed flow, theme CSS once', () => {
  const html = renderAppHtml(cfg({ nations: NATIONS }));
  assert.ok(html.includes('const NATION_THEME='));
  // rgba tint + gradient are baked strings — no client color math
  assert.ok(html.includes('"d":"rgba(248,103,122,0.14)"'), 'England dim baked');
  assert.ok(html.includes('linear-gradient(90deg, #FFFFFF 0.0% 33.3%, #CE1124 33.3% 66.7%, #FFFFFF 66.7% 100.0%)'), 'England vertical band baked');
  assert.ok(html.includes('linear-gradient(180deg, #AE1C28 0.0% 33.3%'), 'Netherlands horizontal band baked');
  assert.ok(html.includes('"New Zealand":{"a":"#BFC7CE"') && html.includes('"i":1'), 'inset flag baked');
  // themed flow present, allowlist fallback in place, picker defined once
  assert.ok(html.includes("const th=NATION_THEME[t.name]||null;"));
  assert.ok(html.includes("(t.insightLine?'<div class=\"natlead\">'+esc(t.insightLine)"));
  assert.equal(html.split('function renderTeamPicker(){').length - 1, 1);
  // theme CSS exactly once, before any pack extraCss position
  assert.equal(html.split('.natbanner{background:var(--teamDim)').length - 1, 1);
  assert.ok(html.includes('.nation .btn.team{color:var(--onTeam)}'));
});

check('gate: a below-AA accent fails the build naming nation + ratio', () => {
  assert.throws(
    () => renderAppHtml(cfg({ nations: { Netherlands: { band: ['#AE1C28', '#21468B'], accent: '#21468B', onAccent: '#FFFFFF' } } })),
    (e: Error) =>
      e.message.includes('team theming: palette fails WCAG AA') &&
      e.message.includes('teamTheming "Netherlands": accent on --bg: #21468B on #0C0C0E = 2.15'),
  );
});

check('gate: a near-shell accent fails loudly (no silent fallback)', () => {
  assert.throws(
    () => renderAppHtml(cfg({ nations: { Void: { band: ['#111114', '#222228'], accent: '#111114', onAccent: '#FFFFFF' } } })),
    /teamTheming "Void": accent on --bg/
  );
});

check('garbage tables throw: empty, band shape, unparseable colors', () => {
  const t = (nations: any) => () => renderAppHtml(cfg({ nations }));
  assert.throws(t({}), /nations table is empty/);
  assert.throws(t({ X: { band: '#FFF', accent: '#F8677A', onAccent: '#2B060B' } }), /band must carry 2–4/);
  assert.throws(t({ X: { band: ['#FFF'], accent: '#F8677A', onAccent: '#2B060B' } }), /band must carry 2–4/);
  assert.throws(t({ X: { band: ['#1', '#2', '#3', '#4', '#5'], accent: '#F8677A', onAccent: '#2B060B' } }), /band must carry 2–4/);
  assert.throws(t({ X: { band: ['#FFFFFF', 'papayawhip'], accent: '#F8677A', onAccent: '#2B060B' } }), /unparseable band color "papayawhip"/);
  assert.throws(t({ X: { band: ['#FFFFFF', '#CE1124'], accent: 'blue', onAccent: '#2B060B' } }), /unparseable accent "blue"/);
  assert.throws(t({ X: { band: ['#FFFFFF', '#CE1124'], accent: '#F8677A', onAccent: 'rgba(0,0,0,1)' } }), /unparseable onAccent/);
});

check('theming + clientJs.renderTeam override is a build error', () => {
  assert.throws(
    () => renderAppHtml(cfg({ nations: NATIONS }, 'function renderTeam(){}')),
    /teamTheming requires the standard My-Team flow/
  );
});

check('onAccent below AA on its accent fails (themed quiz button text)', () => {
  assert.throws(
    () => renderAppHtml(cfg({ nations: { X: { band: ['#FFFFFF', '#CE1124'], accent: '#F8677A', onAccent: '#F0F0F0' } } })),
    /teamTheming "X": onAccent on accent/
  );
});

console.log(failures ? `\n${failures} failing` : '\nALL team-theming cases passed.');
process.exit(failures ? 1 : 0);
