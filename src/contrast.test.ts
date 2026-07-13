/**
 * Contrast math + palette-gate checks (src/contrast.ts).
 *
 *   npx tsx src/contrast.test.ts
 *
 * Cases:
 *   - WCAG anchors: black/white = 21, the classic #767676-on-white = 4.5;
 *   - alpha compositing (rgba over hex) matches hand-computed blends;
 *   - the shell's token×surface contract passes on the AA gray ramp and
 *     FAILS (with the right pairs named) on the pre-fix grays;
 *   - garbage inputs throw instead of passing silently (unparseable colors,
 *     missing tokens, bad alpha, #rrggbbaa).
 */
import assert from 'node:assert/strict';
import {
  assertContrast,
  blendOverHex,
  checkAppPaletteContrast,
  checkNotFoundPaletteContrast,
  contrastRatio,
  hexToRgb,
} from './contrast';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n        ${(e as Error).message}`);
  }
}

const AA_PALETTE = `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`;

// The pre-fix grays + reveal red, otherwise identical.
const OLD_PALETTE = AA_PALETTE
  .replace('#9A9AA3', '#87878F')
  .replace('#84848D', '#55555C')
  .replace('#EA4058', '#E8364F');

const ON_ACCENT = { accent: '#06121f', practice: '#0c0a1a', team: '#04181b', today: '#2a0c19' };

console.log('Contrast math + palette gate\n');

check('black on white is 21:1, white on white is 1:1', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#FFF', '#ffffff'), 1);
});

check('#767676 on white measures the canonical ~4.54', () => {
  const r = contrastRatio('#767676', '#FFFFFF');
  assert.ok(Math.abs(r - 4.54) < 0.01, `got ${r}`);
});

check('ratio is symmetric (fg/bg order does not matter)', () => {
  assert.equal(contrastRatio('#123456', '#EDEDEF'), contrastRatio('#EDEDEF', '#123456'));
});

check('rgba(255,255,255,0.5) over black composites to #808080', () => {
  assert.equal(blendOverHex('rgba(255,255,255,0.5)', '#000000'), '#808080');
});

check('a plain hex passes through blendOverHex untouched', () => {
  assert.equal(blendOverHex('#4E9CF5', '#0C0C0E'), '#4E9CF5');
});

check('the AA gray ramp passes every shell pair', () => {
  const checks = checkAppPaletteContrast(AA_PALETTE, ON_ACCENT);
  const fails = checks.filter((c) => !c.pass);
  assert.deepEqual(fails.map((c) => c.label), [], JSON.stringify(fails, null, 2));
  assert.ok(checks.length >= 25, `only ${checks.length} pairs checked`);
});

check('the pre-fix grays fail exactly the known pairs', () => {
  const fails = checkAppPaletteContrast(OLD_PALETTE, ON_ACCENT)
    .filter((c) => !c.pass)
    .map((c) => c.label);
  assert.deepEqual(fails, [
    '--text2 on --surface',
    '--text3 on --bg',
    '--text3 on --elev',
    '--incorrect on --elev (reveal)',
  ]);
});

check('assertContrast throws naming each failing pair with its ratio', () => {
  assert.throws(
    () => assertContrast(checkAppPaletteContrast(OLD_PALETTE, ON_ACCENT), 'app shell'),
    (e: Error) =>
      e.message.includes('app shell: palette fails WCAG AA on 4 pair(s)') &&
      e.message.includes('--text3 on --bg: #55555C on #0C0C0E = 2.64 (needs >= 4.5)')
  );
});

check('a missing token throws (never silently skipped)', () => {
  assert.throws(
    () => checkAppPaletteContrast(AA_PALETTE.replace('--text3:#84848D;', ''), ON_ACCENT),
    /missing required tokens: --text3/
  );
});

check('unparseable colors throw', () => {
  assert.throws(() => contrastRatio('not-a-color', '#FFFFFF'), /unparseable/);
  assert.throws(() => contrastRatio('#12345', '#FFFFFF'), /unparseable/);
  assert.throws(() => blendOverHex('rgba(1,2)', '#000000'), /unparseable/);
  assert.throws(() => blendOverHex('rgba(0,0,0,7)', '#000000'), /bad alpha/);
  assert.equal(hexToRgb('#11223344'), null); // alpha hex is not a palette color
});

check('the 404 contract passes on the AA values and gates text2', () => {
  const ok = checkNotFoundPaletteContrast(
    '--bg:#0C0C0E;--text:#EDEDEF;--text2:#9A9AA3;--accent:#4E9CF5',
    ON_ACCENT.accent
  );
  assert.ok(ok.every((c) => c.pass));
  assert.throws(
    () => checkNotFoundPaletteContrast('--bg:#0C0C0E;--text:#EDEDEF;--accent:#4E9CF5', ON_ACCENT.accent),
    /404 palette is missing required tokens: --text2/
  );
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
