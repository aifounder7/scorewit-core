import { hexToRgb } from './contrast';

/**
 * The "Almanac hybrid" (DAYLIGHT) light theme — the portfolio's paper-print
 * skin, opt-in per pack via `theme: { name: 'almanac', accent: <key> }`.
 *
 * Design authority: the founder-approved mock
 * (scorewit-almanac-hybrid-final.html). Tokens are spec values, verbatim;
 * the theme is a CLIENT OPTION — a pack that does not set it renders
 * byte-identically to the incumbent dark shell (proven by fixture test),
 * so per-pack rollback is a one-line revert of the opt-in.
 *
 * Color discipline: every rendered pair still goes through the build-time
 * WCAG gate (contrast.ts) — the theme supplies values, the gate supplies the
 * guarantee. Accent TONES may be darkened by the accessibility pass (hue is
 * identity and never shifts); the spec's starting values are recorded next
 * to whatever the pass resolves.
 */

export type AlmanacAccentKey =
  | 'soccer' // extra-time (World Cup)
  | 'f1' // box-box
  | 'epl' // top-flight
  | 'cricket' // cover-drive
  | 'nfl' // hail-mary
  | 'baseball' // fall-classic
  | 't20'; // super-over

export interface AlmanacTheme {
  name: 'almanac';
  accent: AlmanacAccentKey;
}

/** The shared paper tokens (spec values, verbatim). `fadedText` is the
 *  4.5:1 text tone of `faded` (the spec's #8a8577 measures 3.1:1 on paper —
 *  fine for the non-text pip rings it draws at >= 3:1 on card, but the shell
 *  renders --text3 as real text, so the text surfaces get the darkened tone;
 *  hue held, lightness stepped down until the gate passes). */
export const ALMANAC_TOKENS = {
  paper: '#faf5ec',
  card: '#fffdf8',
  border: '#ddd3ba',
  ink: '#20211f',
  muted: '#5a574f',
  faded: '#8a8577',
  fadedText: '#747064',
  meterBg: '#f1ead9',
  meterBorder: '#ddd3ba',
  /** "wit" in the Score|wit masthead (the F1 red, AA on paper at 5.5:1). */
  wit: '#b3382c',
  /** Light-theme answer semantics (computed >= 4.5:1 on paper AND card). */
  correct: '#25804a',
  incorrect: '#cc3c31',
  partial: '#926a09',
} as const;

/** Per-sport accents: `given` = the spec's starting value; `resolved` = the
 *  accessibility pass's shipped tone. Resolution discipline: HSL lightness
 *  stepped down in 0.25% steps — hue and saturation FIXED — until the accent
 *  passes EVERY rendered pair, which is stricter than the spec's three
 *  usage gates because the shell also renders accent text on the #f1ead9
 *  chip surface and on its own 10% tint wash (the binding constraints):
 *    (a) accent text on paper #faf5ec and card #fffdf8   >= 4.5
 *    (b) white on accent (chips/buttons, small bold)      >= 4.5
 *    (c) accent stamp ink on card                         >= 3   (implied by a)
 *    (+) accent on #f1ead9 chips and on tint(accent,.10)  >= 4.5
 *  NFL orange and T20 gold fail (b) as given — the reason this pass exists —
 *  and cricket teal fails only the stricter (+) pairs. The other four pass
 *  as given and ship unchanged. Full before/after table in the DAYLIGHT
 *  report; the numbers are re-computed by almanac-theme.test.ts on every
 *  test run, so the table can never drift from the shipped values. */
export const ALMANAC_ACCENTS: Record<AlmanacAccentKey, { given: string; resolved: string }> = {
  soccer: { given: '#2c6e49', resolved: '#2c6e49' },
  f1: { given: '#b3382c', resolved: '#b3382c' },
  epl: { given: '#5b3fd4', resolved: '#5b3fd4' },
  cricket: { given: '#1f7a7a', resolved: '#1d7373' },
  nfl: { given: '#c96a1e', resolved: '#9f5418' },
  baseball: { given: '#2b5fa3', resolved: '#2b5fa3' },
  t20: { given: '#a1780c', resolved: '#83620a' },
};

export function almanacAccent(key: AlmanacAccentKey): string {
  const a = ALMANAC_ACCENTS[key];
  if (!a) throw new Error(`almanac theme: unknown accent key "${key}"`);
  return a.resolved;
}

/** The unified result-pip tiers (RESULT PIPS unification): one circle
 *  vocabulary across the hub cards, the end-of-round card, and (as emoji
 *  glyphs) the share line. Colors are PINNED to the resolved almanac accent
 *  values — soccer green, T20 gold, F1 red — not derived from
 *  ALMANAC_ACCENTS: a future accent re-resolution must never silently move
 *  result semantics. Tier shapes: correct = filled disc · partial (banded
 *  closest-guess credit) = filled disc · wrong = 2px RING, no fill ·
 *  unanswered = the faint --faded ring the shell already draws. Shape
 *  carries state without color (grayscale/color-blind safe); every value is
 *  gated >= 3:1 non-text on paper and card in almanac-theme.test.ts. */
export const RESULT_TIERS = {
  correct: '#2c6e49',
  partial: '#83620a',
  wrong: '#b3382c',
} as const;

/** Share-line glyphs for the same tiers (wrong = 🔴). The share grid has no
 *  unanswered tier: a daily round only persists — and only then can be
 *  shared — once all six questions are answered. */
export const RESULT_GLYPHS = { correct: '🟢', partial: '🟡', wrong: '🔴' } as const;

/** `rgba(r,g,b,a)` of a hex accent — the tint the light theme washes behind
 *  chips/banners (0.10: subtle on paper, and the accent still measures as
 *  text on the composited result — gated). */
function tint(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`almanac theme: unparseable accent "${hex}"`);
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** The system rounded-sans stack — NO webfonts, zero font downloads. */
export const ALMANAC_FONT_STACK =
  'ui-rounded,"SF Pro Rounded",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

/** Monospace survives ONLY for score/streak numerals (and the share grid,
 *  which is a score surface). */
export const ALMANAC_MONO_STACK =
  'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

/** The :root custom-property body for the app shell (drop-in for
 *  Brand.paletteCss). One accent drives every mode — chips, filled pips,
 *  links, buttons, and stamp ink are the sport's accent per property. */
export function almanacPaletteCss(key: AlmanacAccentKey): string {
  const a = almanacAccent(key);
  const T = ALMANAC_TOKENS;
  const dim = tint(a, 0.1);
  return `    --bg:${T.paper}; --elev:${T.card}; --surface:${T.meterBg}; --hover:${T.meterBg};
    --text:${T.ink}; --text2:${T.muted}; --text3:${T.fadedText};
    --accent:${a}; --accentDim:${dim};
    --practice:${a}; --practiceDim:${dim};
    --team:${a}; --teamDim:${dim};
    --today:${a}; --todayDim:${dim};
    --correct:${T.correct}; --correctDim:${tint(T.correct, 0.1)};
    --incorrect:${T.incorrect}; --incorrectDim:${tint(T.incorrect, 0.1)};
    --partial:${T.partial};
    --bdr:${T.border}; --faded:${T.faded};`;
}

export function almanacNotFoundPaletteCss(key: AlmanacAccentKey): string {
  const T = ALMANAC_TOKENS;
  return `--bg:${T.paper};--text:${T.ink};--text2:${T.muted};--accent:${almanacAccent(key)};--bdr:${T.border}`;
}

/** White text on the accent-filled buttons — chips and buttons are small
 *  bold text, held to the 4.5:1 body standard by the gate. */
export const ALMANAC_ON_ACCENT = {
  accent: '#ffffff',
  practice: '#ffffff',
  team: '#ffffff',
  today: '#ffffff',
} as const;

/**
 * Component overrides appended after the base stylesheet (same-specificity
 * cascade: last declaration wins). The almanac voice: paper cards with real
 * borders, 9px pips (filled = accent; empty = ring — the state survives
 * grayscale by SHAPE), the PLAYED stamp on the final score, pill buttons,
 * the double-rule masthead, and all-caps-mono retired as a voice (labels go
 * sentence-case; monospace only on score numerals).
 */
export function almanacShellCss(): string {
  const T = ALMANAC_TOKENS;
  return `
  /* ==== Almanac (DAYLIGHT) light theme ==== */
  body{font-family:${ALMANAC_FONT_STACK}}
  header{border-bottom:3px double var(--text);padding-bottom:10px;align-items:center}
  .brand{font-weight:800}
  .score{font-family:${ALMANAC_MONO_STACK}}
  /* pips: 9px; filled = accent, current = accent ring, upcoming = faded ring */
  .progress{gap:6px;align-items:center}
  .dot{height:9px;width:9px;flex:0 0 9px;border-radius:50%;background:transparent;border:1.5px solid var(--faded)}
  .dot.done{background:var(--accent);border-color:var(--accent)}
  .dot.active{background:transparent;border:2px solid var(--accent)}
  /* cards carry the real border token */
  button.opt,.cg input,.reveal,.card,.statbox,.fixture,.picker-search,.sharebox{border-color:var(--bdr)}
  .tab,.continue .cchip,.pkbtn{border-color:var(--bdr)}
  .continue,.pickem,footer{border-top-color:var(--bdr)}
  /* buttons and the share control: filled pills, 44px touch targets */
  .btn{border-radius:999px;min-height:44px}
  .tab{min-height:44px}
  button.opt{min-height:44px}
  .pkbtn{min-height:44px}
  /* result pips (end-of-round card): the unified tier circles — filled disc /
     filled disc / 2px ring — shape carries state without color */
  .respips{display:flex;gap:9px;justify-content:center;margin:14px 0}
  .rp{width:14px;height:14px;border-radius:50%;box-sizing:border-box}
  .rp.ok{background:${RESULT_TIERS.correct}}
  .rp.part{background:${RESULT_TIERS.partial}}
  .rp.no{background:transparent;border:2px solid ${RESULT_TIERS.wrong}}
  /* the PLAYED stamp carries the final score (accent ink, -11 degrees) */
  .final .big{display:inline-block;font-family:${ALMANAC_MONO_STACK};font-size:26px;font-weight:800;
    color:var(--accent);border:2.5px solid var(--accent);border-radius:8px;padding:8px 18px;
    transform:rotate(-11deg);letter-spacing:.02em;margin:12px 0 6px}
  .final .big::before{content:"PLAYED ";font-size:14px;letter-spacing:.08em;vertical-align:3px}
  .final .big small{color:var(--accent);opacity:.8}
  /* all-caps retired as a voice: labels go sentence case */
  .meta,.brand small,.card h3,.flabel,.daylabel,.fxround,.statlab,.reclist .lab,.continue .chead,.pklabel,.wdl .lab{text-transform:none;letter-spacing:.01em}
  .toast{background:${T.card};border-color:var(--bdr);box-shadow:0 6px 24px rgba(32,33,31,.18)}
  /* a11y pass: visible keyboard focus — 2px ink ring, offset 2px, on every
     interactive element (the ink ring measures 14.9:1 on paper) */
  button:focus-visible,a:focus-visible,input:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--text);outline-offset:2px}
  /* a11y pass: the theme inherits the shell's micro-transitions (options,
     toast) — under reduced motion they go instant */
  @media (prefers-reduced-motion:reduce){
    button.opt,.toast{transition:none}
  }
`;
}

/** Light chrome for the 404 page (rides __NFEXTRACSS__; the palette slot
 *  carries the paper tokens). */
export function almanacNotFoundCss(): string {
  return `
  body{font-family:${ALMANAC_FONT_STACK}}
  .btn{border-radius:999px;min-height:44px}
  .name{border-bottom:3px double var(--text);display:inline-block;padding-bottom:8px}
  .name small{text-transform:none;letter-spacing:.01em}
  a:focus-visible{outline:2px solid var(--text);outline-offset:2px}`;
}

// ---------- the archive-page (SEO template) chrome ----------

/** "Scorewit Cricket" -> Score|wit masthead treatment: "Score" ink, "wit"
 *  the almanac red, the qualifier muted. Falls back to plain text for
 *  non-Scorewit names (escaped by the caller's discipline: appName is a
 *  brand constant, not user data). */
export function almanacBrandHtml(appName: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if (appName.startsWith('Scorewit')) {
    const rest = appName.slice('Scorewit'.length).trim();
    return `Score<span class="wit">wit</span>${rest ? ` <span class="qual">${esc(rest)}</span>` : ''}`;
  }
  return esc(appName);
}

/** The SEO/archive page stylesheet, almanac skin. Same template structure
 *  and class names as the dark chrome (JSON-LD and answer-first extraction
 *  untouched); only the presentation layer changes. */
export function almanacSeoCss(key: AlmanacAccentKey): string {
  const T = ALMANAC_TOKENS;
  const a = almanacAccent(key);
  return `  :root{--bg:${T.paper};--surface:${T.card};--surface2:${T.meterBg};--line:${T.border};
    --text:${T.ink};--muted:${T.muted};--faint:${T.fadedText};
    --accent:${a};--accent-soft:${tint(a, 0.08)};--accent-line:${tint(a, 0.35)};--accent-lite:${a}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);line-height:1.55;
    font-family:${ALMANAC_FONT_STACK};
    -webkit-font-smoothing:antialiased}
  .topbar{position:sticky;top:0;background:var(--bg);border-bottom:3px double var(--text);
    display:flex;align-items:center;gap:10px;padding:15px 22px}
  .mark{display:inline-flex}
  .mark svg{width:24px;height:24px;display:block}
  .brand{font-weight:800;letter-spacing:.2px;font-size:15px;color:var(--text);text-decoration:none}
  .brand .wit{color:${T.wit}}
  .brand .qual{color:var(--muted);font-weight:700}
  main{max-width:760px;margin:0 auto;padding:0 22px 56px}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;margin-top:38px;
    font-size:12.5px;font-weight:700;color:var(--faint)}
  .eyebrow img,.eyebrow svg{width:22px;height:15px;border-radius:2px;display:block}
  h1{font-size:clamp(34px,8vw,52px);line-height:1.04;font-weight:800;letter-spacing:-1.2px;margin:10px 0 12px}
  .eyebrow+h1{margin-top:8px}
  .sub{font-size:18px;color:var(--muted);font-weight:500;margin:0}
  .sub b{color:var(--text);font-weight:700}
  .pill{display:inline-flex;align-items:center;gap:7px;margin-top:16px;
    background:${T.meterBg};border:1px solid ${T.meterBorder};color:var(--muted);
    font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:999px}
  .pill .dot{width:7px;height:7px;border-radius:50%;background:var(--accent)}
  .lead{font-size:clamp(20px,3.2vw,22px);line-height:1.5;font-weight:600;letter-spacing:-.25px;
    color:var(--text);margin:24px 0 0;max-width:640px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:28px 0 8px}
  .stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px 16px}
  .stat.hero{background:linear-gradient(180deg,var(--accent-soft),transparent);border-color:var(--accent-line)}
  .stat .num{font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums}
  .stat.hero .num{color:var(--accent)}
  .stat .lbl{margin-top:9px;font-size:11.5px;font-weight:700;color:var(--faint)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 4px}
  .chip{background:${T.meterBg};border:1px solid ${T.meterBorder};border-radius:999px;
    padding:6px 13px;font-size:13px;font-weight:600;color:var(--muted)}
  .callout{display:flex;gap:14px;align-items:center;margin-top:26px;background:var(--surface);
    border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:16px 18px}
  .callout .ic{color:var(--accent);font-size:22px;line-height:1}
  .callout .t{font-size:15px}
  .callout .t b{font-weight:700}
  .callout .t span{color:var(--muted)}
  .verify{display:inline-flex;align-items:center;gap:8px;margin-top:28px;
    border:1px dashed var(--line);border-radius:10px;padding:9px 14px;font-size:13px;color:var(--muted)}
  .verify .ck{color:${T.correct};font-weight:800}
  .verify a{color:var(--accent);text-decoration:none;font-weight:600}
  h2{font-size:16px;letter-spacing:-.01em;margin:26px 0 8px}
  p,li{font-size:15px;color:var(--text);margin:8px 0}
  a{color:var(--accent);text-underline-offset:2px}
  .faq{margin:10px 0 18px;font-size:15px}
  .faq dt{font-weight:700;color:var(--text);margin:16px 0 3px}
  .faq dt:first-of-type{margin-top:0}
  .faq dd{font-weight:400;color:var(--text);margin:0}
  table{border-collapse:separate;border-spacing:0;width:100%;margin:14px 0 18px;font-size:14px;
    background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{text-align:left;padding:9px 14px}
  th{background:${T.meterBg};color:var(--muted);font-size:12px;font-weight:700;border-bottom:1px solid var(--line)}
  td{border-bottom:1px solid ${T.meterBg};font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:0}
  tr:nth-child(even) td{background:rgba(32,33,31,.02)}
  .src{font-size:12px;color:var(--faint)}
  .ctarow{margin-top:30px}
  .cta{display:inline-flex;align-items:center;gap:10px;background:var(--accent);color:#ffffff;
    font-weight:800;font-size:16px;min-height:44px;padding:12px 26px;border-radius:999px;text-decoration:none;letter-spacing:.2px}
  .cta:hover{filter:brightness(1.08)}
  footer{max-width:760px;margin:24px auto 0;padding:22px 22px 48px;border-top:1px solid var(--line);
    color:var(--faint);font-size:12.5px;line-height:1.7}
  footer a{color:var(--muted)}
  a:focus-visible{outline:2px solid var(--text);outline-offset:2px}`;
}
