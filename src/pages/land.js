// Land calculator: unit conversion, plot area, shares, price and registration cost, plus a glossary.
// All maths lives in src/lib/land-core.js. Everything here works offline.

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, emptyState, loadingBlock, button } from '../ui/components.js';
import { renderParagraphs } from '../ui/richtext.js';
import { t, num, getLang } from '../i18n/index.js';
import { loadLandData, getRegion, setRegion, getCustomRegion, setCustomRegion } from '../core/land.js';
import { parseNumber, buildAreaUnits, convertArea, toSqft, breakdown, lengthToFeet, shapes, shareOfArea, splitEqually, totalPrice, pricePerUnit, estimateCost, trimNumber, LandInputError } from '../lib/land-core.js';
import { logError } from '../core/logger.js';

const TABS = ['convert', 'plot', 'share', 'price', 'cost', 'terms'];

/** Picks the current language from a { bn, en } pair, falling back to the other language. */
const L = (pair) => (pair && (getLang() === 'bn' ? pair.bn || pair.en : pair.en || pair.bn)) || '';
const fmt = (x, digits = 4) => num(trimNumber(x, digits));
const money = (x) => new Intl.NumberFormat(getLang() === 'bn' ? 'bn-BD' : 'en-BD', { maximumFractionDigits: 0 }).format(Math.round(x));

function errText(err) {
  return err instanceof LandInputError ? t(`land.err.${err.code}`) : t('error.generic');
}

export default function render({ query }) {
  const root = h('div', { class: 'page' });
  root.appendChild(loadingBlock(t('land.loading')));
  let tab = TABS.includes(query.tab) ? query.tab : 'convert';

  loadLandData()
    .then((data) => paint(data))
    .catch((err) => {
      logError(err, { where: 'land.load' });
      clear(root);
      root.appendChild(emptyState({ iconName: 'alert', title: t('land.loadFailed') }));
    });

  function paint(data) {
    clear(root);
    const state = { region: getRegion(), custom: getCustomRegion() };
    const units = () => {
      try {
        return buildAreaUnits(data.units, state.region, state.custom);
      } catch {
        return buildAreaUnits(data.units, 'standard');
      }
    };

    const tabsEl = h('div', { class: 'chips', role: 'tablist' });
    const body = h('div', { class: 'stack' });
    const regionBox = h('div', { class: 'card' });
    root.append(tabsEl, regionBox, body);

    function paintTabs() {
      clear(tabsEl);
      for (const id of TABS) {
        tabsEl.appendChild(
          h('button', { type: 'button', role: 'tab', 'aria-selected': id === tab ? 'true' : 'false', class: `chip${id === tab ? ' chip-active' : ''}`, onclick: () => { tab = id; paintTabs(); paintBody(); } }, t(`land.tab.${id}`)),
        );
      }
    }

    function paintRegion() {
      clear(regionBox);
      const sel = h(
        'select',
        { class: 'input', 'aria-label': t('land.region'), onchange: () => { state.region = sel.value; setRegion(state.region); paintRegion(); paintBody(); } },
        [...data.units.regions.map((r) => h('option', { value: r.id }, L(r.name))), h('option', { value: 'custom' }, t('land.region.custom'))],
      );
      sel.value = state.region === 'custom' || data.units.regions.some((r) => r.id === state.region) ? state.region : 'standard';
      regionBox.appendChild(h('label', { class: 'lc-label' }, t('land.region')));
      regionBox.appendChild(sel);
      if (state.region === 'custom') {
        const kath = h('input', { class: 'input', inputmode: 'decimal', value: String(state.custom.katha_sqft), 'aria-label': t('land.custom.katha') });
        const per = h('input', { class: 'input', inputmode: 'decimal', value: String(state.custom.katha_per_bigha), 'aria-label': t('land.custom.perBigha') });
        const apply = () => {
          const k = parseNumber(kath.value);
          const p = parseNumber(per.value);
          if (k > 0 && p > 0) {
            state.custom = { katha_sqft: k, katha_per_bigha: p };
            setCustomRegion(state.custom);
            paintBody();
          }
        };
        kath.addEventListener('input', apply);
        per.addEventListener('input', apply);
        regionBox.appendChild(h('div', { class: 'grid grid-2' }, h('label', { class: 'lc-label' }, t('land.custom.katha'), kath), h('label', { class: 'lc-label' }, t('land.custom.perBigha'), per)));
      }
      regionBox.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('land.regionNote')));
    }

    // ---- shared pieces ------------------------------------------------------------------
    const unitSelect = (list, value) => {
      const s = h('select', { class: 'input', 'aria-label': t('land.unit') }, list.map((u) => h('option', { value: u.id }, L(u.name))));
      s.value = value;
      return s;
    };
    const numInput = (label, ph = '') => h('input', { class: 'input', inputmode: 'decimal', placeholder: ph, 'aria-label': label });
    const labelled = (label, ...controls) => h('label', { class: 'lc-label' }, label, h('div', { class: 'inline-fields' }, controls));

    /** Result card for an area in sq ft: all units + a bigha/katha/chhatak breakdown. */
    function areaResult(sqft, title) {
      const u = units();
      const all = convertArea(sqft, 'sqft', u);
      const parts = breakdown(sqft, u, ['bigha', 'katha', 'chhatak']);
      const nameOf = (id) => L(u.find((x) => x.id === id).name);
      // "2 Bigha 5 Katha 3.2 Chhatak": whole parts, zero parts left out, last part may carry a fraction.
      const last = parts.length - 1;
      const shown = parts.map((p, i) => ({ ...p, digits: i === last ? 2 : 0 })).filter((p) => p.value > 1e-9);
      const spoken = (shown.length ? shown : [{ ...parts[last], digits: 2 }]).map((p) => `${fmt(p.value, p.digits)} ${nameOf(p.id)}`).join(' ');
      return h(
        'div',
        { class: 'card result', 'aria-live': 'polite' },
        title ? h('p', { class: 'eyebrow' }, title) : null,
        h('p', { class: 'result-big' }, spoken),
        h('dl', { class: 'facts' }, all.map((r) => h('div', { class: 'fact' }, h('dt', null, nameOf(r.id)), h('dd', null, fmt(r.value))))),
      );
    }

    const out = (host, node) => {
      clear(host);
      if (node) host.appendChild(node);
    };
    const hint = (text) => h('p', { class: 'muted small' }, text);

    // ---- tabs ---------------------------------------------------------------------------
    function convertTab() {
      const u = units();
      const value = numInput(t('land.value'), '0');
      const unit = unitSelect(u, 'katha');
      const res = h('div');
      const calc = () => {
        const n = parseNumber(value.value);
        if (value.value.trim() === '') return out(res, hint(t('land.enterValue')));
        if (n === null) return out(res, banner(t('land.err.number'), { tone: 'warning', iconName: 'alert' }));
        try {
          out(res, areaResult(toSqft(n, unit.value, u)));
        } catch (e) {
          out(res, banner(errText(e), { tone: 'warning', iconName: 'alert' }));
        }
      };
      value.addEventListener('input', calc);
      unit.addEventListener('change', calc);
      calc();
      return h('div', { class: 'stack' }, h('div', { class: 'card' }, labelled(t('land.area'), value, unit)), res);
    }

    function plotTab() {
      const lengthUnits = data.units.length_units;
      const shapeSel = h('select', { class: 'input', 'aria-label': t('land.shape') }, ['rectangle', 'triangle', 'triangleSides', 'trapezoid'].map((s) => h('option', { value: s }, t(`land.shape.${s}`))));
      const lenUnit = unitSelect(lengthUnits, 'ft');
      const fieldsEl = h('div', { class: 'stack' });
      const res = h('div');
      const partsEl = h('div');
      const parts = [];
      let inputs = [];
      let current = null;

      const SPEC = { rectangle: ['land.length', 'land.width'], triangle: ['land.base', 'land.height'], triangleSides: ['land.sideA', 'land.sideB', 'land.sideC'], trapezoid: ['land.parallelA', 'land.parallelB', 'land.distance'] };
      const buildFields = () => {
        clear(fieldsEl);
        inputs = SPEC[shapeSel.value].map((k) => numInput(t(k)));
        SPEC[shapeSel.value].forEach((k, i) => fieldsEl.appendChild(h('label', { class: 'lc-label' }, t(k), inputs[i])));
        inputs.forEach((i) => i.addEventListener('input', calc));
        calc();
      };
      function calc() {
        current = null;
        const vals = inputs.map((i) => parseNumber(i.value));
        if (inputs.every((i) => i.value.trim() === '')) return out(res, hint(t('land.enterSides')));
        if (vals.some((v) => v === null)) return out(res, vals.some((v, i) => v === null && inputs[i].value.trim() !== '') ? banner(t('land.err.number'), { tone: 'warning', iconName: 'alert' }) : hint(t('land.enterSides')));
        try {
          const feet = vals.map((v) => lengthToFeet(v, lenUnit.value, lengthUnits));
          current = shapes[shapeSel.value](...feet);
          const box = h('div', { class: 'stack' }, areaResult(current), button(t('land.addPart'), { icon: 'check', onClick: addPart }));
          out(res, box);
        } catch (e) {
          out(res, banner(errText(e), { tone: 'warning', iconName: 'alert' }));
        }
      }
      function addPart() {
        if (current === null) return;
        parts.push(current);
        paintParts();
      }
      function paintParts() {
        if (!parts.length) return out(partsEl, null);
        const total = parts.reduce((a, b) => a + b, 0);
        out(
          partsEl,
          h(
            'div',
            { class: 'stack' },
            areaResult(total, t('land.partsTotal', { n: num(parts.length) })),
            button(t('land.clearParts'), { variant: 'ghost', icon: 'trash', onClick: () => { parts.length = 0; paintParts(); } }),
          ),
        );
      }
      shapeSel.addEventListener('change', buildFields);
      lenUnit.addEventListener('change', calc);
      buildFields();
      return h('div', { class: 'stack' }, h('div', { class: 'card' }, h('label', { class: 'lc-label' }, t('land.shape'), shapeSel), h('label', { class: 'lc-label' }, t('land.lengthUnit'), lenUnit), fieldsEl), res, partsEl);
    }

    function shareTab() {
      const u = units();
      const value = numInput(t('land.value'), '0');
      const unit = unitSelect(u, 'bigha');
      const modeSel = h('select', { class: 'input', 'aria-label': t('land.mode') }, [h('option', { value: 'fraction' }, t('land.mode.fraction')), h('option', { value: 'equal' }, t('land.mode.equal'))]);
      const nu = numInput(t('land.numerator'), '3');
      const de = numInput(t('land.denominator'), '8');
      const people = numInput(t('land.people'), '4');
      const extra = h('div', { class: 'stack' });
      const res = h('div');
      const buildExtra = () => {
        clear(extra);
        if (modeSel.value === 'fraction') extra.appendChild(h('div', { class: 'grid grid-2' }, h('label', { class: 'lc-label' }, t('land.numerator'), nu), h('label', { class: 'lc-label' }, t('land.denominator'), de)));
        else extra.appendChild(h('label', { class: 'lc-label' }, t('land.people'), people));
      };
      const calc = () => {
        const total = parseNumber(value.value);
        if (value.value.trim() === '') return out(res, hint(t('land.enterValue')));
        if (total === null) return out(res, banner(t('land.err.number'), { tone: 'warning', iconName: 'alert' }));
        try {
          const sqft = toSqft(total, unit.value, u);
          if (modeSel.value === 'fraction') {
            const a = parseNumber(nu.value);
            const b = parseNumber(de.value);
            if (a === null || b === null) return out(res, hint(t('land.enterFraction')));
            const part = shareOfArea(sqft, a, b);
            if (part === 0) return out(res, hint(t('land.err.positive')));
            out(res, areaResult(part, t('land.shareOf', { a: num(a), b: num(b) })));
          } else {
            const p = parseNumber(people.value);
            if (p === null) return out(res, hint(t('land.enterPeople')));
            out(res, areaResult(splitEqually(sqft, p), t('land.eachOf', { n: num(p) })));
          }
        } catch (e) {
          out(res, banner(errText(e), { tone: 'warning', iconName: 'alert' }));
        }
      };
      [value, nu, de, people].forEach((i) => i.addEventListener('input', calc));
      unit.addEventListener('change', calc);
      modeSel.addEventListener('change', () => { buildExtra(); calc(); });
      buildExtra();
      calc();
      return h('div', { class: 'stack' }, h('div', { class: 'card' }, labelled(t('land.totalArea'), value, unit), h('label', { class: 'lc-label' }, t('land.mode'), modeSel), extra), res, hint(t('land.shareNote')));
    }

    function priceTab() {
      const u = units();
      const value = numInput(t('land.value'), '0');
      const unit = unitSelect(u, 'katha');
      const modeSel = h('select', { class: 'input', 'aria-label': t('land.mode') }, [h('option', { value: 'total' }, t('land.price.toTotal')), h('option', { value: 'perUnit' }, t('land.price.toUnit'))]);
      const priceUnit = unitSelect(u, 'katha');
      const amount = numInput(t('land.amount'), '0');
      const amountLabel = h('label', { class: 'lc-label' });
      const res = h('div');
      const label = () => {
        amountLabel.replaceChildren(modeSel.value === 'total' ? t('land.price.perUnitLabel') : t('land.price.totalLabel'), h('div', { class: 'inline-fields' }, amount, modeSel.value === 'total' ? priceUnit : null));
      };
      const calc = () => {
        const a = parseNumber(value.value);
        const p = parseNumber(amount.value);
        if (value.value.trim() === '' || amount.value.trim() === '') return out(res, hint(t('land.enterPrice')));
        if (a === null || p === null) return out(res, banner(t('land.err.number'), { tone: 'warning', iconName: 'alert' }));
        try {
          const sqft = toSqft(a, unit.value, u);
          const nameOf = (id) => L(u.find((x) => x.id === id).name);
          if (modeSel.value === 'total') {
            out(res, h('div', { class: 'card result', 'aria-live': 'polite' }, h('p', { class: 'eyebrow' }, t('land.price.totalLabel')), h('p', { class: 'result-big' }, `৳ ${money(totalPrice(p, priceUnit.value, sqft, u))}`)));
          } else {
            out(res, h('div', { class: 'card result', 'aria-live': 'polite' }, h('p', { class: 'eyebrow' }, t('land.price.perUnitLabel')), h('dl', { class: 'facts' }, ['katha', 'shotok', 'bigha', 'acre'].map((id) => h('div', { class: 'fact' }, h('dt', null, `${t('land.perOne')} ${nameOf(id)}`), h('dd', null, `৳ ${money(pricePerUnit(p, id, sqft, u))}`))))));
          }
        } catch (e) {
          out(res, banner(errText(e), { tone: 'warning', iconName: 'alert' }));
        }
      };
      [value, amount].forEach((i) => i.addEventListener('input', calc));
      [unit, priceUnit].forEach((i) => i.addEventListener('change', calc));
      modeSel.addEventListener('change', () => { label(); calc(); });
      label();
      calc();
      return h('div', { class: 'stack' }, h('div', { class: 'card' }, h('label', { class: 'lc-label' }, t('land.mode'), modeSel), labelled(t('land.area'), value, unit), amountLabel), res);
    }

    function costTab() {
      const c = data.costs;
      if (c.status !== 'published' || !c.items.length) {
        return h('div', { class: 'stack' }, emptyState({ iconName: 'info', title: t('land.cost.unavailable'), body: t('land.cost.unavailableHint') }));
      }
      const value = numInput(t('land.deedValue'), '0');
      const res = h('div');
      const calc = () => {
        if (value.value.trim() === '') return out(res, hint(t('land.enterValue')));
        const v = parseNumber(value.value);
        if (v === null) return out(res, banner(t('land.err.number'), { tone: 'warning', iconName: 'alert' }));
        try {
          const r = estimateCost(v, c.items.map((it) => ({ ...it, label: L(it.label) })));
          out(res, h('div', { class: 'card result', 'aria-live': 'polite' }, h('dl', { class: 'facts' }, r.lines.map((l) => h('div', { class: 'fact' }, h('dt', null, l.label), h('dd', null, `৳ ${money(l.amount)}`))), h('div', { class: 'fact fact-total' }, h('dt', null, t('land.cost.total')), h('dd', null, `৳ ${money(r.total)}`)))));
        } catch (e) {
          out(res, banner(errText(e), { tone: 'warning', iconName: 'alert' }));
        }
      };
      value.addEventListener('input', calc);
      calc();
      return h(
        'div',
        { class: 'stack' },
        h('div', { class: 'card' }, h('label', { class: 'lc-label' }, t('land.deedValue'), value)),
        res,
        banner(t('land.cost.note', { source: c.source.name, date: c.as_of }), { tone: 'warning', iconName: 'info' }),
      );
    }

    function termsTab() {
      return h(
        'div',
        { class: 'stack' },
        h('div', { class: 'accordion' }, data.glossary.terms.map((term) => h('details', { class: 'acc-item' }, h('summary', { class: 'acc-summary' }, h('span', { class: 'sec-heading' }, L(term.term)), icon('down', 'acc-chevron')), h('div', { class: 'acc-body' }, renderParagraphs(L(term.meaning)))))),
        h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('land.termsNote')),
      );
    }

    const BODIES = { convert: convertTab, plot: plotTab, share: shareTab, price: priceTab, cost: costTab, terms: termsTab };
    function paintBody() {
      regionBox.hidden = tab === 'cost' || tab === 'terms';
      clear(body);
      body.appendChild(BODIES[tab]());
      body.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('land.disclaimer')));
    }

    paintTabs();
    paintRegion();
    paintBody();
  }

  return { el: root, title: t('mod.land_calculator.title') };
}
