// Inheritance engine. Exact fractions only (see fraction.js); no rounding, no estimates.
// A module returns { shares: [{ id, fraction, basis }] } whose fractions add up to exactly 1, or throws InheritanceError
// when the situation is outside what the module can answer with certainty. It never guesses.

import { Fraction, ONE, ZERO, sum } from './fraction.js';

export class InheritanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = (code) => {
  throw new InheritanceError(code);
};
/** Every legal-basis id the engine can return (the app has one explanation text per id). */
export const BASIS_IDS = [
  'SA_37', 'SA_38', 'SA_39', 'SA_40', 'SA_33_35_a', 'SA_33_35_b', 'SA_33_35_c', 'SA_34', 'SA_42', 'SA_43', 'SA_44', 'SA_45', 'SA_46', 'SA_47', 'SA_48',
  'MU_husband', 'MU_husband_desc', 'MU_wife', 'MU_wife_desc', 'MU_mother', 'MU_mother_desc', 'MU_mother_umar', 'MU_father_desc', 'MU_father_residue',
  'MU_father_res', 'MU_daughter_one', 'MU_daughters', 'MU_residue_children', 'MFLO_4',
];
export const BASIS_SUFFIXES = ['+awl', '+radd'];

const F = (n, d = 1) => new Fraction(BigInt(n), BigInt(d));

/** Final safety net: shares must sum to exactly 1. */
function seal(shares) {
  const live = shares.filter((s) => !s.fraction.isZero());
  if (!sum(live.map((s) => s.fraction)).eq(ONE)) throw new Error('inheritance: shares do not add up to 1');
  return { shares: live };
}

/* ------------------------------------------------------------------ descendants */

/** Validates a descendant tree: [{ id, alive, sex?, children: [...] }]. */
function checkTree(nodes, depth = 0) {
  if (!Array.isArray(nodes)) fail('bad_input');
  if (depth > 6) fail('too_deep');
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.alive !== 'boolean') fail('bad_input');
    if (n.alive && n.children && n.children.length) fail('alive_with_children'); // children of a living person are not heirs
    checkTree(n.children || [], depth + 1);
  }
}

const hasLiving = (n) => n.alive || (n.children || []).some(hasLiving);

/**
 * Succession Act 1925 ss.37-40. Shares are counted at the nearest generation that has a living descendant;
 * below that, a deceased person's share passes down his own line, one share per living child (or per
 * deceased child with living descendants), recursively.
 */
export function splitDescendantsSA(roots, total) {
  checkTree(roots);
  const levels = [roots];
  while (levels[levels.length - 1].some((n) => (n.children || []).length)) {
    levels.push(levels[levels.length - 1].flatMap((n) => n.children || []));
  }
  const d = levels.findIndex((lvl) => lvl.some((n) => n.alive));
  if (d === -1) return [];
  const aliveBasis = d === 0 ? 'SA_37' : d === 1 ? 'SA_38' : 'SA_39';
  const out = [];
  const give = (node, amount, b) => {
    if (node.alive) return void out.push({ id: node.id, fraction: amount, basis: b });
    const kids = (node.children || []).filter(hasLiving);
    const each = amount.div(F(kids.length));
    for (const k of kids) give(k, each, 'SA_40');
  };
  const heads = levels[d].filter(hasLiving);
  const unit = total.div(F(heads.length));
  const allAlive = heads.every((x) => x.alive);
  for (const n of heads) give(n, unit, allAlive ? aliveBasis : 'SA_40');
  return out;
}

/* ------------------------------------------------------------------ Christian: Succession Act 1925 */

/**
 * Intestate succession, Succession Act 1925 Part V Chapter II (ss.33-48), for a Bangladesh Christian.
 * input: { spouseAlive, descendants: tree, fatherAlive, motherAlive,
 *          siblings: [{ id, alive, childrenCount }], nearestKindred: { count } }
 * s.33A (the Tk 5,000 rule) does not apply to Bangladesh Christians (s.33A(5)), so it is not used.
 */
export function christianSuccession(input) {
  const { spouseAlive = false, descendants = [], fatherAlive = false, motherAlive = false, siblings = [], nearestKindred = { count: 0 } } = input;
  checkTree(descendants);
  const hasDesc = descendants.some(hasLiving);
  const shares = [];

  if (hasDesc) {
    const pool = spouseAlive ? F(2, 3) : ONE;
    if (spouseAlive) shares.push({ id: 'spouse', fraction: F(1, 3), basis: 'SA_33_35_a' });
    shares.push(...splitDescendantsSA(descendants, pool));
    return seal(shares);
  }

  // No lineal descendants: kindred (ss.41-48) share with the spouse (s.33(b)); with no kindred the spouse takes all (s.33(c)).
  const kin = kindredSA({ fatherAlive, motherAlive, siblings, nearestKindred });
  if (!kin.length) {
    if (spouseAlive) return seal([{ id: 'spouse', fraction: ONE, basis: 'SA_33_35_c' }]);
    return seal([{ id: 'government', fraction: ONE, basis: 'SA_34' }]);
  }
  const pool = spouseAlive ? F(1, 2) : ONE;
  if (spouseAlive) shares.push({ id: 'spouse', fraction: F(1, 2), basis: 'SA_33_35_b' });
  for (const k of kin) shares.push({ ...k, fraction: k.fraction.mul(pool) });
  return seal(shares);
}

/** Shares (summing to 1) of the kindred when there is no lineal descendant: ss.42-48. Empty list when there is no kindred. */
function kindredSA({ fatherAlive, motherAlive, siblings, nearestKindred }) {
  for (const s of siblings) {
    if (!s || typeof s.id !== 'string' || typeof s.alive !== 'boolean') fail('bad_input');
    if (s.alive && s.childrenCount) fail('alive_with_children');
    if (!Number.isInteger(s.childrenCount || 0) || (s.childrenCount || 0) < 0 || (s.childrenCount || 0) > 99) fail('bad_input');
  }
  if (!Number.isInteger(nearestKindred.count) || nearestKindred.count < 0 || nearestKindred.count > 99) fail('bad_input');

  if (fatherAlive) return [{ id: 'father', fraction: ONE, basis: 'SA_42' }];

  // Lines: the mother (one line), each living brother/sister (one line), each dead one who left children (one line).
  const lines = [];
  if (motherAlive) lines.push({ type: 'mother' });
  for (const s of siblings) {
    if (s.alive) lines.push({ type: 'sibling', s });
    else if ((s.childrenCount || 0) > 0) lines.push({ type: 'nieces', s });
  }
  if (lines.length) {
    const each = ONE.div(F(lines.length));
    const only = lines.length === 1 && lines[0].type === 'mother';
    const hasNieces = lines.some((l) => l.type === 'nieces');
    const out = [];
    for (const l of lines) {
      if (l.type === 'mother') out.push({ id: 'mother', fraction: each, basis: only ? 'SA_46' : hasNieces ? (siblings.some((s) => s.alive) ? 'SA_44' : 'SA_45') : 'SA_43' });
      else if (l.type === 'sibling') out.push({ id: l.s.id, fraction: each, basis: motherAlive ? (hasNieces ? 'SA_44' : 'SA_43') : 'SA_47' });
      else {
        const part = each.div(F(l.s.childrenCount));
        for (let i = 1; i <= l.s.childrenCount; i += 1) out.push({ id: `${l.s.id}:child:${i}`, fraction: part, basis: motherAlive ? (siblings.some((s) => s.alive) ? 'SA_44' : 'SA_45') : 'SA_47' });
      }
    }
    return out;
  }
  if (nearestKindred.count > 0) {
    const each = ONE.div(F(nearestKindred.count));
    return Array.from({ length: nearestKindred.count }, (_, i) => ({ id: `kin:${i + 1}`, fraction: each, basis: 'SA_48' }));
  }
  return [];
}

/* ------------------------------------------------------------------ Muslim (Sunni / Hanafi) */

/**
 * Hanafi fixed shares (Quran 4:11-12, 4:176 as applied in Bangladesh) with MFLO 1961 s.4 for children of a
 * predeceased child. Supported heirs: husband or wives, father, mother, sons, daughters (and, through MFLO s.4,
 * the descendants of a predeceased son or daughter). Anything else must be reported with `otherHeirs: true`,
 * and then the engine refuses instead of guessing.
 * input: { spouse: 'none'|'husband'|'wives', wives, fatherAlive, motherAlive, children: tree with sex, otherHeirs }
 */
export function muslimSuccession(input) {
  const { spouse = 'none', wives = 1, fatherAlive = false, motherAlive = false, children = [], otherHeirs = false } = input;
  if (otherHeirs) fail('unsupported_heirs');
  if (!['none', 'husband', 'wives'].includes(spouse)) fail('bad_input');
  if (spouse === 'wives' && (!Number.isInteger(wives) || wives < 1 || wives > 4)) fail('bad_input');
  checkTree(children);
  for (const n of walk(children)) if (n.sex !== 'M' && n.sex !== 'F') fail('bad_input');

  // MFLO s.4: a predeceased child with living descendants stands in the child's place.
  const lines = children.filter(hasLiving);
  const sons = lines.filter((n) => n.sex === 'M');
  const daughters = lines.filter((n) => n.sex === 'F');
  const hasDesc = lines.length > 0;
  const hasSon = sons.length > 0;

  const sharers = []; // fixed-share entries { key, f, basis }
  let spouseFixed = ZERO;
  if (spouse === 'husband') spouseFixed = hasDesc ? F(1, 4) : F(1, 2);
  if (spouse === 'wives') spouseFixed = hasDesc ? F(1, 8) : F(1, 4);
  if (spouse !== 'none') sharers.push({ key: 'spouse', f: spouseFixed, basis: spouse === 'husband' ? (hasDesc ? 'MU_husband_desc' : 'MU_husband') : hasDesc ? 'MU_wife_desc' : 'MU_wife' });

  // Mother: 1/6 with descendants; otherwise 1/3 (Umariyyatain: 1/3 of what is left after a spouse when both parents inherit).
  let motherFixed = ZERO;
  if (motherAlive) {
    if (hasDesc) motherFixed = F(1, 6);
    else if (fatherAlive && spouse !== 'none') motherFixed = ONE.sub(spouseFixed).div(F(3));
    else motherFixed = F(1, 3);
    sharers.push({ key: 'mother', f: motherFixed, basis: hasDesc ? 'MU_mother_desc' : fatherAlive && spouse !== 'none' ? 'MU_mother_umar' : 'MU_mother' });
  }

  // Father: 1/6 with a son; 1/6 plus the residue with only daughters; residuary alone with no descendants.
  let fatherFixed = ZERO;
  if (fatherAlive && hasDesc) {
    fatherFixed = F(1, 6);
    sharers.push({ key: 'father', f: fatherFixed, basis: 'MU_father_desc' });
  }

  // Daughters (own right) only when there is no son; with sons they are residuaries (2:1).
  let daughtersFixed = ZERO;
  if (hasDesc && !hasSon) {
    daughtersFixed = daughters.length === 1 ? F(1, 2) : F(2, 3);
    sharers.push({ key: 'daughters', f: daughtersFixed, basis: daughters.length === 1 ? 'MU_daughter_one' : 'MU_daughters' });
  }

  const fixedTotal = sum(sharers.map((s) => s.f));
  const residuaryExists = hasSon || (fatherAlive && true);
  const entries = new Map(); // key -> { f, basis }
  let total = fixedTotal;

  if (fixedTotal.cmp(ONE) > 0) {
    // 'Awl: every fixed share is reduced in proportion so that the shares add up to exactly one.
    for (const s of sharers) entries.set(s.key, { f: s.f.div(fixedTotal), basis: `${s.basis}+awl` });
  } else {
    for (const s of sharers) entries.set(s.key, { f: s.f, basis: s.basis });
    const rest = ONE.sub(fixedTotal);
    if (!rest.isZero()) {
      if (hasSon) {
        // Sons and daughters share the rest, a son taking twice a daughter.
        const heads = sons.length * 2 + daughters.length;
        const unit = rest.div(F(heads));
        entries.set('sonsPool', { f: rest, unit, basis: 'MU_residue_children' });
      } else if (fatherAlive) {
        const cur = entries.get('father');
        entries.set('father', { f: (cur ? cur.f : ZERO).add(rest), basis: hasDesc ? 'MU_father_residue' : 'MU_father_res' });
      } else {
        // Radd: no residuary, so the rest returns to the sharers other than the spouse, in proportion to their shares.
        const back = sharers.filter((s) => s.key !== 'spouse');
        if (!back.length) fail(sharers.length ? 'no_other_heirs' : 'no_supported_heirs');
        const backTotal = sum(back.map((s) => s.f));
        for (const s of back) {
          const cur = entries.get(s.key);
          entries.set(s.key, { f: cur.f.add(rest.mul(s.f).div(backTotal)), basis: `${s.basis}+radd` });
        }
      }
    }
  }
  void residuaryExists;
  void total;
  if (!entries.size) fail('no_supported_heirs');

  // Turn group entries into per-person shares.
  const shares = [];
  for (const [key, e] of entries) {
    if (key === 'spouse') {
      if (spouse === 'wives') for (let i = 1; i <= wives; i += 1) shares.push({ id: `wife:${i}`, fraction: e.f.div(F(wives)), basis: e.basis });
      else shares.push({ id: 'spouse', fraction: e.f, basis: e.basis });
    } else if (key === 'mother' || key === 'father') shares.push({ id: key, fraction: e.f, basis: e.basis });
    else if (key === 'daughters') shares.push(...splitByWeight(daughters.map((n) => ({ node: n, w: 1 })), e.f, e.basis));
    else if (key === 'sonsPool') shares.push(...splitByWeight(lines.map((n) => ({ node: n, w: n.sex === 'M' ? 2 : 1 })), e.f, e.basis));
  }
  return seal(shares);
}

function* walk(nodes) {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children || []);
  }
}

/** Splits `amount` between child lines by weight; a line that is a deceased child passes its share down (MFLO s.4, son 2 : daughter 1). */
function splitByWeight(items, amount, basis) {
  const totalW = items.reduce((a, i) => a + i.w, 0);
  const out = [];
  for (const { node, w } of items) {
    const part = amount.mul(F(w)).div(F(totalW));
    if (node.alive) out.push({ id: node.id, fraction: part, basis });
    else out.push(...passDown(node, part));
  }
  return out;
}
function passDown(node, amount) {
  const kids = (node.children || []).filter(hasLiving);
  const totalW = kids.reduce((a, k) => a + (k.sex === 'M' ? 2 : 1), 0);
  const out = [];
  for (const k of kids) {
    const part = amount.mul(F(k.sex === 'M' ? 2 : 1)).div(F(totalW));
    if (k.alive) out.push({ id: k.id, fraction: part, basis: 'MFLO_4' });
    else out.push(...passDown(k, part));
  }
  return out;
}

/* ------------------------------------------------------------------ money (display only, exact) */

/** Amount for a share of an estate, as exact decimal text rounded half-up to the paisa. Returns null if `value` is not a number. */
export function shareAmount(valueText, fraction) {
  const v = Fraction.parseDecimal(valueText);
  if (v === null) return null;
  return v.mul(fraction).toFixed(2);
}
