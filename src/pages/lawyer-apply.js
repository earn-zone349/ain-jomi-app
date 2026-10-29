// A lawyer applies to be listed (or edits / withdraws their application). An admin checks the Bar Council enrolment by hand
// before anything becomes public. The form asks only for conventional listing details: there is no free-text "about me".

import { h, clear } from '../ui/dom.js';
import { banner, button, emptyState, field, loadingBlock, badge, setBusy } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { t, getLang, formatDate } from '../i18n/index.js';
import { getAuth } from '../core/auth.js';
import { getCategories, getSetting } from '../core/content.js';
import { errorCode } from '../core/supabase.js';
import { getMine, saveMine, withdrawMine } from '../core/lawyers.js';
import { validateApplication } from '../lib/lawyers-core.js';
import { DIVISIONS, DISTRICTS, COURTS, LIMITS } from '../lib/lawyers-options.js';
import { logError } from '../core/logger.js';

const L = (o) => (getLang() === 'bn' ? o.bn || o.en : o.en || o.bn);
const TONE = { pending: 'warning', verified: 'success', rejected: 'danger', suspended: 'danger' };

export default function render({ navigate }) {
  const root = h('div', { class: 'page' });
  if ((getSetting('feature_flags', {}) || {}).lawyers !== true) {
    root.appendChild(emptyState({ iconName: 'info', title: t('lawyers.notOpen'), body: t('lawyers.notOpenHint') }));
    return { el: root, title: t('lawyers.applyTitle') };
  }
  const auth = getAuth();
  if (!auth.signedIn) {
    root.appendChild(
      emptyState({
        iconName: 'lock',
        title: t('lawyers.applyLogin'),
        body: t('lawyers.applyLoginHint'),
        action: button(t('auth.login'), { variant: 'primary', onClick: () => navigate(`/login?next=${encodeURIComponent('/tools/lawyers/apply')}`) }),
      }),
    );
    return { el: root, title: t('lawyers.applyTitle') };
  }

  root.appendChild(loadingBlock(t('lawyers.loading')));
  const cats = getCategories().map((c) => ({ slug: c.slug || c.id, label: getLang() === 'bn' ? c.name_bn || c.name_en : c.name_en || c.name_bn }));

  getMine(auth.user.id).then(({ data, error }) => {
    if (error) {
      logError(error, { where: 'lawyer.getMine' });
      clear(root);
      root.appendChild(emptyState({ iconName: 'alert', title: errorCode(error) === 'offline' ? t('error.offline') : t('lawyers.loadFailed') }));
      return;
    }
    paint(data);
  });

  function paint(mine) {
    clear(root);
    root.appendChild(banner(t('lawyers.applyIntro'), { tone: 'info', iconName: 'info' }));
    if (mine) {
      root.appendChild(
        h('div', { class: 'card stack', dataset: { id: 'apply-status' } },
          h('p', null, h('strong', null, `${t('lawyers.statusIs')} `), badge(t(`lawyers.status.${mine.status}`), TONE[mine.status] || 'neutral')),
          h('p', { class: 'muted small' }, t(`lawyers.status.${mine.status}.hint`)),
          mine.review_note ? banner(`${t('lawyers.reviewNote')}: ${mine.review_note}`, { tone: 'warning', iconName: 'alert' }) : null,
          mine.verified_at ? h('p', { class: 'fineprint' }, t('lawyers.verifiedOn', { date: formatDate(mine.verified_at) })) : null,
        ),
      );
    }

    const v = mine || {};
    const f = {
      full_name: field({ id: 'ap-name', label: t('lawyers.f.name'), value: v.full_name || '', maxLength: LIMITS.name[1], autocomplete: 'name' }),
      enrollment_no: field({ id: 'ap-enrol', label: t('lawyers.f.enrolment'), value: v.enrollment_no || '', maxLength: LIMITS.enrollmentNo[1], hint: t('lawyers.f.enrolmentHint') }),
      enrollment_year: field({ id: 'ap-year', label: t('lawyers.f.year'), value: v.enrollment_year ? String(v.enrollment_year) : '', maxLength: 4, inputMode: 'numeric' }),
      bar_association: field({ id: 'ap-bar', label: t('lawyers.f.bar'), value: v.bar_association || '', maxLength: LIMITS.bar[1], hint: t('lawyers.f.barHint') }),
      office_address: field({ id: 'ap-address', label: t('lawyers.f.address'), value: v.office_address || '', maxLength: LIMITS.address[1], autocomplete: 'street-address' }),
      phone: field({ id: 'ap-phone', label: t('lawyers.f.phone'), value: v.phone || '', maxLength: 20, inputMode: 'tel', autocomplete: 'tel' }),
      email: field({ id: 'ap-email', label: t('lawyers.f.email'), value: v.email || '', type: 'email', maxLength: LIMITS.email, autocomplete: 'email' }),
      qualifications: field({ id: 'ap-qual', label: t('lawyers.f.qualifications'), value: v.qualifications || '', maxLength: LIMITS.qualifications, hint: t('lawyers.f.qualificationsHint') }),
    };

    const district = h('select', { class: 'input', id: 'ap-district', 'aria-label': t('lawyers.f.district') }, [h('option', { value: '' }, t('lawyers.f.pickDistrict')), ...DIVISIONS.map((dv) => h('optgroup', { label: L(dv) }, DISTRICTS.filter((d) => d.division === dv.id).map((d) => h('option', { value: d.id }, L(d)))))]);
    district.value = v.district || '';
    const districtErr = h('p', { class: 'field-error', role: 'alert', hidden: true });

    const checks = (name, items, selected) => items.map((i) => h('label', { class: 'check-row' }, h('input', { type: 'checkbox', name, value: i.id, checked: selected.includes(i.id) }), h('span', null, i.label)));
    const courtsBox = h('div', { class: 'stack', dataset: { id: 'courts' } }, checks('court', COURTS.map((c) => ({ id: c.id, label: L(c) })), v.courts || []));
    const areasBox = h('div', { class: 'stack', dataset: { id: 'areas' } }, checks('area', cats.map((c) => ({ id: c.slug, label: c.label })), v.practice_areas || []));
    const courtsErr = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const areasErr = h('p', { class: 'field-error', role: 'alert', hidden: true });

    const consent = h('input', { type: 'checkbox', id: 'ap-consent', checked: Boolean(v.consent_public) });
    const consentErr = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const submit = button(mine ? t('lawyers.save') : t('lawyers.submit'), { variant: 'primary', block: true, type: 'submit' });

    const form = h('form', { class: 'stack', novalidate: true, dataset: { id: 'apply-form' } },
      f.full_name.el, f.enrollment_no.el, f.enrollment_year.el, f.bar_association.el,
      h('div', { class: 'field' }, h('span', { class: 'label' }, t('lawyers.f.courts')), courtsBox, courtsErr),
      h('div', { class: 'field' }, h('span', { class: 'label' }, t('lawyers.f.areas')), h('p', { class: 'hint' }, t('lawyers.f.areasHint', { n: LIMITS.areas })), areasBox, areasErr),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'ap-district' }, t('lawyers.f.district')), district, districtErr),
      f.office_address.el, f.phone.el, f.email.el, f.qualifications.el,
      banner(t('lawyers.consentNote'), { tone: 'info', iconName: 'info' }),
      h('label', { class: 'check-row' }, consent, h('span', null, t('lawyers.f.consent'))),
      consentErr,
      mine && mine.status === 'verified' ? banner(t('lawyers.editWarning'), { tone: 'warning', iconName: 'alert' }) : null,
      submit,
    );

    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
    const show = (el, code) => { el.textContent = code ? t(`lawyers.err.${code}`) : ''; el.hidden = !code; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = validateApplication({
        full_name: f.full_name.input.value, enrollment_no: f.enrollment_no.input.value, enrollment_year: f.enrollment_year.input.value,
        bar_association: f.bar_association.input.value, courts: checked('court'), practice_areas: checked('area'), district: district.value,
        office_address: f.office_address.input.value, phone: f.phone.input.value, email: f.email.input.value, qualifications: f.qualifications.input.value,
        consent_public: consent.checked,
      }, new Set(cats.map((c) => c.slug)));
      for (const k of Object.keys(f)) f[k].setError(r.errors[k] ? t(`lawyers.err.${r.errors[k]}`) : null);
      show(courtsErr, r.errors.courts);
      show(areasErr, r.errors.practice_areas);
      show(districtErr, r.errors.district);
      show(consentErr, r.errors.consent_public);
      if (!r.ok) {
        form.querySelector('[aria-invalid="true"], .field-error:not([hidden])')?.scrollIntoView?.({ block: 'center' });
        return;
      }
      setBusy(submit, true);
      const { error } = await saveMine(mine, r.clean);
      setBusy(submit, false);
      if (error) {
        logError(error, { where: 'lawyer.save' });
        const code = errorCode(error);
        toast(code === 'offline' ? t('error.offline') : String(error.code) === '23505' ? t('lawyers.err.duplicate') : t('error.generic'), { tone: 'error' });
        return;
      }
      toast(t('lawyers.saved'), { tone: 'success' });
      const again = await getMine(auth.user.id);
      paint(again.data || null);
      window.scrollTo?.(0, 0);
    });

    root.appendChild(form);

    if (mine) {
      root.appendChild(
        button(t('lawyers.withdraw'), {
          variant: 'ghost',
          onClick: async () => {
            const ok = await confirmDialog({ title: t('lawyers.withdraw'), message: t('lawyers.withdrawConfirm'), confirmLabel: t('lawyers.withdraw'), danger: true });
            if (!ok) return;
            const { error } = await withdrawMine(mine.id);
            if (error) {
              logError(error, { where: 'lawyer.withdraw' });
              toast(t('error.generic'), { tone: 'error' });
              return;
            }
            toast(t('lawyers.withdrawn'), { tone: 'success' });
            navigate('/tools/lawyers', { replace: true });
          },
        }),
      );
    }
  }

  return { el: root, title: t('lawyers.applyTitle') };
}
