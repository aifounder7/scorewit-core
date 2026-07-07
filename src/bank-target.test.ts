/**
 * Deterministic checks for the opt-in bankTarget top-up (bank.ts + the
 * runGenerate strict wiring). Synthetic pools, no real sport data.
 *
 *   npx tsx src/bank-target.test.ts
 *
 * Cases:
 *   (a) top-up recovers a short bank to its target size from surplus pools,
 *       respecting topUp.perPoolCap — and the quota-selected BASE is
 *       byte-identical to a no-target run;
 *   (b) difficulty-aware fill raises the easy share to the floor;
 *   (c) an impossible floor warns loudly (and, via the spawned harness,
 *       EXITS non-zero under strict, before writing artifacts);
 *   (d) determinism — two runs are byte-identical (pure + end-to-end).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectBank } from './bank';
import { mulberry32 } from './rng';
import type { Difficulty, Question, QuestionType } from './types';

type Q = Question<string, { kind: string; edition: number }>;

function q(id: string, difficulty: Difficulty, type: QuestionType, topic: string): Q {
  return {
    id,
    type,
    text: `t-${id}`,
    ...(type === 'multiple_choice'
      ? { options: ['A', 'B', 'C', 'D'], answer: 'A' }
      : { answer: 1, scoring: { fullPointsWithin: 0, zeroBeyond: 4 } }),
    difficulty,
    era: '2020s',
    topic,
    revealFact: 'f',
    citation: { label: 'l', urls: ['u'] },
    provenance: { endpoints: [], computation: 'c', check: { kind: 'k', edition: 2020 } },
  } as Q;
}

function pool(topic: string, n: number, difficulty: Difficulty, type: QuestionType = 'multiple_choice'): Q[] {
  return Array.from({ length: n }, (_, i) => q(`${topic}-${difficulty}-${i}`, difficulty, type, topic));
}

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

console.log('bankTarget — synthetic pools\n');

// (a) size recovery within perPoolCap, base selection unchanged.
check('(a) top-up reaches target size from surplus, capped per pool, base unchanged', () => {
  const mk = () =>
    new Map<string, Q[]>([
      ['alpha', pool('alpha', 10, 'hard')],
      ['beta', pool('beta', 10, 'medium')],
    ]);
  const quotas: [string, number][] = [['alpha', 5], ['beta', 5]];

  const plain = selectBank(mk(), quotas, mulberry32(42));
  const topped = selectBank(mk(), quotas, mulberry32(42), {
    size: 16,
    topUp: { perPoolCap: 3 },
  });
  assert.equal(plain.selected.length, 10);
  assert.equal(topped.selected.length, 16);
  assert.deepEqual(
    topped.selected.slice(0, 10).map((x) => x.id),
    plain.selected.map((x) => x.id),
    'quota-selected base must be identical to the no-target run'
  );
  const extras = topped.selected.slice(10);
  for (const t of ['alpha', 'beta']) {
    const n = extras.filter((x) => x.topic === t).length;
    assert.ok(n <= 3, `${t} contributed ${n} extras (> perPoolCap 3)`);
  }
  assert.equal(topped.warnings.length, 0);

  // With a tighter cap the target is unreachable -> loud size warning.
  const tight = selectBank(mk(), quotas, mulberry32(42), { size: 16, topUp: { perPoolCap: 2 } });
  assert.equal(tight.selected.length, 14);
  assert.equal(tight.unmet, true);
  assert.ok(tight.warnings.some((w) => w.includes('size 16 not met: 14')), tight.warnings.join('|'));
});

// (b) difficulty-aware fill raises the easy share to the floor.
check('(b) easy floor is repaired first from easy surplus', () => {
  const pools = new Map<string, Q[]>([
    ['grind', pool('grind', 8, 'hard')],
    ['gimme', pool('gimme', 12, 'easy')],
  ]);
  const quotas: [string, number][] = [['grind', 8], ['gimme', 2]];
  const r = selectBank(pools, quotas, mulberry32(7), {
    size: 16,
    difficulty: { easy: 0.5 }, // floor = ceil(0.5 * 16) = 8
  });
  const easy = r.selected.filter((x) => x.difficulty === 'easy').length;
  assert.equal(r.selected.length, 16);
  assert.ok(easy >= 8, `easy ${easy} < floor 8`);
  assert.equal(r.warnings.length, 0);
});

// (c) impossible floor warns loudly and reports unmet.
check('(c) impossible easy floor warns (nothing easy exists)', () => {
  const pools = new Map<string, Q[]>([['grind', pool('grind', 12, 'hard')]]);
  const quotas: [string, number][] = [['grind', 10]];
  const r = selectBank(pools, quotas, mulberry32(7), { size: 10, difficulty: { easy: 0.3 } });
  assert.equal(r.unmet, true);
  assert.ok(
    r.warnings.some((w) => w.includes('easy floor 30%') && w.includes('archetypes')),
    r.warnings.join('|')
  );
});

// (d) pure determinism: identical inputs -> identical selection.
check('(d) two runs produce identical selections', () => {
  const mk = () =>
    new Map<string, Q[]>([
      ['a', pool('a', 15, 'easy')],
      ['b', pool('b', 15, 'hard')],
    ]);
  const quotas: [string, number][] = [['a', 6], ['b', 6]];
  const target = { size: 20, difficulty: { easy: 0.4 }, topUp: { perPoolCap: 6 } };
  const one = selectBank(mk(), quotas, mulberry32(99), target).selected.map((x) => x.id);
  const two = selectBank(mk(), quotas, mulberry32(99), target).selected.map((x) => x.id);
  assert.deepEqual(one, two);
});

// ---- end-to-end harness: runGenerate strict exit + byte determinism ----

const CORE = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'banktarget-'));

const RUNNER = `
import fs from 'node:fs';
import path from 'node:path';
import { defaultPaths, runGenerate, type AnySportPack } from '${CORE.replace(/\\/g, '/')}/src/index';

const root = process.argv[2];
const mode = process.argv[3]; // 'strict-fail' | 'topup'
const paths = defaultPaths(root);
fs.mkdirSync(paths.datasetDir, { recursive: true });
fs.writeFileSync(path.join(paths.datasetDir, 'tournaments.json'), '[]');
fs.writeFileSync(path.join(paths.datasetDir, 'meta.json'), '{}');

function q(id: string, difficulty: string, type: string): any {
  return {
    id, type, text: id,
    ...(type === 'multiple_choice' ? { options: ['A','B','C','D'], answer: 'A' } : { answer: 1, scoring: { fullPointsWithin: 0, zeroBeyond: 4 } }),
    difficulty, era: '2020s', topic: 'mix', revealFact: 'f',
    citation: { label: 'l', urls: ['u'] },
    provenance: { endpoints: [], computation: 'c', check: { kind: 'k', edition: 2020 } },
  };
}
// 8 questions per (tier x type) = 48 total; quota 30 leaves surplus 18.
const all: any[] = [];
for (const d of ['easy','medium','hard']) for (const t of ['multiple_choice','closest_guess'])
  for (let i = 0; i < 8; i++) all.push(q(d + '-' + t + '-' + i, d, t));

const pack = {
  config: { dailyCount: 6, artifactSuffix: 'test', timezone: 'UTC', seed: 0xabc, quotas: [['mix', 30]], storagePrefix: 't', epochUtcArgs: '2026,0,1' },
  bankTarget: mode === 'strict-fail'
    ? { size: 999, difficulty: { easy: 0.9 }, strict: true }
    : { size: 44, difficulty: { easy: 0.3 }, topUp: { perPoolCap: 20 } },
  loadDataset: () => ({ tournaments: [], byEdition: new Map() }),
  generators: { mix: () => all },
  bankCoverage: (c: unknown) => c,
  team: () => ({ version: 1, teams: [] }),
  matchday: (_ds: unknown, coverage: unknown, _qs: unknown, today: string) =>
    ({ version: 1, generatedFor: today, coverage, days: [], results: {} }),
  matchdayAnchor: () => '2026-01-01',
} as unknown as AnySportPack;

runGenerate(pack, paths);
`;
const runnerPath = path.join(TMP, 'runner.ts');
fs.writeFileSync(runnerPath, RUNNER);

function runHarness(dir: string, mode: string) {
  fs.mkdirSync(dir, { recursive: true });
  return spawnSync('npx', ['tsx', runnerPath, dir, mode], { cwd: CORE, encoding: 'utf8' });
}

check('(c) strict: unmet target exits non-zero BEFORE writing artifacts', () => {
  const dir = path.join(TMP, 'strict');
  const res = runHarness(dir, 'strict-fail');
  assert.equal(res.status, 1, `exit ${res.status}; stderr: ${res.stderr.slice(0, 200)}`);
  assert.ok(res.stderr.includes('failing before writing artifacts'), res.stderr.slice(0, 300));
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'questions.test.json')), 'bank written despite strict fail');
});

check('(d) end-to-end: two topped-up runs write byte-identical banks', () => {
  const d1 = path.join(TMP, 'run1');
  const d2 = path.join(TMP, 'run2');
  for (const d of [d1, d2]) {
    const res = runHarness(d, 'topup');
    assert.equal(res.status, 0, res.stderr.slice(0, 300));
  }
  const b1 = fs.readFileSync(path.join(d1, 'data', 'questions.test.json'));
  const b2 = fs.readFileSync(path.join(d2, 'data', 'questions.test.json'));
  assert.ok(b1.equals(b2), 'banks differ between runs');
  const bank = JSON.parse(b1.toString());
  assert.equal(bank.count, 44, `topped-up bank is ${bank.count}, want 44`);
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${failures === 0 ? 'ALL' : ''} ${6 - failures}/6 bankTarget cases passed.`);
if (failures) {
  console.error(`BANKTARGET TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
