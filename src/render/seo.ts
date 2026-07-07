import fs from 'node:fs';
import path from 'node:path';
import type { PipelinePaths, SeoPage } from '../types';
import type { AppCopy, Brand } from './app';

/**
 * SEO pre-render (opt-in via pack.seoPages): wrap each pack-rendered page in
 * the shared crawlable template and write it as a NEW static file under
 * site/<path>.html, plus site/sitemap.xml and site/robots.txt. ADDITIVE ONLY —
 * this stage never touches the app shell or the existing artifacts, so a pack
 * without the hook is byte-identical.
 *
 * Emit-time quality gates (throw loudly — a bad page must never ship):
 *   - path shape + collision guard (client routes, reserved files, dupes);
 *   - unique <title> <= 60, description <= 160, exactly one H1 (the field);
 *   - serializable JSON-LD; a substantive body (thin/doorway pages rejected).
 * Everything is a pure function of the inputs — no clocks, no randomness —
 * so two runs are byte-identical (sitemap <lastmod> comes from the page's
 * dataset-derived `lastmod`, never from the build time).
 */

const RESERVED = new Set([
  'index',
  '404',
  'manifest.webmanifest',
  'sitemap.xml',
  'robots.txt',
  'preview',
]);

/** Minimum bodyHtml length — the thin-page guard. Substantive fact pages are
 *  comfortably past this; a bare heading + one line is not. */
const MIN_BODY_CHARS = 200;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON-LD safe for inline <script> embedding (still valid JSON): escape both
 *  `<` (script-close injection) and `&` (HTML entity ambiguity) as \uXXXX. */
const jsonLdText = (o: object) =>
  JSON.stringify(o).replace(/&/g, '\\u0026').replace(/</g, '\\u003c');

export interface SeoRenderConfig {
  brand: Brand;
  copy: AppCopy;
  /** Client-route paths that page paths must not shadow. */
  routes: { today: string; practice: string; team: string };
}

function validatePages(pages: SeoPage[], cfg: SeoRenderConfig): void {
  const seenPaths = new Set<string>();
  const seenTitles = new Set<string>();
  const routeNames = new Set(
    Object.values(cfg.routes).map((r) => r.replace(/^\//, '').split('/')[0])
  );
  for (const p of pages) {
    const tag = `seoPages["${p.path}"]`;
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(p.path) || p.path.endsWith('/')) {
      throw new Error(`${tag}: path must be relative kebab/slash segments with no leading slash`);
    }
    const head = p.path.split('/')[0];
    if (RESERVED.has(p.path) || RESERVED.has(head) || routeNames.has(head)) {
      throw new Error(`${tag}: path collides with an app route or reserved file`);
    }
    if (seenPaths.has(p.path)) throw new Error(`${tag}: duplicate path`);
    seenPaths.add(p.path);
    if (!p.title.trim() || p.title.length > 60) {
      throw new Error(`${tag}: title must be non-empty and <= 60 chars (got ${p.title.length})`);
    }
    if (seenTitles.has(p.title)) throw new Error(`${tag}: duplicate title "${p.title}"`);
    seenTitles.add(p.title);
    if (!p.description.trim() || p.description.length > 160) {
      throw new Error(`${tag}: description must be non-empty and <= 160 chars (got ${p.description.length})`);
    }
    if (!p.h1.trim()) throw new Error(`${tag}: empty h1`);
    if (p.bodyHtml.trim().length < MIN_BODY_CHARS) {
      throw new Error(
        `${tag}: bodyHtml is ${p.bodyHtml.trim().length} chars — thin/doorway pages are rejected (need >= ${MIN_BODY_CHARS} of substantive, cited content)`
      );
    }
    if (/<h1[\s>]/i.test(p.bodyHtml)) {
      throw new Error(`${tag}: bodyHtml contains an <h1> — the template owns the single H1`);
    }
    JSON.stringify(p.jsonLd); // must serialize
  }
}

/** The shared crawlable page template (self-contained, brand-consistent). */
export function renderSeoPage(page: SeoPage, cfg: SeoRenderConfig): string {
  const { brand, copy } = cfg;
  const url = `${brand.appUrl}/${page.path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}" />
<link rel="canonical" href="${esc(url)}" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<meta name="theme-color" content="${esc(brand.themeColor)}" />
<meta property="og:title" content="${esc(page.ogTitle ?? page.title)}" />
<meta property="og:description" content="${esc(page.ogDescription ?? page.description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${esc(url)}" />
<script type="application/ld+json">${jsonLdText(page.jsonLd)}</script>
<style>
  :root{--bg:${brand.themeColor};--elev:#161619;--surface:#222228;--text:#EDEDEF;--text2:#87878F;--text3:#55555C;--link:#8AB4F8}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);line-height:1.6;
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:640px;margin:0 auto;padding:28px 20px 40px}
  .home{color:var(--text2);font-size:13px;font-weight:700;text-decoration:none;letter-spacing:-.01em}
  .home:hover{color:var(--text)}
  h1{font-size:26px;letter-spacing:-.02em;margin:14px 0 12px}
  h2{font-size:16px;letter-spacing:-.01em;margin:22px 0 8px}
  p,li{font-size:15px;color:var(--text)}
  a{color:var(--link);text-underline-offset:2px}
  table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--surface)}
  th{color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .src{font-size:12px;color:var(--text3)}
  .cta{display:inline-block;margin-top:24px;background:var(--surface);color:var(--text);font-weight:700;
    padding:12px 18px;border-radius:12px;font-size:15px;text-decoration:none}
  .cta:hover{background:#2E2E36}
  footer{max-width:640px;margin:0 auto;padding:14px 20px 40px;border-top:1px solid var(--surface);
    color:var(--text3);font-size:11px;line-height:1.6}
  footer a{color:var(--text2)}
</style>
</head>
<body>
<main>
<a class="home" href="/">${esc(brand.appName)}</a>
<h1>${esc(page.h1)}</h1>
${page.bodyHtml}
<a class="cta" href="/">Play today&rsquo;s round &rarr;</a>
</main>
${copy.footerHtml}
</body>
</html>
`;
}

export function renderSitemap(pages: SeoPage[], appUrl: string): string {
  const urls = [
    `  <url><loc>${esc(appUrl)}/</loc></url>`,
    ...pages.map(
      (p) =>
        `  <url><loc>${esc(`${appUrl}/${p.path}`)}</loc>${p.lastmod ? `<lastmod>${esc(p.lastmod)}</lastmod>` : ''}</url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function renderRobots(appUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${appUrl}/sitemap.xml\n`;
}

/** Emit all pages + sitemap.xml + robots.txt under siteDir. Returns count. */
export function writeSeoSite(
  pages: SeoPage[],
  cfg: SeoRenderConfig,
  paths: PipelinePaths
): { count: number } {
  validatePages(pages, cfg);
  for (const p of pages) {
    const dest = path.join(paths.siteDir, `${p.path}.html`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, renderSeoPage(p, cfg));
  }
  fs.writeFileSync(path.join(paths.siteDir, 'sitemap.xml'), renderSitemap(pages, cfg.brand.appUrl));
  fs.writeFileSync(path.join(paths.siteDir, 'robots.txt'), renderRobots(cfg.brand.appUrl));
  return { count: pages.length };
}
