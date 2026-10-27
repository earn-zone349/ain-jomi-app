import test from 'node:test';
import assert from 'node:assert/strict';
import { Fraction } from '../src/lib/fraction.js';
import { christianSuccession, muslimSuccession, shareAmount, InheritanceError } from '../src/lib/inheritance-core.js';

const F = (n, d = 1) => new Fraction(BigInt(n), BigInt(d));
const got = (res) => Object.fromEntries(res.shares.map((s) => [s.id, s.fraction.toString()]));
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof InheritanceError ? e.code : `other:${e.message}`;
  }
  return null;
};
const kid = (id, alive = true, children = [], sex) => ({ id, alive, children, sex });

test('Fraction: exact arithmetic and rounding', () => {
  assert.equal(F(1, 3).add(F(1, 6)).toString(), '1/2');
  assert.equal(F(2, 4).toString(), '1/2');
  assert.equal(F(1, 3).mul(F(3)).toString(), '1');
  assert.equal(F(2, 3).toFixed(2), '0.67');
  assert.equal(F(1, 8).toFixed(2), '0.13');
  assert.equal(Fraction.parseDecimal('১,২৫০.৫০').toString(), '2501/2');
  assert.equal(Fraction.parseDecimal('abc'), null);
  assert.equal(Fraction.parseDecimal('-5'), null);
  assert.throws(() => F(1, 0));
});

test('Christian: widow + children take 1/3 and 2/3 (s.33(a), s.37)', () => {
  const r = christianSuccession({ spouseAlive: true, descendants: [kid('c1'), kid('c2')] });
  assert.deepEqual(got(r), { spouse: '1/3', c1: '1/3', c2: '1/3' });
});

test('Christian s.38 illustration (i): nine grandchildren take 1/9 each', () => {
  const d = [kid('j', false, [kid('j1'), kid('j2')]), kid('m', false, [kid('m1'), kid('m2'), kid('m3')]), kid('h', false, [kid('h1'), kid('h2'), kid('h3'), kid('h4')])];
  const r = christianSuccession({ descendants: d });
  assert.equal(r.shares.length, 9);
  for (const s of r.shares) assert.equal(s.fraction.toString(), '1/9');
});

test('Christian s.40 illustrations', () => {
  // (i) John (4 children) and Mary (1) dead, Henry alive: 1/3 each line
  let r = christianSuccession({ descendants: [kid('j', false, ['a', 'b', 'c', 'd'].map((x) => kid(x))), kid('m', false, [kid('m1')]), kid('h')] });
  assert.equal(got(r).h, '1/3');
  assert.equal(got(r).m1, '1/3');
  assert.equal(got(r).a, '1/12');
  // (iii) John's child dies leaving two children: 3 x 1/12 and 2 x 1/24
  r = christianSuccession({ descendants: [kid('j', false, [kid('a'), kid('b'), kid('c'), kid('d', false, [kid('d1'), kid('d2')])]), kid('m', false, [kid('m1')]), kid('h')] });
  assert.equal(got(r).a, '1/12');
  assert.equal(got(r).d1, '1/24');
  assert.equal(got(r).h, '1/3');
  // (iv) posthumous child and surviving child share equally
  r = christianSuccession({ descendants: [kid('mary'), kid('john', false, [kid('posthumous')])] });
  assert.deepEqual(got(r), { mary: '1/2', posthumous: '1/2' });
  // (ii) 8 grandchildren + 2 great-grandchildren under a dead grandchild: 9 parts
  const gk = Array.from({ length: 7 }, (_, i) => kid(`g${i}`));
  r = christianSuccession({ descendants: [kid('c', false, [...gk, kid('x', false, [kid('gg1'), kid('gg2')]), kid('y')])] });
  assert.equal(got(r).g0, '1/9');
  assert.equal(got(r).gg1, '1/18');
});

test('Christian: no descendants — father, mother, siblings (ss.42-47)', () => {
  assert.deepEqual(got(christianSuccession({ fatherAlive: true, motherAlive: true, siblings: [{ id: 'b', alive: true }] })), { father: '1' });
  // s.43: mother + two brothers + half sister: 1/4 each... here mother + 3 siblings
  const r43 = christianSuccession({ motherAlive: true, siblings: [{ id: 'b1', alive: true }, { id: 'b2', alive: true }, { id: 's', alive: true }] });
  assert.deepEqual(got(r43), { mother: '1/4', b1: '1/4', b2: '1/4', s: '1/4' });
  // s.44 example: mother, two living brothers, 1 child of dead sister, 2 children of dead half-brother: 1/5 each, last 1/5 split
  const r44 = christianSuccession({ motherAlive: true, siblings: [{ id: 'b1', alive: true }, { id: 'b2', alive: true }, { id: 'ds', alive: false, childrenCount: 1 }, { id: 'hb', alive: false, childrenCount: 2 }] });
  assert.equal(got(r44).mother, '1/5');
  assert.equal(got(r44)['ds:child:1'], '1/5');
  assert.equal(got(r44)['hb:child:2'], '1/10');
  // s.45
  const r45 = christianSuccession({ motherAlive: true, siblings: [{ id: 'ds', alive: false, childrenCount: 1 }, { id: 'db', alive: false, childrenCount: 2 }] });
  assert.equal(got(r45).mother, '1/3');
  assert.equal(got(r45)['db:child:1'], '1/6');
  // s.46
  assert.deepEqual(got(christianSuccession({ motherAlive: true })), { mother: '1' });
  // s.47 (no parents)
  assert.deepEqual(got(christianSuccession({ siblings: [{ id: 'a', alive: true }, { id: 'b', alive: false, childrenCount: 2 }] })), { a: '1/2', 'b:child:1': '1/4', 'b:child:2': '1/4' });
});

test('Christian: spouse with kindred 1/2; spouse alone all; nobody -> Government; s.48 equal shares', () => {
  assert.deepEqual(got(christianSuccession({ spouseAlive: true, fatherAlive: true })), { spouse: '1/2', father: '1/2' });
  assert.deepEqual(got(christianSuccession({ spouseAlive: true })), { spouse: '1' });
  assert.deepEqual(got(christianSuccession({})), { government: '1' });
  assert.deepEqual(got(christianSuccession({ nearestKindred: { count: 3 } })), { 'kin:1': '1/3', 'kin:2': '1/3', 'kin:3': '1/3' });
  assert.deepEqual(got(christianSuccession({ spouseAlive: true, nearestKindred: { count: 2 } })), { spouse: '1/2', 'kin:1': '1/4', 'kin:2': '1/4' });
});

test('Christian: bad input is rejected', () => {
  assert.equal(code(() => christianSuccession({ descendants: [kid('a', true, [kid('b')])] })), 'alive_with_children');
  assert.equal(code(() => christianSuccession({ nearestKindred: { count: -1 } })), 'bad_input');
});

const M = (id, children = [], alive = true) => kid(id, alive, children, 'M');
const Fm = (id, children = [], alive = true) => kid(id, alive, children, 'F');

test('Muslim (Hanafi): classic cases add up exactly', () => {
  // widow + 1 son + 1 daughter: wife 1/8, rest 7/8 split 2:1 -> son 7/12, daughter 7/24
  assert.deepEqual(got(muslimSuccession({ spouse: 'wives', wives: 1, children: [M('s'), Fm('d')] })), { 'wife:1': '1/8', s: '7/12', d: '7/24' });
  // husband + father + mother (Umariyyatain): 1/2, mother 1/6, father 1/3
  assert.deepEqual(got(muslimSuccession({ spouse: 'husband', fatherAlive: true, motherAlive: true })), { spouse: '1/2', mother: '1/6', father: '1/3' });
  // wife + father + mother: 1/4, mother 1/4 (1/3 of 3/4), father 1/2
  assert.deepEqual(got(muslimSuccession({ spouse: 'wives', wives: 1, fatherAlive: true, motherAlive: true })), { 'wife:1': '1/4', mother: '1/4', father: '1/2' });
  // two daughters + father + mother: 2/3, 1/6 + 1/6 -> no rest
  const r = muslimSuccession({ fatherAlive: true, motherAlive: true, children: [Fm('d1'), Fm('d2')] });
  assert.deepEqual(got(r), { father: '1/6', mother: '1/6', d1: '1/3', d2: '1/3' });
  // one daughter + father: daughter 1/2, father 1/6 + residue 1/3 = 1/2
  assert.deepEqual(got(muslimSuccession({ fatherAlive: true, children: [Fm('d')] })), { father: '1/2', d: '1/2' });
});

test("Muslim: 'awl (husband + 2 daughters + both parents = 15 parts; wife version = 27 parts)", () => {
  const h = muslimSuccession({ spouse: 'husband', fatherAlive: true, motherAlive: true, children: [Fm('d1'), Fm('d2')] });
  assert.deepEqual(got(h), { spouse: '1/5', father: '2/15', mother: '2/15', d1: '4/15', d2: '4/15' });
  const w = muslimSuccession({ spouse: 'wives', wives: 1, fatherAlive: true, motherAlive: true, children: [Fm('d1'), Fm('d2')] });
  assert.deepEqual(got(w), { 'wife:1': '1/9', father: '4/27', mother: '4/27', d1: '8/27', d2: '8/27' });
});

test('Muslim: radd, several wives, only-daughters, grandchildren via MFLO s.4', () => {
  // husband + mother only: 1/2 + 1/3, remainder returns to mother: 1/2 each
  assert.deepEqual(got(muslimSuccession({ spouse: 'husband', motherAlive: true })), { spouse: '1/2', mother: '1/2' });
  // 2 wives share the wife's 1/8
  assert.deepEqual(got(muslimSuccession({ spouse: 'wives', wives: 2, children: [M('s')] })), { 'wife:1': '1/16', 'wife:2': '1/16', s: '7/8' });
  // only one daughter, nobody else: 1/2 then radd -> all
  assert.deepEqual(got(muslimSuccession({ children: [Fm('d')] })), { d: '1' });
  // MFLO s.4: son dead leaving 1 son and 1 daughter; living daughter. Line counts as a son (2) : daughter (1)
  const r = muslimSuccession({ children: [M('s', [M('gs'), Fm('gd')], false), Fm('d')] });
  assert.equal(got(r).d, '1/3');
  assert.equal(got(r).gs, '4/9');
  assert.equal(got(r).gd, '2/9');
  // dead childless child is ignored
  assert.deepEqual(got(muslimSuccession({ children: [M('s', [], false), Fm('d')] })), { d: '1' });
});

test('Muslim: refuses what it cannot answer with certainty', () => {
  assert.equal(code(() => muslimSuccession({ children: [M('s')], otherHeirs: true })), 'unsupported_heirs');
  assert.equal(code(() => muslimSuccession({})), 'no_supported_heirs');
  assert.equal(code(() => muslimSuccession({ spouse: 'husband' })), 'no_other_heirs');
  assert.equal(code(() => muslimSuccession({ spouse: 'wives', wives: 5, children: [M('s')] })), 'bad_input');
});

test('property check: shares always add to exactly 1', () => {
  const sexes = ['M', 'F'];
  for (let sp of ['none', 'husband', 'wives']) {
    for (const fa of [false, true]) for (const mo of [false, true]) for (let nS = 0; nS < 3; nS += 1) for (let nD = 0; nD < 4; nD += 1) {
      const children = [...Array.from({ length: nS }, (_, i) => M(`s${i}`)), ...Array.from({ length: nD }, (_, i) => Fm(`d${i}`))];
      let res;
      try {
        res = muslimSuccession({ spouse: sp, wives: 2, fatherAlive: fa, motherAlive: mo, children });
      } catch (e) {
        assert.ok(e instanceof InheritanceError, e.message);
        continue;
      }
      const total = res.shares.reduce((a, s) => a.add(s.fraction), new Fraction(0n));
      assert.equal(total.toString(), '1');
      for (const s of res.shares) assert.ok(s.fraction.cmp(new Fraction(0n)) > 0);
    }
  }
  void sexes;
});

test('shareAmount: exact, rounded half-up to the paisa', () => {
  assert.equal(shareAmount('1000000', F(1, 3)), '333333.33');
  assert.equal(shareAmount('১০,০০,০০০', F(1, 8)), '125000.00');
  assert.equal(shareAmount('x', F(1, 2)), null);
});

test('every basis the engine returns is a declared id', async () => {
  const { BASIS_IDS, BASIS_SUFFIXES } = await import('../src/lib/inheritance-core.js');
  const ok = (b) => BASIS_IDS.includes(b) || BASIS_SUFFIXES.some((s) => b.endsWith(s) && BASIS_IDS.includes(b.slice(0, -s.length)));
  for (const sp of ['none', 'husband', 'wives']) for (const fa of [false, true]) for (const mo of [false, true]) for (const kids of [[], [M('s')], [Fm('d')], [Fm('d1'), Fm('d2')], [M('s', [M('x')], false), Fm('d')]]) {
    try {
      for (const s of muslimSuccession({ spouse: sp, fatherAlive: fa, motherAlive: mo, children: kids }).shares) assert.ok(ok(s.basis), s.basis);
    } catch (e) {
      assert.ok(e instanceof InheritanceError);
    }
  }
});
