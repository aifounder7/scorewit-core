/**
 * Deterministic checks for the post-round continue strip
 * (render/app.ts __FAMILY__ + renderContinue via renderAppHtml).
 *
 *   npx tsx src/family-continue.test.ts
 *
 * Cases:
 *   - family unset → FAMILY renders as null, the container ships empty
 *     (display:none via .continue:empty), no unresolved token;
 *   - family set → validated JSON lands in the shell exactly once, with each
 *     game's DISPLAY name replaced by the canonical sport-first label
 *     (core's FAMILY_LABELS, which quotes the extra-time copy deck) — the
 *     seven strings are pinned below, and an unmapped path is a build error
 *     (no silent fallback to a pack codename);
 *   - config validation: self-in-games, non-https/unsafe URLs, empty fields
 *     all throw at render time;
 *   - behavior (vm over the SHIPPED inline code): played state read from the
 *     sibling's prefix.history[todayKey()], same-origin only; unplayed
 *     chips sort first (stable); the hub link renders last.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderAppHtml, type AppShellConfig, type FamilyConfig } from './render/app';

function cfg(family?: FamilyConfig): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: 'https://example.test',
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
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1' },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    family,
  };
}

const FAMILY: FamilyConfig = {
  heading: 'More Scorewit',
  hub: { url: 'https://www.scorewit.com/', label: 'All games →' },
  games: [
    { name: 'Box-Box', url: 'https://www.scorewit.com/f1', storagePrefix: 'scorewitf1' },
    { name: 'World Cup', url: 'https://www.scorewit.com/worldcup', storagePrefix: 'extratime' },
    // A cross-origin sibling (different host) on a mapped portfolio path — the
    // origin gate must still refuse to read its played state.
    { name: 'Cover Drive', url: 'https://sibling.test/cricket', storagePrefix: 'coverdrive' },
  ],
};

// The canonical sport-first label the strip must show for each fixture path —
// mirrors core's FAMILY_LABELS (the extra-time deck is the naming authority).
const LABEL: Record<string, string> = {
  'https://www.scorewit.com/f1': 'Formula 1',
  'https://www.scorewit.com/worldcup': 'Soccer · World Cup',
  'https://sibling.test/cricket': 'Cricket · World Cup',
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

console.log('Post-round continue strip — synthetic pack\n');

check('unset: FAMILY is null, container ships, no unresolved token', () => {
  const html = renderAppHtml(cfg());
  assert.ok(html.includes('const FAMILY = null;'));
  assert.ok(html.includes('<div class="continue" id="continue"></div>'));
  assert.ok(html.includes('.continue:empty{display:none}'));
  assert.ok(!html.includes('__FAMILY__'));
});

check('set: validated JSON lands exactly once, name is the canonical label', () => {
  const html = renderAppHtml(cfg(FAMILY));
  const expected = `const FAMILY = ${JSON.stringify({
    heading: FAMILY.heading,
    hub: FAMILY.hub,
    games: FAMILY.games.map((g) => ({ name: LABEL[g.url], url: g.url, prefix: g.storagePrefix })),
  })};`;
  assert.equal(html.split(expected).length - 1, 1);
  // The pack-supplied codenames never reach the shipped shell.
  for (const codename of ['Box-Box', 'Cover Drive']) {
    assert.ok(!html.includes(`"name":"${codename}"`), `codename "${codename}" must not surface`);
  }
});

check('canonical labels: all seven sport-first strings pinned (quotes the deck)', () => {
  // Every portfolio path → its EXACT display string. These quote the founder's
  // copy deck (content/hub-copy.json on extra-time main); any drift here is a
  // drift from the naming authority and must fail this test.
  const ALL: FamilyConfig = {
    heading: 'More Scorewit',
    hub: { url: 'https://www.scorewit.com/', label: 'All games →' },
    games: [
      { name: 'World Cup', url: 'https://www.scorewit.com/worldcup', storagePrefix: 'extratime' },
      { name: 'Box-Box', url: 'https://www.scorewit.com/f1', storagePrefix: 'scorewitf1' },
      { name: 'Footyphoria', url: 'https://www.scorewit.com/footyphoria', storagePrefix: 'topflight' },
      { name: 'Cover Drive', url: 'https://www.scorewit.com/cricket', storagePrefix: 'coverdrive' },
      { name: 'Hail Mary', url: 'https://www.scorewit.com/gridiron', storagePrefix: 'gridiron' },
      { name: 'Fall Classic', url: 'https://www.scorewit.com/baseball', storagePrefix: 'fallclassic' },
      { name: 'Super Over', url: 'https://www.scorewit.com/superover', storagePrefix: 'ipl' },
    ],
  };
  const html = renderAppHtml(cfg(ALL));
  const family = JSON.parse(/const FAMILY = (\{.*?\});\n/.exec(html)![1]);
  const byPath = Object.fromEntries(
    family.games.map((g: { url: string; name: string }) => [new URL(g.url).pathname, g.name])
  );
  assert.deepEqual(byPath, {
    '/worldcup': 'Soccer · World Cup',
    '/f1': 'Formula 1',
    '/footyphoria': 'English Football',
    '/cricket': 'Cricket · World Cup',
    '/gridiron': 'American Football',
    '/baseball': 'Baseball',
    '/superover': 'T20 Cricket · India',
  });
  // No pack codename survives to the display layer.
  for (const codename of ['Box-Box', 'Cover Drive', 'Fall Classic', 'Hail Mary', 'Super Over', 'Footyphoria']) {
    assert.ok(
      !family.games.some((g: { name: string }) => g.name === codename),
      `codename "${codename}" must not surface`
    );
  }
});

check('canonical labels: legacy /topflight configs remain renderable during migration', () => {
  const legacy: FamilyConfig = {
    heading: 'More Scorewit',
    hub: { url: 'https://www.scorewit.com/', label: 'All games →' },
    games: [
      { name: 'Footyphoria', url: 'https://www.scorewit.com/topflight', storagePrefix: 'topflight' },
    ],
  };
  const html = renderAppHtml(cfg(legacy));
  const family = JSON.parse(/const FAMILY = (\{.*?\});\n/.exec(html)![1]);
  assert.equal(family.games[0].url, 'https://www.scorewit.com/topflight');
  assert.equal(family.games[0].name, 'English Football');
});

check('canonical labels: an unmapped path is a build error (no codename fallback)', () => {
  const bad = { ...FAMILY, games: [{ name: 'Mystery', url: 'https://www.scorewit.com/mystery', storagePrefix: 'mystery' }] };
  assert.throws(() => renderAppHtml(cfg(bad)), /no canonical label/);
});

check('validation: self in games throws', () => {
  const bad = { ...FAMILY, games: [...FAMILY.games, { name: 'Self', url: 'https://example.test/x', storagePrefix: 'testwit' }] };
  assert.throws(() => renderAppHtml(cfg(bad)), /the pack itself/);
});

check('validation: unsafe URLs throw', () => {
  for (const url of ['/f1', 'http://www.scorewit.com/f1', 'javascript:alert(1)', 'https://x.com/a"b', 'https://x.com/a?q=1']) {
    const bad = { ...FAMILY, games: [{ name: 'X', url, storagePrefix: 'x' }] };
    assert.throws(() => renderAppHtml(cfg(bad)), /absolute https URL/, `should reject ${url}`);
  }
});

check('validation: empty heading/games throw', () => {
  assert.throws(() => renderAppHtml(cfg({ ...FAMILY, heading: ' ' })), /empty heading/);
  assert.throws(() => renderAppHtml(cfg({ ...FAMILY, games: [] })), /non-empty/);
});

check('behavior: same-origin played state, unplayed first, hub link last', () => {
  const html = renderAppHtml(cfg(FAMILY));
  const now = new Date();
  const tk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Box-Box played today; the cross-origin sibling (Cover Drive) ALSO has
  // history in this store, but must never be read (origin gate) — it stays
  // "play".
  const store: Record<string, string> = {
    'scorewitf1.history': JSON.stringify({ [tk]: { score: 300 } }),
    'coverdrive.history': JSON.stringify({ [tk]: { score: 300 } }),
  };
  const el = { innerHTML: '' };
  const ctx = {
    localStorage: { getItem: (k: string) => store[k] ?? null },
    document: { getElementById: (id: string) => (id === 'continue' ? el : null) },
    location: { href: 'https://www.scorewit.com/cricket', origin: 'https://www.scorewit.com' },
    URL,
    FAMILY: JSON.parse(/const FAMILY = (\{.*?\});\n/.exec(html)![1]),
  };
  const src = ['todayKey', 'esc', 'familyPlayedToday', 'renderContinue']
    .map((n) => fnSrc(html, n))
    .join('\n');
  vm.runInNewContext(`${src}\nrenderContinue();`, ctx);
  const order = [...el.innerHTML.matchAll(/class="cchip( done)?" href="[^"]+">([^<]+)</g)].map(
    (m) => [m[2], m[1] ? 'done' : 'todo']
  );
  assert.deepEqual(order, [
    ['Soccer · World Cup', 'todo'],
    ['Cricket · World Cup', 'todo'],
    ['Formula 1', 'done'],
  ]);
  assert.equal((el.innerHTML.match(/✓ played/g) ?? []).length, 1);
  assert.ok(el.innerHTML.endsWith('<a class="chub" href="https://www.scorewit.com/">All games →</a>'));
  assert.ok(el.innerHTML.startsWith('<div class="chead">More Scorewit</div>'));
});

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll continue-strip checks passed.');
