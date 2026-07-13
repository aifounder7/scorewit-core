/**
 * Team-theming contrast validator — the build-time gate the T1 design
 * promises: every derived pair a themed My-Team tab renders (accent as text
 * on the page bg, on cards, on the nation-tinted banner; the dark button
 * text on the accent) must measure WCAG AA or the BUILD FAILS. Colors are
 * editorial data (nation-colors.json); the accessibility guarantee is
 * computed here, never eyeballed and never at runtime.
 *
 *   npx tsx mocks/team-theming/validate-nations.ts
 *
 * In T2 this moves into the pack build (pack nation tables feed the same
 * checks through src/contrast.ts) with unit tests over garbage inputs:
 * unknown nation -> UNTHEMED fallback (allowlist semantics, not an error);
 * missing/unparseable colors or a below-AA accent -> build failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  assertContrast,
  blendOverHex,
  contrastRatio,
  hexToRgb,
  type ContrastCheck,
} from '../../src/contrast';

const table = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'nation-colors.json'), 'utf8')
);
const SHELL = table._shell as { bg: string; elev: string; text: string; dimAlpha: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const pair = (label: string, fg: string, bg: string, min = 4.5): ContrastCheck => {
  const ratio = round2(contrastRatio(fg, bg));
  return { label, fg, bg, ratio, min, pass: ratio >= min };
};

let failed = false;
for (const [nation, c] of Object.entries<any>(table.nations)) {
  // structural gates first — garbage must fail loudly, not render oddly
  if (!Array.isArray(c.band) || c.band.length < 2 || c.band.length > 4) {
    throw new Error(`${nation}: band must carry 2–4 stripe colors`);
  }
  for (const b of c.band) {
    if (!hexToRgb(b)) throw new Error(`${nation}: unparseable band color "${b}"`);
  }
  const rgb = hexToRgb(c.accent);
  if (!rgb) throw new Error(`${nation}: unparseable accent "${c.accent}"`);
  const dim = blendOverHex(`rgba(${rgb.join(',')},${SHELL.dimAlpha})`, SHELL.bg);

  const checks = [
    pair('accent on --bg (subnav/links)', c.accent, SHELL.bg),
    pair('accent on --elev (in-card links)', c.accent, SHELL.elev),
    pair('accent on nation-tinted banner', c.accent, dim),
    pair('--text on nation-tinted banner (name + insight line)', SHELL.text, dim),
    pair('onAccent on accent (quiz button text)', c.onAccent, c.accent),
  ];
  try {
    assertContrast(checks, `nation "${nation}"`);
    console.log(`✓ ${nation}  ` + checks.map((k) => `${k.label.split(' ')[0]}=${k.ratio}`).join(' '));
  } catch (e) {
    failed = true;
    console.error(`✗ ${(e as Error).message}`);
  }
}

console.log(failed ? '\nVALIDATION FAILED — a below-AA nation must be fixed or dropped to the unthemed fallback.' : '\nall nations pass AA on every themed pair');
process.exit(failed ? 1 : 0);
