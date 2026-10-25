// Accessible modal dialog + confirm helper. Dialogs form a stack so the Android back
// button can close the top one (see closeTopDialog).

import { h } from './dom.js';
import { t } from '../i18n/index.js';

const stack = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * openDialog({ title, body, actions, dismissible })
 * actions: [{ label, variant, onClick(close) }]  (onClick may return false to keep the dialog open)
 */
export function openDialog({ title, body, actions = [], dismissible = true, onClose }) {
  const previouslyFocused = document.activeElement;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    const i = stack.findIndex((d) => d.close === close);
    if (i >= 0) stack.splice(i, 1);
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    if (onClose) onClose();
  };

  const footer = h(
    'div',
    { class: 'dialog-actions' },
    actions.map((a) =>
      h(
        'button',
        {
          type: 'button',
          class: `btn btn-${a.variant || 'secondary'}`,
          onclick: async () => {
            const res = a.onClick ? await a.onClick(close) : undefined;
            if (res !== false) close();
          },
        },
        a.label,
      ),
    ),
  );

  const panel = h(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('h2', { id: titleId, class: 'dialog-title' }, title),
    h('div', { class: 'dialog-body' }, body),
    actions.length ? footer : null,
  );

  const overlay = h(
    'div',
    {
      class: 'overlay',
      onclick: (e) => {
        if (dismissible && e.target === overlay) close();
      },
    },
    panel,
  );

  function onKey(e) {
    if (stack[stack.length - 1]?.close !== close) return;
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  stack.push({ close, dismissible });
  const first = panel.querySelector('input, textarea, select') || panel.querySelector('.dialog-actions .btn');
  if (first) first.focus();
  return { close, panel };
}

/** Resolves true if the user confirms. */
export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    openDialog({
      title,
      onClose: () => resolve(false), // dismissed via Escape / backdrop / back button (no-op if already resolved)
      body: h('p', { class: 'dialog-text' }, message),
      actions: [
        { label: cancelLabel || t('common.cancel'), variant: 'ghost', onClick: () => resolve(false) },
        { label: confirmLabel || t('common.ok'), variant: danger ? 'danger' : 'primary', onClick: () => resolve(true) },
      ],
    });
  });
}

/** Called by the Android back button. Returns true if a dialog was closed. */
export function closeTopDialog() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.dismissible) top.close();
  return true;
}

export function hasOpenDialog() {
  return stack.length > 0;
}
