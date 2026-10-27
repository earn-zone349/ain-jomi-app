// Inheritance calculator. All maths is in src/lib/inheritance-core.js (exact fractions, no rounding of shares).
// Only rule sets whose status is live (see inheritance-status.js) can be used. Everything works offline.

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, button, badge, externalLink } from '../ui/components.js';
import { t, getLang } from '../i18n/index.js';
import { RULE_STATUS, RELIGIONS, isLive } from '../lib/inheritance-status.js';
import { christianSuccession, muslimSuccession, shareAmount, InheritanceError } from '../lib/inheritance-core.js';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const digits = (s) => (getLang() === 'bn' ? String(s).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : String(s));
const fracText = (f) => digits(f.toString());
const MAX_PER_LEVEL = 12;
const MAX_DEPTH = 4;

export default function render() {
  const root = h('div', { class: 'page' });
  const state = {
    religion: null,
    spouseAlive: false,
    spouse: 'none',
    wives: 1,
    fatherAlive: false,
    motherAlive: false,
    children: [],
    siblings: [],
    kin: 0,
    other: false,
    noKin: false,
    value: '',
    calculated: false,
  };
  const formHost = h('div', { class: 'stack' });
  const resultHost = h('div', { class: 'stack' });
  const estateInput = h('input', { class: 'input', inputmode: 'decimal', 'aria-label': t('inh.estate'), placeholder: '0' });
  estateInput.addEventListener('input', () => {
    state.value = estateInput.value;
    paintResult();
  });

  /* ---------- small controls ---------- */
  const check = (label, checked, onChange, id) =>
    h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked, dataset: { id }, onchange: (e) => onChange(e.target.checked) }), h('span', null, label));
  const select = (options, value, onChange, label, id) => {
    const el = h('select', { class: 'input', 'aria-label': label, dataset: { id }, onchange: () => onChange(el.value) }, options.map((o) => h('option', { value: o.value }, o.label)));
    el.value = String(value);
    return el;
  };
  const changed = () => {
    paintForm();
    if (state.calculated) paintResult();
  };

  /* ---------- descendant tree editor ---------- */
  function treeEditor(nodes, depth, prefix, withSex) {
    const box = h('div', { class: 'stack tree', dataset: { id: `tree-${prefix || 'root'}` } });
    nodes.forEach((node, i) => {
      const path = `${prefix}${i + 1}`;
      const row = h(
        'div',
        { class: 'card tree-node' },
        h('p', { class: 'eyebrow' }, t('inh.child', { n: digits(path.split('.').join('.')) })),
        h(
          'div',
          { class: 'inline-fields' },
          withSex ? select([{ value: 'M', label: t('inh.sex.M') }, { value: 'F', label: t('inh.sex.F') }], node.sex, (v) => { node.sex = v; changed(); }, t('inh.sex'), `sex-${path}`) : null,
          select([{ value: 'alive', label: t('inh.alive') }, { value: 'dead', label: t('inh.dead') }], node.alive ? 'alive' : 'dead', (v) => { node.alive = v === 'alive'; if (node.alive) node.children = []; changed(); }, t('inh.state'), `state-${path}`),
          button(t('inh.remove'), { variant: 'ghost', onClick: () => { nodes.splice(i, 1); changed(); } }),
        ),
      );
      if (!node.alive) {
        row.appendChild(h('p', { class: 'muted small' }, t('inh.deadHint')));
        if (depth < MAX_DEPTH) {
          row.appendChild(treeEditor(node.children, depth + 1, `${path}.`, withSex));
          if (node.children.length < MAX_PER_LEVEL) row.appendChild(button(t('inh.addChildOf', { n: digits(path) }), { variant: 'secondary', onClick: () => { node.children.push(newNode(withSex)); changed(); } }));
        }
      }
      box.appendChild(row);
    });
    return box;
  }
  const newNode = (withSex) => ({ alive: true, sex: withSex ? 'M' : undefined, children: [] });

  const toEngine = (nodes, prefix, labels, withSex) =>
    nodes.map((n, i) => {
      const path = `${prefix}${i + 1}`;
      labels[`c${path}`] = t('inh.child', { n: digits(path) });
      return { id: `c${path}`, alive: n.alive, sex: withSex ? n.sex : undefined, children: n.alive ? [] : toEngine(n.children, `${path}.`, labels, withSex) };
    });
  const hasLiving = (nodes) => nodes.some((n) => n.alive || hasLiving(n.children));

  /* ---------- forms ---------- */
  function christianForm() {
    const living = hasLiving(state.children);
    const frag = [
      check(t('inh.spouseAlive'), state.spouseAlive, (v) => { state.spouseAlive = v; changed(); }, 'spouse'),
      h('h3', { class: 'section-title' }, t('inh.children')),
      h('p', { class: 'muted small' }, t('inh.childrenHint')),
      treeEditor(state.children, 1, '', false),
      state.children.length < MAX_PER_LEVEL ? button(t('inh.addChild'), { variant: 'secondary', onClick: () => { state.children.push(newNode(false)); changed(); } }) : null,
    ];
    if (!living) {
      frag.push(
        h('h3', { class: 'section-title' }, t('inh.kindred')),
        h('p', { class: 'muted small' }, t('inh.kindredHint')),
        check(t('inh.fatherAlive'), state.fatherAlive, (v) => { state.fatherAlive = v; changed(); }, 'father'),
        check(t('inh.motherAlive'), state.motherAlive, (v) => { state.motherAlive = v; changed(); }, 'mother'),
      );
      if (!state.fatherAlive) {
        frag.push(h('h3', { class: 'section-title' }, t('inh.siblings')));
        state.siblings.forEach((s, i) => {
          frag.push(
            h(
              'div',
              { class: 'card' },
              h('p', { class: 'eyebrow' }, t('inh.sibling', { n: digits(i + 1) })),
              h(
                'div',
                { class: 'inline-fields' },
                select([{ value: 'alive', label: t('inh.alive') }, { value: 'dead', label: t('inh.dead') }], s.alive ? 'alive' : 'dead', (v) => { s.alive = v === 'alive'; if (s.alive) s.kids = 0; changed(); }, t('inh.state'), `sib-state-${i + 1}`),
                !s.alive ? select(Array.from({ length: 21 }, (_, k) => ({ value: k, label: `${t('inh.kidsLeft')}: ${digits(k)}` })), s.kids, (v) => { s.kids = Number(v); changed(); }, t('inh.kidsLeft'), `sib-kids-${i + 1}`) : null,
                button(t('inh.remove'), { variant: 'ghost', onClick: () => { state.siblings.splice(i, 1); changed(); } }),
              ),
            ),
          );
        });
        if (state.siblings.length < 20) frag.push(button(t('inh.addSibling'), { variant: 'secondary', onClick: () => { state.siblings.push({ alive: true, kids: 0 }); changed(); } }));
        if (!state.motherAlive && !state.siblings.some((s) => s.alive || s.kids > 0)) {
          frag.push(
            h('h3', { class: 'section-title' }, t('inh.nearest')),
            h('p', { class: 'muted small' }, t('inh.nearestHint')),
            select(Array.from({ length: 21 }, (_, k) => ({ value: k, label: digits(k) })), state.kin, (v) => { state.kin = Number(v); changed(); }, t('inh.nearest'), 'kin'),
            state.kin === 0 ? check(t('inh.noKin'), state.noKin, (v) => { state.noKin = v; changed(); }, 'nokin') : null,
          );
        }
      }
    }
    return frag;
  }

  function muslimForm() {
    return [
      h('p', { class: 'muted small' }, t('inh.muslimScope')),
      h('div', { class: 'card' }, h('label', { class: 'lc-label' }, t('inh.spouse'), select([{ value: 'none', label: t('inh.spouse.none') }, { value: 'husband', label: t('inh.spouse.husband') }, { value: 'wives', label: t('inh.spouse.wives') }], state.spouse, (v) => { state.spouse = v; changed(); }, t('inh.spouse'), 'spouse-kind')),
        state.spouse === 'wives' ? h('label', { class: 'lc-label' }, t('inh.wivesCount'), select([1, 2, 3, 4].map((k) => ({ value: k, label: digits(k) })), state.wives, (v) => { state.wives = Number(v); changed(); }, t('inh.wivesCount'), 'wives')) : null),
      check(t('inh.fatherAlive'), state.fatherAlive, (v) => { state.fatherAlive = v; changed(); }, 'father'),
      check(t('inh.motherAlive'), state.motherAlive, (v) => { state.motherAlive = v; changed(); }, 'mother'),
      h('h3', { class: 'section-title' }, t('inh.children')),
      h('p', { class: 'muted small' }, t('inh.childrenHintMuslim')),
      treeEditor(state.children, 1, '', true),
      state.children.length < MAX_PER_LEVEL ? button(t('inh.addChild'), { variant: 'secondary', onClick: () => { state.children.push(newNode(true)); changed(); } }) : null,
      check(t('inh.otherHeirs'), state.other, (v) => { state.other = v; changed(); }, 'other'),
    ];
  }

  function paintForm() {
    clear(formHost);
    if (!state.religion) return paintChooser();
    const r = state.religion;
    formHost.appendChild(
      h('div', { class: 'row-between' }, h('strong', null, t(`inh.religion.${r}`)), button(t('inh.change'), { variant: 'ghost', onClick: () => { state.religion = null; state.calculated = false; paintForm(); paintResult(); } })),
    );
    if (RULE_STATUS[r].status === 'pending_review') formHost.appendChild(banner(t('inh.previewBanner'), { tone: 'warning', iconName: 'alert' }));
    formHost.appendChild(banner(t(r === 'christian' ? 'inh.christianNote' : 'inh.muslimNote'), { tone: 'info', iconName: 'info' }));
    formHost.append(...(r === 'christian' ? christianForm() : muslimForm()));
    formHost.appendChild(h('div', { class: 'card' }, h('label', { class: 'lc-label' }, t('inh.estate'), estateInput), h('p', { class: 'muted small' }, t('inh.estateHint'))));
    formHost.appendChild(button(t('inh.calc'), { variant: 'primary', block: true, onClick: () => { state.calculated = true; paintResult(); resultHost.scrollIntoView?.({ block: 'start' }); } }));
  }

  function paintChooser() {
    formHost.appendChild(h('p', { class: 'muted' }, t('inh.intro')));
    for (const r of RELIGIONS) {
      const usable = isLive(r);
      const st = RULE_STATUS[r].status;
      const tone = st === 'pending_review' ? 'warning' : st === 'unavailable' ? 'neutral' : 'success';
      formHost.appendChild(
        h(
          usable ? 'button' : 'div',
          { class: `module${usable ? ' module-live' : ''}`, type: usable ? 'button' : undefined, dataset: { religion: r }, onclick: usable ? () => { state.religion = r; state.calculated = false; paintForm(); paintResult(); } : undefined },
          h('span', { class: 'module-icon' }, icon('family')),
          h('span', { class: 'module-text' }, h('strong', null, t(`inh.religion.${r}`)), h('span', { class: 'muted small' }, t(`inh.status.${st}.desc`))),
          badge(t(`inh.status.${st}`), tone),
        ),
      );
    }
    formHost.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('inh.whyNot')));
  }

  /* ---------- result ---------- */
  function labelFor(id, labels) {
    if (labels[id]) return labels[id];
    if (id === 'spouse') return state.religion === 'muslim' ? t('inh.who.husband') : t('inh.who.spouse');
    if (id.startsWith('wife:')) return t('inh.who.wife', { n: digits(id.split(':')[1]) });
    if (id === 'father' || id === 'mother' || id === 'government') return t(`inh.who.${id}`);
    if (id.startsWith('kin:')) return t('inh.who.kin', { n: digits(id.split(':')[1]) });
    const m = /^sib(\d+)(?::child:(\d+))?$/.exec(id);
    if (m) return m[2] ? t('inh.who.nieceOf', { s: digits(m[1]), n: digits(m[2]) }) : t('inh.sibling', { n: digits(m[1]) });
    return id;
  }

  function compute() {
    const labels = {};
    if (state.religion === 'christian') {
      const nobody = !hasLiving(state.children) && !state.fatherAlive && !state.motherAlive && !state.siblings.some((x) => x.alive || x.kids > 0) && state.kin === 0;
      if (nobody && !state.noKin) throw new InheritanceError('confirm_no_kindred');
      return {
        labels,
        res: christianSuccession({
          spouseAlive: state.spouseAlive,
          descendants: toEngine(state.children, '', labels, false),
          fatherAlive: state.fatherAlive,
          motherAlive: state.motherAlive,
          siblings: state.siblings.map((s, i) => ({ id: `sib${i + 1}`, alive: s.alive, childrenCount: s.alive ? 0 : s.kids })),
          nearestKindred: { count: state.kin },
        }),
      };
    }
    return {
      labels,
      res: muslimSuccession({ spouse: state.spouse, wives: state.wives, fatherAlive: state.fatherAlive, motherAlive: state.motherAlive, children: toEngine(state.children, '', labels, true), otherHeirs: state.other }),
    };
  }

  function basisText(b) {
    const suffix = b.endsWith('+awl') ? '+awl' : b.endsWith('+radd') ? '+radd' : '';
    const base = suffix ? b.slice(0, -suffix.length) : b;
    return `${t(`inh.basis.${base}`)}${suffix ? ` ${t(suffix === '+awl' ? 'inh.awl' : 'inh.radd')}` : ''}`;
  }

  function paintResult() {
    clear(resultHost);
    if (!state.religion || !state.calculated) return;
    let out;
    try {
      out = compute();
    } catch (e) {
      const known = e instanceof InheritanceError;
      resultHost.appendChild(banner(known ? t(`inh.err.${e.code}`) : t('error.generic'), { tone: 'warning', iconName: 'alert' }));
      return;
    }
    const { res, labels } = out;
    const withMoney = state.value.trim() !== '';
    const bad = withMoney && shareAmount(state.value, res.shares[0].fraction) === null;
    resultHost.appendChild(
      h(
        'div',
        { class: 'card result', 'aria-live': 'polite', dataset: { id: 'inh-result' } },
        h('p', { class: 'eyebrow' }, t('inh.result')),
        h(
          'dl',
          { class: 'facts' },
          res.shares.map((s) =>
            h('div', { class: 'fact', dataset: { id: s.id } }, h('dt', null, labelFor(s.id, labels)), h('dd', null, fracText(s.fraction), withMoney && !bad ? h('span', { class: 'muted small' }, ` · ৳ ${digits(shareAmount(state.value, s.fraction))}`) : null)),
          ),
          h('div', { class: 'fact fact-total' }, h('dt', null, t('inh.total')), h('dd', null, digits(1))),
        ),
        bad ? banner(t('inh.err.badValue'), { tone: 'warning', iconName: 'alert' }) : null,
        withMoney && !bad ? h('p', { class: 'muted small' }, t('inh.moneyNote')) : null,
      ),
    );
    const bases = [...new Set(res.shares.map((s) => s.basis))];
    resultHost.appendChild(h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, t('inh.basisTitle')), h('ul', { class: 'plain-list' }, bases.map((b) => h('li', null, basisText(b))))));
    const info = RULE_STATUS[state.religion];
    resultHost.appendChild(
      h(
        'p',
        { class: 'fineprint' },
        icon('info', 'icon-inline'),
        t('inh.source'),
        ': ',
        info.url ? externalLink(info.url, info.law) : info.law,
        info.checkedOn ? ` (${t('inh.checked')}: ${digits(info.checkedOn)})` : '',
      ),
    );
  }

  root.append(formHost, resultHost, h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('inh.disclaimer')));
  paintForm();
  return { el: root, title: t('mod.inheritance.title') };
}
