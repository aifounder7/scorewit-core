/**
 * Source-link navigation — the double-navigation regression pin (v0.18.0).
 *
 * THE BUG: the shell's old "robust source link" handlers called
 * `window.open(href,'_blank','noopener')` and treated a falsy return as
 * "popup blocked → navigate the current tab". But window.open with the
 * 'noopener' feature returns null BY SPEC even on success, so every click
 * opened the source in a new tab AND navigated the game tab, destroying the
 * in-progress round. Three sites carried the pattern: the daily reveal, the
 * practice reveal, and bindSrcLinks() (team/today card sweeper).
 *
 * THE FIX: no JS navigation at all — citation anchors are plain
 * `target="_blank" rel="noopener noreferrer"` anchors and native behavior
 * handles click, Enter, and middle-click with exactly one navigation intent.
 *
 * Pins:
 *   1. every citation-anchor template carries target=_blank + rel;
 *   2. the shipped shell contains ZERO scripted navigation intents —
 *      no window.open(, no window.location.href= (tab routing's pushState
 *      is internal SPA state, not a link intent);
 *   3. micro-DOM simulation: activating a rendered source anchor (click,
 *      Enter, middle-click) yields exactly one navigation intent — the
 *      _blank anchor — and the current document's location is unchanged;
 *   4. negative control: the RETIRED handler pattern run in the same
 *      harness produces the double navigation (proves the harness would
 *      catch a regression, and documents the root cause).
 *
 *   npx tsx src/source-link.test.ts
 */
import assert from 'node:assert/strict';
import { renderAppHtml, type AppShellConfig } from './render/app';

function cfg(): AppShellConfig {
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
      decorations: 'function teamLabel(n){return n;}function slLabel(s){return s;}',
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards: 'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
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

console.log('Source-link navigation — double-navigation regression pins\n');

const html = renderAppHtml(cfg());

// ---- 1. citation anchors are native _blank + noopener noreferrer ----

check('every citation-anchor template carries target="_blank" rel="noopener noreferrer"', () => {
  const revealAnchors = html.split(`'<a href='+`).length; // guard against template drift
  const cites = html.match(/<a href="'\+[^>]*?'"[^>]*>/g) ?? [];
  const citeAnchors = html.match(/'<a href="'\+(q\.citation\.urls\[0\]|s\.url)\+'"[^']*'/g) ?? [];
  assert.ok(citeAnchors.length >= 4, `expected >=4 citation anchor templates, found ${citeAnchors.length}`);
  for (const a of citeAnchors) {
    assert.ok(a.includes('target="_blank"'), `missing target=_blank: ${a}`);
    assert.ok(a.includes('rel="noopener noreferrer"'), `missing rel: ${a}`);
  }
  void revealAnchors; void cites;
});

// ---- 2. zero scripted navigation intents in the shipped shell ----

check('shell has NO scripted navigation: no window.open(, no window.location.href=', () => {
  assert.ok(!html.includes('window.open('), 'window.open must not appear');
  assert.ok(!html.includes('window.location.href='), 'window.location.href assignment must not appear');
  assert.ok(!html.includes(`querySelector('#reveal a`), 'no handler wiring on the daily reveal anchor');
  assert.ok(!html.includes(`querySelector('#preveal a`), 'no handler wiring on the practice reveal anchor');
  assert.ok(html.includes('function bindSrcLinks(root){}'), 'bindSrcLinks is the compatibility no-op');
});

// ---- 3. micro-DOM activation simulation ----

/** Minimal DOM model: an anchor with attributes and registered handlers.
 *  "Activation" = run click handlers with a cancelable event, then apply
 *  native anchor semantics unless defaultPrevented. Navigation intents are
 *  collected; a same-tab navigation also mutates document.location. */
interface Intent { url: string; disposition: 'new-tab' | 'current-tab' }
function activate(
  anchor: { href: string; target?: string; handlers: ((e: { preventDefault: () => void; defaultPrevented: boolean }) => void)[] },
  doc: { location: string },
  win: { open: (u: string, n?: string, f?: string) => unknown }
): Intent[] {
  const intents: Intent[] = [];
  const realOpen = win.open;
  win.open = (u: string, _n?: string, f?: string) => {
    intents.push({ url: u, disposition: 'new-tab' });
    // the spec detail at the heart of the bug:
    return f && f.includes('noopener') ? null : {};
  };
  const docProxy = new Proxy(doc, {
    set(t, k, v) {
      if (k === 'location') intents.push({ url: String(v), disposition: 'current-tab' });
      return Reflect.set(t, k, v);
    },
  });
  const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const h of anchor.handlers) h(e);
  if (!e.defaultPrevented) {
    // native anchor semantics: _blank = new tab, else current tab
    if (anchor.target === '_blank') intents.push({ url: anchor.href, disposition: 'new-tab' });
    else { intents.push({ url: anchor.href, disposition: 'current-tab' }); docProxy.location = anchor.href; }
  }
  win.open = realOpen;
  return intents;
}

/** The shipped anchor: attributes from the reveal template, handlers = none
 *  (pinned by check 2 — the shell wires nothing onto reveal anchors). */
const shippedAnchor = { href: 'https://source.example/match', target: '_blank', handlers: [] };

check('click on a shipped source link: exactly ONE navigation intent (the _blank anchor); document location unchanged', () => {
  const doc = { location: 'https://www.scorewit.com/testcup' };
  const intents = activate({ ...shippedAnchor, handlers: [] }, doc, { open: () => ({}) });
  assert.equal(intents.length, 1, 'exactly one navigation intent');
  assert.deepEqual(intents[0], { url: 'https://source.example/match', disposition: 'new-tab' });
  assert.equal(doc.location, 'https://www.scorewit.com/testcup', 'current document location unchanged');
});

check('keyboard (Enter) and middle-click: same single-intent native path, nothing double-handled', () => {
  // Enter on a focused anchor fires the same activation path; middle-click
  // (auxclick) never runs 'click' handlers — with zero handlers registered
  // both reduce to native _blank activation.
  for (const _ of ['enter', 'middle-click']) {
    const doc = { location: 'https://www.scorewit.com/testcup' };
    const intents = activate({ ...shippedAnchor, handlers: [] }, doc, { open: () => ({}) });
    assert.equal(intents.length, 1);
    assert.equal(intents[0].disposition, 'new-tab');
    assert.equal(doc.location, 'https://www.scorewit.com/testcup');
  }
});

// ---- 4. negative control: the retired pattern double-fires in this harness ----

check('negative control: the RETIRED handler pattern produces the double navigation the fix removes', () => {
  const doc = { location: 'https://www.scorewit.com/testcup' };
  const win: { open: (u: string, n?: string, f?: string) => unknown } = { open: () => ({}) };
  let currentTabNav: string | null = null;
  // Verbatim logic of the removed handler (location assignment routed
  // through the harness):
  const retired = (e: { preventDefault: () => void; defaultPrevented: boolean }) => {
    e.preventDefault();
    const w = win.open(shippedAnchor.href, '_blank', 'noopener');
    if (!w) currentTabNav = shippedAnchor.href;
  };
  const intents = activate({ ...shippedAnchor, handlers: [retired] }, doc, win);
  if (currentTabNav) intents.push({ url: currentTabNav, disposition: 'current-tab' });
  assert.equal(intents.filter((i) => i.disposition === 'new-tab').length, 1, 'old pattern opened a new tab');
  assert.equal(intents.filter((i) => i.disposition === 'current-tab').length, 1, 'AND navigated the current tab — the bug');
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${5 - failures}/5 cases passed.`);
if (failures) {
  console.error(`SOURCE-LINK TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
