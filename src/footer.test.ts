import assert from 'node:assert/strict';
import { FOOTER_CSS, renderFooter, type FooterConfig } from './render/footer';
import { renderAppHtml, type AppShellConfig, type FamilyConfig } from './render/app';
import { renderSeoPage } from './render/seo';
function shellConfig(family?: FamilyConfig): AppShellConfig {
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

const cfg = shellConfig();
const footer: FooterConfig = {
  homeUrl: 'https://example.test/', wordmark: 'Example', heading: 'More to play', allGamesLabel: 'All games',
  trust: 'Verified before publication.', disclaimer: ['Independent of all leagues.'], privacy: 'No cookies.',
  copyright: '© 2026 Example', links: [{ text: 'Terms', url: 'https://example.test/terms' }],
  credits: [['Data from ', { text: 'Data & Co', url: 'https://data.test/license?a=1&b=2' }, ' (CC BY 4.0).']],
};
const family: FamilyConfig = { heading: 'More games', hub: { url: footer.homeUrl, label: 'All games' },
  games: [{ name: 'Sibling <game>', url: 'https://example.test/cricket', storagePrefix: 'sibling',
    description: 'A & B', markUrl: 'https://example.test/cricket/icon.svg' }] };
const band = renderFooter(footer);
const shelf = renderFooter(footer, family);
assert.ok(!band.includes('sw-footer-shelf'));
assert.ok(shelf.includes('aria-label="Sibling &lt;game&gt;"'));
assert.ok(shelf.includes('alt="" width="30" height="30"'));
assert.ok(shelf.includes('A &amp; B'));
assert.ok(shelf.includes('a=1&amp;b=2'));
for (const text of ['Verified before publication.', 'Independent of all leagues.', 'No cookies.', '© 2026 Example', 'CC BY 4.0']) {
  assert.ok(band.includes(text) && shelf.includes(text));
}
assert.ok(!/<details|<script|target=/.test(shelf));
assert.throws(() => renderFooter({ ...footer, links: [{ text: 'bad', url: 'javascript:alert(1)' }] }), /HTTPS/);
assert.throws(() => renderFooter(footer, { ...family, games: [{ ...family.games[0], markUrl: undefined }] }), /markUrl/);
assert.throws(() => renderFooter(footer, { ...family, games: [...family.games, ...family.games] }), /duplicate/);
assert.throws(() => renderFooter({ ...footer, gameUrl: family.games[0].url }, family), /current game/);
assert.ok(renderFooter(footer, { ...family, games: [{ ...family.games[0], markUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }] }).includes('src="data:image/svg+xml;base64,PHN2Zy8+"'));
const legacy = renderAppHtml(cfg);
const enabled = renderAppHtml({ ...cfg, footer, family });
const stripFooter = (s: string) => s.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/g, '').replace(FOOTER_CSS, '');
// New metadata in family must not alter the existing post-round strip's JS.
const withFamily = renderAppHtml({ ...cfg, family });
assert.equal(stripFooter(enabled), stripFooter(withFamily));
assert.equal(legacy, renderAppHtml({ ...cfg, footer: undefined }));
assert.ok(FOOTER_CSS.includes('body:has(#continue:not(:empty)) .sw-footer-shelf{display:none}'));
assert.ok(!FOOTER_CSS.includes('#continue{display:none}'));
const seoCfg = { brand: cfg.brand, copy: cfg.copy, routes: { today: '/today', practice: '/practice', team: '/my-team' } };
const page = { jsonLd: {}, path: 'example', title: 'Example', description: 'Example page', h1: 'Example', bodyHtml: '<p>'+'source data '.repeat(30)+'</p>' };
const seo = renderSeoPage(page, seoCfg);
const seoNew = renderSeoPage(page, { ...seoCfg, footer, family });
assert.equal(stripFooter(seo), stripFooter(seoNew));
assert.ok(seoNew.includes('sw-footer-shelf'));
console.log('footer: escaping, visible notices, variants, legacy parity and unchanged result code pass');
