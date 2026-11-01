// Admin panel check for the lawyer features (Chromium + in-memory fake Supabase).
//   node tests/e2e/admin.mjs
import { createRequire } from 'node:module';
import { startServer } from '../harness/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), ...(process.env.NODE_PATH || '').split(':').filter(Boolean)] }));
const { server, url } = await startServer(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const problems = [];
const results = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`); };
const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).trim();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Details do not match' : undefined));

await page.goto(`${url}/admin`);
await page.waitForSelector('#email');
await page.fill('#email', 'admin@example.com');
await page.fill('#password', 'adminpass1');
await page.locator('.adm-login .btn-primary').click();
await page.waitForSelector('.adm-nav');
check('admin sees Lawyers, Payments and Ratings in the menu', (await text('.adm-nav')).includes('Lawyers') && (await text('.adm-nav')).includes('Payments') && (await text('.adm-nav')).includes('Ratings'));

// prepare: one pending payment, one rating
await page.evaluate(() => {
  __fake.db.payments.push({ id: 'py1', user_id: 'u-1', lawyer_id: 'lw1', lawyer_name: 'Ayesha Rahman', kind: 'contact', amount_bdt: 50, sender_number: '01922222222', trx_id: '9AB12CD34E', status: 'pending', review_note: null, created_at: '2026-10-30T10:00:00Z' });
  __fake.db.payments.push({ id: 'py2', user_id: 'u-1', lawyer_id: 'lw2', lawyer_name: 'Bashir Ahmed', kind: 'rating', amount_bdt: 2500, sender_number: '01922222222', trx_id: 'RATE000002', status: 'pending', review_note: null, created_at: '2026-10-30T11:00:00Z' });
  __fake.db.ratings.push({ id: 'rt1', lawyer_id: 'lw1', user_id: 'u-1', payment_id: 'py0', stars: 2, comment: 'Rude and unhelpful', status: 'visible', created_at: '2026-10-30T12:00:00Z' });
});

// lawyers: pending one shows certificates
await page.evaluate(() => { location.hash = '#/lawyers'; });
await page.waitForSelector('.card');
check('pending lawyer shows education/cases fields and a certificate button', (await text('.page, #admin')).includes('Pending Person') && (await page.locator('.btn', { hasText: 'Open certificate 1' }).count()) === 1);
await page.locator('.btn', { hasText: 'Verify' }).first().click();
await page.waitForTimeout(500);
check('verify is saved in the database (not just hidden on screen)', (await page.evaluate(() => __fake.db.lawyers.find((l) => l.id === 'lw3').status)) === 'verified');

// payments
await page.evaluate(() => { location.hash = '#/payments'; });
await page.waitForSelector('.card');
const pay = (await text('#admin')).replace(/\s+/g, ' ');
check('payment card shows TrxID, sender number and amount', pay.includes('9AB12CD34E') && pay.includes('01922222222') && pay.includes('৳50') && pay.includes('Ayesha Rahman'), pay);
await page.locator('.card', { hasText: '9AB12CD34E' }).locator('.btn', { hasText: 'Approve' }).click();
await page.waitForTimeout(500);
check('approve is saved, with reviewer and time', await page.evaluate(() => { const p = __fake.db.payments.find((x) => x.id === 'py1'); return p.status === 'approved' && p.reviewed_by === 'u-admin' && !!p.reviewed_at; }));
await page.waitForSelector('.card');
await page.locator('.card', { hasText: 'RATE000002' }).locator('.btn', { hasText: 'Reject' }).click();
await page.waitForTimeout(500);
check('reject needs and stores a reason', await page.evaluate(() => { const p = __fake.db.payments.find((x) => x.id === 'py2'); return p.status === 'rejected' && p.review_note === 'Details do not match'; }));

// ratings: hide
await page.evaluate(() => { location.hash = '#/ratings'; });
await page.waitForSelector('.card');
check('rating card shows stars and comment', (await text('#admin')).includes('Rude and unhelpful'));
await page.locator('.btn', { hasText: 'Hide' }).first().click();
await page.waitForTimeout(500);
check('hide is saved', (await page.evaluate(() => __fake.db.ratings[0].status)) === 'hidden');

// settings: prices
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#fee-contact');
check('settings show the current fees and bKash number', (await page.inputValue('#fee-contact')) === '50' && (await page.inputValue('#fee-rating')) === '2500' && (await page.inputValue('#bkash-number')) === '01711111111');
await page.fill('#fee-contact', '60');
await page.fill('#bkash-number', 'abc');
await page.locator('form .btn-primary').click();
check('bad bKash number is refused', (await text('#admin')).includes('digits only'));
await page.fill('#bkash-number', '01722222222');
await page.fill('#fee-rating', '3000');
await page.locator('form .btn-primary').click();
await page.waitForTimeout(500);
check('fees and number are saved', await page.evaluate(() => { const v = __fake.db.settings.lawyer_pricing; return v.contact_fee === 60 && v.rating_fee === 3000 && v.bkash_number === '01722222222'; }));

check('no JS errors', problems.length === 0, problems.join(' | '));
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} admin checks passed`);
process.exit(failed ? 1 : 0);
