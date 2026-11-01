// Verified lawyer directory. Neutral, alphabetical list. Ratings are shown but never used to rank or promote anyone.
// Browsing needs no account. Phone/email (small fee) and ratings (fee) need an account so that payments can be recorded.
// Money is taken by bKash "Send Money" and checked by an admin; the database sets the price (see phase5_lawyers_v2.sql).

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, button, emptyState, loadingBlock, badge, field, textareaField, setBusy } from '../ui/components.js';
import { openDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { t, getLang, num, formatDate } from '../i18n/index.js';
import { getAuth } from '../core/auth.js';
import { getCategories, getSetting } from '../core/content.js';
import { errorCode } from '../core/supabase.js';
import { listVerified, listMyPayments, listMyRatings, submitPayment, getContact, listRatings, submitRating, reportLawyer, certificateUrl, getPricing } from '../core/lawyers.js';
import { filterLawyers, sortLawyers, validatePayment, paymentFor, yearsSince } from '../lib/lawyers-core.js';
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
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function render({ navigate }) {
  const root = h('div', { class: 'page' });
  if ((getSetting('feature_flags', {}) || {}).lawyers !== true) {
    root.appendChild(emptyState({ iconName: 'info', title: t('lawyers.notOpen'), body: t('lawyers.notOpenHint') }));
    return { el: root, title: t('mod.lawyers.title') };
  }

  const auth = getAuth();
  const here = encodeURIComponent('/tools/lawyers');
  const catName = (slug) => {
    const c = getCategories().find((x) => x.slug === slug || x.id === slug);
    return c ? (getLang() === 'bn' ? c.name_bn || c.name_en : c.name_en || c.name_bn) : slug;
  };
  const filters = { district: '', area: '', court: '', q: '' };
  let all = [];
  let payments = [];
  let myRatings = [];
  const contacts = new Map(); // lawyer id -> { phone, email }
  const bodies = new Map(); // lawyer id -> body element
  const pricing = getPricing();

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

  const authBanner = () => banner(t('lawyers.loginToPay'), {
    tone: 'info',
    iconName: 'lock',
    action: h('div', { class: 'btn-row' },
      button(t('auth.login'), { variant: 'primary', onClick: () => navigate(`/login?next=${here}`) }),
      button(t('auth.register'), { onClick: () => navigate(`/register?next=${here}`) })),
  });

  async function refreshMine() {
    if (!auth.signedIn) return;
    const [p, r] = await Promise.all([listMyPayments(), listMyRatings()]);
    if (!p.error) payments = p.data || [];
    if (!r.error) myRatings = r.data || [];
  }

  // ---- payment dialog (shared by "contact" and "rating") ----
  function openPayment(l, kind) {
    if (!pricing.ready) { toast(t('lawyers.pay.notReady'), { tone: 'error' }); return; }
    const fee = kind === 'contact' ? pricing.contact : pricing.rating;
    const sender = field({ id: 'pay-sender', label: t('lawyers.pay.sender'), type: 'tel', inputMode: 'tel', autocomplete: 'tel', maxLength: 20 });
    const trx = field({ id: 'pay-trx', label: t('lawyers.pay.trx'), hint: t('lawyers.pay.trxHint'), maxLength: 24 });
    const note = getLang() === 'bn' ? pricing.note_bn || pricing.note_en : pricing.note_en || pricing.note_bn;
    let sending = false;
    openDialog({
      title: t(`lawyers.pay.${kind}`),
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, t('lawyers.pay.amount', { fee: num(fee) }))),
        h('p', { class: 'pre-line' }, t('lawyers.pay.steps', { fee: num(fee), number: pricing.bkash })),
        note ? h('p', { class: 'muted small' }, note) : null,
        sender.el, trx.el),
      actions: [
        { label: t('common.cancel'), variant: 'ghost' },
        {
          label: t('lawyers.pay.send'),
          variant: 'primary',
          onClick: async () => {
            if (sending) return false;
            const r = validatePayment({ sender_number: sender.input.value, trx_id: trx.input.value });
            sender.setError(r.errors.sender_number ? t('lawyers.err.format') : null);
            trx.setError(r.errors.trx_id ? t('lawyers.err.format') : null);
            if (!r.ok) return false;
            sending = true;
            const { error } = await submitPayment({ lawyerId: l.id, kind, ...r.clean });
            sending = false;
            if (error) {
              logError(error, { where: 'lawyer.pay' });
              trx.setError(errorCode(error) === 'offline' ? t('error.offline') : String(error.code) === '23505' ? t('lawyers.pay.duplicate') : t('lawyers.pay.failed'));
              return false;
            }
            toast(t('lawyers.pay.sent'), { tone: 'success' });
            await refreshMine();
            paintBody(l);
            return true;
          },
        },
      ],
    });
  }

  // ---- sections inside a lawyer card ----
  function contactSection(l) {
    const box = h('div', { class: 'stack', dataset: { id: 'contact' } }, h('h3', { class: 'section-title' }, t('lawyers.contact')));
    const c = contacts.get(l.id);
    if (c) {
      box.append(
        h('p', null, h('strong', null, `${t('lawyers.phone')}: `), h('a', { class: 'link', href: `tel:${c.phone}` }, c.phone)),
        c.email ? h('p', null, h('strong', null, `${t('lawyers.email')}: `), h('a', { class: 'link', href: `mailto:${c.email}` }, c.email)) : null,
      );
      return box;
    }
    const pay = paymentFor(payments, l.id, 'contact');
    const fee = pricing.contact;
    if (!auth.signedIn) {
      box.append(pricing.ready ? h('p', { class: 'muted' }, t('lawyers.contactLocked', { fee: num(fee) })) : null, authBanner());
    } else if (pay && pay.status === 'pending') {
      box.append(banner(t('lawyers.contactPending'), { tone: 'info', iconName: 'info' }), button(t('lawyers.refresh'), { variant: 'secondary', onClick: async () => { await refreshMine(); paintBody(l); } }));
    } else if (pay && pay.status === 'approved') {
      box.append(loadingBlock(t('lawyers.loading')));
      getContact(l.id).then(({ data, error }) => {
        if (error || !data) { logError(error || new Error('empty contact'), { where: 'lawyer.contact' }); clear(box); box.append(h('h3', { class: 'section-title' }, t('lawyers.contact')), banner(t('lawyers.contactFailed'), { tone: 'warning', iconName: 'alert' })); return; }
        contacts.set(l.id, data);
        paintBody(l);
      });
    } else {
      if (pay && pay.status === 'rejected') box.append(banner(t('lawyers.contactRejected', { note: pay.review_note || '' }), { tone: 'warning', iconName: 'alert' }));
      if (!pricing.ready) box.append(h('p', { class: 'muted' }, t('lawyers.pay.notReady')));
      else box.append(h('p', { class: 'muted' }, t('lawyers.contactLocked', { fee: num(fee) })), button(t('lawyers.contactShow', { fee: num(fee) }), { variant: 'primary', onClick: () => openPayment(l, 'contact') }));
    }
    return box;
  }

  function ratingSection(l) {
    const box = h('div', { class: 'stack', dataset: { id: 'rating' } }, h('h3', { class: 'section-title' }, t('lawyers.rate')));
    const count = l.rating_count || 0;
    box.appendChild(h('p', { dataset: { id: 'rating-summary' } }, count ? h('strong', null, `★ ${t('lawyers.ratingAvg', { avg: num(Number(l.rating_avg).toFixed(1)), n: num(count) })}`) : h('span', { class: 'muted' }, t('lawyers.ratingNone'))));
    if (count) {
      const list = h('div', { class: 'stack', hidden: true, dataset: { id: 'rating-list' } });
      let loaded = false;
      const toggle = button(t('lawyers.reviewsShow'), { variant: 'ghost', onClick: async () => {
        list.hidden = !list.hidden;
        toggle.textContent = list.hidden ? t('lawyers.reviewsShow') : t('lawyers.reviewsHide');
        if (!list.hidden && !loaded) {
          loaded = true;
          list.appendChild(loadingBlock(t('lawyers.loading')));
          const { data, error } = await listRatings(l.id);
          clear(list);
          if (error) { list.appendChild(banner(t('lawyers.loadFailed'), { tone: 'warning', iconName: 'alert' })); loaded = false; return; }
          if (!data.length) list.appendChild(h('p', { class: 'muted' }, t('lawyers.reviewsEmpty')));
          data.forEach((r) => list.appendChild(h('div', { class: 'card stack-tight' }, h('strong', null, stars(r.stars)), r.comment ? h('p', null, r.comment) : null, h('span', { class: 'fineprint' }, formatDate(r.created_at)))));
        }
      } });
      box.append(toggle, list);
    }

    const mine = myRatings.find((r) => r.lawyer_id === l.id);
    const pay = paymentFor(payments, l.id, 'rating');
    if (!auth.signedIn) {
      box.append(pricing.ready ? h('p', { class: 'muted small' }, t('lawyers.rateFee', { fee: num(pricing.rating) })) : null, authBanner());
    } else if (mine) {
      box.append(h('p', { class: 'muted' }, t('lawyers.rateDone')));
    } else if (pay && pay.status === 'approved') {
      const pick = h('select', { class: 'input', 'aria-label': t('lawyers.rateStars'), dataset: { id: 'rate-stars' } }, [5, 4, 3, 2, 1].map((n) => h('option', { value: String(n) }, `${stars(n)} (${num(n)})`)));
      const comment = textareaField({ id: 'rate-comment', label: t('lawyers.rateComment'), maxLength: 500, rows: 3 });
      const send = button(t('lawyers.rateSend'), { variant: 'primary', onClick: async () => {
        setBusy(send, true);
        const { error } = await submitRating(l.id, Number(pick.value), comment.input.value.trim());
        setBusy(send, false);
        if (error) { logError(error, { where: 'lawyer.rate' }); comment.setError(errorCode(error) === 'offline' ? t('error.offline') : t('lawyers.rateFailed')); return; }
        toast(t('lawyers.rateThanks'), { tone: 'success' });
        const fresh = await listVerified();
        if (!fresh.error) all = fresh.data || all;
        await refreshMine();
        paintResults();
      } });
      box.append(h('p', null, h('strong', null, t('lawyers.rateWrite'))), pick, comment.el, send);
    } else if (pay && pay.status === 'pending') {
      box.append(banner(t('lawyers.ratePending'), { tone: 'info', iconName: 'info' }), button(t('lawyers.refresh'), { variant: 'secondary', onClick: async () => { await refreshMine(); paintBody(l); } }));
    } else {
      if (pay && pay.status === 'rejected') box.append(banner(t('lawyers.rateRejected', { note: pay.review_note || '' }), { tone: 'warning', iconName: 'alert' }));
      if (!pricing.ready) box.append(h('p', { class: 'muted' }, t('lawyers.pay.notReady')));
      else box.append(h('p', { class: 'muted small' }, t('lawyers.rateFee', { fee: num(pricing.rating) })), button(t('lawyers.rateButton', { fee: num(pricing.rating) }), { variant: 'secondary', onClick: () => openPayment(l, 'rating') }));
    }
    return box;
  }

  async function openCertificates(l) {
    const list = h('div', { class: 'stack' }, loadingBlock(t('lawyers.loading')));
    openDialog({ title: t('lawyers.certsDialog'), body: list, actions: [{ label: t('common.close'), variant: 'secondary' }] });
    const links = await Promise.all((l.certificate_paths || []).map((p) => certificateUrl(p)));
    clear(list);
    list.appendChild(h('p', { class: 'muted small' }, t('lawyers.certsChecked')));
    links.forEach((r, i) => {
      if (r.error) list.appendChild(h('p', { class: 'field-error' }, `${t('lawyers.certFile', { n: num(i + 1) })}: ${t('lawyers.certOpenFailed')}`));
      else list.appendChild(h('p', null, h('a', { class: 'link', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, t('lawyers.certFile', { n: num(i + 1) }))));
    });
  }

  function fillBody(l, body) {
    clear(body);
    const years = yearsSince(l.practising_since);
    const facts = [
      [t('lawyers.enrolment'), `${l.enrollment_no}${l.enrollment_year ? ` (${num(l.enrollment_year)})` : ''}`],
      [t('lawyers.bar'), l.bar_association],
      l.qualifications ? [t('lawyers.qualifications'), l.qualifications] : null,
      l.education ? [t('lawyers.education'), l.education] : null,
      l.practising_since ? [t('lawyers.experience'), `${num(l.practising_since)}${years !== null ? ` (${t('lawyers.yearsN', { n: num(years) })})` : ''}`] : null,
      l.cases_handled !== null && l.cases_handled !== undefined ? [t('lawyers.casesHandled'), num(l.cases_handled)] : null,
      l.cases_won !== null && l.cases_won !== undefined ? [t('lawyers.casesWon'), num(l.cases_won)] : null,
    ].filter(Boolean);
    body.appendChild(h('dl', { class: 'facts' }, facts.map(([k, v]) => h('div', { class: 'fact' }, h('dt', null, k), h('dd', null, v)))));
    if (l.cases_handled !== null && l.cases_handled !== undefined || l.achievements) body.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('lawyers.selfDeclared')));
    if (l.achievements) body.appendChild(h('p', null, h('strong', null, `${t('lawyers.achievements')}: `), l.achievements));
    body.appendChild(h('p', null, h('strong', null, `${t('lawyers.courts')}: `), (l.courts || []).map(courtName).join(', ')));
    body.appendChild(h('p', null, h('strong', null, `${t('lawyers.areas')}: `), (l.practice_areas || []).map(catName).join(', ')));
    body.appendChild(h('p', null, h('strong', null, `${t('lawyers.office')}: `), l.office_address));
    if ((l.certificate_paths || []).length) body.appendChild(button(t('lawyers.certsView', { n: num(l.certificate_paths.length) }), { variant: 'secondary', icon: 'file', onClick: () => openCertificates(l) }));
    body.appendChild(contactSection(l));
    body.appendChild(ratingSection(l));
    body.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('lawyers.verifiedOn', { date: formatDate(l.verified_at) })));
    body.appendChild(button(t('lawyers.report'), { variant: 'ghost', onClick: () => openReport(l) }));
  }

  function paintBody(l) {
    const body = bodies.get(l.id);
    if (body) fillBody(l, body);
  }

  function card(l) {
    const body = h('div', { class: 'acc-body stack' });
    bodies.set(l.id, body);
    fillBody(l, body);
    const ratingLine = l.rating_count ? `★ ${num(Number(l.rating_avg).toFixed(1))} (${num(l.rating_count)})` : '';
    return h('details', { class: 'acc-item card', dataset: { lawyer: l.id } },
      h('summary', { class: 'acc-summary' }, h('span', { class: 'stack-tight' }, h('span', { class: 'sec-heading' }, l.full_name), h('span', { class: 'muted small' }, `${districtName(l.district)} · ${l.bar_association}${ratingLine ? ` · ${ratingLine}` : ''}`)), icon('down', 'acc-chevron')),
      body);
  }

  function paintResults() {
    clear(results);
    bodies.clear();
    const shown = sortLawyers(filterLawyers(all, filters), getLang());
    if (!all.length) return void results.appendChild(emptyState({ iconName: 'info', title: t('lawyers.none'), body: t('lawyers.noneHint') }));
    results.appendChild(h('p', { class: 'muted small', 'aria-live': 'polite', dataset: { id: 'lawyer-count' } }, t('lawyers.count', { n: num(shown.length) })));
    if (!shown.length) return void results.appendChild(emptyState({ iconName: 'search', title: t('lawyers.noMatch') }));
    shown.forEach((l) => results.appendChild(card(l)));
  }

  function openReport(l) {
    if (!auth.signedIn) {
      navigate(`/login?next=${here}`);
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

  Promise.all([listVerified(), refreshMine()]).then(([{ data, error }]) => {
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
