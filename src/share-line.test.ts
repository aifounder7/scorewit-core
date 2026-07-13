/**
 * Deterministic checks for the opt-in share insight line
 * (render/app.ts __SHARELINE__ via renderAppHtml). Synthetic pack — pure
 * string assertions on the emitted shell.
 *
 *   npx tsx src/share-line.test.ts
 *
 * Cases:
 *   - shareLine UNSET → buildShareText is byte-for-byte the incumbent code
 *     (default-safe: the token erases, streak line abuts the URL line);
 *   - shareLine set → the pack block lands between the streak line and the
 *     app URL, exactly once, with no unresolved token anywhere.
 */
import assert from 'node:assert/strict';
import { renderAppHtml, type AppShellConfig } from './render/app';

function cfg(shareLine?: string): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: 'https://example.test',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
      // Full AA-passing palette — renderAppHtml gates contrast at build time.
      paletteCss: `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`,
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
      shareLine,
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
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

console.log('Opt-in share insight line — synthetic pack\n');

// The incumbent buildShareText tail, exactly as it shipped before the token
// existed. The unset render MUST contain it verbatim (byte-identical proof
// at the unit level; the temp-clone verifier proves it per pack).
const INCUMBENT_TAIL =
  "  if(streak>1) lines.push('🔥 '+streak+'-day streak');\n" +
  '  if(APP_URL) lines.push(APP_URL);';

check('unset: buildShareText is byte-for-byte the incumbent code', () => {
  const html = renderAppHtml(cfg());
  assert.ok(html.includes(INCUMBENT_TAIL), 'streak line must abut the URL line with nothing between');
  assert.ok(!html.includes('__SHARELINE__'), 'no unresolved token');
});

check('set: the pack block lands between the streak line and the app URL, once', () => {
  const block = "  const il=shareInsightLine(); if(il) lines.push(il);\n";
  const html = renderAppHtml(cfg(block));
  const expected =
    "  if(streak>1) lines.push('🔥 '+streak+'-day streak');\n" +
    block +
    '  if(APP_URL) lines.push(APP_URL);';
  assert.ok(html.includes(expected), 'block must sit after streak, before URL');
  assert.equal(html.split(block).length - 1, 1, 'exactly once');
  assert.ok(!html.includes('__SHARELINE__'), 'no unresolved token');
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${2 - failures}/2 cases passed.`);
if (failures) {
  console.error(`SHARE-LINE TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
