import { h } from '../ui/dom.js';
import { button, field, setBusy } from '../ui/components.js';
import { t } from '../i18n/index.js';
import { signIn, setGuestChosen } from '../core/auth.js';
import { errorCode } from '../core/supabase.js';
import { logError } from '../core/logger.js';
import { isValidEmail } from '../lib/text.js';
import { authFrame, authErrorText, safeNext } from './auth-shared.js';
import { toast } from '../ui/toast.js';

export default function render({ navigate, query }) {
  const next = safeNext(query.next);
  const email = field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email', inputMode: 'email', required: true });
  const password = field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'current-password', required: true });
  const formError = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const submit = button(t('auth.login'), { variant: 'primary', type: 'submit', block: true });

  const form = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        formError.hidden = true;
        email.setError(null);
        password.setError(null);
        let bad = false;
        if (!isValidEmail(email.input.value)) {
          email.setError(t('auth.err.email'));
          bad = true;
        }
        if (!password.input.value) {
          password.setError(t('auth.err.required'));
          bad = true;
        }
        if (bad) return;
        setBusy(submit, true);
        const res = await signIn(email.input.value, password.input.value);
        setBusy(submit, false);
        if (!res.ok) {
          const code = errorCode(res.error);
          if (code === 'unknown') logError(res.error, { where: 'signIn' });
          formError.textContent = authErrorText(code);
          formError.hidden = false;
          return;
        }
        toast(t('auth.welcomeBack'), { tone: 'success' });
        navigate(next, { replace: true });
      },
    },
    email.el,
    password.el,
    formError,
    submit,
    h('p', { class: 'center small' }, h('a', { class: 'link', href: '#/forgot' }, t('auth.forgot'))),
  );

  const el = authFrame(
    t('auth.login'),
    form,
    h('p', { class: 'center' }, t('auth.noAccount'), ' ', h('a', { class: 'link', href: `#/register?next=${encodeURIComponent(next)}` }, t('auth.register'))),
    h('p', { class: 'center' }, h('a', { class: 'link', href: '#/', onclick: () => setGuestChosen(true) }, t('auth.continueGuest'))),
  );
  return { el, title: t('auth.login') };
}
