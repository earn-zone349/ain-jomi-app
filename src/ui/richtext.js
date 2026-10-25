// Render plain text from the database safely (text nodes only; never innerHTML).

import { h } from './dom.js';
import { parseBlocks } from '../lib/text.js';

/** Our light format: first line = title, "# Heading", "- bullet", blank-line separated paragraphs. */
export function renderDoc(text, { skipTitle = false } = {}) {
  const wrap = h('div', { class: 'prose' });
  let list = null;
  for (const block of parseBlocks(text)) {
    if (block.type === 'li') {
      if (!list) {
        list = h('ul');
        wrap.appendChild(list);
      }
      list.appendChild(h('li', null, block.text));
      continue;
    }
    list = null;
    if (block.type === 'title') {
      if (!skipTitle) wrap.appendChild(h('h2', { class: 'prose-title' }, block.text));
    } else if (block.type === 'h') wrap.appendChild(h('h3', null, block.text));
    else wrap.appendChild(h('p', null, block.text));
  }
  return wrap;
}

/** Plain paragraphs: every non-empty line becomes a <p>. Used for law text and explanations. */
export function renderParagraphs(text, className = 'prose') {
  const wrap = h('div', { class: className });
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => wrap.appendChild(h('p', null, line)));
  return wrap;
}
