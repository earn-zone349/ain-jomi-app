import { h } from '../ui/dom.js';
import { button, field, setBusy, banner } from '../ui/components.js';
import { t } from '../i18n/index.js';
import { signUp } from '../core/auth.js';
import { errorCode } from '../core/supabase.js';
import { logError } from '../core/logger.js';
import { isValidEmail, passwordProblem } from '../lib/text.js';
import { authFrame, authErrorText, safeNext } from './auth-shared.js';
import { toast } from '../ui/toast.js';

export default function render({ navigate, query }) {
  const next = safeNext(query.next);
  const name = field({ id: 'name', label: t('auth.name'), autocomplete: 'name', maxLength: 120, hint: t('auth.nameOptional') });
  const email = field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email', inputMode: 'email', required: true });
  const password = field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'new-password', required: true, hint: t('auth.passwordHint') });
  const confirm = field({ id: 'confirm', label: t('auth.confirmPassword'), type: 'password', autocomplete: 'new-password', required: true });
  const formError = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const submit = button(t('auth.register'), { variant: 'primary', type: 'submit', block: true });
  const holder = h('div');

  const form = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        formError.hidden = true;
        [email, password, confirm].forEach((f) => f.setError(null));
        let bad = false;
        if (!isValidEmail(email.input.value)) {
          email.setError(t('auth.err.email'));
          bad = true;
        }
        const pwProblem = passwordProblem(password.input.value);
        if (pwProblem) {
          password.setError(t(pwProblem));
          bad = true;
        }
        if (confirm.input.value !== password.input.value) {
          confirm.setError(t('auth.err.pwMismatch'));
          bad = true;
        }
        if (bad) return;
        setBusy(submit, true);
        const res = await signUp(email.input.value, password.input.value, name.input.value);
        setBusy(submit, false);
        if (!res.ok) {
          const code = errorCode(res.error);
          if (code === 'unknown') logError(res.error, { where: 'signUp' });
          formError.textContent = authErrorText(code);
          formError.hidden = false;
          return;
        }
        if (res.needsConfirmation) {
          holder.replaceChildren(banner(t('auth.checkEmail'), { tone: 'success', iconName: 'mail' }));
          form.hidden = true;
          return;
        }
        toast(t('auth.accountCreated'), { tone: 'success' });
        navigate(next, { replace: true });
      },
    },
    name.el,
    email.el,
    password.el,
    confirm.el,
    formError,
    submit,
    h('p', { class: 'fineprint center' }, t('auth.agreePrefix'), ' ', h('a', { class: 'link', href: '#/legal/terms' }, t('legal.terms')), ' · ', h('a', { class: 'link', href: '#/legal/privacy' }, t('legal.privacy'))),
  );

  const el = authFrame(
    t('auth.register'),
    holder,
    form,
    h('p', { class: 'center' }, t('auth.haveAccount'), ' ', h('a', { class: 'link', href: `#/login?next=${encodeURIComponent(next)}` }, t('auth.login'))),
  );
  return { el, title: t('auth.register') };
}
