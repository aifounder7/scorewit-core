/**
 * OPT-IN base-path support (config.basePath): serve a pack under a sub-path
 * of a larger origin (e.g. "/f1" on www.scorewit.com) with every emitted URL
 * prefix-aware. The DESIGN SPLIT:
 *
 *   - brand.appUrl carries the full public URL INCLUDING the prefix
 *     ("https://www.scorewit.com/f1") — it already drives every absolute
 *     emission (canonical, og:url/og:image, sitemap <loc>s, robots' Sitemap
 *     line, the share-text link), so those become prefix-aware for free.
 *   - config.basePath governs the ROOT-RELATIVE emissions: head asset links,
 *     the client router's tab routes (incl. the hardcoded daily:'/'), the PWA
 *     manifest's start_url, and the SEO template's "/" links.
 *
 * The two must agree: appUrl must END WITH basePath (gated below), so a
 * canonical can never point somewhere the router doesn't serve.
 *
 * UNSET = byte-identical output: every rewrite below runs ONLY when basePath
 * is set, and the shell template text is untouched otherwise — existing
 * shellPatches keep their anchors.
 *
 * Rewrites use the shellPatches exact-once discipline (replaceExactlyOnce):
 * a basePath edit that matches zero or twice means the template drifted, and
 * the build fails loudly instead of shipping a half-prefixed app.
 *
 * ENFORCEMENT: after rendering, every href/src in the emitted HTML must stay
 * inside the prefix (findRootRelativeLeaks) — a basePath pack must never emit
 * a root-relative link that escapes its prefix, because on the shared origin
 * that link lands on a DIFFERENT product. This is a build gate, not a lint:
 * pack-side copy (404 actions, SEO bodies, footer links) that still says
 * href="/practice" fails the build until it says href="/f1/practice".
 * NOTE: the Vercel-analytics head script is root-relative by nature
 * ("/_vercel/insights/script.js"), so a basePath pack must configure an
 * analytics provider that isn't served from the origin root (e.g. plausible)
 * — the leak gate rejects the default wiring by design.
 */

/** Shape gate: root-absolute, lowercase kebab segments, no trailing slash. */
export function assertValidBasePath(basePath: string, appUrl: string): void {
  if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(basePath)) {
    throw new Error(
      `config.basePath must be root-absolute lowercase segments with no trailing slash (got "${basePath}")`
    );
  }
  if (!appUrl.endsWith(basePath)) {
    throw new Error(
      `brand.appUrl must end with config.basePath so canonicals/og/sitemap/share URLs agree with the served prefix (appUrl "${appUrl}", basePath "${basePath}")`
    );
  }
}

/** Exact-once replacement (the shellPatches discipline) for basePath edits. */
export function replaceExactlyOnce(
  html: string,
  find: string,
  replace: string,
  what: string
): string {
  const n = html.split(find).length - 1;
  if (n !== 1) {
    throw new Error(`basePath edit "${what}" must match exactly once (matched ${n})`);
  }
  return html.split(find).join(replace);
}

/** Every href/src attribute value that is root-relative but escapes the
 *  prefix. Protocol-relative ("//…") and the prefix itself are allowed. */
export function findRootRelativeLeaks(html: string, basePath: string): string[] {
  const leaks: string[] = [];
  const re = /(?:href|src)="(\/[^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (url.startsWith('//')) continue; // protocol-relative
    if (url === basePath || url.startsWith(`${basePath}/`)) continue;
    leaks.push(m[0]);
  }
  return leaks;
}

/** Build gate over findRootRelativeLeaks — throws with the offending links. */
export function assertNoRootRelativeLeaks(html: string, basePath: string, what: string): void {
  const leaks = findRootRelativeLeaks(html, basePath);
  if (leaks.length) {
    throw new Error(
      `${what}: ${leaks.length} root-relative link(s) escape basePath ${basePath}:\n  ` +
        [...new Set(leaks)].slice(0, 20).join('\n  ')
    );
  }
}
