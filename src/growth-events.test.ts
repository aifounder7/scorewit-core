/**
 * round_started / returning_round_completed (brief 0015) — behavioral
 * regression against the ACTUAL emitted answer()/finishDaily() functions, not
 * just a substring grep. Mirrors round-progress.test.ts's extraction pattern
 * (vm.runInNewContext over the real function source) so the firing/no-firing
 * conditions are proven against shipped code, not restated in the test.
 *
 *   npx tsx src/growth-events.test.ts
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderAppHtml, type AppShellConfig } from './render/app';

function cfg(): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit', appUrl: 'https://example.test', markSvg: '<svg/>',
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
      footerHtml: '<footer>No personal data, no cookies.</footer>', resultNote: 'r',
      teamPickerBanner: 'b', titleToday: 'Today', titlePractice: 'Practice',
      titleTeam: 'My Team', notFoundHeading: 'nf', notFoundBody: 'nf',
      notFoundActionsHtml: '<a href="/">home</a>',
    },
    client: {
      consts: '// pack consts',
      decorations: 'function teamLabel(n){return n;}function slLabel(s){return s;}',
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards: 'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    analytics: { provider: 'plausible', domain: 'quiz.example' },
    sport: 'testball',
  };
}

function fnSrc(html: string, name: string): string {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in shipped shell`);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
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

console.log('Growth-loop events: round_started / returning_round_completed — shipped shell\n');

const html = renderAppHtml(cfg());
// Pull the real EPOCH_UTC declaration line straight from the shipped shell —
// the same clock dayNumber()/currentStreak() use, not a re-guess.
const epochLine = /const EPOCH_UTC=Date\.UTC\([^;]+\);/.exec(html);
assert.ok(epochLine, 'EPOCH_UTC declaration found in shipped shell');
const helpers = [
  epochLine![0],
  fnSrc(html, 'dayNumber'),
  fnSrc(html, 'dateKeyFromDayNum'),
  fnSrc(html, 'currentStreak'),
  fnSrc(html, 'loadHistory'),
  fnSrc(html, 'saveHistory'),
  fnSrc(html, 'streakBucket'),
  fnSrc(html, 'gapBucket'),
  fnSrc(html, 'saveDailyProgress'),
  fnSrc(html, 'clearDailyProgress'),
  fnSrc(html, 'answer'),
  fnSrc(html, 'finishDaily'),
].join('\n');

const questions = Array.from({ length: 2 }, (_, i) => ({ id: `q${i + 1}`, answer: 'A' }));

function runtime(storage: ReturnType<typeof fakeStorage>, dailyKey: string, tracked: [string, unknown][]) {
  const context: Record<string, unknown> = {
    localStorage: storage,
    PROGRESS_KEY: 'testwit.progress',
    HISTORY_KEY: 'testwit.history',
    MAX_POINTS: 100,
    SPORT: 'testball',
    currentDailyKey: () => dailyKey,
    questions,
    idx: 0,
    total: 0,
    results: [] as number[],
    scoreAnswer: (_q: unknown, response: string) => ({ points: response === 'A' ? 100 : 0 }),
    // Cross the vm-realm boundary via JSON so deepEqual compares plain
    // outer-realm objects (a vm-sandbox object literal has a different
    // Object.prototype identity, which trips deepStrictEqual otherwise).
    track: (name: string, data?: unknown) => tracked.push([name, JSON.parse(JSON.stringify(data ?? null))]),
    // finishDaily()/answer() also call these render hooks — no-ops here,
    // the events under test fire before any of them run.
    renderDailyReveal: () => {},
    renderProgress: () => {},
    renderResult: () => {},
  };
  vm.runInNewContext(`${helpers}\napi={answer,finishDaily,loadHistory,saveHistory};`, context);
  return context as typeof context & {
    api: { answer: (r: string) => void; finishDaily: () => void; loadHistory: () => Record<string, unknown>; saveHistory: (h: unknown) => void };
    idx: number; total: number; results: number[];
  };
}

check('round_started fires exactly once, on the first answer only', () => {
  const tracked: [string, unknown][] = [];
  const rt = runtime(fakeStorage(), '2026-02-10', tracked);
  rt.api.answer('A'); // idx 0 -> fires
  rt.idx = 1;
  rt.api.answer('A'); // idx 1 -> must not re-fire
  const starts = tracked.filter(([n]) => n === 'round_started');
  assert.equal(starts.length, 1, 'exactly one round_started for the round');
  assert.deepEqual(starts[0][1], { sport: 'testball' });
});

check('round_started fires again on a genuinely new day (fresh idx=0)', () => {
  const store = fakeStorage();
  const day1: [string, unknown][] = [];
  runtime(store, '2026-02-10', day1).api.answer('A');
  assert.equal(day1.filter(([n]) => n === 'round_started').length, 1);
  const day2: [string, unknown][] = [];
  runtime(store, '2026-02-11', day2).api.answer('A');
  assert.equal(day2.filter(([n]) => n === 'round_started').length, 1, 'new day, new round, fires again');
});

check('round_started does not fire when resuming an in-progress round past Q1', () => {
  const tracked: [string, unknown][] = [];
  const rt = runtime(fakeStorage(), '2026-02-10', tracked);
  rt.idx = 1; // simulates a restored in-progress round already past question 1
  rt.api.answer('A');
  assert.equal(tracked.filter(([n]) => n === 'round_started').length, 0);
});

check('returning_round_completed does NOT fire on a first-ever completion', () => {
  const tracked: [string, unknown][] = [];
  const rt = runtime(fakeStorage(), '2026-02-10', tracked);
  rt.idx = questions.length; // both questions answered
  rt.total = 200; rt.results = [100, 100];
  rt.api.finishDaily();
  assert.equal(tracked.filter(([n]) => n === 'returning_round_completed').length, 0, 'no prior day in history');
  assert.equal(tracked.filter(([n]) => n === 'round_completed').length, 1, 'round_completed still fires');
});

function completeDay(store: ReturnType<typeof fakeStorage>, key: string, tracked: [string, unknown][]) {
  const rt = runtime(store, key, tracked);
  rt.idx = questions.length;
  rt.total = 200; rt.results = [100, 100];
  rt.api.finishDaily();
}

check('returning_round_completed gap_bucket: 1 / 2-6 / 7+ boundaries', () => {
  const cases: [string, string, string][] = [
    ['2026-02-10', '2026-02-11', '1'],   // 1 day gap
    ['2026-02-10', '2026-02-16', '2-6'], // 6 day gap (boundary)
    ['2026-02-10', '2026-02-17', '7+'],  // 7 day gap (boundary)
  ];
  for (const [first, second, bucket] of cases) {
    const store = fakeStorage();
    completeDay(store, first, []);
    const tracked: [string, unknown][] = [];
    completeDay(store, second, tracked);
    const ret = tracked.filter(([n]) => n === 'returning_round_completed');
    assert.equal(ret.length, 1, `${first} -> ${second}: fires once`);
    assert.deepEqual(ret[0][1], { sport: 'testball', gap_bucket: bucket }, `${first} -> ${second}: bucket ${bucket}`);
  }
});

check('returning_round_completed uses the MOST RECENT earlier day, not the oldest', () => {
  const store = fakeStorage();
  completeDay(store, '2026-01-01', []); // far past
  completeDay(store, '2026-02-10', []); // yesterday-ish, closer
  const tracked: [string, unknown][] = [];
  completeDay(store, '2026-02-11', tracked);
  const ret = tracked.filter(([n]) => n === 'returning_round_completed');
  assert.deepEqual(ret[0][1], { sport: 'testball', gap_bucket: '1' }, 'gap measured from the nearest prior day, not the first-ever one');
});

check('completing the SAME day twice does not double-fire either event', () => {
  const store = fakeStorage();
  completeDay(store, '2026-02-10', []);
  const tracked: [string, unknown][] = [];
  completeDay(store, '2026-02-10', tracked); // h[key] already set — the if() guards this
  assert.equal(tracked.length, 0, 'no track calls on a no-op repeat completion');
});

check('byte-identity: analytics unset emits neither token nor marker anywhere', () => {
  const unsetHtml = renderAppHtml({ ...cfg(), analytics: undefined });
  for (const m of ['round_started', 'returning_round_completed', 'gapBucket', '__TRACKSTART__']) {
    assert.ok(!unsetHtml.includes(m), `must not emit "${m}" when analytics unset`);
  }
  assert.ok(unsetHtml.includes('function answer(resp){\n'), 'answer() token resolves to empty, no residue');
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${9 - failures}/9 growth-events cases passed.`);
if (failures) {
  console.error(`GROWTH-EVENTS TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
