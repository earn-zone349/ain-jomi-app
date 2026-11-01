// Lawyer directory data access (Supabase). Online only: nothing here is cached offline, because a stale list could
// show someone who has since been suspended, and payment state must always be the server's.

import { supabase } from './supabase.js';
import { getSetting } from './content.js';
import { PUBLIC_COLUMNS, certificatePath, readPricing } from '../lib/lawyers-core.js';

const MAX_ROWS = 1000;
const BUCKET = 'lawyer-certs';
const offline = () => ({ data: null, error: new Error('Failed to fetch') });

/** Fees and the bKash number, as set by the admin. */
export const getPricing = () => readPricing(getSetting('lawyer_pricing', null));

/** Verified lawyers from the public view. No phone or email in it. */
export async function listVerified() {
  if (!supabase) return offline();
  return supabase.from('lawyers_public').select(PUBLIC_COLUMNS).limit(MAX_ROWS);
}

/** Phone and email of one lawyer. The database refuses unless the contact fee was paid and approved. */
export async function getContact(lawyerId) {
  if (!supabase) return offline();
  const { data, error } = await supabase.rpc('get_lawyer_contact', { p_lawyer: lawyerId });
  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row || null, error: null };
}

/** The signed-in user's own payments (their payment status per lawyer). */
export async function listMyPayments() {
  if (!supabase) return offline();
  return supabase.from('lawyer_payments').select('id,lawyer_id,kind,amount_bdt,status,review_note,trx_id,created_at').order('created_at', { ascending: false }).limit(500);
}

/** Records a bKash payment for an admin to check. The price is set by the database, not sent from here. */
export async function submitPayment({ lawyerId, kind, sender_number, trx_id }) {
  if (!supabase) return offline();
  return supabase.from('lawyer_payments').insert({ lawyer_id: lawyerId, kind, sender_number, trx_id });
}

export async function listRatings(lawyerId) {
  if (!supabase) return offline();
  return supabase.from('lawyer_ratings_public').select('id,stars,comment,created_at').eq('lawyer_id', lawyerId).order('created_at', { ascending: false }).limit(100);
}

/** Which advocates the signed-in user has already rated (RLS lets a user read only their own). */
export async function listMyRatings() {
  if (!supabase) return offline();
  return supabase.from('lawyer_ratings').select('lawyer_id,stars,status').limit(500);
}

/** Needs an approved rating payment; the database checks it and allows one rating per user per lawyer. */
export async function submitRating(lawyerId, stars, comment) {
  if (!supabase) return offline();
  return supabase.rpc('submit_lawyer_rating', { p_lawyer: lawyerId, p_stars: stars, p_comment: comment || null });
}

/** The signed-in user's own application (any status), or null. */
export async function getMine(userId) {
  if (!supabase) return offline();
  return supabase.from('lawyer_profiles').select('*').eq('user_id', userId).maybeSingle();
}

/** Creates or updates the user's one application. The database decides the status; the app never sends one. */
export async function saveMine(existing, clean) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  if (existing) return supabase.from('lawyer_profiles').update(clean).eq('id', existing.id);
  return supabase.from('lawyer_profiles').insert(clean);
}

export async function withdrawMine(id, certificatePaths = []) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  const res = await supabase.from('lawyer_profiles').delete().eq('id', id);
  if (!res.error && certificatePaths.length) await removeCertificates(certificatePaths);
  return res;
}

export async function reportLawyer(lawyerId, message) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  return supabase.from('reports').insert({ target_type: 'lawyer', target_id: lawyerId, message: String(message).slice(0, 1000) });
}

// ---- certificate files (private bucket; see phase5_lawyers_v2.sql) ----

function randomName() {
  const bytes = new Uint8Array(12);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Uploads one file into the user's own folder. Returns { path } or { error }. */
export async function uploadCertificate(userId, file) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  const path = certificatePath(userId, file, randomName());
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  return error ? { error } : { path };
}

/** A short-lived link to view a certificate (opens in a new tab). */
export async function certificateUrl(path) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return error ? { error } : { url: data.signedUrl };
}

export async function removeCertificates(paths) {
  if (!supabase || !paths.length) return { error: null };
  return supabase.storage.from(BUCKET).remove(paths);
}
