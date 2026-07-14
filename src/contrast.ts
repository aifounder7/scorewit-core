/**
 * WCAG 2.x contrast math + the build-time palette gate.
 *
 * The app shell's stylesheet pairs each palette token with known surfaces
 * (page bg, card/elev, chip/surface). Colors are editorial data supplied by
 * the pack; the ACCESSIBILITY GUARANTEE is computed here at build time —
 * renderAppHtml refuses to emit a shell whose palette fails WCAG AA on any
 * pair the stylesheet actually renders. No runtime color math, ever.
 *
 * The same primitives back the team-theming validator (nation palettes are
 * editorial data too, and get the same computed guarantee).
 */

export type Rgb = [number, number, number];

/** #rgb / #rrggbb -> [r,g,b]; null for anything else (incl. #rrggbbaa). */
export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as Rgb;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21) between two OPAQUE colors. Throws on
 *  unparseable input — a palette gate must never silently pass garbage. */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg) throw new Error(`contrastRatio: unparseable color "${fgHex}"`);
  if (!bg) throw new Error(`contrastRatio: unparseable color "${bgHex}"`);
  const a = relativeLuminance(fg) + 0.05;
  const b = relativeLuminance(bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

/** Composite `rgba(r,g,b,a)` (or a plain hex) over an opaque hex base ->
 *  the effective opaque hex the eye sees. */
export function blendOverHex(color: string, baseHex: string): string {
  if (color.startsWith('#')) return color;
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/.exec(color.trim());
  if (!m) throw new Error(`blendOverHex: unparseable color "${color}"`);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (!(a >= 0 && a <= 1)) throw new Error(`blendOverHex: bad alpha in "${color}"`);
  const base = hexToRgb(baseHex);
  if (!base) throw new Error(`blendOverHex: unparseable base "${baseHex}"`);
  const mix = [Number(m[1]), Number(m[2]), Number(m[3])].map((v, i) =>
    Math.round(a * v + (1 - a) * base[i])
  );
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** One checked (foreground, effective-background) pair. */
export interface ContrastCheck {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseTokens(paletteCss: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g;
  for (let m = re.exec(paletteCss); m; m = re.exec(paletteCss)) out[m[1]] = m[2];
  return out;
}

const APP_TOKENS = [
  'bg', 'elev', 'surface', 'hover',
  'text', 'text2', 'text3',
  'accent', 'accentDim',
  'practice', 'practiceDim',
  'team', 'teamDim',
  'today', 'todayDim',
  'correct', 'correctDim',
  'incorrect', 'incorrectDim',
  'partial',
] as const;

/** The shell's token×surface contract: every pair the stylesheet renders,
 *  with its WCAG AA minimum (4.5 normal text; 3 non-text UI borders). */
export function checkAppPaletteContrast(
  paletteCss: string,
  onAccent: { accent: string; practice: string; team: string; today: string }
): ContrastCheck[] {
  const t = parseTokens(paletteCss);
  const missing = APP_TOKENS.filter((k) => !t[k]);
  if (missing.length) {
    throw new Error(`palette is missing required tokens: ${missing.map((k) => `--${k}`).join(', ')}`);
  }
  const pair = (label: string, fg: string, bg: string, min = 4.5): ContrastCheck => {
    const ratio = round2(contrastRatio(fg, bg));
    return { label, fg, bg, ratio, min, pass: ratio >= min };
  };
  const dim = (tok: string, base: string) => blendOverHex(t[tok], t[base]);
  return [
    // body text on every surface it sits on
    pair('--text on --bg', t.text, t.bg),
    pair('--text on --elev (cards)', t.text, t.elev),
    pair('--text on --surface (chips)', t.text, t.surface),
    pair('--text on --hover', t.text, t.hover),
    // secondary gray: tabs/links/meta on bg, recmeta on cards, credline2 on surface chips
    pair('--text2 on --bg', t.text2, t.bg),
    pair('--text2 on --elev', t.text2, t.elev),
    pair('--text2 on --surface', t.text2, t.surface),
    // faint gray: sub/score-max/meta labels on bg, card labels on elev
    // (the shell never renders --text3 on --surface — see .ttag .yr / .credtt)
    pair('--text3 on --bg', t.text3, t.bg),
    pair('--text3 on --elev', t.text3, t.elev),
    // accent as text: .meta .d, reveal source links, assent link (on bg),
    // active tab / streak chip (on accentDim over bg)
    pair('--accent on --bg', t.accent, t.bg),
    pair('--accent on --accentDim/bg', t.accent, dim('accentDim', 'bg')),
    // mode colors as text on their dim banners (over bg) and plain bg
    pair('--practice on --bg', t.practice, t.bg),
    pair('--practice on --practiceDim/bg', t.practice, dim('practiceDim', 'bg')),
    pair('--team on --bg', t.team, t.bg),
    pair('--team on --teamDim/bg', t.team, dim('teamDim', 'bg')),
    pair('--today on --bg', t.today, t.bg),
    pair('--today on --todayDim/bg', t.today, dim('todayDim', 'bg')),
    // pick'em "on" state sits INSIDE a card: todayDim composites over elev
    pair('--today on --todayDim/elev', t.today, dim('todayDim', 'elev')),
    // reveal verdict text on the reveal card (elev)
    pair('--correct on --elev (reveal)', t.correct, t.elev),
    pair('--incorrect on --elev (reveal)', t.incorrect, t.elev),
    pair('--partial on --elev (reveal)', t.partial, t.elev),
    // answered-option borders (non-text UI, 3:1) against the option fill
    pair('--correct border on --correctDim/bg', t.correct, dim('correctDim', 'bg'), 3),
    pair('--incorrect border on --incorrectDim/bg', t.incorrect, dim('incorrectDim', 'bg'), 3),
    // dark-on-accent button text
    pair('onAccent.accent on --accent (buttons)', onAccent.accent, t.accent),
    pair('onAccent.practice on --practice', onAccent.practice, t.practice),
    pair('onAccent.team on --team', onAccent.team, t.team),
    pair('onAccent.today on --today', onAccent.today, t.today),
  ];
}

/** The 404 page's smaller contract. */
export function checkNotFoundPaletteContrast(
  notFoundPaletteCss: string,
  onAccentAccent: string
): ContrastCheck[] {
  const t = parseTokens(notFoundPaletteCss);
  const missing = ['bg', 'text', 'text2', 'accent'].filter((k) => !t[k]);
  if (missing.length) {
    throw new Error(`404 palette is missing required tokens: ${missing.map((k) => `--${k}`).join(', ')}`);
  }
  const pair = (label: string, fg: string, bg: string, min = 4.5): ContrastCheck => {
    const ratio = round2(contrastRatio(fg, bg));
    return { label, fg, bg, ratio, min, pass: ratio >= min };
  };
  return [
    pair('404 --text on --bg', t.text, t.bg),
    pair('404 --text2 on --bg', t.text2, t.bg),
    pair('404 --accent on --bg (alt link)', t.accent, t.bg),
    pair('404 onAccent on --accent (button)', onAccentAccent, t.accent),
  ];
}

/** One nation's team-theming colors (editorial data supplied by the pack —
 *  see teamTheming on SportPack). `band` is decorative only; `accent`
 *  replaces `--team` on the themed tab and must measure as TEXT. */
export interface NationTheme {
  /** 2–4 flag/kit stripe colors for the decorative band. */
  band: string[];
  /** Display accent (hue-faithful, AA-verified) — becomes --team. */
  accent: string;
  /** Dark text used ON the accent (the themed quiz button). */
  onAccent: string;
  /** Render the band's inset ring (near-shell stripes, e.g. black). */
  inset?: boolean;
  /** Vertical band segments instead of horizontal stripes. */
  vband?: boolean;
}

/** The themed-tab contract: every pair a nation-themed My-Team tab renders.
 *  Structural garbage (missing/unparseable colors, bad band shape) throws
 *  immediately; color pairs return as checks for assertContrast. */
export function checkNationThemeContrast(
  nations: Record<string, NationTheme>,
  paletteCss: string
): ContrastCheck[] {
  const t = parseTokens(paletteCss);
  for (const k of ['bg', 'elev', 'text'] as const) {
    if (!t[k]) throw new Error(`teamTheming: shell palette is missing --${k}`);
  }
  const pair = (label: string, fg: string, bg: string, min = 4.5): ContrastCheck => {
    const ratio = round2(contrastRatio(fg, bg));
    return { label, fg, bg, ratio, min, pass: ratio >= min };
  };
  const out: ContrastCheck[] = [];
  const names = Object.keys(nations);
  if (!names.length) throw new Error('teamTheming: nations table is empty');
  for (const [name, n] of Object.entries(nations)) {
    const tag = `teamTheming "${name}"`;
    if (!Array.isArray(n.band) || n.band.length < 2 || n.band.length > 4) {
      throw new Error(`${tag}: band must carry 2–4 stripe colors`);
    }
    for (const b of n.band) {
      if (!hexToRgb(b)) throw new Error(`${tag}: unparseable band color "${b}"`);
    }
    const rgb = hexToRgb(n.accent);
    if (!rgb) throw new Error(`${tag}: unparseable accent "${n.accent}"`);
    if (!hexToRgb(n.onAccent)) throw new Error(`${tag}: unparseable onAccent "${n.onAccent}"`);
    const dim = blendOverHex(`rgba(${rgb.join(',')},0.14)`, t.bg);
    out.push(
      pair(`${tag}: accent on --bg`, n.accent, t.bg),
      pair(`${tag}: accent on --elev`, n.accent, t.elev),
      pair(`${tag}: accent on its banner tint`, n.accent, dim),
      pair(`${tag}: --text on its banner tint`, t.text, dim),
      pair(`${tag}: onAccent on accent`, n.onAccent, n.accent)
    );
  }
  return out;
}

/** Throw (listing every failing pair with its measured ratio) unless all
 *  checks pass. The build fails; a shell below AA never ships. */
export function assertContrast(checks: ContrastCheck[], context: string): void {
  const fails = checks.filter((c) => !c.pass);
  if (!fails.length) return;
  const lines = fails.map(
    (c) => `  ${c.label}: ${c.fg} on ${c.bg} = ${c.ratio} (needs >= ${c.min})`
  );
  throw new Error(
    `${context}: palette fails WCAG AA on ${fails.length} pair(s):\n${lines.join('\n')}\n` +
      `Colors are editorial data — pick values that measure >= the minimum; the guarantee is computed, not eyeballed.`
  );
}
