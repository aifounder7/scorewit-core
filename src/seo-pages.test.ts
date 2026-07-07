/**
 * Deterministic checks for the SEO pre-render stage (render/seo.ts).
 * Synthetic pages, no real sport data.
 *
 *   npx tsx src/seo-pages.test.ts
 *   SEO_OUT=/some/dir npx tsx src/seo-pages.test.ts   # also keep an emit there
 *
 * Cases: pages emitted with the full on-page kit; sitemap + robots valid;
 * determinism (two emits byte-identical); the emit-time quality gates throw
 * on route collisions, long titles, duplicate titles, and thin bodies.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderRobots, renderSitemap, writeSeoSite, type SeoRenderConfig } from './render/seo';
import type { PipelinePaths, SeoPage } from './types';

const CFG: SeoRenderConfig = {
  brand: {
    appName: 'TestWit',
    appUrl: 'https://example.test',
    markSvg: '<svg/>',
    themeColor: '#0C0C0E',
    paletteCss: '',
    notFoundPaletteCss: '',
  },
  copy: {
    title: 't', metaDescription: 'm', ogTitle: 'o', ogDescription: 'o',
    twitterTitle: 'tw', twitterDescription: 'tw', subInitial: 's',
    footerHtml: '<footer>Not affiliated with anyone. Data: Example Source (LICENSE-1.0).</footer>',
    resultNote: 'r', teamPickerBanner: 'b',
    titleToday: 'Today', titlePractice: 'Practice', titleTeam: 'My Team',
    notFoundHeading: 'nf', notFoundBody: 'nf', notFoundActionsHtml: '<a href="/">home</a>',
  },
  routes: { today: '/today', practice: '/practice', team: '/my-team' },
};

const BODY =
  '<p>The 2020 Test Cup was decided on the final day. Alpha beat Beta by a clear margin, ' +
  'with the decisive result re-derived from the committed dataset.</p>' +
  '<p class="src">Source: 2020 Test Cup match data, via Example Source (LICENSE-1.0).</p>';

function page(n: number, over: Partial<SeoPage> = {}): SeoPage {
  return {
    path: `cup/20${20 + n}`,
    title: `20${20 + n} Test Cup — result & final`,
    description: `Who won the 20${20 + n} Test Cup? Result, margin and final details, computed from public match records.`,
    h1: `20${20 + n} Test Cup`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `20${20 + n} Test Cup` },
    bodyHtml: BODY,
    lastmod: '2026-01-02',
    ...over,
  };
}

function tmpPaths(): PipelinePaths {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
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

console.log('SEO pre-render — synthetic pages\n');

check('pages emitted with the full on-page kit', () => {
  const p = tmpPaths();
  const { count } = writeSeoSite([page(0), page(1)], CFG, p);
  assert.equal(count, 2);
  const html = fs.readFileSync(path.join(p.siteDir, 'cup', '2020.html'), 'utf8');
  assert.ok(html.includes('<title>2020 Test Cup — result &amp; final</title>'));
  assert.ok(html.includes('<link rel="canonical" href="https://example.test/cup/2020" />'));
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'exactly one h1');
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1];
  assert.equal(JSON.parse(ld)['@type'], 'SportsEvent');
  assert.ok(html.includes('Not affiliated with anyone'), 'trade-dress footer present');
  assert.ok(html.includes('class="cta" href="/"'), 'CTA into the app');
  fs.rmSync(p.root, { recursive: true, force: true });
});

check('sitemap.xml + robots.txt are valid and complete', () => {
  const p = tmpPaths();
  writeSeoSite([page(0), page(1)], CFG, p);
  const sm = fs.readFileSync(path.join(p.siteDir, 'sitemap.xml'), 'utf8');
  assert.ok(sm.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(sm.includes('<loc>https://example.test/</loc>'), 'app root listed');
  assert.ok(sm.includes('<loc>https://example.test/cup/2021</loc><lastmod>2026-01-02</lastmod>'));
  assert.equal((sm.match(/<url>/g) ?? []).length, 3);
  const rb = fs.readFileSync(path.join(p.siteDir, 'robots.txt'), 'utf8');
  assert.ok(rb.includes('Allow: /') && rb.includes('Sitemap: https://example.test/sitemap.xml'));
  fs.rmSync(p.root, { recursive: true, force: true });
});

check('deterministic: two emits are byte-identical', () => {
  const a = tmpPaths();
  const b = tmpPaths();
  writeSeoSite([page(0), page(1)], CFG, a);
  writeSeoSite([page(0), page(1)], CFG, b);
  for (const f of ['cup/2020.html', 'cup/2021.html', 'sitemap.xml', 'robots.txt']) {
    assert.ok(
      fs.readFileSync(path.join(a.siteDir, f)).equals(fs.readFileSync(path.join(b.siteDir, f))),
      `${f} differs`
    );
  }
  fs.rmSync(a.root, { recursive: true, force: true });
  fs.rmSync(b.root, { recursive: true, force: true });
});

check('quality gates throw: collision, long title, dup title, thin body, h1 in body', () => {
  const p = tmpPaths();
  const cases: [Partial<SeoPage>, RegExp][] = [
    [{ path: 'today/2020' }, /collides/],
    [{ path: '404' }, /collides/],
    [{ path: 'sitemap.xml' }, /relative kebab/],
    [{ title: 'x'.repeat(61) }, /<= 60/],
    [{ description: 'y'.repeat(161) }, /<= 160/],
    [{ bodyHtml: '<p>tiny</p>' }, /thin\/doorway/],
    [{ bodyHtml: '<h1>again</h1>' + BODY }, /owns the single H1/],
  ];
  for (const [over, re] of cases) {
    assert.throws(() => writeSeoSite([page(0, over)], CFG, p), re, JSON.stringify(over).slice(0, 60));
  }
  assert.throws(() => writeSeoSite([page(0), page(0, { path: 'cup/other' })], CFG, p), /duplicate title/);
  fs.rmSync(p.root, { recursive: true, force: true });
});

check('JSON-LD escapes & and < (valid JSON, entity-safe inline script)', () => {
  const p = tmpPaths();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: 'Alpha & Beta <Cup>',
    url: 'https://example.test/cup?a=1&b=2',
  };
  writeSeoSite([page(0, { jsonLd })], CFG, p);
  const html = fs.readFileSync(path.join(p.siteDir, 'cup', '2020.html'), 'utf8');
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1];
  assert.ok(!ld.includes('&'), 'no raw & inside the JSON-LD script');
  assert.ok(!ld.includes('<'), 'no raw < inside the JSON-LD script');
  assert.ok(ld.includes('\\u0026') && ld.includes('\\u003c'), 'escaped as \\uXXXX');
  assert.deepEqual(JSON.parse(ld), jsonLd, 'still valid JSON that round-trips');
  fs.rmSync(p.root, { recursive: true, force: true });
});

// Optional persistent emit for external verifiers (seo_check.py).
if (process.env.SEO_OUT) {
  const p = tmpPaths();
  (p as { siteDir: string }).siteDir = process.env.SEO_OUT;
  writeSeoSite([page(0), page(1), page(2)], CFG, p);
  console.log(`\n(emitted 3 pages + sitemap + robots to ${process.env.SEO_OUT})`);
}

console.log(`\n${failures === 0 ? 'ALL' : ''} ${5 - failures}/5 SEO cases passed.`);
if (failures) {
  console.error(`SEO TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
