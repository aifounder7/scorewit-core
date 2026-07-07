/**
 * Deterministic checks for the insight engine (insights.ts) with a SYNTHETIC
 * pack — no real sport facts. Covers: threshold gating (wit must be earned;
 * respectful degrade), interestingness ranking, composition, the VALIDATOR
 * HOOK (verifyLead re-derives every fired framing — tampered leads and
 * drifted stats both fail), and the hedged-rate helpers.
 *
 *   npx tsx src/insights.test.ts
 */
import assert from 'node:assert/strict';
import {
  composeLead,
  moreOftenThanNot,
  numberWord,
  oneInN,
  verifyLead,
  type InsightTemplate,
} from './insights';

interface DriverStats {
  starts: number;
  wins: number;
  podiums: number;
  titles: number;
  ledAtVenue: string | null;
}

// A miniature library in the pattern packs will author: threshold-gated, the
// phrasing computed from the numbers, a genuine angle for the zero-win case.
const LIB: InsightTemplate<DriverStats>[] = [
  {
    id: 'title_haul',
    predicate: (s) => s.titles >= 2,
    render: (s) => `A ${numberWord(s.titles)}-time champion.`,
    weight: 100,
  },
  {
    id: 'win_rate',
    predicate: (s) => s.wins >= 10 && oneInN(s.wins, s.starts) !== null,
    render: (s) => {
      const r = oneInN(s.wins, s.starts)!;
      return `Wins ${r.hedge} one race in ${numberWord(r.n)}.`;
    },
    weight: 80,
  },
  {
    id: 'podium_habit',
    predicate: (s) => s.starts >= 50 && moreOftenThanNot(s.podiums, s.starts),
    render: () => `On the podium more often than not.`,
    weight: 60,
  },
  {
    id: 'led_a_race',
    // The respectful degrade: fires only when nothing bigger will carry the
    // page, and finds the genuine angle instead of snark.
    predicate: (s) => s.wins === 0 && s.ledAtVenue !== null,
    render: (s) => `Led a Grand Prix at ${s.ledAtVenue}.`,
    weight: 20,
  },
];

const ACE: DriverStats = { starts: 242, wins: 71, podiums: 129, titles: 4, ledAtVenue: null };
const JOURNEYMAN: DriverStats = { starts: 90, wins: 0, podiums: 2, titles: 0, ledAtVenue: 'Monaco' };

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

console.log('Insight engine — synthetic pack\n');

check('gating + ranking + composition: the ace gets the earned lines, in weight order', () => {
  const { lead, fired } = composeLead(ACE, LIB);
  assert.equal(fired.map((f) => f.id).join(','), 'title_haul,win_rate,podium_habit');
  assert.equal(
    lead,
    'A four-time champion. Wins nearly one race in three. On the podium more often than not.'
  );
});

check('respectful degrade: zero-win driver gets the genuine angle, never the ace lines', () => {
  const { lead, fired } = composeLead(JOURNEYMAN, LIB);
  assert.equal(fired.length, 1);
  assert.equal(lead, 'Led a Grand Prix at Monaco.');
  assert.ok(!lead.includes('champion') && !lead.includes('podium'));
});

check('max caps the composed lines but fired reports all', () => {
  const { lead, fired } = composeLead(ACE, LIB, { max: 1 });
  assert.equal(lead, 'A four-time champion.');
  assert.equal(fired.length, 3);
});

check('weight can be data-driven; ties break by library order', () => {
  const lib: InsightTemplate<DriverStats>[] = [
    { id: 'a', predicate: () => true, render: () => 'A.', weight: (s) => s.titles },
    { id: 'b', predicate: () => true, render: () => 'B.', weight: 4 },
    { id: 'c', predicate: () => true, render: () => 'C.', weight: 4 },
  ];
  assert.equal(composeLead(ACE, lib).lead, 'A. B. C.');
  assert.equal(composeLead({ ...ACE, titles: 0 }, lib).lead, 'B. C. A.');
});

check('malformed libraries throw: dup ids, empty lines, non-sentences', () => {
  const dup = [LIB[0], { ...LIB[1], id: 'title_haul' }];
  assert.throws(() => composeLead(ACE, dup), /duplicate template id/);
  assert.throws(
    () => composeLead(ACE, [{ id: 'x', predicate: () => true, render: () => '  ', weight: 1 }]),
    /empty line/
  );
  assert.throws(
    () => composeLead(ACE, [{ id: 'x', predicate: () => true, render: () => 'no period', weight: 1 }]),
    /full sentences/
  );
});

check('verifyLead: a clean lead re-derives to zero errors', () => {
  const { lead } = composeLead(ACE, LIB);
  assert.deepEqual(verifyLead(ACE, LIB, lead), []);
});

check('verifyLead: a tampered lead fails (a witty line cannot smuggle a fact)', () => {
  const { lead } = composeLead(ACE, LIB);
  const errs = verifyLead(ACE, LIB, lead.replace('four-time', 'five-time'));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /does not re-derive/);
});

check('verifyLead: stats drift fails (validator re-derives thresholds AND numbers)', () => {
  const { lead } = composeLead(ACE, LIB);
  // the dataset the validator sees says 3 titles — the shipped "four-time" lead must fail
  const errs = verifyLead({ ...ACE, titles: 3 }, LIB, lead);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /expected: "A three-time champion\./);
});

check('oneInN hedges truthfully and refuses unclean ratios', () => {
  assert.deepEqual(oneInN(71, 242), { n: 3, hedge: 'nearly' }); // 29.3% — nearly a third
  assert.deepEqual(oneInN(50, 150), { n: 3, hedge: 'roughly' }); // exactly a third
  assert.deepEqual(oneInN(52, 150), { n: 3, hedge: 'better than' }); // beats a third
  assert.deepEqual(oneInN(1, 100), { n: 100, hedge: 'roughly' }); // exact big-N is fine
  assert.equal(oneInN(40, 100), null); // 2.5 — rounds to neither 2 nor 3 cleanly
  assert.equal(oneInN(60, 100), null); // ratio 1.67 -> n=2 off by 17%
  assert.equal(oneInN(90, 100), null); // n would be 1 — not a reframe
  assert.equal(oneInN(0, 100), null);
  assert.equal(oneInN(10, 0), null);
});

check('moreOftenThanNot is strict; numberWord spells small counts only', () => {
  assert.equal(moreOftenThanNot(129, 242), true);
  assert.equal(moreOftenThanNot(121, 242), false); // exactly half is NOT "more often than not"
  assert.equal(moreOftenThanNot(0, 0), false);
  assert.equal(numberWord(4), 'four');
  assert.equal(numberWord(12), 'twelve');
  assert.equal(numberWord(13), '13');
  assert.equal(numberWord(2.5), '2.5');
});

check('shared formatters are total on garbage input — never a silent lie (FIREWALL.md)', () => {
  // oneInN: refuse rather than misframe.
  assert.equal(oneInN(NaN, 100), null);
  assert.equal(oneInN(10, NaN), null);
  assert.equal(oneInN(-5, 100), null);
  assert.equal(oneInN(10, -100), null);
  assert.equal(oneInN(Infinity, 100), null); // count > total
  assert.equal(oneInN(10, Infinity), null); // ratio Infinity: n rounds to Infinity, rel NaN -> null
  // moreOftenThanNot: false on nonsense, never true by accident.
  assert.equal(moreOftenThanNot(NaN, 100), false);
  assert.equal(moreOftenThanNot(5, NaN), false);
  assert.equal(moreOftenThanNot(5, -10), false);
  // numberWord: totality — any number in, a string out, no NaN-word surprises.
  assert.equal(numberWord(NaN), 'NaN'); // visible, never silently wrong
  assert.equal(numberWord(-1), '-1');
});

console.log(`\n${failures === 0 ? 'ALL' : ''} ${11 - failures}/11 insight cases passed.`);
if (failures) {
  console.error(`INSIGHT TEST FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
