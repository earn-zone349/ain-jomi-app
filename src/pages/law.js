// A single law with its sections (accordion), source info, share and "report a problem".

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { badge, banner, emptyState, externalLink, button, textareaField } from '../ui/components.js';
import { openDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { renderParagraphs } from '../ui/richtext.js';
import { t, pick, isFallback, formatDate, num } from '../i18n/index.js';
import { getLaw, getSections, getCategory, subscribe, loadSections } from '../core/content.js';
import { getAuth } from '../core/auth.js';
import { supabase, errorCode } from '../core/supabase.js';
import { logError } from '../core/logger.js';
import { uuidFromString } from '../lib/text.js';

export default function render({ params, navigate }) {
  const root = h('div', { class: 'page' });
  const lawId = params.id;
  let sectionsState = 'loading'; // loading | ready | failed

  function paint() {
    root.replaceChildren();
    const law = getLaw(lawId);
    if (!law) {
      root.appendChild(
        emptyState({
          iconName: 'search',
          title: t('law.notFound'),
          body: t('law.notFoundHint'),
          action: button(t('nav.laws'), { variant: 'primary', onClick: () => navigate('/laws', { replace: true }) }),
        }),
      );
      return;
    }

    const category = getCategory(law.category_id);
    const meta = [law.act_number ? `${t('law.act')} ${law.act_number}` : null, law.year ? num(law.year) : null].filter(Boolean).join(' · ');

    root.appendChild(
      h(
        'section',
        { class: 'card law-head' },
        category ? h('p', { class: 'eyebrow' }, pick(category, 'name')) : null,
        h('h2', { class: 'law-title' }, pick(law, 'title')),
        meta ? h('p', { class: 'muted' }, meta) : null,
        law.law_status !== 'in_force' ? h('p', null, badge(t(`law.status.${law.law_status}`), law.law_status === 'repealed' ? 'danger' : 'warning')) : null,
        pick(law, 'summary') ? h('p', { class: 'law-summary' }, pick(law, 'summary')) : null,
        h(
          'dl',
          { class: 'facts' },
          law.last_verified_at ? factRow(t('law.verified'), formatDate(law.last_verified_at)) : null,
          law.source_url ? factRow(t('law.source'), externalLink(law.source_url, law.source_name || t('law.officialSource'))) : law.source_name ? factRow(t('law.source'), law.source_name) : null,
        ),
        h('div', { class: 'btn-row' }, button(t('common.share'), { icon: 'share', onClick: () => share(law) }), button(t('law.report'), { icon: 'flag', onClick: () => openReport({ type: 'law', id: law.id, title: pick(law, 'title'), navigate }) })),
      ),
    );

    if (law.law_status === 'repealed') root.appendChild(banner(t('law.repealedNote'), { tone: 'warning', iconName: 'alert' }));

    const sections = getSections(law.id);
    root.appendChild(h('h3', { class: 'h3' }, t('law.sections')));
    if (sectionsState === 'loading' && law.section_count) {
      root.appendChild(h('p', { class: 'muted' }, icon('refresh', 'icon-inline'), t('law.loading')));
    } else if (sectionsState === 'failed') {
      root.appendChild(banner(t('law.loadFailed'), { tone: 'warning', iconName: 'alert' }));
    } else if (!sections.length) {
      root.appendChild(h('p', { class: 'muted' }, t('law.noSections')));
    } else {
      root.appendChild(h('div', { class: 'accordion' }, sections.map((s, i) => sectionItem(s, law, navigate, i > 0 ? sections[i - 1] : null))));
    }

    root.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('law.disclaimerShort')));
  }

  paint();
  loadSections(lawId)
    .then(() => {
      sectionsState = 'ready';
      paint();
    })
    .catch((err) => {
      logError(err, { where: 'law.loadSections' });
      sectionsState = 'failed';
      paint();
    });
  const unsubscribe = subscribe(paint);
  const law = getLaw(lawId);
  return { el: root, title: law ? pick(law, 'title') : t('nav.laws'), destroy: unsubscribe };
}

function factRow(label, value) {
  return h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value));
}

function sectionItem(s, law, navigate, prev) {
  const heading = pick(s, 'heading');
  const chapter = pick(s, 'chapter');
  const showChapter = chapter && (!prev || pick(prev, 'chapter') !== chapter);
  const summary = h('summary', { class: 'acc-summary' }, h('span', { class: 'sec-no' }, `${t('law.section')} ${s.section_no}`), heading ? h('span', { class: 'sec-heading' }, heading) : null, icon('down', 'acc-chevron'));
  const body = h('div', { class: 'acc-body' });

  const text = pick(s, 'text');
  if (text) {
    body.appendChild(h('h4', { class: 'sub' }, t('law.text')));
    body.appendChild(renderParagraphs(text, 'prose law-text'));
    if (isFallback(s, 'text')) body.appendChild(h('p', { class: 'fineprint' }, t('law.shownOtherLang')));
  }
  const explain = pick(s, 'explain');
  if (explain) {
    body.appendChild(h('h4', { class: 'sub' }, t('law.explanation')));
    body.appendChild(renderParagraphs(explain));
  }
  const pun = pick(s, 'punishment');
  if (pun) {
    body.appendChild(h('h4', { class: 'sub' }, t('law.punishment')));
    body.appendChild(renderParagraphs(pun));
  }
  body.appendChild(
    h(
      'div',
      { class: 'btn-row' },
      button(t('law.reportSection'), {
        variant: 'ghost',
        icon: 'flag',
        onClick: () => openReport({ type: 'law_section', id: s.id, title: `${pick(law, 'title')} · ${t('law.section')} ${s.section_no}`, navigate }),
      }),
    ),
  );
  const item = h('details', { class: 'acc-item' }, summary, body);
  return showChapter ? h('div', { class: 'acc-group' }, h('p', { class: 'sec-chapter' }, chapter), item) : item;
}

async function share(law) {
  const lines = [pick(law, 'title'), law.source_url || ''].filter(Boolean).join('\n');
  try {
    if (navigator.share) {
      await navigator.share({ title: pick(law, 'title'), text: lines });
      return;
    }
    await navigator.clipboard.writeText(lines);
    toast(t('common.copied'));
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user closed the share sheet
    toast(t('error.generic'), { tone: 'error' });
  }
}

function openReport({ type, id, title, navigate }) {
  const auth = getAuth();
  if (!auth.signedIn) {
    openDialog({
      title: t('report.title'),
      body: h('p', { class: 'dialog-text' }, t('report.loginNeeded')),
      actions: [
        { label: t('common.cancel'), variant: 'ghost' },
        {
          label: t('auth.login'),
          variant: 'primary',
          onClick: () => {
            navigate(`/login?next=${encodeURIComponent(location.hash.replace(/^#/, '') || '/')}`);
          },
        },
      ],
    });
    return;
  }

  const msg = textareaField({ id: 'report-msg', label: t('report.message'), hint: t('report.hint'), maxLength: 1000, rows: 5 });
  const body = h('div', null, h('p', { class: 'muted small' }, title), msg.el);
  let sending = false;
  openDialog({
    title: t('report.title'),
    body,
    actions: [
      { label: t('common.cancel'), variant: 'ghost' },
      {
        label: t('report.send'),
        variant: 'primary',
        onClick: async () => {
          if (sending) return false;
          const text = msg.input.value.trim();
          if (text.length < 5) {
            msg.setError(t('report.tooShort'));
            return false;
          }
          msg.setError(null);
          sending = true;
          // Laws live in JSON files, so the law is named inside the message; target_id is a stable uuid made from its id.
          const { error } = await supabase.from('reports').insert({ target_type: type, target_id: uuidFromString(id), message: `[${id}] ${text}`.slice(0, 1000) });
          sending = false;
          if (error) {
            logError(error, { where: 'report.insert' });
            msg.setError(errorCode(error) === 'offline' ? t('error.offline') : t('error.generic'));
            return false;
          }
          toast(t('report.sent'), { tone: 'success' });
          return true;
        },
      },
    ],
  });
}

