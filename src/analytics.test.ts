/**
 * Deterministic checks for the opt-in cookieless engagement analytics
 * (render/app.ts analyticsChunks via renderAppHtml). Synthetic pack, no
 * network, no provider account — pure string assertions on the emitted shell.
 *
 *   npx tsx src/analytics.test.ts
 *
 * Cases:
 *   - analytics UNSET  → the original inline Vercel wiring, byte-for-byte
 *     (default-safe: no new script, no new events, sport ignored) — plus the
 *     terms-assent line, the ONLY addition an analytics-unset app gains;
 *   - plausible/vercel/custom → the provider script + the anonymous
 *     round_completed / result_shared / practice_played events, with NO
 *     cookie, NO tracking id, NO PII anywhere in the emitted shell;
 *   - the analytics-off switch: flag set ⇒ ZERO events on every provider
 *     (the generated track() is executed against stubs, not just grepped),
 *     flag unset ⇒ emission unchanged; the settings card renders exactly
 *     once iff analytics is configured; plausible mirrors plausible_ignore;
 *   - the terms-assent line renders exactly once in every variant;
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
      // A full AA-passing palette: renderAppHtml gates palette contrast at
      // build time (src/contrast.ts), so the fixture must carry every token.
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
  'analyticsOff',
  'ANOFF_KEY',
  'Don&#39;t count me in analytics',
];

/** Extract the spliced analytics JS chunk and return its live functions,
 *  executed against stubs (no browser): the flag gate is TESTED, not grepped. */
function evalAnalytics(html: string, storage: ReturnType<typeof fakeStorage>, win: Record<string, unknown>, nav: Record<string, unknown>) {
  const start = html.indexOf('// ---- Engagement events');
  const end = html.indexOf('\n\nfunction teamLabel', start);
  assert.ok(start >= 0 && end > start, 'analytics chunk found in shell');
  const src = html.slice(start, end);
  const fn = new Function(
    'window', 'localStorage', 'navigator', 'fetch',
    src + '\nreturn {track:track,analyticsOff:analyticsOff,setAnalyticsOff:setAnalyticsOff};'
  );
  return fn(win, storage, nav, () => {}) as {
    track: (name: string, data?: unknown) => void;
    analyticsOff: () => boolean;
    setAnalyticsOff: (v: boolean) => void;
  };
}

function fakeStorage(init?: Record<string, string>) {
  const m = new Map(Object.entries(init ?? {}));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
    get: (k: string) => m.get(k),
  };
}

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

check('shell head: self-referential canonical on the app URL, exactly once', () => {
  const html = renderAppHtml(cfg());
  const tag = '<link rel="canonical" href="https://example.test/" />';
  assert.ok(html.includes(tag), 'index declares its own canonical host URL');
  assert.equal(html.indexOf(tag), html.lastIndexOf(tag), 'canonical appears once');
});

check('plausible: gated provider loader + anonymous events, Vercel wiring gone', () => {
  const html = renderAppHtml(cfg({ provider: 'plausible', domain: 'quiz.example' }, 'testball'));
  assert.ok(html.includes("s.setAttribute('data-domain','quiz.example')"));
  assert.ok(html.includes("s.src='https://plausible.io/js/script.js'"));
  assert.ok(
    html.includes("localStorage.getItem('testwit.analyticsOff')==='1'"),
    'head loader honors the analytics-off switch (storagePrefix substituted)'
  );
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

check('vercel provider: gated insights loader, swaps in the new events', () => {
  const html = renderAppHtml(cfg({ provider: 'vercel' }, 'testball'));
  assert.ok(html.includes("s.src='/_vercel/insights/script.js'"), 'loader-injected script');
  assert.ok(!html.includes('<script defer src="/_vercel/insights/script.js"></script>'), 'static tag replaced by the gated loader');
  assert.ok(html.includes("localStorage.getItem('testwit.analyticsOff')==='1'"), 'loader honors the switch');
  assert.ok(html.includes("window.va('event',{name:name,data:data||{}})"));
  assert.ok(html.includes('round_completed') && html.includes('result_shared'));
  assert.ok(!html.includes('daily_completed'));
});

check('analytics-off switch: flag set ⇒ zero events on EVERY provider; unset ⇒ unchanged', () => {
  const make = (provider: 'plausible' | 'vercel' | 'custom') => {
    const analytics =
      provider === 'plausible' ? { provider, domain: 'quiz.example' } :
      provider === 'custom' ? { provider, endpoint: 'https://example.test/e' } : { provider };
    const html = renderAppHtml(cfg(analytics as AnalyticsConfig, 'testball'));
    let fired = 0;
    const win: Record<string, unknown> = {
      plausible: () => { fired++; },
      va: () => { fired++; },
    };
    const nav = { sendBeacon: () => { fired++; return true; } };
    return { html, win, nav, fired: () => fired };
  };
  for (const provider of ['plausible', 'vercel', 'custom'] as const) {
    // flag SET before load: no event fires, ever
    const off = make(provider);
    const offApi = evalAnalytics(off.html, fakeStorage({ 'testwit.analyticsOff': '1' }), off.win, off.nav);
    offApi.track('round_completed', { sport: 'testball' });
    offApi.track('result_shared');
    assert.equal(off.fired(), 0, `${provider}: zero events with the flag set`);
    assert.equal(offApi.analyticsOff(), true);
    // flag UNSET: emission unchanged
    const on = make(provider);
    const onApi = evalAnalytics(on.html, fakeStorage(), on.win, on.nav);
    onApi.track('round_completed', { sport: 'testball' });
    assert.equal(on.fired(), 1, `${provider}: events emit normally with the flag unset`);
    // flipping the switch mid-session stops the next event immediately
    onApi.setAnalyticsOff(true);
    onApi.track('practice_played');
    assert.equal(on.fired(), 1, `${provider}: no event after opting out mid-session`);
  }
});

check('analytics-off switch: plausible toggle mirrors plausible_ignore; others do not', () => {
  const html = renderAppHtml(cfg({ provider: 'plausible', domain: 'quiz.example' }, 'testball'));
  const store = fakeStorage();
  const api = evalAnalytics(html, store, { plausible: () => {} }, {});
  api.setAnalyticsOff(true);
  assert.equal(store.get('testwit.analyticsOff'), '1');
  assert.equal(store.get('plausible_ignore'), 'true', 'official Plausible opt-out mirrored on');
  api.setAnalyticsOff(false);
  assert.ok(!store.has('testwit.analyticsOff'), 'flag cleared');
  assert.ok(!store.has('plausible_ignore'), 'mirror cleared');
  const vhtml = renderAppHtml(cfg({ provider: 'vercel' }, 'testball'));
  const vstore = fakeStorage();
  const vapi = evalAnalytics(vhtml, vstore, { va: () => {} }, {});
  vapi.setAnalyticsOff(true);
  assert.ok(!vstore.has('plausible_ignore'), 'non-plausible providers leave plausible_ignore alone');
});

check('settings card: exactly once when analytics is set, absent when unset', () => {
  const set = renderAppHtml(cfg({ provider: 'plausible', domain: 'quiz.example' }, 'testball'));
  assert.equal(set.split('Don&#39;t count me in analytics').length - 1, 1, 'toggle rendered exactly once');
  assert.equal(set.split('<h3>Settings</h3>').length - 1, 1, 'settings card exactly once');
  assert.ok(set.includes("document.getElementById('anoff').onchange"), 'toggle wired');
  const unset = renderAppHtml(cfg());
  assert.ok(!unset.includes('Settings'), 'no settings card when analytics unset');
  assert.ok(!unset.includes('anoff'), 'no toggle wiring when analytics unset');
});

check('terms-assent line: exactly once in every variant; default URL; override honored', () => {
  const assent = 'By playing you agree to the <a href="https://scorewit.com/terms">Terms</a>';
  const variants = [
    renderAppHtml(cfg()),
    renderAppHtml(cfg({ provider: 'plausible', domain: 'quiz.example' }, 'testball')),
    renderAppHtml(cfg({ provider: 'vercel' }, 'testball')),
    renderAppHtml(cfg({ provider: 'custom', endpoint: 'https://example.test/e' }, 'testball')),
  ];
  for (const html of variants) {
    assert.equal(html.split('class="assent"').length - 1, 1, 'assent line exactly once');
    assert.ok(html.includes(assent), 'default umbrella terms URL');
  }
  const custom = { ...cfg(), termsUrl: '/terms' };
  const html = renderAppHtml(custom);
  assert.ok(html.includes('By playing you agree to the <a href="/terms">Terms</a>'), 'termsUrl override');
  assert.ok(!html.includes('__TERMSURL__'), 'no unresolved token');
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

console.log(`\n${failures === 0 ? 'ALL' : ''} ${11 - failures}/11 analytics cases passed.`);
if (failures) {
  console.error(`ANALYTICS TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
