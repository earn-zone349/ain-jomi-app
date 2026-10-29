// Verified lawyer directory. Conventional listing only (name, enrolment, courts, areas, office): no ratings, reviews,
// featured slots or promotion, in line with the Bangladesh Bar Council's conduct rules. Contact details are for signed-in users.

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, button, emptyState, loadingBlock, badge, textareaField } from '../ui/components.js';
import { openDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { t, getLang, num, formatDate } from '../i18n/index.js';
import { getAuth } from '../core/auth.js';
import { getCategories, getSetting } from '../core/content.js';
import { errorCode } from '../core/supabase.js';
import { listVerified, reportLawyer } from '../core/lawyers.js';
import { filterLawyers, sortLawyers } from '../lib/lawyers-core.js';
import { DIVISIONS, DISTRICTS, COURTS } from '../lib/lawyers-options.js';
import { logError } from '../core/logger.js';

const L = (o) => (getLang() === 'bn' ? o.bn || o.en : o.en || o.bn);
const districtName = (id) => {
  const d = DISTRICTS.find((x) => x.id === id);
  return d ? L(d) : id;
};
const courtName = (id) => {
  const c = COURTS.find((x) => x.id === id);
  return c ? L(c) : id;
};

export default function render({ navigate }) {
  const root = h('div', { class: 'page' });
  if ((getSetting('feature_flags', {}) || {}).lawyers !== true) {
    root.appendChild(emptyState({ iconName: 'info', title: t('lawyers.notOpen'), body: t('lawyers.notOpenHint') }));
    return { el: root, title: t('mod.lawyers.title') };
  }

  const auth = getAuth();
  const catName = (slug) => {
    const c = getCategories().find((x) => x.slug === slug || x.id === slug);
    return c ? (getLang() === 'bn' ? c.name_bn || c.name_en : c.name_en || c.name_bn) : slug;
  };
  const filters = { district: '', area: '', court: '', q: '' };
  let all = [];

  const intro = banner(t('lawyers.intro'), { tone: 'info', iconName: 'info' });
  const form = h('div', { class: 'card stack' });
  const results = h('div', { class: 'stack' });
  const applyRow = h('div', { class: 'card stack' }, h('p', { class: 'muted small' }, t('lawyers.areYouLawyer')), button(t('lawyers.applyCta'), { variant: 'secondary', onClick: () => navigate('/tools/lawyers/apply') }));
  root.append(intro, form, results, applyRow, h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('lawyers.disclaimer')));
  results.appendChild(loadingBlock(t('lawyers.loading')));

  const q = h('input', { class: 'input', type: 'search', 'aria-label': t('lawyers.search'), placeholder: t('lawyers.search'), dataset: { id: 'lawyer-q' } });
  q.addEventListener('input', () => { filters.q = q.value; paintResults(); });
  const sel = (key, label, options) => {
    const s = h('select', { class: 'input', 'aria-label': label, dataset: { id: `lawyer-${key}` }, onchange: () => { filters[key] = s.value; paintResults(); } }, [h('option', { value: '' }, label), ...options.map((o) => h('option', { value: o.value }, o.label))]);
    return s;
  };
  form.append(
    q,
    sel('district', t('lawyers.anyDistrict'), DIVISIONS.flatMap((dv) => DISTRICTS.filter((d) => d.division === dv.id).map((d) => ({ value: d.id, label: `${L(d)} (${L(dv)})` })))),
    sel('area', t('lawyers.anyArea'), getCategories().map((c) => ({ value: c.slug || c.id, label: catName(c.slug || c.id) }))),
    sel('court', t('lawyers.anyCourt'), COURTS.map((c) => ({ value: c.id, label: L(c) }))),
  );

  function card(l) {
    const body = h('div', { class: 'acc-body stack' });
    body.appendChild(h('dl', { class: 'facts' },
      h('div', { class: 'fact' }, h('dt', null, t('lawyers.enrolment')), h('dd', null, `${l.enrollment_no}${l.enrollment_year ? ` (${num(l.enrollment_year)})` : ''}`)),
      h('div', { class: 'fact' }, h('dt', null, t('lawyers.bar')), h('dd', null, l.bar_association)),
      l.qualifications ? h('div', { class: 'fact' }, h('dt', null, t('lawyers.qualifications')), h('dd', null, l.qualifications)) : null,
    ));
    body.appendChild(h('p', null, h('strong', null, `${t('lawyers.courts')}: `), (l.courts || []).map(courtName).join(', ')));
    body.appendChild(h('p', null, h('strong', null, `${t('lawyers.areas')}: `), (l.practice_areas || []).map(catName).join(', ')));
    if (auth.signedIn) {
      body.appendChild(h('div', { class: 'stack', dataset: { id: 'contact' } },
        h('h3', { class: 'section-title' }, t('lawyers.contact')),
        h('p', null, l.office_address),
        h('p', null, h('a', { class: 'link', href: `tel:${l.phone}` }, l.phone)),
        l.email ? h('p', null, h('a', { class: 'link', href: `mailto:${l.email}` }, l.email)) : null,
      ));
    } else {
      body.appendChild(banner(t('lawyers.loginForContact'), { tone: 'info', iconName: 'lock', action: button(t('auth.login'), { variant: 'primary', onClick: () => navigate(`/login?next=${encodeURIComponent('/tools/lawyers')}`) }) }));
    }
    body.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('lawyers.verifiedOn', { date: formatDate(l.verified_at) })));
    body.appendChild(button(t('lawyers.report'), { variant: 'ghost', onClick: () => openReport(l) }));
    return h('details', { class: 'acc-item card', dataset: { lawyer: l.id } },
      h('summary', { class: 'acc-summary' }, h('span', { class: 'stack-tight' }, h('span', { class: 'sec-heading' }, l.full_name), h('span', { class: 'muted small' }, `${districtName(l.district)} · ${l.bar_association}`)), icon('down', 'acc-chevron')),
      body);
  }

  function paintResults() {
    clear(results);
    const shown = sortLawyers(filterLawyers(all, filters), getLang());
    if (!all.length) return void results.appendChild(emptyState({ iconName: 'info', title: t('lawyers.none'), body: t('lawyers.noneHint') }));
    results.appendChild(h('p', { class: 'muted small', 'aria-live': 'polite', dataset: { id: 'lawyer-count' } }, t('lawyers.count', { n: num(shown.length) })));
    if (!shown.length) return void results.appendChild(emptyState({ iconName: 'search', title: t('lawyers.noMatch') }));
    shown.forEach((l) => results.appendChild(card(l)));
  }

  function openReport(l) {
    if (!auth.signedIn) {
      navigate(`/login?next=${encodeURIComponent('/tools/lawyers')}`);
      return;
    }
    const msg = textareaField({ id: 'lawyer-report', label: t('report.message'), hint: t('lawyers.reportHint'), maxLength: 1000, rows: 5 });
    let sending = false;
    openDialog({
      title: t('lawyers.report'),
      body: h('div', null, h('p', { class: 'muted small' }, l.full_name), msg.el),
      actions: [
        { label: t('common.cancel'), variant: 'ghost' },
        {
          label: t('report.send'),
          variant: 'primary',
          onClick: async () => {
            if (sending) return false;
            const text = msg.input.value.trim();
            if (text.length < 5) { msg.setError(t('report.tooShort')); return false; }
            sending = true;
            const { error } = await reportLawyer(l.id, text);
            sending = false;
            if (error) { logError(error, { where: 'lawyer.report' }); msg.setError(errorCode(error) === 'offline' ? t('error.offline') : t('error.generic')); return false; }
            toast(t('report.sent'), { tone: 'success' });
            return true;
          },
        },
      ],
    });
  }

  listVerified(auth.signedIn).then(({ data, error }) => {
    if (error) {
      logError(error, { where: 'lawyers.list' });
      clear(results);
      results.appendChild(emptyState({ iconName: 'alert', title: errorCode(error) === 'offline' ? t('error.offline') : t('lawyers.loadFailed') }));
      return;
    }
    all = data || [];
    paintResults();
  });

  return { el: root, title: t('mod.lawyers.title') };
}
