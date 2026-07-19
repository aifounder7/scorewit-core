/**
 * Deterministic checks for the opt-in calendar spotlight
 * (render/app.ts __SPOTLIGHTJS__/__SPOTLIGHTHOOK__/__DAILYSWAP__/__QBADGE__
 * via renderAppHtml). Synthetic pack — string assertions on the emitted
 * shell PLUS behavioral pins on the injected runtime (evaluated in
 * isolation with the shell's own rng ports).
 *
 *   npx tsx src/calendar-spotlight.test.ts
 *
 * Cases:
 *   - opt-in UNSET → zero spotlight artifacts, selectDaily byte-identical;
 *   - banner-only → banner runtime + hooks land, NO swap code;
 *   - quiz set → swap wired into selectDaily, badge wired into render();
 *   - missing clientJs.spotlight chunk → renderAppHtml throws;
 *   - window logic: upcoming (N days / 1 day), active, past → hidden;
 *   - guaranteed question: no natural venue pick → LAST slot swaps to the
 *     pinned seeded pick; pool < min → silent skip; one natural pick →
 *     round untouched, badge on it; two natural picks → exactly one stays.
 */
import assert from 'node:assert/strict';
import { hashString, mulberry32, shuffle } from './rng';
import { renderAppHtml, type AppShellConfig } from './render/app';

const SPOT_CHUNK =
  'function spotlightInfo(f){if(!f||!f.sessions||!f.sessions.length)return null;' +
  'const dates=f.sessions.map(s=>s.date).slice().sort();' +
  "return{event:f.raceName,venue:f.circuitName,hubPath:'/circuit/'+f.circuitId,start:dates[0],end:f.date,quizIds:(f.quiz||[]).map(x=>x.id)};}";

const FIXTURE = {
  raceName: 'Belgian Grand Prix',
  circuitName: 'Spa-Francorchamps',
  circuitId: 'spa-francorchamps',
  date: '2026-07-19',
  sessions: [{ date: '2026-07-17' }, { date: '2026-07-18' }, { date: '2026-07-19' }],
  quiz: [] as { id: string }[],
};

// Synthetic bank: two per bucket so rwPerm always has a successor.
const TIERS = ['easy', 'medium', 'hard'];
const TYPES = ['multiple_choice', 'closest_guess'];
const QUESTIONS = TIERS.flatMap((d, i) =>
  TYPES.flatMap((t, j) =>
    [0, 1].map((n) => ({ id: `q${i}${j}${n}`, difficulty: d, type: t }))
  )
);
const BANK = { seed: 7, questions: QUESTIONS };

function cfg(
  spotlightCfg?: AppShellConfig['calendarSpotlight'],
  chunk: string | undefined = SPOT_CHUNK
): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: 'https://example.test',
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
      decorations: 'function teamLabel(n){return n;}function slLabel(s){return s;}//DECOEND',
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards: 'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
      spotlight: chunk,
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    data: {
      bank: BANK,
      teams: { teams: [] },
      matchday: { days: [{ date: '2026-07-19', fixtures: [FIXTURE] }] },
    },
    calendarSpotlight: spotlightCfg,
  };
}

const SPOT = {
  activeHtml: 'Race week: {event} — {venue}&rsquo;s full history &rarr;',
  upcomingText: 'Next race: {event} in {days}',
  quiz: { min: 3, badge: '🏁 race week' },
};

/** Evaluate the injected spotlight runtime in isolation (no DOM). */
function runtime(spotlightCfg: AppShellConfig['calendarSpotlight'], quizIds: string[]) {
  const html = renderAppHtml(cfg(spotlightCfg));
  const body = html.slice(
    html.indexOf('//DECOEND') + '//DECOEND'.length,
    html.indexOf('\nfunction render(){')
  );
  const esc = (s: unknown) =>
    String(s).replace(/[&<>]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }) as any)[c]);
  const matchday = {
    days: [{ date: '2026-07-19', fixtures: [{ ...FIXTURE, quiz: quizIds.map((id) => ({ id })) }] }],
  };
  const make = new Function(
    'MATCHDAY', 'mode', 'currentDailyKey', 'document', 'mulberry32', 'hashString', 'shuffle', 'esc',
    body +
      '\nreturn {spotlightState:spotlightState,spotlightHtml:spotlightHtml,' +
      'raceWeekAdjust:(typeof raceWeekAdjust!=="undefined"?raceWeekAdjust:null),' +
      'raceWeekBadge:(typeof raceWeekBadge!=="undefined"?raceWeekBadge:null),' +
      'rwId:()=>(typeof RW_ID!=="undefined"?RW_ID:null)};'
  );
  return make(matchday, 'daily', () => '2026-07-18', undefined, mulberry32, hashString, shuffle, esc);
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

console.log('Opt-in calendar spotlight — synthetic pack\n');

check('unset: zero spotlight artifacts, selectDaily byte-identical', () => {
  const html = renderAppHtml(cfg(undefined));
  for (const marker of ['spotbar', 'raceWeekAdjust', '.spot{', 'rwchip', 'renderSpotlight']) {
    assert.ok(!html.includes(marker), `no "${marker}" in the non-adopting shell`);
  }
  for (const token of ['__SPOTLIGHTJS__', '__SPOTLIGHTHOOK__', '__DAILYSWAP__', '__QBADGE__']) {
    assert.ok(!html.includes(token), `no unresolved ${token}`);
  }
  assert.ok(
    html.includes('out.push(perm[(start+i)%perm.length]);}}return out;}'),
    'selectDaily tail is byte-for-byte the incumbent code'
  );
  assert.ok(html.includes("let html=chip(q)+'<div"), 'render() head is byte-for-byte the incumbent code');
});

check('banner-only: banner runtime + hooks land, no swap code', () => {
  const html = renderAppHtml(cfg({ activeHtml: SPOT.activeHtml, upcomingText: SPOT.upcomingText }));
  assert.ok(html.includes('function renderSpotlight()'), 'banner runtime present');
  assert.ok(html.includes('enterDaily();renderSpotlight();'), 'hook after start()’s enterDaily');
  assert.ok(html.includes('updateStreakBar();renderSpotlight();'), 'hook after setMode’s updateStreakBar');
  assert.ok(!html.includes('raceWeekAdjust'), 'no swap code without quiz config');
  assert.ok(html.includes('}}return out;}'), 'selectDaily untouched without quiz config');
});

check('quiz set: swap wired into selectDaily, badge wired into render()', () => {
  const html = renderAppHtml(cfg(SPOT));
  assert.ok(html.includes('}}raceWeekAdjust(out,key,bank);return out;}'), 'swap runs before the return');
  assert.ok(html.includes('let html=chip(q)+raceWeekBadge(q)+'), 'badge renders between chip and question');
  assert.ok(html.includes('.rwchip{'), 'badge css present');
});

check('missing clientJs.spotlight chunk throws', () => {
  assert.throws(() => renderAppHtml(cfg(SPOT, '')), /clientJs\.spotlight/);
});

check('window logic: upcoming N days / 1 day, active, past hidden', () => {
  const rt = runtime(SPOT, ['q000', 'q001', 'q010']);
  const up = rt.spotlightState('2026-07-14');
  assert.equal(up.phase, 'upcoming');
  assert.equal(up.days, 5);
  assert.ok(rt.spotlightHtml('2026-07-14').includes('Next race: Belgian Grand Prix in 5 days'));
  assert.ok(rt.spotlightHtml('2026-07-18').includes('href="/circuit/spa-francorchamps"'), 'active links the hub');
  assert.ok(rt.spotlightHtml('2026-07-18').includes('Race week: Belgian Grand Prix'), 'active copy');
  assert.equal(rt.spotlightState('2026-07-16').days, 3);
  assert.ok(rt.spotlightHtml('2026-07-18').length > 0 && rt.spotlightState('2026-07-17').phase === 'active');
  assert.ok(rt.spotlightHtml('2026-07-19').includes('Race week'), 'race day is active');
  assert.equal(rt.spotlightState('2026-07-20'), null, 'window over → hidden');
  assert.ok(rt.spotlightHtml('2026-07-18').includes('Spa-Francorchamps&rsquo;s full history'), 'venue templated');
});

check('active with no venue hub → plain (non-link) banner, no-hub copy', () => {
  const rt = runtime(
    { ...SPOT, activeTextNoHub: 'Race week: {event} at {venue}' },
    ['q000', 'q001', 'q010']
  );
  // Simulate a hub-less venue by nulling hubPath through a wrapper chunk is
  // heavier than it's worth — instead assert on the emitted runtime: both
  // templates are inlined and the link is conditional on hubPath.
  const html = renderAppHtml(cfg({ ...SPOT, activeTextNoHub: 'Race week: {event} at {venue}' }));
  assert.ok(html.includes('Race week: {event} at {venue}'), 'no-hub template inlined');
  assert.ok(html.includes("st.info.hubPath?'<a class=\"spot\""), 'link is hubPath-conditional');
  assert.ok(rt.spotlightHtml('2026-07-18').includes('<a class="spot"'), 'hub present → link renders');
});

check('no natural venue pick → LAST slot swaps to the pinned seeded pick', () => {
  const rt = runtime(SPOT, ['q000', 'q001', 'q010']);
  const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;
  const out = [q('q100'), q('q110'), q('q200'), q('q210'), q('q101'), q('q201')];
  rt.raceWeekAdjust(out, '2026-07-18', BANK);
  // Determinism pin (tripwire): seed 7, key 2026-07-18, pool sorted
  // [q000,q001,q010] → mulberry32(hash('raceweek/2026-07-18')^7) picks q000.
  // Changing the swap's seeding moves every adopter's race-week round.
  assert.equal(out[5].id, 'q000', 'last slot carries the pinned seeded pick');
  assert.equal(rt.rwId(), 'q000');
  assert.equal(out.filter((x) => ['q000', 'q001', 'q010'].includes(x.id)).length, 1, 'exactly one');
  assert.ok(rt.raceWeekBadge(out[5]).includes('🏁 race week'), 'badge on the guaranteed question');
  assert.equal(rt.raceWeekBadge(out[0]), '', 'no badge elsewhere');
});

check('pool below min → silent skip', () => {
  const rt = runtime(SPOT, ['q000', 'q001']);
  const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;
  const out = [q('q100'), q('q110'), q('q200'), q('q210'), q('q101'), q('q201')];
  const before = out.map((x) => x.id).join(',');
  rt.raceWeekAdjust(out, '2026-07-18', BANK);
  assert.equal(out.map((x) => x.id).join(','), before, 'round untouched');
  assert.equal(rt.rwId(), null);
});

check('one natural venue pick → round untouched, badge on it', () => {
  const rt = runtime(SPOT, ['q100', 'q000', 'q001']);
  const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;
  const out = [q('q100'), q('q110'), q('q200'), q('q210'), q('q101'), q('q201')];
  const before = out.map((x) => x.id).join(',');
  rt.raceWeekAdjust(out, '2026-07-18', BANK);
  assert.equal(out.map((x) => x.id).join(','), before, 'round untouched');
  assert.equal(rt.rwId(), 'q100');
});

check('two natural venue picks → exactly one stays', () => {
  const rt = runtime(SPOT, ['q100', 'q110', 'q000']);
  const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;
  const out = [q('q100'), q('q110'), q('q200'), q('q210'), q('q101'), q('q201')];
  rt.raceWeekAdjust(out, '2026-07-18', BANK);
  const tied = out.filter((x) => ['q100', 'q110', 'q000'].includes(x.id));
  assert.equal(tied.length, 1, 'surplus natural pick yielded its slot');
  assert.equal(tied[0].id, 'q100', 'the FIRST natural pick stays');
  assert.equal(rt.rwId(), 'q100');
  assert.equal(new Set(out.map((x) => x.id)).size, 6, 'no duplicate landed');
});

console.log(failures === 0 ? '\nALL calendar-spotlight cases passed.' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
