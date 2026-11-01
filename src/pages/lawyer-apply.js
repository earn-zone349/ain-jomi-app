// One page for an advocate: create the account (if needed), give every detail, add the certificate files, send.
// An admin checks the enrolment and certificates by hand before anything becomes public. Editing a verified listing
// sends it back for a new check. The form asks only for facts: there is no free-text "about me" or promotion.

import { h, clear } from '../ui/dom.js';
import { banner, button, emptyState, field, textareaField, loadingBlock, badge, setBusy } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { t, getLang, formatDate, num } from '../i18n/index.js';
import { getAuth, signUp } from '../core/auth.js';
import { getCategories, getSetting } from '../core/content.js';
import { errorCode } from '../core/supabase.js';
import { getJSON, setJSON, remove as removeKey } from '../core/storage.js';
import { getMine, saveMine, withdrawMine, uploadCertificate, removeCertificates } from '../core/lawyers.js';
import { validateApplication, certificateProblem } from '../lib/lawyers-core.js';
import { DIVISIONS, DISTRICTS, COURTS, LIMITS, CERT_TYPES } from '../lib/lawyers-options.js';
import { isValidEmail, passwordProblem } from '../lib/text.js';
import { logError } from '../core/logger.js';

const L = (o) => (getLang() === 'bn' ? o.bn || o.en : o.en || o.bn);
const TONE = { pending: 'warning', verified: 'success', rejected: 'danger', suspended: 'danger' };
const DRAFT_KEY = 'lawyer-draft';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function render({ navigate }) {
  const root = h('div', { class: 'page' });
  if ((getSetting('feature_flags', {}) || {}).lawyers !== true) {
    root.appendChild(emptyState({ iconName: 'info', title: t('lawyers.notOpen'), body: t('lawyers.notOpenHint') }));
    return { el: root, title: t('lawyers.applyTitle') };
  }

  const cats = getCategories().map((c) => ({ slug: c.slug || c.id, label: getLang() === 'bn' ? c.name_bn || c.name_en : c.name_en || c.name_bn }));
  const startAuth = getAuth();

  if (startAuth.signedIn) {
    root.appendChild(loadingBlock(t('lawyers.loading')));
    getMine(startAuth.user.id).then(({ data, error }) => {
      if (error) {
        logError(error, { where: 'lawyer.getMine' });
        clear(root);
        root.appendChild(emptyState({ iconName: 'alert', title: errorCode(error) === 'offline' ? t('error.offline') : t('lawyers.loadFailed') }));
        return;
      }
      paint(data, null);
    });
  } else {
    const draft = getJSON(DRAFT_KEY, null);
    paint(null, draft && typeof draft === 'object' ? draft : null);
  }

  function paint(mine, draft) {
    clear(root);
    root.appendChild(banner(t('lawyers.applyIntro'), { tone: 'info', iconName: 'info' }));
    if (draft) root.appendChild(banner(t('lawyers.acct.draft'), { tone: 'info', iconName: 'info' }));
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

    const v = mine || draft || {};
    const txt = (x) => (x === null || x === undefined ? '' : String(x));
    const f = {
      full_name: field({ id: 'ap-name', label: t('lawyers.f.name'), value: txt(v.full_name), maxLength: LIMITS.name[1], autocomplete: 'name' }),
      enrollment_no: field({ id: 'ap-enrol', label: t('lawyers.f.enrolment'), value: txt(v.enrollment_no), maxLength: LIMITS.enrollmentNo[1], hint: t('lawyers.f.enrolmentHint') }),
      enrollment_year: field({ id: 'ap-year', label: t('lawyers.f.year'), value: txt(v.enrollment_year), maxLength: 4, inputMode: 'numeric' }),
      bar_association: field({ id: 'ap-bar', label: t('lawyers.f.bar'), value: txt(v.bar_association), maxLength: LIMITS.bar[1], hint: t('lawyers.f.barHint') }),
      office_address: field({ id: 'ap-address', label: t('lawyers.f.address'), value: txt(v.office_address), maxLength: LIMITS.address[1], autocomplete: 'street-address' }),
      phone: field({ id: 'ap-phone', label: t('lawyers.f.phone'), value: txt(v.phone), maxLength: 20, inputMode: 'tel', autocomplete: 'tel' }),
      email: field({ id: 'ap-email', label: t('lawyers.f.email'), value: txt(v.email), type: 'email', maxLength: LIMITS.email, autocomplete: 'email' }),
      qualifications: field({ id: 'ap-qual', label: t('lawyers.f.qualifications'), value: txt(v.qualifications), maxLength: LIMITS.qualifications, hint: t('lawyers.f.qualificationsHint') }),
      education: textareaField({ id: 'ap-edu', label: t('lawyers.f.education'), value: txt(v.education), maxLength: LIMITS.education, rows: 3, hint: t('lawyers.f.educationHint') }),
      practising_since: field({ id: 'ap-since', label: t('lawyers.f.since'), value: txt(v.practising_since), maxLength: 4, inputMode: 'numeric' }),
      cases_handled: field({ id: 'ap-handled', label: t('lawyers.f.casesHandled'), value: txt(v.cases_handled), maxLength: 7, inputMode: 'numeric', hint: t('lawyers.f.casesHint') }),
      cases_won: field({ id: 'ap-won', label: t('lawyers.f.casesWon'), value: txt(v.cases_won), maxLength: 7, inputMode: 'numeric' }),
      achievements: textareaField({ id: 'ap-ach', label: t('lawyers.f.achievements'), value: txt(v.achievements), maxLength: LIMITS.achievements, rows: 3 }),
    };
    const errKey = { full_name: 'full_name', enrollment_no: 'enrollment_no', enrollment_year: 'enrollment_year', bar_association: 'bar_association', office_address: 'office_address', phone: 'phone', email: 'email', qualifications: 'qualifications', education: 'education', practising_since: 'practising_since', cases_handled: 'cases_handled', cases_won: 'cases_won', achievements: 'achievements' };

    // ---- account fields (only when not signed in) ----
    const acct = startAuth.signedIn ? null : {
      email: field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email', inputMode: 'email', required: true, value: txt(v.account_email) }),
      password: field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'new-password', required: true, hint: t('auth.passwordHint') }),
      confirm: field({ id: 'confirm', label: t('auth.confirmPassword'), type: 'password', autocomplete: 'new-password', required: true }),
    };

    // ---- selects and checkboxes ----
    const district = h('select', { class: 'input', id: 'ap-district', 'aria-label': t('lawyers.f.district') }, [h('option', { value: '' }, t('lawyers.f.pickDistrict')), ...DIVISIONS.map((dv) => h('optgroup', { label: L(dv) }, DISTRICTS.filter((d) => d.division === dv.id).map((d) => h('option', { value: d.id }, L(d)))))]);
    district.value = v.district || '';
    const districtErr = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const checks = (name, items, selected) => items.map((i) => h('label', { class: 'check-row' }, h('input', { type: 'checkbox', name, value: i.id, checked: (selected || []).includes(i.id) }), h('span', null, i.label)));
    const courtsBox = h('div', { class: 'stack', dataset: { id: 'courts' } }, checks('court', COURTS.map((c) => ({ id: c.id, label: L(c) })), v.courts));
    const areasBox = h('div', { class: 'stack', dataset: { id: 'areas' } }, checks('area', cats.map((c) => ({ id: c.slug, label: c.label })), v.practice_areas));
    const courtsErr = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const areasErr = h('p', { class: 'field-error', role: 'alert', hidden: true });

    // ---- certificates: kept (already uploaded) + new (uploaded on submit) ----
    let kept = [...(mine?.certificate_paths || [])];
    const added = []; // File objects
    const removedPaths = [];
    const certList = h('div', { class: 'stack', dataset: { id: 'certs' } });
    const certErr = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const fileInput = h('input', { type: 'file', accept: Object.keys(CERT_TYPES).join(','), hidden: true, dataset: { id: 'cert-input' } });
    const paintCerts = () => {
      clear(certList);
      kept.forEach((p, i) => certList.appendChild(h('div', { class: 'row-between' }, h('span', null, `${t('lawyers.certFile', { n: num(i + 1) })} · ${t('lawyers.f.certSaved')}`), button(t('lawyers.f.certRemove'), { variant: 'ghost', onClick: () => { removedPaths.push(p); kept = kept.filter((x) => x !== p); paintCerts(); } }))));
      added.forEach((file, i) => certList.appendChild(h('div', { class: 'row-between' }, h('span', null, `${file.name} · ${t('lawyers.f.certNew')}`), button(t('lawyers.f.certRemove'), { variant: 'ghost', onClick: () => { added.splice(i, 1); paintCerts(); } }))));
    };
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      certErr.hidden = true;
      if (!file) return;
      if (kept.length + added.length >= LIMITS.certificates) { certErr.textContent = t('lawyers.err.tooMany'); certErr.hidden = false; return; }
      const problem = certificateProblem(file);
      if (problem) { certErr.textContent = t(`lawyers.err.cert${problem[0].toUpperCase()}${problem.slice(1)}`); certErr.hidden = false; return; }
      added.push(file);
      paintCerts();
    });
    paintCerts();

    const consent = h('input', { type: 'checkbox', id: 'ap-consent', checked: Boolean(v.consent_public) });
    const consentErr = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const formError = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
    const submit = button(mine ? t('lawyers.save') : t('lawyers.submit'), { variant: 'primary', block: true, type: 'submit' });
    const holder = h('div');

    const form = h('form', { class: 'stack', novalidate: true, dataset: { id: 'apply-form' } },
      acct ? h('div', { class: 'card stack' },
        h('h3', { class: 'section-title' }, t('lawyers.acct.title')),
        h('p', { class: 'muted small' }, t('lawyers.acct.hint')),
        acct.email.el, acct.password.el, acct.confirm.el,
        h('p', { class: 'center' }, t('lawyers.acct.have'), ' ', h('a', { class: 'link', href: `#/login?next=${encodeURIComponent('/tools/lawyers/apply')}` }, t('auth.login')))) : null,
      f.full_name.el, f.enrollment_no.el, f.enrollment_year.el, f.bar_association.el,
      h('div', { class: 'field' }, h('span', { class: 'label' }, t('lawyers.f.courts')), courtsBox, courtsErr),
      h('div', { class: 'field' }, h('span', { class: 'label' }, t('lawyers.f.areas')), h('p', { class: 'hint' }, t('lawyers.f.areasHint', { n: LIMITS.areas })), areasBox, areasErr),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'ap-district' }, t('lawyers.f.district')), district, districtErr),
      f.office_address.el, f.phone.el, f.email.el, f.qualifications.el, f.education.el, f.practising_since.el, f.cases_handled.el, f.cases_won.el, f.achievements.el,
      h('div', { class: 'field' },
        h('span', { class: 'label' }, t('lawyers.f.certs')),
        h('p', { class: 'hint' }, t('lawyers.f.certsHint')),
        certList, fileInput,
        button(t('lawyers.f.certAdd'), { variant: 'secondary', onClick: () => fileInput.click() }),
        certErr),
      banner(t('lawyers.consentNote'), { tone: 'info', iconName: 'info' }),
      h('label', { class: 'check-row' }, consent, h('span', null, t('lawyers.f.consent'))),
      consentErr,
      mine && mine.status === 'verified' ? banner(t('lawyers.editWarning'), { tone: 'warning', iconName: 'alert' }) : null,
      formError,
      submit,
    );

    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
    const show = (el, code) => { el.textContent = code ? t(`lawyers.err.${code}`) : ''; el.hidden = !code; };
    const readText = () => ({
      full_name: f.full_name.input.value, enrollment_no: f.enrollment_no.input.value, enrollment_year: f.enrollment_year.input.value,
      bar_association: f.bar_association.input.value, courts: checked('court'), practice_areas: checked('area'), district: district.value,
      office_address: f.office_address.input.value, phone: f.phone.input.value, email: f.email.input.value, qualifications: f.qualifications.input.value,
      education: f.education.input.value, practising_since: f.practising_since.input.value, cases_handled: f.cases_handled.input.value,
      cases_won: f.cases_won.input.value, achievements: f.achievements.input.value, consent_public: consent.checked,
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.hidden = true;
      const text = readText();
      const r = validateApplication({ ...text, certificate_paths: [...kept, ...added.map((_, i) => `new-${i}`)] }, new Set(cats.map((c) => c.slug)));
      for (const k of Object.keys(errKey)) f[k].setError(r.errors[k] ? t(`lawyers.err.${r.errors[k]}`) : null);
      show(courtsErr, r.errors.courts);
      show(areasErr, r.errors.practice_areas);
      show(districtErr, r.errors.district);
      show(consentErr, r.errors.consent_public);
      show(certErr, r.errors.certificate_paths);
      let accountBad = false;
      if (acct) {
        [acct.email, acct.password, acct.confirm].forEach((x) => x.setError(null));
        if (!isValidEmail(acct.email.input.value)) { acct.email.setError(t('auth.err.email')); accountBad = true; }
        const pw = passwordProblem(acct.password.input.value);
        if (pw) { acct.password.setError(t(pw)); accountBad = true; }
        if (acct.confirm.input.value !== acct.password.input.value) { acct.confirm.setError(t('auth.err.pwMismatch')); accountBad = true; }
      }
      if (!r.ok || accountBad) {
        form.querySelector('[aria-invalid="true"], .field-error:not([hidden])')?.scrollIntoView?.({ block: 'center' });
        return;
      }

      setBusy(submit, true);
      const fail = (msg) => { setBusy(submit, false); formError.textContent = msg; formError.hidden = false; };

      // 1. account, when the advocate is not signed in yet
      let auth = getAuth();
      if (!auth.signedIn) {
        const res = await signUp(acct.email.input.value, acct.password.input.value, r.clean.full_name);
        if (!res.ok) {
          const code = errorCode(res.error);
          if (code === 'unknown') logError(res.error, { where: 'lawyer.signUp' });
          return fail(code === 'offline' ? t('error.offline') : code === 'emailTaken' ? t('auth.err.emailTaken') : t('error.generic'));
        }
        if (res.needsConfirmation) {
          // No session yet, so nothing can be uploaded. Keep the typed details (not the files) for after login.
          setJSON(DRAFT_KEY, { ...text, account_email: acct.email.input.value.trim() });
          setBusy(submit, false);
          form.hidden = true;
          holder.replaceChildren(banner(t('lawyers.acct.pending'), { tone: 'success', iconName: 'mail' }));
          return;
        }
        for (let i = 0; i < 20 && !getAuth().signedIn; i += 1) await sleep(100);
        auth = getAuth();
        if (!auth.signedIn) return fail(t('error.generic'));
      }

      // 2. certificate files
      const uploaded = [];
      for (const file of added) {
        const up = await uploadCertificate(auth.user.id, file);
        if (up.error) {
          logError(up.error, { where: 'lawyer.upload' });
          await removeCertificates(uploaded);
          return fail(errorCode(up.error) === 'offline' ? t('error.offline') : t('lawyers.uploadFailed'));
        }
        uploaded.push(up.path);
      }
      const clean = { ...r.clean, certificate_paths: [...kept, ...uploaded] };

      // 3. the application itself
      const { error } = await saveMine(mine, clean);
      if (error) {
        logError(error, { where: 'lawyer.save' });
        await removeCertificates(uploaded);
        const code = errorCode(error);
        return fail(code === 'offline' ? t('error.offline') : String(error.code) === '23505' ? t('lawyers.err.duplicate') : t('error.generic'));
      }
      if (removedPaths.length) await removeCertificates(removedPaths);
      removeKey(DRAFT_KEY);
      setBusy(submit, false);
      toast(t('lawyers.saved'), { tone: 'success' });
      const again = await getMine(auth.user.id);
      paint(again.data || null, null);
      window.scrollTo?.(0, 0);
    });

    root.append(holder, form);

    if (mine) {
      root.appendChild(
        button(t('lawyers.withdraw'), {
          variant: 'ghost',
          onClick: async () => {
            const ok = await confirmDialog({ title: t('lawyers.withdraw'), message: t('lawyers.withdrawConfirm'), confirmLabel: t('lawyers.withdraw'), danger: true });
            if (!ok) return;
            const { error } = await withdrawMine(mine.id, mine.certificate_paths || []);
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
