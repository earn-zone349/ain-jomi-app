// Landing page for the "reset password" email link. Supabase puts a recovery token in the URL;
// this page lets the user choose a new password. Bilingual (Bangla / English).

import '../site.css';
import { createClient } from '@supabase/supabase-js';
import { h } from '../../src/ui/dom.js';
import { passwordProblem } from '../../src/lib/text.js';

const root = document.getElementById('reset');
const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const TEXT = {
  title: ['নতুন পাসওয়ার্ড দিন', 'Set a new password'],
  pw: ['নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)', 'New password (at least 8 characters)'],
  confirm: ['পাসওয়ার্ড আবার লিখুন', 'Confirm password'],
  save: ['পাসওয়ার্ড সংরক্ষণ', 'Save password'],
  mismatch: ['পাসওয়ার্ড দুটি মিলছে না।', 'Passwords do not match.'],
  pwShort: ['কমপক্ষে ৮ অক্ষর দিন।', 'Use at least 8 characters.'],
  pwDigits: ['শুধু সংখ্যা নয়, কিছু অক্ষরও দিন।', 'Add some letters, not only digits.'],
  done: ['পাসওয়ার্ড বদলানো হয়েছে। এখন অ্যাপে ফিরে গিয়ে লগইন করুন।', 'Your password was changed. Go back to the app and log in.'],
  invalid: ['এই লিংকটি ভুল বা মেয়াদোত্তীর্ণ। অ্যাপ থেকে আবার রিসেট লিংক চান।', 'This link is invalid or has expired. Request a new reset link from the app.'],
  fail: ['পাসওয়ার্ড বদলানো যায়নি। আবার চেষ্টা করুন।', 'Could not change the password. Please try again.'],
  config: ['এই পাতা এখনো সেটআপ করা হয়নি।', 'This page has not been set up yet.'],
};
const tx = (k) => `${TEXT[k][0]} / ${TEXT[k][1]}`;
const KEYMAP = { 'auth.err.pwShort': 'pwShort', 'auth.err.pwDigits': 'pwDigits' };

function show(...children) {
  root.replaceChildren(h('main', { class: 'reset' }, ...children));
}
const message = (text, tone = 'info') => h('div', { class: `banner banner-${tone}`, role: 'status' }, h('p', null, text));

if (!URL_ || !KEY) {
  show(message(tx('config'), 'warning'));
} else {
  const supabase = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true } });
  let shown = false;

  function showForm() {
    if (shown) return;
    shown = true;
    const pw = h('input', { id: 'pw', class: 'input', type: 'password', autocomplete: 'new-password', required: true });
    const cf = h('input', { id: 'cf', class: 'input', type: 'password', autocomplete: 'new-password', required: true });
    const out = h('div');
    const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, tx('save'));
    const form = h('form', { class: 'form', novalidate: true }, h('div', { class: 'field' }, h('label', { class: 'label', for: 'pw' }, tx('pw')), pw), h('div', { class: 'field' }, h('label', { class: 'label', for: 'cf' }, tx('confirm')), cf), out, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      out.replaceChildren();
      const problem = passwordProblem(pw.value);
      if (problem) return out.replaceChildren(message(tx(KEYMAP[problem]), 'error'));
      if (pw.value !== cf.value) return out.replaceChildren(message(tx('mismatch'), 'error'));
      submit.disabled = true;
      const { error } = await supabase.auth.updateUser({ password: pw.value });
      submit.disabled = false;
      if (error) return out.replaceChildren(message(`${tx('fail')} (${error.message})`, 'error'));
      await supabase.auth.signOut();
      show(h('h1', null, tx('title')), message(tx('done'), 'success'));
    });
    show(h('h1', null, tx('title')), form);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) showForm();
  });

  // If no recovery event arrives, the link was not valid.
  setTimeout(() => {
    if (!shown) show(h('h1', null, tx('title')), message(tx('invalid'), 'error'));
  }, 4000);
}
