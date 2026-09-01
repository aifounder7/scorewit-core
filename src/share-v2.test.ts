/**
 * SHARE V2 — the three-line share format (render/app.ts client.shareV2).
 *
 * The emitted client block is extracted from the rendered shell and executed
 * with a controlled day clock, so every fixture below pins the EXACT bytes a
 * player pastes into a chat:
 *
 *   {icon} Scorewit {shareName} #{roundNumber}
 *   {grid} {score}/600 · {rankTitle}
 *   🔥 Day {streak} · beat me: scorewit.com/{path}#s
 *
 * Cases: full-string fixtures per tier/edge (0/600 all-wrong, perfect 600,
 * partial-only round, mixed grid), the score→title band sweep (exactly 600
 * upgrades to the 6th title), option validation, mutual exclusion with
 * shareLine, the end-of-round rank title, the #s share-visit hook, and the
 * unset path leaving zero residue.
 *
 *   npx tsx src/share-v2.test.ts
 */
import assert from 'node:assert/strict';
import { renderAppHtml, type AppShellConfig } from './render/app';

const LADDER = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5'];

function cfg(over?: Partial<AppShellConfig['client']>, analytics = false): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: 'https://www.scorewit.com/testcup',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
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
      shareV2: { shareName: 'Test Cup', shareIcon: '⚽', rankLadder: LADDER },
      ...over,
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    theme: { name: 'almanac', accent: 'soccer' },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    ...(analytics ? { analytics: { provider: 'plausible' as const, domain: 'scorewit.com' } } : {}),
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

console.log('SHARE V2 — three-line share format\n');

const html = renderAppHtml(cfg());
const m = html.match(/\/\/ ---- SHARE V2 \(see share-v2\.test\.ts\)[\s\S]*?\/\/ ---- end SHARE V2 ----/);
assert.ok(m, 'SHARE V2 client block not found in rendered shell');
const block = m![0];

/** Run the shipped buildShareText with a controlled day clock. Day 216 since
 *  the 2026-01-01 epoch = 2026-08-05 = round #217. */
function shareText(results: number[], streak: number, dayNum = 216): string {
  const fn = new Function(
    'dayNumber', 'currentDailyKey', 'results', 'total', 'questions', 'streak',
    `${block}\nreturn buildShareText(streak);`
  );
  const total = results.reduce((a, b) => a + b, 0);
  return fn(() => dayNum, () => 'stub-key', results, total, { length: 6 }, streak) as string;
}

function rank(score: number): string {
  const fn = new Function('sc', `${block}\nreturn rankTitle(sc);`);
  return fn(score) as string;
}

// ---- full three-line fixtures (exact bytes) ----

check('all-wrong round: ⭕ grid, 0/600, worst title, Day 1 valid copy', () => {
  assert.equal(
    shareText([0, 0, 0, 0, 0, 0], 1),
    '⚽ Scorewit Test Cup #217\n⭕⭕⭕⭕⭕⭕ 0/600 · R0\n🔥 Day 1 · beat me: scorewit.com/testcup#s'
  );
});

check('perfect round: 600 upgrades to the 6th title', () => {
  assert.equal(
    shareText([100, 100, 100, 100, 100, 100], 3),
    '⚽ Scorewit Test Cup #217\n🟢🟢🟢🟢🟢🟢 600/600 · R5\n🔥 Day 3 · beat me: scorewit.com/testcup#s'
  );
});

check('partial-only round: 🟡 grid, banded title', () => {
  assert.equal(
    shareText([50, 50, 50, 50, 50, 50], 2),
    '⚽ Scorewit Test Cup #217\n🟡🟡🟡🟡🟡🟡 300/600 · R2\n🔥 Day 2 · beat me: scorewit.com/testcup#s'
  );
});

check('mixed round: grid order mirrors the answer order', () => {
  assert.equal(
    shareText([100, 50, 0, 100, 100, 50], 7),
    '⚽ Scorewit Test Cup #217\n🟢🟡⭕🟢🟢🟡 400/600 · R3\n🔥 Day 7 · beat me: scorewit.com/testcup#s'
  );
});

check('round number is epoch-deterministic (#1 = the daily epoch)', () => {
  assert.ok(shareText([0, 0, 0, 0, 0, 0], 1, 0).startsWith('⚽ Scorewit Test Cup #1\n'));
  assert.ok(shareText([0, 0, 0, 0, 0, 0], 1, 41).startsWith('⚽ Scorewit Test Cup #42\n'));
});

// ---- the score→title bands ----

check('bands: 0-119 / 120-239 / 240-359 / 360-479 / 480-600, exactly 600 = perfect', () => {
  const expect: [number, string][] = [
    [0, 'R0'], [119, 'R0'], [120, 'R1'], [239, 'R1'], [240, 'R2'], [359, 'R2'],
    [360, 'R3'], [479, 'R3'], [480, 'R4'], [599, 'R4'], [600, 'R5'],
  ];
  for (const [sc, want] of expect) assert.equal(rank(sc), want, `score ${sc}`);
});

// ---- surfaces + wiring ----

check('end-of-round card shows the earned title (markup + AA-gated CSS)', () => {
  assert.ok(html.includes(`'<div class="ranktitle">'+rankTitle(total)+'</div>'`), 'rank title markup');
  assert.ok(html.includes('.ranktitle{font-size:15px;font-weight:800;color:var(--accent)'), 'rank title CSS');
});

check('no legacy glyphs or squares remain in a v2+theme render', () => {
  for (const g of ['🟩', '🟨', '🟥', '🔴']) assert.ok(!html.includes(g), `no ${g}`);
  assert.ok(!html.includes('class="squares"'), 'squares markup gone');
});

check('share-visit: #s hook rides the analytics module (and only it), sport prop included', () => {
  const withA = renderAppHtml(cfg(undefined, true));
  assert.ok(
    withA.includes(`if(location.hash==='#s'){track('share-visit',{sport:SPORT});try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}}`),
    'share-visit hook present with analytics configured, carrying sport'
  );
  assert.ok(!html.includes(`track('share-visit')`), 'no hook without analytics');
});

// ---- validation + the unset path ----

check('validation: partial options, bad ladder, and shareLine+v2 all throw', () => {
  const bad = (c: Partial<AppShellConfig['client']>) => () => renderAppHtml(cfg(c));
  assert.throws(bad({ shareV2: { shareName: '', shareIcon: '⚽', rankLadder: LADDER } }), /shareName/);
  assert.throws(bad({ shareV2: { shareName: 'X', shareIcon: ' ', rankLadder: LADDER } }), /shareIcon/);
  assert.throws(bad({ shareV2: { shareName: 'X', shareIcon: '⚽', rankLadder: LADDER.slice(0, 5) } }), /exactly 6/);
  assert.throws(bad({ shareV2: { shareName: 'X', shareIcon: '⚽', rankLadder: [...LADDER.slice(0, 5), ' '] } }), /exactly 6/);
  assert.throws(
    bad({ shareV2: { shareName: 'X', shareIcon: '⚽', rankLadder: LADDER }, shareLine: 'lines.push("x");' }),
    /mutually exclusive/
  );
});

check('unset: zero residue — incumbent share text intact', () => {
  const plain = renderAppHtml(cfg({ shareV2: undefined }));
  assert.ok(!plain.includes('SHARE_NAME') && !plain.includes('roundNumber'), 'no v2 client code');
  assert.ok(!plain.includes('ranktitle'), 'no rank title');
  assert.ok(plain.includes(`const lines=[APP_NAME+' '+currentDailyKey()`), 'incumbent buildShareText');
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${11 - failures}/11 cases passed.`);
if (failures) {
  console.error(`SHARE-V2 TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
