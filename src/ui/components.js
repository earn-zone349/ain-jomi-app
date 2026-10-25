// Reusable UI building blocks. All return DOM nodes built with h().

import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/index.js';

/** button('Save', { variant:'primary', icon:'check', onClick, type:'submit', block:true }) */
export function button(label, { variant = 'secondary', icon: iconName, onClick, type = 'button', block = false, disabled = false, ariaLabel } = {}) {
  return h(
    'button',
    {
      type,
      class: `btn btn-${variant}${block ? ' btn-block' : ''}`,
      onclick: onClick,
      disabled,
      'aria-label': ariaLabel,
    },
    iconName ? icon(iconName) : null,
    label ? h('span', null, label) : null,
  );
}

/** Set a button into a busy state and back. */
export function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle('is-busy', busy);
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
}

/**
 * Labelled input with an inline error slot.
 * Returns { el, input, setError(msg|null) }.
 */
export function field({ id, label, type = 'text', value = '', autocomplete, placeholder, hint, required = false, maxLength, inputMode }) {
  const errorId = `${id}-err`;
  const input = h('input', {
    id,
    name: id,
    type,
    value,
    autocomplete,
    placeholder,
    required,
    maxlength: maxLength,
    inputmode: inputMode,
    'aria-describedby': errorId,
    class: 'input',
    autocapitalize: type === 'email' ? 'none' : undefined,
    spellcheck: type === 'email' || type === 'password' ? 'false' : undefined,
  });
  const error = h('p', { id: errorId, class: 'field-error', role: 'alert', hidden: true });
  const el = h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input, hint ? h('p', { class: 'hint' }, hint) : null, error);
  return {
    el,
    input,
    setError(msg) {
      error.textContent = msg || '';
      error.hidden = !msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    },
  };
}

export function textareaField({ id, label, value = '', placeholder, hint, maxLength, rows = 4 }) {
  const errorId = `${id}-err`;
  const input = h('textarea', { id, name: id, rows, maxlength: maxLength, placeholder, 'aria-describedby': errorId, class: 'input textarea' }, value);
  const error = h('p', { id: errorId, class: 'field-error', role: 'alert', hidden: true });
  const el = h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input, hint ? h('p', { class: 'hint' }, hint) : null, error);
  return {
    el,
    input,
    setError(msg) {
      error.textContent = msg || '';
      error.hidden = !msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    },
  };
}

export function spinner() {
  return h('span', { class: 'spinner', role: 'status', 'aria-label': t('common.loading') });
}

export function loadingBlock(text) {
  return h('div', { class: 'state state-loading' }, spinner(), h('p', null, text || t('common.loading')));
}

export function emptyState({ iconName = 'info', title, body, action } = {}) {
  return h(
    'div',
    { class: 'state' },
    h('div', { class: 'state-icon' }, icon(iconName)),
    title ? h('h2', { class: 'state-title' }, title) : null,
    body ? h('p', { class: 'state-body' }, body) : null,
    action || null,
  );
}

export function badge(text, tone = 'neutral') {
  return h('span', { class: `badge badge-${tone}` }, text);
}

export function banner(text, { tone = 'info', iconName = 'info', action } = {}) {
  return h('div', { class: `banner banner-${tone}`, role: tone === 'warning' || tone === 'error' ? 'alert' : 'note' }, icon(iconName), h('p', null, text), action || null);
}

/** A tappable row / card. Renders <a> when href is given, otherwise <button>. */
export function listRow({ iconName, title, subtitle, onClick, href, trailing, disabled = false }) {
  const content = [
    iconName ? h('span', { class: 'row-icon' }, icon(iconName)) : null,
    h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, title), subtitle ? h('span', { class: 'row-sub' }, subtitle) : null),
    trailing === undefined ? (onClick || href ? icon('next', 'row-chevron') : null) : trailing,
  ];
  if (href) return h('a', { class: 'row', href }, content);
  return h('button', { type: 'button', class: 'row', onclick: onClick, disabled }, content);
}

export function sectionTitle(text, right) {
  return h('div', { class: 'section-title' }, h('h2', null, text), right || null);
}

/** Open only http(s) links; anything else renders as plain text. */
export function externalLink(href, label) {
  const safe = typeof href === 'string' && /^https?:\/\//i.test(href);
  if (!safe) return h('span', null, label || '');
  return h('a', { class: 'link', href, target: '_blank', rel: 'noopener noreferrer' }, label || href, icon('external', 'icon-inline'));
}

/** Segmented single-choice control. options: [{value,label}]; onChange(value). */
export function segmented({ name, options, value, onChange, ariaLabel }) {
  const root = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': ariaLabel });
  const buttons = options.map((o) => {
    const b = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'seg',
        'aria-checked': o.value === value ? 'true' : 'false',
        dataset: { value: o.value },
        onclick: () => {
          buttons.forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
          onChange(o.value);
        },
      },
      o.label,
    );
    return b;
  });
  buttons.forEach((b) => root.appendChild(b));
  root.dataset.name = name;
  return root;
}
