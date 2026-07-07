/**
 * Deterministic checks for the opt-in cookieless engagement analytics
 * (render/app.ts analyticsChunks via renderAppHtml). Synthetic pack, no
 * network, no provider account — pure string assertions on the emitted shell.
 *
 *   npx tsx src/analytics.test.ts
 *
 * Cases:
 *   - analytics UNSET  → the original inline Vercel wiring, byte-for-byte
 *     (default-safe: no new script, no new events, sport ignored);
 *   - plausible/vercel/custom → the provider script + the anonymous
 *     round_completed / result_shared / practice_played events, with NO
 *     cookie, NO tracking id, NO PII anywhere in the emitted shell;
 *   - misconfiguration throws (plausible w/o domain, custom w/o endpoint).
 */
import assert from 'node:assert/strict';
import { renderAppHtml, type AppShellConfig } from './render/app';
import type { AnalyticsConfig } from './types';

function cfg(analytics?: AnalyticsConfig, sport?: string): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: 'https://example.test',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
      paletteCss: '    --bg:#0C0C0E;',
      notFoundPaletteCss: '--bg:#0C0C0E;',
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
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    analytics,
    sport,
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

console.log('Opt-in cookieless analytics — synthetic pack\n');

const NEW_MARKERS = [
  'round_completed',
  'result_shared',
  'practice_played',
  'streakBucket',
  'plausible',
  'sendBeacon',
];

check('unset: original Vercel wiring only — no new script, no new events', () => {
  const html = renderAppHtml(cfg());
  assert.ok(html.includes('<script defer src="/_vercel/insights/script.js"></script>'));
  assert.ok(html.includes('window.va = window.va || function ()'), 'va queue stub kept');
  assert.ok(html.includes("track('daily_completed',{score_bucket:"), 'original event kept');
  assert.ok(html.includes("track('shared');"), 'original share event kept');
  for (const m of NEW_MARKERS) assert.ok(!html.includes(m), `must not emit "${m}" when unset`);
  assert.ok(!html.includes('__ANALYTICS') && !html.includes('__TRACK'), 'no unresolved tokens');
});

check('unset: sport is ignored — output byte-identical with or without it', () => {
  assert.equal(renderAppHtml(cfg()), renderAppHtml(cfg(undefined, 'testball')));
});

check('plausible: provider script + anonymous events, Vercel wiring gone', () => {
  const html = renderAppHtml(cfg({ provider: 'plausible', domain: 'quiz.example' }, 'testball'));
  assert.ok(html.includes('data-domain="quiz.example"'));
  assert.ok(html.includes('src="https://plausible.io/js/script.js"'));
  assert.ok(html.includes('window.plausible = window.plausible ||'), 'queue stub');
  assert.ok(!html.includes('/_vercel/insights/script.js'), 'vercel script replaced');
  assert.ok(!html.includes('daily_completed') && !html.includes("track('shared')"), 'old events replaced');
  assert.ok(html.includes('const SPORT="testball";'));
  assert.ok(html.includes("track('round_completed',{sport:SPORT,streak_length:streakBucket(currentStreak(h,key)),num_correct:results.filter(p=>p>=100).length});"));
  assert.ok(html.includes("track('result_shared',{sport:SPORT,streak_length:streakBucket(streak)});"));
  assert.ok(html.includes("function answerPractice(resp){track('practice_played',{sport:SPORT});"));
  assert.ok(html.includes("function streakBucket(s){return s>=30?'30+':s>=7?'7-29':s>=2?'2-6':'1';}"));
});

check('privacy: no cookie, no tracking id, no fingerprint in any variant', () => {
  const variants = [
    renderAppHtml(cfg()),
    renderAppHtml(cfg({ provider: 'plausible', domain: 'quiz.example' }, 'testball')),
    renderAppHtml(cfg({ provider: 'vercel' }, 'testball')),
    renderAppHtml(cfg({ provider: 'custom', endpoint: 'https://example.test/e' }, 'testball')),
  ];
  for (const html of variants) {
    assert.ok(!html.includes('document.cookie'), 'no cookie access');
    // (the shell's own comments SAY "no fingerprint" — assert on real id tokens)
    for (const idish of ['userId', 'user_id', 'clientId', 'client_id', 'deviceId', 'uuid', 'randomUUID']) {
      assert.ok(!html.includes(idish), `no "${idish}"`);
    }
  }
  // event payloads carry only sport / streak bucket / correct count
  const track = variants[1].match(/track\('(round_completed|result_shared|practice_played)',\{([^}]*)\}/g)!;
  for (const t of track) {
    assert.ok(!/localStorage|navigator|history|team|pick/.test(t), `payload is aggregate-only: ${t}`);
  }
});

check('vercel provider: keeps the insights script, swaps in the new events', () => {
  const html = renderAppHtml(cfg({ provider: 'vercel' }, 'testball'));
  assert.ok(html.includes('<script defer src="/_vercel/insights/script.js"></script>'));
  assert.ok(html.includes("window.va('event',{name:name,data:data||{}})"));
  assert.ok(html.includes('round_completed') && html.includes('result_shared'));
  assert.ok(!html.includes('daily_completed'));
});

check('custom provider: first-party beacon to the endpoint, no third-party script', () => {
  const html = renderAppHtml(cfg({ provider: 'custom', endpoint: 'https://example.test/e' }, 'testball'));
  assert.ok(html.includes('navigator.sendBeacon("https://example.test/e",b)'));
  assert.ok(!html.includes('/_vercel/insights/script.js') && !html.includes('plausible.io'));
  assert.ok(html.includes('round_completed'));
});

check('misconfiguration throws before emitting anything', () => {
  assert.throws(() => renderAppHtml(cfg({ provider: 'plausible' })), /requires analytics\.domain/);
  assert.throws(() => renderAppHtml(cfg({ provider: 'custom' })), /requires analytics\.endpoint/);
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${7 - failures}/7 analytics cases passed.`);
if (failures) {
  console.error(`ANALYTICS TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
