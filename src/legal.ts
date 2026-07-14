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
 * HARDENED (2026-07): promises are scoped so monetization stages don't
 * falsify them, and later stages activate via the constants below — the same
 * one-line-activation pattern as the analytics config:
 *
 *   LEGAL_ENTITY         — set when the LLC exists; names the operator in
 *                          both pages ("Scorewit is operated by X LLC").
 *   LEGAL_GOVERNING_LAW  — set when the LLC exists (attorney call: entity
 *                          state vs home state); activates the governing-law
 *                          sentence in the disputes section.
 *   LEGAL_DMCA_AGENT     — set after registering the $6 designated agent
 *                          with the Copyright Office (register in the LLC's
 *                          name; RENEW EVERY 3 YEARS or safe harbor lapses);
 *                          activates the copyright-complaints section.
 *   LEGAL_AD_NETWORKS    — set at Stage 1 with the live ad networks (e.g.
 *                          ['Google AdSense']; Google's required disclosures
 *                          are pre-drafted in the conditional ads section,
 *                          which names vendors from this list). Empty array =
 *                          the "no ads today" copy renders.
 *
 * Analytics section describes the live Plausible setup: the in-game
 * "analytics off" switch shipped in the shell in v0.10.0, and packs
 * activated analytics 2026-07-10 — the promise is kept. Ads section is
 * ADS-READY the same way: activating ads at Stage 1 needs the certified-CMP
 * wiring (EEA/UK) + the US-state opt-out link from the network, both of
 * which the copy already describes conditionally.
 *
 * NOT LEGAL ADVICE: attorney review is the gate before Stage 2 (paid
 * subscriptions) — see scorewit-legal-hardening-report.md.
 */

export const LEGAL_EFFECTIVE_DATE = '2026-07-13';
export const LEGAL_CONTACT = 'hello@scorewit.com';

/** Operator entity, e.g. 'Example Holdings LLC'. Null until the LLC exists. */
export const LEGAL_ENTITY: string | null = null;

/** Governing law + venue, e.g. { law: 'Wyoming', venue: 'the state and federal courts located in Wyoming' }. Null until the LLC exists (attorney call). */
export const LEGAL_GOVERNING_LAW: { law: string; venue: string } | null = null;

/** DMCA designated agent as registered with the US Copyright Office. Null until registered. */
export const LEGAL_DMCA_AGENT: { name: string; email: string } | null = null;

/** Live ad networks, e.g. ['Google AdSense']. Empty until Stage 1. */
export const LEGAL_AD_NETWORKS: string[] = [];

/** "Scorewit" or "Scorewit, operated by X LLC" — used at first mention on each page. */
const OPERATOR = LEGAL_ENTITY ? `Scorewit (operated by ${LEGAL_ENTITY})` : 'Scorewit';

/** The data-source credits, reusing each pack's own attribution wording. */
const SOURCES_HTML = `<ul>
<li>World Cup match records via <a href="https://github.com/openfootball" rel="noopener noreferrer">openfootball</a> (public-domain data).</li>
<li>Cricket ball-by-ball data via <a href="https://cricsheet.org/" rel="noopener noreferrer">Cricsheet</a> (ODC-By 1.0).</li>
<li>Formula 1 records via <a href="https://github.com/f1db/f1db" rel="noopener noreferrer">F1DB</a> (CC BY 4.0).</li>
<li>World Series game logs via <a href="https://www.retrosheet.org" rel="noopener noreferrer">Retrosheet</a> (the information used here was obtained free of charge from and is copyrighted by Retrosheet).</li>
<li>NFL play-by-play data via <a href="https://github.com/nflverse/nflverse-data" rel="noopener noreferrer">nflverse</a> (nflfastR play-by-play data, CC BY 4.0).</li>
</ul>`;

/** Ads section: "no ads" copy until LEGAL_AD_NETWORKS is populated, then the
 *  full disclosure set (Google's four required privacy-policy disclosures are
 *  pre-drafted here so Stage-1 activation is a config change + date bump).
 *  Builder functions (not inline ternaries on the consts) so TypeScript's
 *  control-flow narrowing of the literal-null activation constants doesn't
 *  reduce the active branches to `never`. */
const adsHtml = (networks: string[]): string => networks.length === 0
  ? `<p>Scorewit pages carry no advertising today. If that ever changes, this page changes first: it will name the ad partners, describe what they collect, and link the choices you have — including the consent prompt shown where law requires one and a "Do Not Sell or Share My Personal Information" control where US state law provides one. The daily game stays clean either way; any future ads belong on our stats and reference pages.</p>`
  : `<p>Our stats and reference pages carry advertising served by ${networks.join(', ')}. The daily game itself carries none.</p>
<p>On pages with ads, third-party vendors — including Google — use cookies or similar technologies to serve ads based on your prior visits to this site or other sites. Google's advertising cookies enable Google and its partners to serve ads based on those visits. You can opt out of personalized advertising at <a href="https://adssettings.google.com" rel="noopener noreferrer">Google Ads Settings</a> and <a href="https://www.aboutads.info" rel="noopener noreferrer">aboutads.info</a>, which also lists other participating ad vendors.</p>
<p>If you visit from the EEA, UK, or Switzerland, ad pages show a consent prompt before any advertising technology runs, and "reject" means it doesn't. If you visit from a US state with a privacy law, ad pages carry a "Do Not Sell or Share My Personal Information" link, and we honor Global Privacy Control signals where required. None of this applies to the game pages, which carry no ads and no ad technology.</p>`;

const ADS_HTML = adsHtml(LEGAL_AD_NETWORKS);

const PRIVACY_BODY = `<p>${OPERATOR} makes daily sports-trivia games. This page describes what happens with data when you play — it is short because very little happens.</p>

<h2>The short version</h2>
<p>Scorewit games have no accounts and no logins. The games set no cookies, use no tracking identifiers, and carry no advertising. We do not build profiles of players and we do not sell or share personal information.</p>

<h2>What stays on your device</h2>
<p>Your game state — daily streaks, past scores, and preferences such as a followed team — is stored in your browser's localStorage. It is functional data the game needs to remember you between visits, stored because you asked the game to remember (that is the whole feature). It never leaves your device and we never see it. Clearing your browser data resets it.</p>

<h2>Hosting</h2>
<p>Scorewit sites are served by <a href="https://vercel.com" rel="noopener noreferrer">Vercel</a>. Like any web host, Vercel processes IP addresses in ordinary server logs in order to deliver requests and protect the service. We do not use those logs to identify or track players.</p>

<h2>Analytics</h2>
<p>Analytics on Scorewit sites are cookieless and aggregate-only: no cookies, no persistent identifiers, no cross-site tracking, and IP addresses are not stored. We see counts — how many rounds were played — never people, and the numbers are not combined with any other data or shared with anyone. If you'd rather not be counted at all, settings (on the Stats panel) include an analytics-off switch that we honor.</p>

<h2>Advertising</h2>
${ADS_HTML}

<h2>Children</h2>
<p>Scorewit is a general-audience service. It is not directed to children under 13 and we do not knowingly collect personal information from anyone, children included — there is no mechanism that could.</p>

<h2>Your data, your rights</h2>
<p>Privacy laws in various places (the EU and UK, California and other US states, and elsewhere) give you rights over personal data an operator holds about you — access, correction, deletion, and objection among them. Today Scorewit holds none: no accounts, no profiles, nothing keyed to you. If you believe we hold personal data about you, or you have any privacy question or complaint, email us and we will answer plainly: <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>. If Scorewit ever adds optional accounts, this section will grow to describe exactly what an account stores and how to export or delete it.</p>

<h2>Data sources</h2>
<p>Every fact in a Scorewit game is computed from cited public data:</p>
${SOURCES_HTML}

<h2>Contact</h2>
<p>Questions about any of this: <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>.</p>

<p class="src">Effective ${LEGAL_EFFECTIVE_DATE}. If this page changes, the date changes with it — and if what we actually do ever changes, this page changes first.</p>`;

/** Disputes section: informal notice-and-cure always; governing law joins when the constant is set. */
const disputesHtml = (gov: { law: string; venue: string } | null): string =>
  `<p>If you have a problem with Scorewit, tell us first: email <a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a> with what went wrong and what you'd like done. We'll do our best to respond, and both sides agree to try in good faith to resolve any dispute informally for 60 days before starting any legal proceeding. Most problems are a bug report, and we fix bugs.</p>${
    gov
      ? `\n<p>These terms are governed by the laws of ${gov.law}, and disputes that can't be resolved informally belong in ${gov.venue} — except where the law of the place you live gives you protections or a forum that can't be taken away by agreement, which we don't try to take away.</p>`
      : ''
  }`;

const DISPUTES_HTML = disputesHtml(LEGAL_GOVERNING_LAW);

/** Copyright-complaints section: renders once the DMCA agent is registered. */
const dmcaHtml = (agent: { name: string; email: string } | null): string => agent
  ? `\n<h2>Copyright complaints</h2>
<p>If you believe something on a Scorewit site infringes your copyright, send a notice under 17 U.S.C. § 512 to our designated agent: ${agent.name}, <a href="mailto:${agent.email}">${agent.email}</a>. Include the material, where it appears, your contact details, and a good-faith statement of your claim. We respond to complete notices promptly.</p>`
  : '';

const DMCA_HTML = dmcaHtml(LEGAL_DMCA_AGENT);

const TERMS_BODY = `<p>Scorewit games are free to play. These terms are short because the service is simple — but they are a real agreement: by using a Scorewit site, you accept them.</p>

<h2>The service</h2>
<p>${OPERATOR} provides daily sports-trivia games, free of charge, as-is and as-available. To the fullest extent the law allows, we make no warranties of any kind — express or implied, including fitness for a particular purpose, accuracy, or uninterrupted availability — and we may change or discontinue any part of the service at any time.</p>

<h2>Facts and sources</h2>
<p>Every answer and fact is computed from cited public data sources; each question links to its source so you can check it. The underlying data remains subject to its own licenses (credited on our <a href="/privacy">privacy page</a> and in each game's footer). We work hard to compute correctly, but sports records get amended — if something looks wrong, tell us.</p>

<h2>Your license, our content</h2>
<p>We grant you a personal, non-commercial license to play the games and share your results. The Scorewit name, marks, designs, question banks, and the games themselves are ours; the facts they present are facts — nobody owns those. This license is all the permission the service grants: it does not include scraping, bulk extraction, or republishing our content, and it ends if you breach these terms.</p>

<h2>Acceptable use</h2>
<p>Play the games; share your results. Don't scrape, bulk-extract, or republish the service's content; don't access the service with automated tools except ordinary search-engine indexing; don't probe, overload, or disrupt the infrastructure; don't misrepresent an affiliation with Scorewit; and don't use the service to break any law.</p>

<h2>Not affiliated</h2>
<p>Scorewit games are independent fan products. Each game's footer carries its own non-affiliation statement for the competition it covers; those statements are part of these terms.</p>

<h2>Not betting advice</h2>
<p>Scorewit is trivia about things that already happened. Nothing here is gambling, odds, or betting advice, and no wagering content is presented.</p>

<h2>If something goes wrong</h2>
<p>Scorewit is a free trivia game, and the deal is sized accordingly: to the fullest extent the law allows, we are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising from the service — and our total liability for all claims combined is capped at one hundred US dollars ($100) or, if you have paid us anything in the twelve months before the claim, the amount you paid, whichever is greater. Some places don't allow some of these limits; where that's you, they apply only as far as the law allows. Nothing in these terms limits liability that the law says can't be limited.</p>

<h2>Disputes</h2>
${DISPUTES_HTML}${DMCA_HTML}

<h2>Sponsored content</h2>
<p>Scorewit content is independent. If a round or page is ever sponsored, it will say so clearly, right where it appears.</p>

<h2>Changes</h2>
<p>We may update these terms; the effective date below marks the current version, and we'll flag material changes on the site. Continuing to play after a change means the current version applies.</p>

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
        'Scorewit games have no accounts, no cookies, no tracking. Game state stays in your browser; analytics are cookieless and aggregate-only. The details, plainly.',
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
      subtitleHtml: 'No accounts, no cookies, no tracking in the games — here is exactly what that means.',
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
