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
 * The template implements the Scorewit page design language: branded topbar
 * with a sport-accent speed line, big display H1, hero stat cards, chips, an
 * accent callout, the fact-checked trust badge, a strong CTA, and a muted
 * trade-dress footer — themed per sport by the pack's accent token. All the
 * structured fields are OPTIONAL (see SeoPage): a page carrying only bodyHtml
 * renders exactly as valid a document. Pages stay fast by construction:
 * system font stack, inline critical CSS, no JavaScript, no images beyond
 * inline/flag SVGs the pack supplies.
 *
 * Emit-time quality gates (throw loudly — a bad page must never ship):
 *   - path shape + collision guard (client routes, reserved files, dupes);
 *   - unique <title> <= 60, description <= 160, exactly one H1 (the field);
 *   - serializable JSON-LD; a substantive body (thin/doorway pages rejected);
 *   - structured fields sane (plain-text fields carry no markup; raw inline
 *     fields carry no <h1>/<script>; 1–4 stat cards, at most one hero).
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
  // Umbrella legal pages (src/legal.ts) — emitted only by the umbrella pack
  // via `legalPages: true`; no pack's seoPages may ever collide with them.
  'privacy',
  'terms',
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
  /** Sport accent color (hex) for the page theme. Default: parsed from the
   *  brand palette's `--accent` token, so existing packs theme themselves. */
  accent?: string;
  /** CTA label (raw inline HTML). Default: "Play today&rsquo;s round &rarr;".
   *  Set per sport, e.g. "Play today&rsquo;s F1 round &rarr;". */
  cta?: string;
}

// ---------- accent theming (derived, deterministic) ----------

function accentOf(cfg: SeoRenderConfig): string {
  if (cfg.accent) return cfg.accent;
  const m = /--accent\s*:\s*(#[0-9a-fA-F]{3,8})/.exec(cfg.brand.paletteCss);
  return m ? m[1] : '#4E9CF5';
}

function hexRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as [number, number, number];
  }
  if (h.length === 6 || h.length === 8) {
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  return null;
}

/** hex + alpha -> rgba(); falls back to the raw value for non-hex accents. */
function rgba(hex: string, a: number): string {
  const c = hexRgb(hex);
  return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : hex;
}

/** Mix toward white (for the pill text on dark accent-soft backgrounds). */
function lighten(hex: string, amt: number): string {
  const c = hexRgb(hex);
  if (!c) return hex;
  const mix = c.map((v) => Math.round(v + (255 - v) * amt));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- emit-time gates ----------

function checkRawInline(tag: string, field: string, v: string): void {
  if (/<h1[\s>]/i.test(v)) throw new Error(`${tag}: ${field} contains an <h1> — the template owns the single H1`);
  if (/<script/i.test(v)) throw new Error(`${tag}: ${field} contains a <script>`);
}

function checkPlainText(tag: string, field: string, v: string): void {
  if (!v.trim()) throw new Error(`${tag}: ${field} is empty`);
  if (/<[a-z!/]/i.test(v)) throw new Error(`${tag}: ${field} is plain text — markup is not allowed (the template escapes it)`);
}

function validatePages(
  pages: SeoPage[],
  cfg: SeoRenderConfig,
  opts: { skipCollision?: boolean } = {}
): void {
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
    // Legal pages occupy the RESERVED privacy/terms paths BY DESIGN — the
    // collision check is the single gate they are exempt from.
    if (!opts.skipCollision && (RESERVED.has(p.path) || RESERVED.has(head) || routeNames.has(head))) {
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

    // Structured presentation fields (all optional).
    if (p.eyebrowHtml !== undefined) checkRawInline(tag, 'eyebrowHtml', p.eyebrowHtml);
    if (p.subtitleHtml !== undefined) checkRawInline(tag, 'subtitleHtml', p.subtitleHtml);
    if (p.callout !== undefined) checkRawInline(tag, 'callout', p.callout);
    if (p.trustNote !== undefined) checkRawInline(tag, 'trustNote', p.trustNote);
    if (p.premiseNote !== undefined) checkPlainText(tag, 'premiseNote', p.premiseNote);
    if (p.lead !== undefined) checkPlainText(tag, 'lead', p.lead);
    if (p.heroStats !== undefined) {
      if (p.heroStats.length < 1 || p.heroStats.length > 4) {
        throw new Error(`${tag}: heroStats must have 1–4 cards (got ${p.heroStats.length})`);
      }
      let heroes = 0;
      for (const s of p.heroStats) {
        if (!s.label.trim() || s.label.length > 28) throw new Error(`${tag}: heroStats label must be non-empty and <= 28 chars`);
        if (!s.value.trim() || s.value.length > 12) throw new Error(`${tag}: heroStats value must be non-empty and <= 12 chars`);
        if (s.hero) heroes++;
      }
      if (heroes > 1) throw new Error(`${tag}: at most ONE heroStats card may set hero`);
    }
    if (p.chips !== undefined) {
      if (p.chips.length < 1 || p.chips.length > 24) throw new Error(`${tag}: chips must have 1–24 items`);
      for (const c of p.chips) checkPlainText(tag, 'chips item', c);
    }
    if (p.chipIcons !== undefined) {
      // Decoration parallel to `chips`: the chip FACT strings stay plain-text
      // (checked above, byte-unchanged for the validators); icons are raw
      // inline HTML rendered before the escaped text.
      if (p.chips === undefined) throw new Error(`${tag}: chipIcons requires chips`);
      if (p.chipIcons.length !== p.chips.length) {
        throw new Error(`${tag}: chipIcons must match chips length (${p.chipIcons.length} vs ${p.chips.length})`);
      }
      for (const ic of p.chipIcons) {
        if (ic !== null) checkRawInline(tag, 'chipIcons item', ic);
      }
    }
  }
}

// ---------- the page template ----------

/** The shared crawlable page template (self-contained, brand-consistent,
 *  sport-accent themed; system fonts, no JS, inline CSS only). */
export function renderSeoPage(page: SeoPage, cfg: SeoRenderConfig): string {
  const { brand, copy } = cfg;
  const url = `${brand.appUrl}/${page.path}`;
  const accent = accentOf(cfg);
  const onAccent = brand.onAccent?.accent ?? '#06121f';
  const cta = cfg.cta ?? 'Play today&rsquo;s round &rarr;';

  // "Scorewit Cricket" -> "Scorewit <span>Cricket</span>" (single-word names
  // render plain).
  const [brandFirst, ...brandRest] = brand.appName.split(' ');
  const brandHtml = brandRest.length
    ? `${esc(brandFirst)} <span>${esc(brandRest.join(' '))}</span>`
    : esc(brand.appName);

  const blocks: string[] = [];
  if (page.eyebrowHtml) blocks.push(`<div class="eyebrow">${page.eyebrowHtml}</div>`);
  blocks.push(`<h1>${esc(page.h1)}</h1>`);
  if (page.subtitleHtml) blocks.push(`<p class="sub">${page.subtitleHtml}</p>`);
  if (page.premiseNote) {
    blocks.push(`<div class="pill"><span class="dot"></span> ${esc(page.premiseNote)}</div>`);
  }
  if (page.lead) blocks.push(`<p class="lead">${esc(page.lead)}</p>`);
  if (page.heroStats?.length) {
    blocks.push(
      `<div class="stats">${page.heroStats
        .map(
          (s) =>
            `<div class="stat${s.hero ? ' hero' : ''}"><div class="num">${esc(s.value)}</div><div class="lbl">${esc(s.label)}</div></div>`
        )
        .join('')}</div>`
    );
  }
  if (page.chips?.length) {
    // chipIcons (validated parallel decoration) render INSIDE the span before
    // the escaped text; pages without them render byte-identically to before.
    blocks.push(
      `<div class="chips">${page.chips
        .map((c, i) => {
          const ic = page.chipIcons?.[i];
          return `<span class="chip">${ic ? `${ic} ` : ''}${esc(c)}</span>`;
        })
        .join('')}</div>`
    );
  }
  if (page.callout) {
    blocks.push(`<div class="callout"><div class="ic">◧</div><div class="t">${page.callout}</div></div>`);
  }
  blocks.push(page.bodyHtml);
  if (page.trustNote) {
    blocks.push(`<div class="verify"><span class="ck">✓</span> <span>${page.trustNote}</span></div>`);
  }
  blocks.push(`<p class="ctarow"><a class="cta" href="/">${cta}</a></p>`);

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
  :root{--bg:${brand.themeColor};--surface:#161619;--surface2:#1C1C21;--line:#2A2A30;
    --text:#F4F4F6;--muted:#9A9AA3;--faint:#84848D;
    --accent:${accent};--accent-soft:${rgba(accent, 0.12)};--accent-line:${rgba(accent, 0.35)};--accent-lite:${lighten(accent, 0.45)}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);line-height:1.55;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased}
  .topbar{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);
    display:flex;align-items:center;gap:10px;padding:15px 22px}
  .topbar .accentbar{position:absolute;left:0;right:0;top:0;height:3px;
    background:linear-gradient(90deg,var(--accent) 0%,var(--accent) 60%,transparent 100%)}
  .mark{display:inline-flex}
  .mark svg{width:24px;height:24px;display:block}
  .brand{font-weight:700;letter-spacing:.2px;font-size:15px;color:var(--text);text-decoration:none}
  .brand span{color:var(--accent)}
  main{max-width:760px;margin:0 auto;padding:0 22px 56px}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;margin-top:38px;
    font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--faint)}
  .eyebrow img,.eyebrow svg{width:22px;height:15px;border-radius:2px;display:block}
  h1{font-size:clamp(34px,8vw,52px);line-height:1.04;font-weight:800;letter-spacing:-1.2px;margin:10px 0 12px}
  .eyebrow+h1{margin-top:8px}
  .sub{font-size:18px;color:var(--muted);font-weight:500;margin:0}
  .sub b{color:var(--text);font-weight:700}
  .pill{display:inline-flex;align-items:center;gap:7px;margin-top:16px;
    background:var(--accent-soft);border:1px solid var(--accent-line);color:var(--accent-lite);
    font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:999px}
  .pill .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .lead{font-size:clamp(20px,3.2vw,22px);line-height:1.5;font-weight:600;letter-spacing:-.25px;
    color:var(--text);margin:24px 0 0;max-width:640px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:28px 0 8px}
  .stat{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 16px}
  .stat.hero{background:linear-gradient(180deg,var(--accent-soft),transparent);border-color:var(--accent-line)}
  .stat .num{font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums}
  .stat.hero .num{color:var(--accent)}
  .stat .lbl{margin-top:9px;font-size:11.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--faint)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 4px}
  .chip{background:var(--surface2);border:1px solid var(--line);border-radius:999px;
    padding:6px 13px;font-size:13px;font-weight:600;color:var(--muted)}
  .callout{display:flex;gap:14px;align-items:center;margin-top:26px;background:var(--surface);
    border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:16px 18px}
  .callout .ic{color:var(--accent);font-size:22px;line-height:1}
  .callout .t{font-size:15px}
  .callout .t b{font-weight:700}
  .callout .t span{color:var(--muted)}
  .verify{display:inline-flex;align-items:center;gap:8px;margin-top:28px;
    border:1px dashed var(--line);border-radius:10px;padding:9px 14px;font-size:13px;color:var(--muted)}
  .verify .ck{color:#3DDC84;font-weight:800}
  .verify a{color:var(--accent);text-decoration:none;font-weight:600}
  h2{font-size:16px;letter-spacing:-.01em;margin:26px 0 8px}
  p,li{font-size:15px;color:var(--text);margin:8px 0}
  a{color:var(--accent);text-underline-offset:2px}
  table{border-collapse:separate;border-spacing:0;width:100%;margin:14px 0 18px;font-size:14px;
    background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{text-align:left;padding:9px 14px}
  th{background:var(--surface2);color:var(--faint);font-size:11px;font-weight:700;
    text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--line)}
  td{border-bottom:1px solid var(--surface2);font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:0}
  tr:nth-child(even) td{background:rgba(255,255,255,.015)}
  .src{font-size:12px;color:var(--faint)}
  .ctarow{margin-top:30px}
  .cta{display:inline-flex;align-items:center;gap:10px;background:var(--accent);color:${onAccent};
    font-weight:800;font-size:16px;padding:15px 26px;border-radius:12px;text-decoration:none;letter-spacing:.2px}
  .cta:hover{filter:brightness(1.08)}
  footer{max-width:760px;margin:24px auto 0;padding:22px 22px 48px;border-top:1px solid var(--line);
    color:var(--faint);font-size:12.5px;line-height:1.7}
  footer a{color:var(--muted)}
</style>
</head>
<body>
<header class="topbar"><span class="accentbar"></span><a class="mark" href="/" aria-label="${esc(brand.appName)}">${brand.markSvg}</a><a class="brand" href="/">${brandHtml}</a></header>
<main>
${blocks.join('\n')}
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

/** Emit all pages + sitemap.xml + robots.txt under siteDir. Returns count.
 *  `legalPages` (the umbrella pack only) are appended AFTER the pack pages
 *  pass the collision gates: they occupy the RESERVED privacy/terms paths by
 *  design, so they skip only that one check — every other quality gate still
 *  applies to them via the same render path. */
export function writeSeoSite(
  pages: SeoPage[],
  cfg: SeoRenderConfig,
  paths: PipelinePaths,
  legalPages: SeoPage[] = []
): { count: number } {
  validatePages(pages, cfg);
  // Legal pages go through the SAME quality gates (title/description
  // lengths, thin-body floor, single-H1, JSON-LD serializability, …) with
  // ONLY the reserved-path collision check exempted — so a >160-char legal
  // meta description can never ship silently again.
  validatePages(legalPages, cfg, { skipCollision: true });
  const all = [...pages, ...legalPages];
  for (const p of all) {
    const dest = path.join(paths.siteDir, `${p.path}.html`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, renderSeoPage(p, cfg));
  }
  fs.writeFileSync(path.join(paths.siteDir, 'sitemap.xml'), renderSitemap(all, cfg.brand.appUrl));
  fs.writeFileSync(path.join(paths.siteDir, 'robots.txt'), renderRobots(cfg.brand.appUrl));
  return { count: all.length };
}
