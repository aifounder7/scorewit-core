import type { FamilyConfig } from './app';

/** Pack-owned text and links; the shared renderer contains no sport facts. */
export interface FooterLink { text: string; url: string }
export type FooterLine = Array<string | FooterLink>;
export interface FooterConfig {
  homeUrl: string;
  /** Present for pack pages; prevents a self-link in the sibling shelf. */
  gameUrl?: string;
  wordmark: string;
  heading: string;
  allGamesLabel: string;
  trust: string;
  disclaimer: string[];
  privacy: string;
  credits: FooterLine[];
  links: FooterLink[];
  copyright: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function url(s: string): string {
  if (!/^https:\/\/[^\s"<>]+$/.test(s)) throw new Error(`footer: expected absolute HTTPS URL: ${s}`);
  return esc(s);
}
function imageUrl(s: string): string {
  // SVGs load as images, never injected markup or executable DOM.
  if (/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(s)) return s;
  return url(s);
}
function link(l: FooterLink): string {
  if (!l.text.trim()) throw new Error('footer: empty link label');
  return `<a href="${url(l.url)}">${esc(l.text)}</a>`;
}

/** No family means the homepage's band-only variant. All text is visible. */
export function renderFooter(config: FooterConfig, family?: FamilyConfig): string {
  let shelf = '';
  if (family) {
    const seen = new Set<string>();
    const tiles = family.games.map(g => {
      if (!g.name.trim() || !g.markUrl || !g.description?.trim()) {
        throw new Error('footer: every sibling needs a name, markUrl and description');
      }
      if (g.url === config.gameUrl) throw new Error('footer: the current game must not appear in its shelf');
      if (seen.has(g.url)) throw new Error('footer: duplicate sibling URL');
      seen.add(g.url);
      return `<li><a href="${url(g.url)}" aria-label="${esc(g.name)}"><img src="${imageUrl(g.markUrl)}" alt="" width="30" height="30" loading="lazy" decoding="async"><span><strong>${esc(g.name)}</strong><small>${esc(g.description)}</small></span></a></li>`;
    }).join('');
    shelf = `<nav class="sw-footer-shelf" aria-label="${esc(config.heading)}"><div class="sw-footer-head"><h2>${esc(config.heading)}</h2>${link({ text: config.allGamesLabel, url: config.homeUrl })}</div><ul>${tiles}</ul></nav>`;
  }
  return `<footer class="sw-footer">${shelf}<div class="sw-footer-band"><div class="sw-footer-row"><a class="sw-footer-brand" href="${url(config.homeUrl)}">${esc(config.wordmark)}<span aria-hidden="true">.</span></a><nav class="sw-footer-links" aria-label="Site information">${config.links.map(link).join('')}</nav></div><p class="sw-footer-trust">${esc(config.trust)}</p><div class="sw-footer-columns"><section><h2>Independent by design</h2>${config.disclaimer.map(s => `<p>${esc(s)}</p>`).join('')}<p>${esc(config.privacy)}</p></section><section><h2>Data and credits</h2>${config.credits.map(line => `<p>${line.map(part => typeof part === 'string' ? esc(part) : link(part)).join('')}</p>`).join('')}</section></div><p class="sw-footer-copyright">${esc(config.copyright)}</p></div></footer>`;
}

/** Namespaced, additive stylesheet; legacy consumers remain byte-identical. */
export const FOOTER_CSS = `
/* Shared footer: visible notices, pack-owned content. */
footer.sw-footer{box-sizing:border-box;max-width:780px;margin:32px auto 0;padding:20px 0 24px;border-top:1px solid #ddd3ba;background:#faf5ec;color:#645f52;font-family:ui-rounded,"SF Pro Rounded",-apple-system,system-ui,"Segoe UI",sans-serif;font-size:12px;line-height:1.6;text-align:left}
body>footer.sw-footer{padding:20px 22px 32px}
.sw-footer *{box-sizing:border-box}
.sw-footer a{color:inherit;text-underline-offset:3px}
.sw-footer a:focus-visible{outline:3px solid #245bb3;outline-offset:3px}
.sw-footer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.sw-footer-head h2{font-weight:700;line-height:1.5;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin:0;color:#645f52}
.sw-footer-head>a{display:flex;align-items:center;min-height:44px;color:#20211f}
.sw-footer-shelf ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;list-style:none;padding:0;margin:0 0 20px}
.sw-footer-shelf li{margin:0;min-width:0}
.sw-footer-shelf li>a{display:flex;align-items:center;gap:10px;min-height:64px;padding:10px 12px;background:#fffdf8;border:1px solid #ddd3ba;border-radius:12px;text-decoration:none;color:#20211f;height:100%}
.sw-footer-shelf li>a:hover{border-color:#645f52}
.sw-footer-shelf img{width:30px;height:30px;flex:none}
.sw-footer-shelf span{min-width:0}
.sw-footer-shelf strong{display:block;font-size:13px;line-height:1.3}
.sw-footer-shelf small{display:block;font-size:11px;line-height:1.5;color:#645f52;margin-top:2px}
.sw-footer-band{border-top:1px solid #ddd3ba;padding-top:14px}
.sw-footer-band:first-child{border-top:0;padding-top:0}
.sw-footer-row{display:flex;justify-content:space-between;align-items:center;gap:8px 16px;flex-wrap:wrap;margin-bottom:8px}
.sw-footer-brand{font-size:18px;font-weight:800;letter-spacing:-.02em;text-decoration:none;color:#20211f!important;min-height:44px;display:flex;align-items:center}
.sw-footer-brand span{color:#b3382c}
.sw-footer-links{display:flex;gap:0 16px;flex-wrap:wrap}
.sw-footer-links a{min-height:44px;display:flex;align-items:center;color:#20211f}
.sw-footer-trust{font-size:12px;margin:0 0 12px}
.sw-footer-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:12px;line-height:1.6}
.sw-footer-columns h2{font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 0 4px;color:#645f52}
.sw-footer-columns p{margin:0 0 6px}
.sw-footer-copyright{font-size:11px;margin:12px 0 0}
@media(max-width:640px){.sw-footer-shelf ul{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sw-footer-shelf li>a{gap:8px;padding:10px 8px}.sw-footer-shelf strong{font-size:12px}.sw-footer-columns{grid-template-columns:1fr}}
/* End shared footer */
`;
