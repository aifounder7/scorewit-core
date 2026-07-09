import type { SeoPage } from './types';

/**
 * Umbrella legal pages (/privacy, /terms) — CANONICAL COPY, versioned here in
 * core so there is exactly one edit point and updates ship through the pin.
 * Rendered with the shared SEO page template by the umbrella pack (the pack
 * that owns the scorewit.com root sets `legalPages: true`); every other pack
 * links to the umbrella URLs and may never emit these paths (they are in the
 * SEO emitter's RESERVED set).
 *
 * Voice: Scorewit but sober — plain sentences, no legalese theatre, nothing
 * promised that the products don't actually do. The effective date is an
 * EDITORIAL CONSTANT (bumped when the copy changes), never a build clock.
 *
 * Analytics section is Plausible-READY by design: it describes the cookieless,
 * aggregate-only analytics that MAY run, so activation later needs zero legal
 * edits. No governing-law clause yet — that arrives with the LLC.
 */

export const LEGAL_EFFECTIVE_DATE = '2026-07-09';
export const LEGAL_CONTACT = 'hello@scorewit.com';

/** The data-source credits, reusing each pack's own attribution wording. */
const SOURCES_HTML = `<ul>
<li>World Cup match records via <a href="https://github.com/openfootball" rel="noopener noreferrer">openfootball</a> (public-domain data).</li>
<li>Cricket ball-by-ball data via <a href="https://cricsheet.org/" rel="noopener noreferrer">Cricsheet</a> (ODC-By 1.0).</li>
<li>Formula 1 records via <a href="https://github.com/f1db/f1db" rel="noopener noreferrer">F1DB</a> (CC BY 4.0).</li>
<li>World Series game logs via <a href="https://www.retrosheet.org" rel="noopener noreferrer">Retrosheet</a> (the information used here was obtained free of charge from and is copyrighted by Retrosheet).</li>
<li>NFL play-by-play data via <a href="https://github.com/nflverse/nflverse-data" rel="noopener noreferrer">nflverse</a> (nflfastR play-by-play data, CC BY 4.0).</li>
</ul>`;

const PRIVACY_BODY = `<p>Scorewit makes daily sports-trivia games. This page describes what happens with data when you play — it is short because very little happens.</p>

<h2>What we don't do</h2>
<p>Scorewit has no accounts, sets no cookies, and uses no tracking identifiers. We do not build profiles, we do not collect personal information, we do not show ads, and we do not sell or share data with anyone — there is nothing to sell.</p>

<h2>What stays on your device</h2>
<p>Your game state — daily streaks, past scores, and preferences such as a followed team — is stored in your browser's localStorage. It is functional data only: it exists so the game remembers you between visits, it never leaves your device, and we never see it. Clearing your browser data resets it.</p>

<h2>Hosting</h2>
<p>Scorewit sites are served by <a href="https://vercel.com" rel="noopener noreferrer">Vercel</a>. Like any web host, Vercel processes IP addresses in ordinary server logs in order to deliver requests and protect the service. We do not use those logs to identify or track players.</p>

<h2>Analytics</h2>
<p>If analytics run on a Scorewit site, they are cookieless and aggregate-only: no cookies, no persistent identifiers, no cross-site tracking, and IP addresses are not stored. We see counts — how many rounds were played — never people.</p>

<h2>Data sources</h2>
<p>Every fact in a Scorewit game is computed from cited public data:</p>
${SOURCES_HTML}

<h2>Contact</h2>
<p>Questions about any of this: <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>.</p>

<p class="src">Effective ${LEGAL_EFFECTIVE_DATE}. If this page changes, the date changes with it.</p>`;

const TERMS_BODY = `<p>Scorewit games are free to play. These terms are short because the service is simple.</p>

<h2>The service</h2>
<p>Scorewit provides daily sports-trivia games, free of charge, as-is and as-available. We make no warranties of any kind — about availability, accuracy, or fitness for any purpose — and we may change or discontinue any part of the service at any time.</p>

<h2>Facts and sources</h2>
<p>Every answer and fact is computed from cited public data sources; each question links to its source so you can check it. The underlying data remains subject to its own licenses (credited on our <a href="/privacy">privacy page</a> and in each game's footer). We work hard to compute correctly, but sports records get amended — if something looks wrong, tell us.</p>

<h2>Our content</h2>
<p>The Scorewit name, marks, designs, and the games themselves are ours. The facts they present are facts — nobody owns those.</p>

<h2>Not affiliated</h2>
<p>Scorewit games are independent fan products. Each game's footer carries its own non-affiliation statement for the competition it covers; those statements are part of these terms.</p>

<h2>Acceptable use</h2>
<p>Play the games; share your results. Don't scrape, bulk-extract, or republish the service's content, don't probe or disrupt the infrastructure, and don't misrepresent an affiliation with Scorewit.</p>

<h2>Not betting advice</h2>
<p>Scorewit is trivia about things that already happened. Nothing here is gambling, odds, or betting advice, and no wagering content is presented.</p>

<h2>Changes</h2>
<p>We may update these terms; the effective date below marks the current version. Continuing to play after a change means the current version applies.</p>

<h2>Contact</h2>
<p><a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a></p>

<p class="src">Effective ${LEGAL_EFFECTIVE_DATE}.</p>`;

/** The two umbrella pages, shaped as SeoPage so the shared template renders
 *  them. `lastmod` is the editorial effective date — never a build clock. */
export function legalSeoPages(): SeoPage[] {
  return [
    {
      path: 'privacy',
      title: 'Privacy — Scorewit',
      description:
        'Scorewit has no accounts, no cookies, and no tracking. Game state stays in your browser; any analytics are cookieless and aggregate-only. The details, plainly.',
      h1: 'Privacy',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Scorewit privacy policy',
        description: 'What Scorewit does and does not do with data.',
      },
      bodyHtml: PRIVACY_BODY,
      lastmod: LEGAL_EFFECTIVE_DATE,
      eyebrowHtml: 'Scorewit · Legal',
      subtitleHtml: 'No accounts, no cookies, no tracking — here is exactly what that means.',
    },
    {
      path: 'terms',
      title: 'Terms of use — Scorewit',
      description:
        'Scorewit games are free, provided as-is, and computed from cited public data. The terms of playing them, in plain words.',
      h1: 'Terms of use',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Scorewit terms of use',
        description: 'The terms for playing Scorewit games.',
      },
      bodyHtml: TERMS_BODY,
      lastmod: LEGAL_EFFECTIVE_DATE,
      eyebrowHtml: 'Scorewit · Legal',
      subtitleHtml: 'Free to play, as-is, facts computed from cited public data.',
    },
  ];
}
