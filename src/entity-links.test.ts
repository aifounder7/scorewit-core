/**
 * Deterministic checks for opt-in post-answer entity linking
 * (render/app.ts __ENTITYLINKS__ + linkFact via renderAppHtml).
 *
 *   npx tsx src/entity-links.test.ts
 *
 * Cases:
 *   - unset → ENTITYLINKS renders as null, no unresolved token, the elink
 *     CSS ships inert;
 *   - set → validated JSON lands exactly once, hrefs basePath-prefixed,
 *     pair keys re-sorted;
 *   - path validation throws on anything that isn't a plain page path;
 *   - guardEntityLinks drops targets missing from the emitted page set;
 *   - behavior (vm over the SHIPPED inline code): mentions wrap with the
 *     fact text byte-unchanged (strip the anchors → exactly esc(fact)),
 *     longest name wins, word boundaries hold, a bare score token between
 *     a known pair links the h2h page, same-tab (no target attr);
 *   - an UNANSWERED question renders zero anchors even with linking on;
 *   - the reveal call sites and citation binders are wired around elinks.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  guardEntityLinks,
  renderAppHtml,
  type AppShellConfig,
  type EntityLinkMap,
} from './render/app';

function cfg(entityLinks?: EntityLinkMap, basePath?: string): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: basePath ? `https://example.test${basePath}` : 'https://example.test',
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
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1', basePath },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    entityLinks,
  };
}

const LINKS: EntityLinkMap = {
  entities: {
    'Arsenal FC': 'club/arsenal-fc',
    'Aston Villa FC': 'club/aston-villa-fc',
    'West Germany': 'team/germany',
    'Germany': 'team/germany',
  },
  // Deliberately unsorted key — the serializer must normalize it.
  pairs: { 'Aston Villa FC|Arsenal FC': 'h2h/arsenal-fc-v-aston-villa-fc' },
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

/** The full source of a top-level `function name(…){…}` in the shell HTML. */
function fnSrc(html: string, name: string): string {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in shell`);
  let depth = 0;
  for (let k = html.indexOf('{', start); k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}' && --depth === 0) return html.slice(start, k + 1);
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

/** vm context with the shipped linkFact wired to the shell's ENTITYLINKS. */
function linkCtx(html: string): { linkFact: (s: string) => string } {
  const parsed = JSON.parse(/const ENTITYLINKS = (.*);\n/.exec(html)![1]);
  const ctx: Record<string, unknown> = {
    ENTITYLINKS: parsed,
    ELINK_NAMES: parsed
      ? Object.keys(parsed.entities).sort((a: string, b: string) => b.length - a.length)
      : [],
  };
  const src = ['esc', 'elinkEdge', 'linkFact'].map((n) => fnSrc(html, n)).join('\n');
  vm.runInNewContext(src, ctx);
  return ctx as unknown as { linkFact: (s: string) => string };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const strip = (s: string) => s.replace(/<a class="elink" href="[^"]*">/g, '').replace(/<\/a>/g, '');

console.log('Post-answer entity links — synthetic pack\n');

check('unset: ENTITYLINKS is null, no unresolved token, CSS ships inert', () => {
  const html = renderAppHtml(cfg());
  assert.ok(html.includes('const ENTITYLINKS = null;'));
  assert.ok(!html.includes('__ENTITYLINKS__'));
  assert.ok(html.includes('a.elink{'));
  // With the knob unset, linkFact must degrade to plain esc().
  const { linkFact } = linkCtx(html);
  assert.equal(linkFact('Arsenal FC 1-2 Aston Villa FC & <co>.'), esc('Arsenal FC 1-2 Aston Villa FC & <co>.'));
});

check('set: validated JSON lands exactly once, pair key re-sorted', () => {
  const html = renderAppHtml(cfg(LINKS));
  const expected = `const ENTITYLINKS = ${JSON.stringify({
    entities: {
      'Arsenal FC': '/club/arsenal-fc',
      'Aston Villa FC': '/club/aston-villa-fc',
      'West Germany': '/team/germany',
      'Germany': '/team/germany',
    },
    pairs: { 'Arsenal FC|Aston Villa FC': '/h2h/arsenal-fc-v-aston-villa-fc' },
  })};`;
  assert.equal(html.split(expected).length - 1, 1);
});

check('set under basePath: hrefs carry the prefix', () => {
  const html = renderAppHtml(cfg(LINKS, '/topflight'));
  assert.ok(html.includes('"Arsenal FC":"/topflight/club/arsenal-fc"'));
  assert.ok(html.includes('"Arsenal FC|Aston Villa FC":"/topflight/h2h/arsenal-fc-v-aston-villa-fc"'));
});

check('validation: non-page-path targets throw', () => {
  for (const p of ['/club/x', 'https://x.com/club', 'club/x?q=1', 'club/x"y', '../club/x', 'club/x y']) {
    const bad: EntityLinkMap = { entities: { X: p } };
    assert.throws(() => renderAppHtml(cfg(bad)), /plain root-relative page path/, `should reject ${p}`);
  }
  assert.throws(() => renderAppHtml(cfg({ entities: { ' ': 'club/x' } })), /empty entity name/);
});

check('existence guard: missing targets drop (plain text), present ones keep', () => {
  const guarded = guardEntityLinks(LINKS, new Set(['club/arsenal-fc', 'h2h/arsenal-fc-v-aston-villa-fc']));
  assert.deepEqual(Object.keys(guarded.entities), ['Arsenal FC']);
  assert.deepEqual(guarded.pairs, { 'Aston Villa FC|Arsenal FC': 'h2h/arsenal-fc-v-aston-villa-fc' });
});

check('behavior: mention wraps, fact text byte-unchanged, same-tab', () => {
  const { linkFact } = linkCtx(renderAppHtml(cfg(LINKS)));
  const fact = 'Arsenal FC finished 10 points clear — & Aston Villa FC <held on>.';
  const out = linkFact(fact);
  assert.ok(out.includes('<a class="elink" href="/club/arsenal-fc">Arsenal FC</a>'));
  assert.ok(out.includes('<a class="elink" href="/club/aston-villa-fc">Aston Villa FC</a>'));
  assert.ok(!out.includes('target='), 'entity links must be same-tab');
  assert.equal(strip(out), esc(fact), 'stripping anchors must recover the escaped fact byte-for-byte');
});

check('behavior: longest name wins and word boundaries hold', () => {
  const { linkFact } = linkCtx(renderAppHtml(cfg(LINKS)));
  const out = linkFact('West Germany beat Germanytown.');
  assert.ok(out.includes('<a class="elink" href="/team/germany">West Germany</a>'));
  // "Germany" must not match inside the already-linked "West Germany" nor
  // inside the word "Germanytown".
  assert.equal((out.match(/<a /g) ?? []).length, 1);
});

check('behavior: bare score token between a known pair links the h2h page', () => {
  const { linkFact } = linkCtx(renderAppHtml(cfg(LINKS)));
  const out = linkFact('Arsenal FC 1-2 Aston Villa FC stunned the crowd.');
  assert.ok(out.includes('<a class="elink" href="/h2h/arsenal-fc-v-aston-villa-fc">1-2</a>'));
  assert.equal(strip(out), esc('Arsenal FC 1-2 Aston Villa FC stunned the crowd.'));
  // Prose between the pair (not a bare scoreline) must NOT produce an h2h link.
  const prose = linkFact('Arsenal FC beat 10-man Aston Villa FC.');
  assert.ok(!prose.includes('h2h'));
});

check('behavior: unknown entity renders as plain text', () => {
  const { linkFact } = linkCtx(renderAppHtml(cfg(LINKS)));
  assert.equal(linkFact('Coventry City had a day.'), esc('Coventry City had a day.'));
});

check('unanswered question renders ZERO anchors even with linking on', () => {
  const html = renderAppHtml(cfg(LINKS));
  const q = {
    type: 'multiple_choice',
    text: 'Who beat Arsenal FC 1-2 at home?',
    options: ['Aston Villa FC', 'West Germany', 'Germany'],
    difficulty: 'easy', era: 'e', topic: 'topic',
  };
  const parsed = JSON.parse(/const ENTITYLINKS = (.*);\n/.exec(html)![1]);
  const stage = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  const ctx: Record<string, unknown> = {
    ENTITYLINKS: parsed,
    ELINK_NAMES: Object.keys(parsed.entities).sort((a: string, b: string) => b.length - a.length),
    questions: [q], idx: 0, stage,
    updateStreakBar: () => {}, renderProgress: () => {}, finishDaily: () => {},
  };
  const src = ['esc', 'elinkEdge', 'linkFact', 'chip', 'hasPills', 'pillsHtml', 'render']
    .map((n) => fnSrc(html, n))
    .join('\n');
  vm.runInNewContext(`function teamLabel(n){return esc(n);}\n${src}\nrender();`, ctx);
  assert.ok(stage.innerHTML.includes('Who beat Arsenal FC'), 'question rendered');
  assert.ok(stage.innerHTML.includes('Aston Villa FC'), 'options rendered');
  assert.equal((stage.innerHTML.match(/<a /g) ?? []).length, 0, 'question surface must be link-free');
});

check('wiring: reveal facts go through linkFact; no citation binders exist (native anchors)', () => {
  const html = renderAppHtml(cfg(LINKS));
  assert.equal(html.split("linkFact(q.revealFact)").length - 1, 4, 'all four reveal sites');
  // v0.18.0 source-link fix: the citation binders (which the :not(.elink)
  // selectors existed to scope) are GONE — source anchors navigate natively
  // and elinks need no exemption because nothing binds anymore. Pinned in
  // source-link.test.ts; asserted here so a binder can't quietly return.
  assert.ok(!html.includes("querySelector('#reveal a"), 'no daily citation binder');
  assert.ok(!html.includes("querySelector('#preveal a"), 'no practice citation binder');
  assert.ok(html.includes('function bindSrcLinks(root){}'), 'bindSrcLinks is a no-op');
  // Question/option builders must never call linkFact.
  assert.ok(!fnSrc(html, 'render').includes('linkFact('));
  assert.ok(!fnSrc(html, 'pillsHtml').includes('linkFact('));
  assert.ok(!fnSrc(html, 'renderPractice').includes('linkFact('));
  assert.ok(!fnSrc(html, 'teamQuizHtml').includes('linkFact('));
  assert.ok(!fnSrc(html, 'renderMatchupQuiz').includes('linkFact('));
  // The spoiler-free share text stays plain.
  assert.ok(!fnSrc(html, 'buildShareText').includes('linkFact('));
});

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll entity-link checks passed.');
