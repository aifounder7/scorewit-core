/**
 * Deterministic checks for the opt-in basePath (config.basePath — see
 * render/base-path.ts). Synthetic pack, pure string assertions.
 *
 *   npx tsx src/base-path.test.ts
 *
 * Cases:
 *   - UNSET → the incumbent emissions, byte-for-byte: relative head assets,
 *     daily:'/', unprefixed tab routes, manifest start_url "/", the SEO
 *     template's href="/" links — nothing added, nothing renamed;
 *   - SET ('/f1') → every root-relative emission carries the prefix (head
 *     links, both route maps, tab routes, manifest start_url, 404 links,
 *     SEO icon/topbar/CTA), absolute emissions follow appUrl (canonical,
 *     og:url/og:image, sitemap <loc>s, robots' Sitemap line), and the
 *     emitted HTML has ZERO root-relative leaks;
 *   - the leak gate: a pack-supplied root-relative link that escapes the
 *     prefix (404 action href="/", SEO bodyHtml href="/season/2020") FAILS
 *     the build; the same link prefixed passes;
 *   - the config gates: malformed basePath throws; appUrl not ending with
 *     basePath throws;
 *   - the exact-once discipline: a shellPatch that rewrites a basePath
 *     anchor makes the render throw (loud, never half-prefixed).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findRootRelativeLeaks } from './render/base-path';
import { renderAppHtml, renderNotFoundHtml, writeSite, type AppShellConfig, type AssetSpec } from './render/app';
import { renderSeoPage, renderSitemap, renderRobots, writeSeoSite, type SeoRenderConfig } from './render/seo';
import type { PipelinePaths, SeoPage } from './types';

const PALETTE = `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`;

function cfg(over: {
  basePath?: string;
  appUrl?: string;
  notFoundActionsHtml?: string;
  shellPatches?: [string, string][];
} = {}): AppShellConfig {
  return {
    brand: {
      appName: 'TestWit',
      appUrl: over.appUrl ?? 'https://example.test',
      markSvg: '<svg/>',
      themeColor: '#0C0C0E',
      paletteCss: PALETTE,
      notFoundPaletteCss: '--bg:#0C0C0E;--text:#EDEDEF;--text2:#9A9AA3;--accent:#4E9CF5',
    },
    copy: {
      title: 't', metaDescription: 'm', ogTitle: 'o', ogDescription: 'o',
      twitterTitle: 'tw', twitterDescription: 'tw', subInitial: 's',
      footerHtml: '<footer>No personal data, no cookies.</footer>',
      resultNote: 'r', teamPickerBanner: 'b',
      titleToday: 'Today', titlePractice: 'Practice', titleTeam: 'My Team',
      notFoundHeading: 'nf', notFoundBody: 'nf',
      notFoundActionsHtml: over.notFoundActionsHtml ?? '<a href="/">home</a>',
    },
    client: {
      consts: '// pack consts',
      decorations: 'function teamLabel(n){return n;}function slLabel(s){return s;}',
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards: 'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
      shellPatches: over.shellPatches,
    },
    config: { storagePrefix: 'testwit', epochUtcArgs: '2026,0,1', basePath: over.basePath },
    data: { bank: { seed: 1, questions: [] }, teams: { teams: [] }, matchday: { days: [] } },
    // basePath needs a provider that isn't served from the origin root — the
    // default inline Vercel wiring ("/_vercel/…") is a leak by design.
    analytics: { provider: 'plausible', domain: 'example.test' },
    sport: 'test',
  };
}

const NO_ASSETS: AssetSpec = { files: [], copies: [], dirs: [] };

function tmpPaths(): PipelinePaths {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basepath-'));
  return {
    root,
    dataDir: path.join(root, 'data'),
    datasetDir: path.join(root, 'pipeline', 'dataset'),
    pipelineDir: path.join(root, 'pipeline'),
    siteDir: path.join(root, 'site'),
    assetsDir: path.join(root, 'assets'),
    previewFile: path.join(root, 'preview.html'),
  };
}

const SEO_BODY =
  '<p>The 2020 Test Cup was decided on the final day. Alpha beat Beta by a clear margin, ' +
  'with the decisive result re-derived from the committed dataset.</p>' +
  '<p class="src">Source: 2020 Test Cup match data, via Example Source (LICENSE-1.0).</p>';

function seoCfg(over: { basePath?: string; appUrl?: string } = {}): SeoRenderConfig {
  const app = cfg({ appUrl: over.appUrl });
  return {
    brand: app.brand,
    copy: app.copy,
    routes: { today: '/today', practice: '/practice', team: '/my-team' },
    basePath: over.basePath,
  };
}

function seoPage(over: Partial<SeoPage> = {}): SeoPage {
  return {
    path: 'cup/2020',
    title: '2020 Test Cup — result & final',
    description: 'Who won the 2020 Test Cup? Result, margin and final details, computed from public match records.',
    h1: '2020 Test Cup',
    jsonLd: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: '2020 Test Cup' },
    bodyHtml: SEO_BODY,
    lastmod: '2026-01-02',
    ...over,
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

console.log('Opt-in basePath — synthetic pack\n');

// ---------- unset: the incumbent emissions, byte-for-byte ----------

check('unset: relative head assets, daily:"/", unprefixed routes', () => {
  const html = renderAppHtml(cfg());
  assert.ok(html.includes('<link rel="icon" href="icon.svg" type="image/svg+xml" />'));
  assert.ok(html.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png" />'));
  assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest" />'));
  assert.ok(html.includes(`const ROUTE_FOR_MODE={daily:'/',today:'/today',practice:'/practice',team:'/my-team'};`));
  assert.ok(html.includes(`const MODE_FOR_ROUTE={'/':'daily','/today':'today','/practice':'practice','/my-team':'team'};`));
  assert.ok(html.includes('<link rel="canonical" href="https://example.test/" />'));
});

check('unset: 404 keeps root-absolute links; manifest start_url stays "/"', () => {
  const nf = renderNotFoundHtml(cfg());
  assert.ok(nf.includes('<link rel="icon" href="/icon.svg"'));
  assert.ok(nf.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png"'));
  const paths = tmpPaths();
  writeSite(cfg(), NO_ASSETS, paths);
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.siteDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.ok(!('scope' in manifest), 'unset manifest stays byte-compatible without a new scope field');
});

check('unset: SEO template keeps href="/" links', () => {
  const html = renderSeoPage(seoPage(), seoCfg());
  assert.ok(html.includes('<link rel="icon" href="/icon.svg"'));
  assert.ok(html.includes('<a class="mark" href="/"'));
  assert.ok(html.includes('<a class="brand" href="/"'));
  assert.ok(html.includes('<a class="cta" href="/">'));
});

// ---------- set: every emission prefix-aware ----------

const F1 = { basePath: '/f1', appUrl: 'https://example.test/f1' };

check('set: head assets, both route maps, tab routes carry the prefix', () => {
  const html = renderAppHtml(cfg({ ...F1, notFoundActionsHtml: '<a href="/f1">home</a>' }));
  assert.ok(html.includes('<link rel="icon" href="/f1/icon.svg" type="image/svg+xml" />'));
  assert.ok(html.includes('<link rel="apple-touch-icon" href="/f1/apple-touch-icon.png" />'));
  assert.ok(html.includes('<link rel="manifest" href="/f1/manifest.webmanifest" />'));
  assert.ok(html.includes(`const ROUTE_FOR_MODE={daily:'/f1',today:'/f1/today',practice:'/f1/practice',team:'/f1/my-team'};`));
  assert.ok(html.includes(`const MODE_FOR_ROUTE={'/f1':'daily','/f1/today':'today','/f1/practice':'practice','/f1/my-team':'team'};`));
});

check('set: absolute emissions follow appUrl (canonical, og:url, og:image)', () => {
  const html = renderAppHtml(cfg(F1));
  assert.ok(html.includes('<link rel="canonical" href="https://example.test/f1" />'));
  assert.ok(html.includes('<meta property="og:url" content="https://example.test/f1" />'));
  assert.ok(html.includes('<meta property="og:image" content="https://example.test/f1/og.png" />'));
  assert.ok(html.includes('const APP_URL = "https://example.test/f1";'));
});

check('set: the emitted shell and 404 have zero root-relative leaks', () => {
  const shell = renderAppHtml(cfg(F1));
  assert.deepEqual(findRootRelativeLeaks(shell, '/f1'), []);
  const nf = renderNotFoundHtml(cfg({ ...F1, notFoundActionsHtml: '<a class="btn" href="/f1">Play &rarr;</a>' }));
  assert.ok(nf.includes('<link rel="icon" href="/f1/icon.svg"'));
  assert.ok(nf.includes('<link rel="apple-touch-icon" href="/f1/apple-touch-icon.png"'));
  assert.deepEqual(findRootRelativeLeaks(nf, '/f1'), []);
});

check('set: manifest start_url is the non-redirecting "/f1" root', () => {
  const paths = tmpPaths();
  writeSite(cfg({ ...F1, notFoundActionsHtml: '<a href="/f1">home</a>' }), NO_ASSETS, paths);
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.siteDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/f1/', 'explicit id preserves the previously installed PWA identity');
  assert.equal(manifest.start_url, '/f1');
  assert.equal(manifest.scope, '/f1', 'explicit scope keeps the no-slash start URL inside the pack');
});

check('set: SEO template links, canonical, sitemap and robots carry the prefix', () => {
  const scfg = seoCfg({ basePath: '/f1', appUrl: 'https://example.test/f1' });
  const html = renderSeoPage(seoPage(), scfg);
  assert.ok(html.includes('<link rel="icon" href="/f1/icon.svg"'));
  assert.ok(html.includes('<a class="mark" href="/f1"'));
  assert.ok(html.includes('<a class="brand" href="/f1"'));
  assert.ok(html.includes('<a class="cta" href="/f1">'));
  assert.ok(html.includes('<link rel="canonical" href="https://example.test/f1/cup/2020" />'));
  assert.deepEqual(findRootRelativeLeaks(html, '/f1'), []);
  const sm = renderSitemap([seoPage()], 'https://example.test/f1', '/f1');
  assert.ok(sm.includes('<loc>https://example.test/f1</loc>'));
  assert.ok(sm.includes('<loc>https://example.test/f1/cup/2020</loc>'));
  assert.ok(renderRobots('https://example.test/f1').includes('Sitemap: https://example.test/f1/sitemap.xml'));
});

// ---------- the leak gate ----------

check('leak gate: a 404 action that escapes the prefix fails the build', () => {
  const paths = tmpPaths();
  assert.throws(
    () => writeSite(cfg({ ...F1, notFoundActionsHtml: '<a href="/">home</a>' }), NO_ASSETS, paths),
    /root-relative link.*escape/
  );
});

check('leak gate: an SEO body link that escapes the prefix fails; prefixed passes', () => {
  const scfg = seoCfg({ basePath: '/f1', appUrl: 'https://example.test/f1' });
  const bad = seoPage({ bodyHtml: SEO_BODY + '<p><a href="/season/2020">the 2020 season</a></p>' });
  assert.throws(() => writeSeoSite([bad], scfg, tmpPaths()), /root-relative link.*escape/);
  const good = seoPage({ bodyHtml: SEO_BODY + '<p><a href="/f1/season/2020">the 2020 season</a></p>' });
  const { count } = writeSeoSite([good], scfg, tmpPaths());
  assert.equal(count, 1);
});

// ---------- the config gates ----------

check('config gates: malformed basePath / appUrl mismatch throw', () => {
  assert.throws(() => renderAppHtml(cfg({ basePath: 'f1', appUrl: 'https://example.test/f1' })), /root-absolute lowercase/);
  assert.throws(() => renderAppHtml(cfg({ basePath: '/f1/', appUrl: 'https://example.test/f1/' })), /root-absolute lowercase/);
  assert.throws(() => renderAppHtml(cfg({ basePath: '/F1', appUrl: 'https://example.test/F1' })), /root-absolute lowercase/);
  assert.throws(() => renderAppHtml(cfg({ basePath: '/f1', appUrl: 'https://example.test' })), /must end with config.basePath/);
});

// ---------- the exact-once discipline ----------

check('exact-once: a shellPatch that rewrites a basePath anchor throws', () => {
  // The patch rewrites the daily-route line BEFORE… no — basePath edits run
  // first, so the patch's anchor (the pre-rewrite text) no longer matches and
  // the render throws instead of shipping a half-prefixed router.
  assert.throws(
    () =>
      renderAppHtml(
        cfg({
          ...F1,
          notFoundActionsHtml: '<a href="/f1">home</a>',
          shellPatches: [[`const ROUTE_FOR_MODE={daily:'/',`, `const ROUTE_FOR_MODE={daily:'/x',`]],
        })
      ),
    /shellPatch must match exactly once/
  );
});

console.log(failures ? `\n${failures} failing` : '\nAll basePath checks passed.');
process.exit(failures ? 1 : 0);
