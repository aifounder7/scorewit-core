/**
 * Opt-in SEO-page analytics (brief 0015: seo_play_clicked + the shared
 * Plausible loader on crawlable pages). Synthetic pack, no network.
 *
 *   npx tsx src/seo-analytics.test.ts
 *
 * Cases: unset stays byte-identical (zero JS, zero analytics marker); set
 * loads the ANOFF-gated Plausible script keyed to the pack's own
 * storagePrefix; the click handler fires seo_play_clicked ONLY for the
 * page's configured destinations (never for ordinary internal archive
 * links), with a closed sport/page_template/destination payload — proven by
 * actually executing the emitted click-handler script, not just grepping it.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderSeoPage, type SeoRenderConfig, type SeoAnalyticsConfig } from './render/seo';
import type { SeoPage } from './types';

const CFG: SeoRenderConfig = {
  brand: {
    appName: 'TestWit', appUrl: 'https://example.test', markSvg: '<svg/>',
    themeColor: '#0C0C0E', paletteCss: '', notFoundPaletteCss: '',
  },
  copy: {
    title: 't', metaDescription: 'm', ogTitle: 'o', ogDescription: 'o',
    twitterTitle: 'tw', twitterDescription: 'tw', subInitial: 's',
    footerHtml: '<footer>Not affiliated with anyone.</footer>',
    resultNote: 'r', teamPickerBanner: 'b',
    titleToday: 'Today', titlePractice: 'Practice', titleTeam: 'My Team',
    notFoundHeading: 'nf', notFoundBody: 'nf', notFoundActionsHtml: '<a href="/">home</a>',
  },
  routes: { today: '/today', practice: '/practice', team: '/my-team' },
};

const BODY =
  '<p>The Arsenal FC vs Chelsea FC head-to-head record is decided on the pitch, ' +
  're-derived from the committed match dataset with every score checked twice.</p>' +
  '<p class="src">Source: Example Source (LICENSE-1.0).</p>';

const PAGE: SeoPage = {
  path: 'h2h/arsenal-fc-v-chelsea-fc',
  title: 'Arsenal vs Chelsea head-to-head',
  description: 'The Arsenal FC vs Chelsea FC head-to-head record, computed from the match dataset.',
  h1: 'Arsenal vs Chelsea head-to-head',
  jsonLd: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: 'Arsenal v Chelsea' },
  bodyHtml: BODY,
};

const ANALYTICS: SeoAnalyticsConfig = {
  domain: 'scorewit.com',
  sport: 'topflight',
  storagePrefix: 'topflight',
  destinations: { app: '/footyphoria', practice: '/footyphoria/practice', quizHub: '/footyphoria/quiz' },
};

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

console.log('SEO-page opt-in analytics — synthetic page\n');

check('unset: zero analytics marker — byte-identical to the pre-brief-0015 shape', () => {
  const html = renderSeoPage(PAGE, CFG);
  const withAnalytics = renderSeoPage(PAGE, { ...CFG, analytics: ANALYTICS });
  assert.notEqual(html, withAnalytics, 'sanity: analytics does change output when set');
  for (const m of ['plausible', 'seo_play_clicked', 'analyticsOff', 'DESTS']) {
    assert.ok(!html.includes(m), `must not emit "${m}" when analytics unset`);
  }
});

check('set: ANOFF-gated Plausible loader keyed to the pack storagePrefix + domain', () => {
  const html = renderSeoPage(PAGE, { ...CFG, analytics: ANALYTICS });
  assert.ok(html.includes("localStorage.getItem(\"topflight.analyticsOff\")==='1'"), 'reads the shared opt-out flag');
  assert.ok(html.includes("s.setAttribute('data-domain',\"scorewit.com\")"), 'Plausible site domain wired');
  assert.ok(html.includes("s.src='https://plausible.io/js/script.js'"), 'official script URL');
  assert.ok(html.indexOf('<script') < html.indexOf('</head>'), 'loader lives in <head>');
});

check('page_template is the build-time top-level path segment, never the full path', () => {
  const html = renderSeoPage(PAGE, { ...CFG, analytics: ANALYTICS });
  assert.ok(html.includes('var PT="h2h";'), 'page_template derived from path.split("/")[0]');
  const scriptStart = html.indexOf('<script>(function(){\nvar DESTS');
  const scriptEnd = html.indexOf('</script>', scriptStart);
  assert.ok(!html.slice(scriptStart, scriptEnd).includes('arsenal-fc-v-chelsea-fc'), 'the page slug never reaches the analytics script');
});

/** Extract the click-handler IIFE and execute it against a stub DOM so the
 *  firing/no-firing behavior is proven, not just grepped. */
function runClickScript(html: string) {
  const start = html.indexOf('<script>(function(){\nvar DESTS');
  assert.ok(start >= 0, 'click-handler script found');
  const end = html.indexOf('</script>', start);
  const src = html.slice(start + '<script>'.length, end);
  let handler: ((e: unknown) => void) | null = null;
  const fired: Array<{ name: string; props: unknown }> = [];
  const storage = new Map<string, string>();
  const context = {
    document: { addEventListener: (_type: string, fn: (e: unknown) => void) => { handler = fn; } },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
    // JSON round-trip: a vm-realm object literal has a different Object
    // prototype identity than this file's, which trips deepStrictEqual.
    window: { plausible: (name: string, opts: { props: unknown }) => fired.push(JSON.parse(JSON.stringify({ name, props: opts.props }))) },
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  return {
    click: (href: string) => handler!({ target: { closest: (sel: string) => (sel === 'a[href]' ? { getAttribute: () => href } : null) } }),
    clickNonAnchor: () => handler!({ target: {} }),
    setOff: (v: boolean) => storage.set('topflight.analyticsOff', v ? '1' : '0'),
    fired,
  };
}

check('click handler: fires ONLY for configured destinations, with the closed payload', () => {
  const html = renderSeoPage(PAGE, { ...CFG, analytics: ANALYTICS });
  const rt = runClickScript(html);
  rt.click('/footyphoria');
  rt.click('/footyphoria/practice');
  rt.click('/footyphoria/quiz');
  assert.deepEqual(rt.fired, [
    { name: 'seo_play_clicked', props: { sport: 'topflight', page_template: 'h2h', destination: 'app' } },
    { name: 'seo_play_clicked', props: { sport: 'topflight', page_template: 'h2h', destination: 'practice' } },
    { name: 'seo_play_clicked', props: { sport: 'topflight', page_template: 'h2h', destination: 'quiz_hub' } },
  ]);
});

check('click handler: ordinary internal archive links never fire (not in destinations)', () => {
  const html = renderSeoPage(PAGE, { ...CFG, analytics: ANALYTICS });
  const rt = runClickScript(html);
  rt.click('/footyphoria/season/2019-20');
  rt.click('/footyphoria/club/arsenal-fc');
  rt.clickNonAnchor();
  assert.deepEqual(rt.fired, [], 'no event for links outside the configured destination set');
});

check('click handler: analytics-off suppresses the event even for a real destination', () => {
  const html = renderSeoPage(PAGE, { ...CFG, analytics: ANALYTICS });
  const rt = runClickScript(html);
  rt.setOff(true);
  rt.click('/footyphoria');
  assert.deepEqual(rt.fired, [], 'opted-out visitor generates zero seo_play_clicked events');
});

check('quizHub/practice are independently optional — a pack without one omits that destination', () => {
  const html = renderSeoPage(PAGE, { ...CFG, analytics: { ...ANALYTICS, destinations: { app: '/f1' } } });
  const rt = runClickScript(html);
  rt.click('/f1');
  rt.click('/f1/practice'); // never configured — must not match
  assert.deepEqual(rt.fired, [{ name: 'seo_play_clicked', props: { sport: 'topflight', page_template: 'h2h', destination: 'app' } }]);
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${7 - failures}/7 seo-analytics cases passed.`);
if (failures) {
  console.error(`SEO-ANALYTICS TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
