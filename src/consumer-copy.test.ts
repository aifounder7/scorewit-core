import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderAppHtml, type AppShellConfig } from './render/app';

const cfg: AppShellConfig = {
  brand: { appName: 'Test', appUrl: 'https://example.test', markSvg: '<svg/>',
    themeColor: '#0C0C0E', notFoundPaletteCss: '',
    paletteCss: '--bg:#0C0C0E;--elev:#161619;--surface:#222228;--hover:#2E2E36;--text:#EDEDEF;--text2:#9A9AA3;--text3:#84848D;--accent:#4E9CF5;--accentDim:rgba(78,156,245,.14);--practice:#A78BFA;--practiceDim:rgba(167,139,250,.14);--team:#5BC0CE;--teamDim:rgba(91,192,206,.14);--today:#E879A6;--todayDim:rgba(232,121,166,.14);--correct:#2ECC71;--correctDim:rgba(46,204,113,.14);--incorrect:#EA4058;--incorrectDim:rgba(232,54,79,.14);--partial:#F5A623;' },
  copy: { title: 't', metaDescription: 'm', ogTitle: 'o', ogDescription: 'o',
    twitterTitle: 't', twitterDescription: 't', subInitial: 's', footerHtml: '<footer/>',
    resultNote: 'r', teamPickerBanner: 'b', titleToday: 'Today', titlePractice: 'Practice',
    titleTeam: 'Team', notFoundHeading: 'nf', notFoundBody: 'nf', notFoundActionsHtml: '' },
  client: { consts: '', decorations: 'function teamLabel(n){return n;}function slLabel(n){return n;}',
    teamCards: 'function teamInsightsHtml(){return "";}', todayCards: 'function fixtureHtml(){return "";}function pickRecordHtml(){return "";}' },
  config: { storagePrefix: 'test', epochUtcArgs: '2026,0,1' },
  data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
};
function fn(html: string, name: string): string {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Unbalanced ${name}`);
}
const cue = { upcoming: 'Next daily round: {date} at midnight (your local time).',
  available: 'A newer daily round is ready. Reload this page to play.' };
const labels = { basics_race_winner: 'Race winners', rivalry: 'Drivers & teams' };
const base = renderAppHtml(cfg);
const enabled = renderAppHtml({ ...cfg, copy: { ...cfg.copy, topicLabels: labels, dailyReturnCue: cue } });
assert.ok(!base.includes('DAILY_RETURN_CUE') && !base.includes('TOPIC_LABELS'));
assert.equal(base, renderAppHtml({ ...cfg, copy: { ...cfg.copy, topicLabels: undefined, dailyReturnCue: undefined } }));
// Display additions cannot change engine functions or their telemetry/progress calls.
for (const name of ['todayKey', 'selectDaily', 'scoreAnswer', 'finishDaily', 'saveDailyProgress', 'buildShareText']) {
  assert.equal(fn(enabled, name), fn(base, name), `${name} unchanged`);
}
assert.equal(enabled.match(/\+dailyReturnHtml\(\)\+/g)?.length, 1);
for (const name of ['renderPractice', 'renderTeam', 'renderStats', 'teamQuizHtml']) {
  assert.ok(!fn(enabled, name).includes('dailyReturnHtml'), `${name} has no daily cue`);
}
const context = vm.createContext({ Date, mode: 'daily', key: '2026-09-14' });
vm.runInContext(`const TOPIC_LABELS=${JSON.stringify(labels)};const DAILY_RETURN_CUE=${JSON.stringify(cue)};
function currentDailyKey(){return key;}
${['todayKey','esc','topicLabel','chip','nextDailyDate','dailyReturnHtml'].map(n=>fn(enabled,n)).join('\n')}`, context);
const run = (code: string) => vm.runInContext(code, context);
assert.equal(run(`topicLabel({topic:'basics_race_winner'})`), 'Race winners');
assert.equal(run(`topicLabel({topic:'unknown_topic'})`), 'unknown topic');
assert.equal(run(`topicLabel({topic:'constructor'})`), 'constructor');
assert.ok(run(`chip({difficulty:'easy',era:'2020s',topic:'rivalry'})`).includes('Drivers &amp; teams'));
assert.ok(run(`chip({difficulty:'easy',era:'2020s',topic:'<unknown>'})`).includes('&lt;unknown&gt;'));

// The daily selector uses LOCAL date components; the epoch alone is UTC.
// Force explicit zones so this test is independent of the developer's clock.
const originalTZ = process.env.TZ;
try {
  process.env.TZ = 'America/Los_Angeles';
  for (const [key, iso, hours] of [
    ['2026-03-08','2026-03-09T07:00:00.000Z',23],
    ['2026-11-01','2026-11-02T08:00:00.000Z',25],
    ['2026-12-31','2027-01-01T08:00:00.000Z',24],
  ] as const) {
    context.key = key;
    assert.equal(run(`nextDailyDate(key).toISOString()`), iso);
    assert.equal(run(`(nextDailyDate(key)-new Date(key+'T00:00:00'))/3600000`), hours);
    assert.ok(run(`dailyReturnHtml(new Date(nextDailyDate(key)-1))`).includes('at midnight (your local time).'));
    assert.ok(run(`dailyReturnHtml(nextDailyDate(key))`).includes(cue.available));
  }
  context.key = '2026-09-14';
  assert.ok(run(`dailyReturnHtml(new Date('2026-09-15T01:00:00Z'))`).includes('2026-09-15 at midnight'));
  assert.equal(run(`todayKey(new Date('2026-09-15T01:00:00Z'))`), '2026-09-14');
  process.env.TZ = 'Asia/Tokyo';
  assert.equal(run(`nextDailyDate(key).toISOString()`), '2026-09-14T15:00:00.000Z');
  for (const mode of ['practice', 'today', 'team']) {
    context.mode = mode;
    assert.equal(run('dailyReturnHtml()'), '');
  }
} finally {
  if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
}
for (const bad of [{...cue,upcoming:'No date'}, {...cue,upcoming:'{date} {date}'}, {...cue,available:'<script/>'}]) {
  assert.throws(()=>renderAppHtml({...cfg,copy:{...cfg.copy,dailyReturnCue:bad}}), /dailyReturnCue/);
}
assert.throws(()=>renderAppHtml({...cfg,copy:{...cfg.copy,topicLabels:{test:'<b>Test</b>'}}}), /topicLabels/);
console.log('Consumer copy: labels, fallback, daily-only cue, local clock, DST and unchanged engine passed.');
