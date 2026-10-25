import { h } from '../ui/dom.js';
import { button, field, setBusy, banner } from '../ui/components.js';
import { t } from '../i18n/index.js';
import { requestPasswordReset } from '../core/auth.js';
import { errorCode } from '../core/supabase.js';
import { isValidEmail } from '../lib/text.js';
import { authFrame, authErrorText } from './auth-shared.js';

export default function render() {
  const email = field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email', inputMode: 'email', required: true });
  const formError = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const submit = button(t('auth.sendReset'), { variant: 'primary', type: 'submit', block: true });
  const holder = h('div');

  const form = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        formError.hidden = true;
        email.setError(null);
        if (!isValidEmail(email.input.value)) {
          email.setError(t('auth.err.email'));
          return;
        }
        setBusy(submit, true);
        const res = await requestPasswordReset(email.input.value);
        setBusy(submit, false);
        if (!res.ok) {
          formError.textContent = authErrorText(errorCode(res.error));
          formError.hidden = false;
          return;
        }
        // Same message whether or not the address exists (no account enumeration).
        holder.replaceChildren(banner(t('auth.resetSent'), { tone: 'success', iconName: 'mail' }));
        form.hidden = true;
      },
    },
    h('p', { class: 'muted' }, t('auth.forgotHint')),
    email.el,
    formError,
    submit,
  );

  const el = authFrame(t('auth.forgotTitle'), holder, form, h('p', { class: 'center' }, h('a', { class: 'link', href: '#/login' }, t('auth.backToLogin'))));
  return { el, title: t('auth.forgotTitle') };
}
