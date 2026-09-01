/**
 * In-progress daily-round persistence regression.
 *
 * Exercises the exact helpers emitted in the single-file app. Two isolated
 * runtimes share only a fake localStorage map, which models a page reload.
 *
 *   npx tsx src/round-progress.test.ts
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
    has: (key: string) => values.has(key),
  };
}

const html = renderAppHtml(cfg());
const helpers = ['clearDailyProgress', 'saveDailyProgress', 'validDailyProgress', 'loadDailyProgress']
  .map((name) => fnSrc(html, name)).join('\n');
const questions = Array.from({ length: 6 }, (_, i) => ({ id: `q${i + 1}`, answer: 'A' }));

function runtime(storage: ReturnType<typeof fakeStorage>, qs = questions) {
  const context: Record<string, unknown> = {
    localStorage: storage,
    PROGRESS_KEY: 'testwit.progress',
    MAX_POINTS: 100,
    currentDailyKey: () => '2026-08-31',
    questions: qs,
    idx: 0,
    total: 0,
    results: [],
    scoreAnswer: (q: { answer: string }, response: string) => ({
      points: q.answer === response ? 100 : 0,
    }),
  };
  vm.runInNewContext(`${helpers}\napi={clearDailyProgress,saveDailyProgress,validDailyProgress,loadDailyProgress};`, context);
  return context as typeof context & {
    api: {
      clearDailyProgress: () => void;
      saveDailyProgress: (revealed: boolean, response?: string | number) => void;
      validDailyProgress: (progress: unknown) => boolean;
      loadDailyProgress: () => {
        date: string; questionIds: string[]; idx: number; total: number;
        results: number[]; revealed: boolean; response?: string | number;
      } | null;
    };
    idx: number;
    total: number;
    results: number[];
  };
}

console.log('Daily round progress persistence — shipped shell\n');

// Save after Q1 and model the normal Next-question position.
const store = fakeStorage();
const beforeReload = runtime(store);
beforeReload.idx = 1;
beforeReload.total = 100;
beforeReload.results = [100];
beforeReload.api.saveDailyProgress(false);
const serialized = JSON.parse(store.getItem('testwit.progress') ?? 'null');
assert.equal(serialized.idx, 1, 'saved position is question 2');
assert.equal(serialized.total, 100, 'saved running score is current');
assert.deepEqual(serialized.results, [100], 'saved results include Q1');

// A brand-new runtime sees exactly the state the first runtime saved.
const afterReload = runtime(store);
assert.equal(afterReload.api.validDailyProgress(serialized), true, 'saved progress passes validation');
const restored = afterReload.api.loadDailyProgress();
assert.ok(restored, 'saved progress restores after a reload');
assert.equal(restored.idx, 1, 'reload resumes on question 2');
assert.equal(restored.total, 100, 'running score survives');
assert.deepEqual(Array.from(restored.results), [100], 'answered-question result survives');

// Reload while the reveal is still open: keep the current question and the
// response needed to reconstruct its locked options and reveal card.
const revealStore = fakeStorage();
const revealBefore = runtime(revealStore);
revealBefore.total = 100;
revealBefore.results = [100];
revealBefore.api.saveDailyProgress(true, 'A');
const revealRestored = runtime(revealStore).api.loadDailyProgress();
assert.ok(revealRestored?.revealed);
assert.equal(revealRestored.idx, 0);
assert.equal(revealRestored.response, 'A');

// A bank refresh that changes the selected questions invalidates the state;
// an index must never restore onto a different question.
const changed = questions.map((q, i) => i === 0 ? { ...q, id: 'replacement' } : q);
assert.equal(runtime(store, changed).api.loadDailyProgress(), null);
assert.equal(store.has('testwit.progress'), false, 'stale state is removed');

// Pin the production wiring, not just the helper behavior.
assert.ok(html.includes('const p=loadDailyProgress();'), 'daily entry loads progress');
assert.ok(html.includes('saveDailyProgress(true,resp);'), 'answer persists before reveal');
assert.ok(html.includes('idx++;saveDailyProgress(false);'), 'Next persists the new position');
assert.ok(html.includes('clearDailyProgress();\n  renderResult();'), 'completion clears transient state');

console.log('All round-progress checks passed.');
