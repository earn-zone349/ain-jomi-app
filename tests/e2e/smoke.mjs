// Browser smoke test: runs the real app in Chromium against an in-memory fake Supabase.
//   node tests/e2e/smoke.mjs            (needs Playwright + Chromium; NOT part of `npm test`)
// Screenshots go to $SHOTS (default ./tests/e2e/shots).

import { createRequire } from 'node:module';
import { startServer } from '../harness/server.mjs';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Build the law catalogue from the fixture JSON files, exactly like the real build does.
execFileSync('node', ['scripts/build-laws.mjs'], { env: { ...process.env, CONTENT_DIR: 'tests/fixtures/content', DATA_OUT: 'tests/harness/data' }, stdio: 'inherit' });
execFileSync('node', ['scripts/build-land.mjs'], { env: { ...process.env, LAND_OUT: 'tests/harness/data/land' }, stdio: 'inherit' });
execFileSync('node', ['scripts/build-services.mjs'], { env: { ...process.env, SERVICES_OUT: 'tests/harness/data/services' }, stdio: 'inherit' });

// ESM ignores NODE_PATH, so resolve Playwright explicitly (local install or a global one).
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), ...(process.env.NODE_PATH || '').split(':').filter(Boolean)] }));

const SHOTS = process.env.SHOTS || new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const { server, url } = await startServer(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'bn-BD', timezoneId: 'Asia/Dhaka' });
const page = await context.newPage();

const problems = [];
const results = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}
const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).trim();
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png` });
const waitIdle = () => page.waitForFunction(() => !document.querySelector('.sync-line .icon') || true, null, { timeout: 2000 }).catch(() => {});

// Offline simulation that still lets the page itself reload (the real app ships its files inside the APK).
await page.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'onLine', { get: () => localStorage.getItem('x-offline') !== '1', configurable: true });
});

await page.goto(url);

// 1. first run: language + disclaimer gate
await page.waitForSelector('.lang-grid');
check('welcome screen shows language chooser', (await page.locator('.lang-card').count()) === 2);
await shot('01-language');
await page.locator('.lang-card', { hasText: 'বাংলা' }).click();
await page.waitForSelector('#accept');
check('disclaimer shown in Bangla', (await text('.welcome-card')).includes('গুরুত্বপূর্ণ বিজ্ঞপ্তি'));
check('start button disabled until accepted', await page.locator('.welcome .btn-primary').isDisabled());
await shot('02-disclaimer');
await page.locator('#accept').check();
check('start button enabled after accepting', await page.locator('.welcome .btn-primary').isEnabled());
await page.locator('.welcome .btn-primary').click();

// 2. home + sync
await page.waitForSelector('.tile');
await page.waitForTimeout(300);
check('home lists all 28 categories, even empty ones', (await page.locator('.tile').count()) === 28, `count=${await page.locator('.tile').count()}`);
check('home shows law counts and coming-soon', (await text('.tile:nth-child(1) .tile-count')).includes('২ টি আইন') && (await page.locator('.tile-soon').count()) === 26, await text('.tile:nth-child(1) .tile-count'));
check('update notice is visible', (await text('.notice')).includes('আইন হালনাগাদ'));
check('home is Bangla', (await text('.hero-title')).includes('অধিকার'));
await shot('03-home');
await page.locator('.notice .icon-btn').click();
check('notice can be dismissed', (await page.locator('.notice').count()) === 0);

// 3. laws list and search
await page.locator('.tab[data-tab="laws"]').click();
await page.waitForSelector('ul.list .row');
check('laws tab lists 3 laws', (await page.locator('ul.list .row').count()) === 3);
check('repealed law has a badge', (await page.locator('.badge-danger').count()) === 1);
await page.locator('.search-input').fill('penal');
await page.waitForTimeout(350);
check('English search finds Penal Code', (await page.locator('ul.list .row').count()) === 1);
await page.locator('.search-input').fill('৩৭৮');
await page.waitForTimeout(350);
check('Bangla-digit search finds law by section number', (await text('ul.list .row-title')).includes('দণ্ডবিধি'), await text('ul.list'));
check('search says which section matched', (await text('ul.list .row-hit')).includes('৩৭৮'), await text('ul.list'));
await page.locator('.search-input').fill('zzzzzz');
await page.waitForTimeout(350);
check('no-match state shown', (await page.locator('.state').count()) === 1);
await page.locator('.search-input').fill('');
await page.waitForTimeout(350);
await page.locator('.chip', { hasText: 'ভূমি' }).click();
check('category filter works', (await page.locator('ul.list .row').count()) === 1);
await page.locator('.chip', { hasText: 'শিক্ষা' }).click();
check('empty category says coming soon', (await text('.state')).includes('শীঘ্রই আসছে'));
await page.locator('.chip', { hasText: 'ভূমি' }).click();
await shot('04-laws');

// 4. law detail
await page.locator('ul.list .row').first().click();
await page.waitForSelector('.law-title');
check('law without sections shows an empty note, not a broken list', (await page.locator('.acc-item').count()) === 0 && (await text('.page')).includes('ধারা এখনো যোগ করা হয়নি'));
check('amended law shows its status badge', (await page.locator('.law-head .badge-warning').count()) === 1);
await page.goBack();
await page.locator('.chip', { hasText: 'সব' }).click();
await page.locator('ul.list .row', { hasText: 'দণ্ডবিধি' }).click();
await page.waitForSelector('.acc-item');
check('Penal Code has 9 sections', (await page.locator('.acc-item').count()) === 9);
check('long law offers a section jump box', (await page.locator('.jump input').count()) === 1);
await page.locator('.jump input').fill('৩৮৫');
await page.locator('.jump button').click();
check('jump opens section 385 (Bangla digits)', await page.locator('details[data-no="385"]').evaluate((d) => d.open));
await page.locator('.jump input').fill('999');
await page.locator('.jump button').click();
await page.waitForSelector('.toast');
check('jump to a missing section says so', (await text('.toast')).includes('999'));
await page.evaluate(() => { location.hash = '#/law/penal-code-1860?s=379'; });
await page.waitForSelector('details[data-no="379"][open]');
check('deep link ?s= opens that section', true);
await page.locator('.law-head .btn', { hasText: 'সংরক্ষণ' }).click();
check('Save button switches to Saved', (await text('.law-head .btn-primary')).includes('সংরক্ষিত'));
check('chapter heading shown once for consecutive sections', (await page.locator('.sec-chapter').count()) === 1);
check('source link is external and safe', (await page.locator('a.link[target="_blank"][rel*="noopener"]').count()) === 1);
await page.locator('.acc-item').first().locator('summary').click();
check('section 378 text visible', (await text('.acc-item[open] .law-text')).includes('অসদুদ্দেশ্যে'));
await page.locator('.acc-item').nth(1).locator('summary').click();
const second = await page.locator('.acc-item').nth(1).innerText();
check('section with no Bangla text falls back to English and says so', second.includes('Whoever commits theft') && second.includes('অনুবাদ এখনো নেই'), second);
await shot('05-law');

// 5. report as guest -> asks to log in
await page.locator('button', { hasText: 'সমস্যা জানান' }).first().click();
await page.waitForSelector('.dialog');
check('guest report asks to log in', (await text('.dialog')).includes('লগইন'));
await shot('06-report-guest');
await page.locator('.dialog .btn-ghost').click();

// 6. settings: language, theme, size
await page.locator('.tab[data-tab="settings"]').click();
await page.waitForSelector('.segmented');
await page.locator('.segmented[data-name="lang"] .seg', { hasText: 'English' }).click();
await page.waitForTimeout(200);
check('switching to English re-renders UI', (await text('.topbar-title')) === 'Settings');
check('tab labels switch to English', (await text('.tab[data-tab="laws"]')) === 'Laws');
await page.locator('.segmented[data-name="theme"] .seg', { hasText: 'Dark' }).click();
check('dark theme applied', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
await shot('07-settings-dark');
await page.locator('.segmented[data-name="size"] .seg', { hasText: 'Large' }).click();
check('large text applied', (await page.evaluate(() => document.documentElement.dataset.textSize)) === 'large');
await page.locator('.segmented[data-name="theme"] .seg', { hasText: 'Light' }).click();
await page.locator('.segmented[data-name="size"] .seg', { hasText: 'Normal' }).click();

// 7. legal pages (bundled)
await page.locator('.row', { hasText: 'Privacy policy' }).click();
await page.waitForSelector('.prose');
check('privacy policy renders', (await text('.prose')).includes('What we collect'));
check('no raw placeholder leaks', !(await text('.prose')).includes('{{'));
await shot('08-privacy');
await page.goBack();

// 8. login: wrong, then right
await page.locator('.btn-primary', { hasText: 'Log in' }).click();
await page.waitForSelector('#email');
await page.locator('#email').fill('rakib@example.com');
await page.locator('#password').fill('wrongpass');
await page.locator('button[type=submit]').click();
await page.waitForSelector('.form-error:not([hidden])');
check('wrong password shows friendly error', (await text('.form-error')).includes('Wrong email or password'));
await page.locator('#email').fill('not-an-email');
await page.locator('button[type=submit]').click();
check('invalid email is caught client-side', (await text('#email-err')).includes('valid email'));
await shot('09-login-error');
await page.locator('#email').fill('rakib@example.com');
await page.locator('#password').fill('secret123');
await page.locator('button[type=submit]').click();
await page.waitForSelector('.account');
check('after login, returns to Settings showing account', (await text('.account')).includes('Rakib'));
await shot('10-settings-account');

// 9. report as signed-in user
await page.locator('.tab[data-tab="laws"]').click();
await page.locator('.chip', { hasText: 'Saved' }).click();
check('Saved filter lists only the saved law', (await page.locator('ul.list .row').count()) === 1 && (await text('ul.list')).includes('Penal Code'));
await page.locator('.chip:text-is("All")').click();
await page.locator('ul.list .row', { hasText: 'Penal Code' }).click();
await page.waitForSelector('.law-title');
await page.locator('.btn', { hasText: 'Report a problem' }).first().click();
await page.waitForSelector('.dialog textarea');
await page.locator('.dialog .btn-primary').click();
check('short report rejected', (await text('.dialog .field-error')).includes('at least 5'));
await page.locator('.dialog textarea').fill('Section number looks wrong');
await page.locator('.dialog .btn-primary').click();
await page.waitForSelector('.toast');
check('report sent', (await page.evaluate(() => __fake.db.reports.length)) === 2);
check('report names the law and has a uuid target', await page.evaluate(() => { const r = __fake.db.reports.at(-1); return r.message.startsWith('[penal-code-1860]') && /^[0-9a-f-]{36}$/.test(r.target_id); }));

// 10. server-side changes to notices: add, archive (tombstone), hard delete (epoch bump)
await page.evaluate(() => __fake.upsert('notices', { id: 'n2', kind: 'info', title_bn: 'নতুন নোটিশ', title_en: 'Fresh notice', status: 'published' }));
await page.locator('.tab[data-tab="settings"]').click();
await page.locator('.btn', { hasText: 'Update now' }).click();
await page.waitForSelector('.toast');
await page.locator('.tab[data-tab="home"]').click();
await page.waitForSelector('.notice');
check('new notice synced', (await text('.notice')).includes('Fresh notice'));
check('home shows recently viewed law', (await text('.page')).includes('Recently viewed') && (await text('.page')).includes('Penal Code'));
await page.locator('.row[href="#/faq"]').click();
await page.waitForSelector('.acc-item');
check('FAQ page lists the question', (await text('.acc-item')).includes('Do I need a lawyer?'));
await page.locator('.acc-item summary').click();
check('FAQ answer opens', (await text('.acc-item .acc-body')).includes('depends'));
await page.locator('.search-input').fill('zzzz');
await page.waitForTimeout(350);
check('FAQ search no-match state', (await page.locator('.state').count()) === 1);
await page.goBack();
await page.evaluate(() => __fake.upsert('notices', { id: 'n2', status: 'archived' }));
await page.locator('.tab[data-tab="settings"]').click();
await page.locator('.btn', { hasText: 'Update now' }).click();
await page.waitForTimeout(500);
await page.locator('.tab[data-tab="home"]').click();
await page.waitForSelector('.tile');
check('archived notice removed from cache', (await page.locator('.notice').count()) === 0);
await page.evaluate(() => { __fake.upsert('notices', { id: 'n3', kind: 'info', title_bn: 'তৃতীয়', title_en: 'Third notice', status: 'published' }); __fake.hardDelete('notices', 'n1'); });
await page.locator('.tab[data-tab="settings"]').click();
await page.locator('.btn', { hasText: 'Update now' }).click();
await page.waitForTimeout(500);
await page.locator('.tab[data-tab="home"]').click();
await page.waitForSelector('.notice');
check('hard delete (epoch bump) wipes and resyncs', (await text('.notice')).includes('Third notice') && (await page.locator('.notice').count()) === 1);

// 11. offline: reload with no network
await page.evaluate(() => localStorage.setItem('x-offline', '1'));
await page.reload();
await page.waitForSelector('.tab');
await page.locator('.tab[data-tab="laws"]').click();
await page.waitForSelector('ul.list .row');
check('offline: laws are bundled, so all 3 are listed after restart', (await page.locator('ul.list .row').count()) === 3);
check('offline bar visible', await page.locator('.offline-bar').isVisible());
await page.locator('.tab[data-tab="home"]').click();
await page.waitForSelector('.sync-line');
check('home says content is offline-saved', (await text('.sync-line')).length > 0 && (await text('.sync-line')).includes('Offline'), await text('.sync-line'));
await shot('11-offline');
await page.evaluate(() => localStorage.removeItem('x-offline'));
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForTimeout(600);
check('back online: offline bar hidden', !(await page.locator('.offline-bar').isVisible()));

// 11b. land calculator (offline, bundled data)
await page.locator('.tab[data-tab="tools"]').click();
await page.waitForSelector('.module-live');
check('Tools tab: land, inheritance and service guides are live, others coming soon', (await page.locator('.module-live').count()) === 3 && (await page.locator('.module').count()) === 5);
await page.locator('.module-live').first().click();
await page.waitForSelector('.chip-active');
check('calculator opens on the converter tab', (await page.locator('.chip-active').first().innerText()).includes('Convert'));
await page.locator('input[aria-label="Amount"]').first().fill('১');
await page.waitForTimeout(100);
const kathaFacts = await text('.result .facts');
check('1 katha = 720 sq ft (default region), Bangla input accepted', /Square feet\s*720/.test(kathaFacts.replace(/\n/g, ' ').replace(/\t/g, ' ')), kathaFacts);
check('headline reads "1 Katha" (no stray zero parts)', (await text('.result-big')) === '1 Katha', await text('.result-big'));
await shot('13a-land-convert');
await page.locator('select[aria-label="Unit"]').first().selectOption('acre');
await page.waitForTimeout(100);
check('1 acre reads "3 Bigha 8 Chhatak" (0.5 katha = 8 chhatak)', (await text('.result-big')) === '3 Bigha 8 Chhatak', await text('.result-big'));
check('1 acre = 100 shotok', /Decimal \(shotok\)\s*100/.test((await text('.result .facts')).replace(/\s+/g, ' ')), await text('.result .facts'));
await page.locator('input[aria-label="Amount"]').first().fill('abc');
await page.waitForTimeout(100);
check('bad number shows a friendly warning, no crash', (await text('.banner')).includes('Type the number correctly'));
await page.locator('.chip', { hasText: 'Plot size' }).click();
const sides = page.locator('input[aria-label="Length"]');
await sides.fill('20');
await page.locator('input[aria-label="Width"]').fill('36');
await page.waitForTimeout(100);
check('20 ft x 36 ft = 1 katha', (await text('.result-big')).startsWith('1 Bigha') === false && (await text('.result-big')).includes('1 Katha'), await text('.result-big'));
await page.locator('.btn', { hasText: 'Add to total' }).click();
await page.locator('.btn', { hasText: 'Add to total' }).click();
check('parts add up to 2 katha', (await page.locator('.result-big').nth(1).innerText()).includes('2 Katha'), await page.locator('.result-big').count() + '');
await page.locator('select[aria-label="Shape"]').selectOption('triangleSides');
await page.locator('input[aria-label="First side"]').fill('1');
await page.locator('input[aria-label="Second side"]').fill('2');
await page.locator('input[aria-label="Third side"]').fill('10');
await page.waitForTimeout(100);
check('impossible triangle is explained', (await text('.banner')).includes('cannot make a triangle'));
await page.locator('.chip', { hasText: 'Share' }).click();
await page.locator('input[aria-label="Amount"]').first().fill('2');
await page.locator('input[aria-label="Numerator (top)"]').fill('3');
await page.locator('input[aria-label="Denominator (bottom)"]').fill('8');
await page.waitForTimeout(100);
check('3/8 of 2 bigha = 15 katha', (await text('.result-big')).includes('15 Katha') || (await text('.result-big')).includes('0 Bigha 15'), await text('.result-big'));
await page.locator('input[aria-label="Numerator (top)"]').fill('9');
await page.waitForTimeout(100);
check('numerator bigger than denominator is rejected', (await text('.banner')).includes('cannot be bigger'));
await page.locator('.chip', { hasText: 'Price' }).click();
await page.locator('input[aria-label="Amount"]').first().fill('5');
await page.locator('input[aria-label="Taka"]').fill('300000');
await page.waitForTimeout(100);
check('5 katha at 3,00,000 per katha = 15,00,000', (await text('.result-big')).replace(/\D/g, '') === '1500000', await text('.result-big'));
await page.locator('.chip', { hasText: 'Costs' }).click();
check('cost calculator stays off while no official rates are published', (await text('.state')).includes('have not been added'));
await page.locator('.chip', { hasText: 'Terms' }).click();
check('glossary lists terms', (await page.locator('.acc-item').count()) >= 10);
await shot('13-land');
await page.locator('.chip', { hasText: 'Convert' }).click();
await page.locator('select[aria-label="Local unit sizes"]').selectOption('shotok33');
await page.locator('input[aria-label="Amount"]').first().fill('1');
await page.locator('select[aria-label="Unit"]').first().selectOption('bigha');
await page.waitForTimeout(100);
check('33-shotok region: 1 bigha = 33 shotok', /Decimal \(shotok\)\s*33/.test((await text('.result .facts')).replace(/\s+/g, ' ')), await text('.result .facts'));
await page.locator('.tab[data-tab="home"]').click();

// 11c. inheritance calculator
await page.locator('.tab[data-tab="tools"]').click();
await page.locator('.module-live').nth(1).click();
await page.waitForSelector('[data-religion]');
check('religion list shows 4 religions', (await page.locator('[data-religion]').count()) === 4);
check('Christian and Muslim are usable; Hindu/Buddhist are not', (await page.locator('button[data-religion]').count()) === 2 && (await page.locator('div[data-religion]').count()) === 2);
const chooser = await text('.page');
check('Muslim is marked not yet reviewed; Hindu/Buddhist unavailable', chooser.includes('Not yet reviewed') && chooser.includes('Not available'), chooser.slice(0, 300));
await page.locator('button[data-religion="christian"]').click();
await page.locator('[data-id="spouse"]').check();
await page.locator('button', { hasText: 'Add a child' }).click();
await page.locator('button', { hasText: 'Add a child' }).click();
await page.locator('button', { hasText: 'Calculate' }).click();
await page.waitForSelector('[data-id="inh-result"]');
let facts = (await text('[data-id="inh-result"]')).replace(/\s+/g, ' ');
check('widow + 2 children: 1/3 each, total 1', (facts.match(/1\/3/g) || []).length === 3 && facts.includes('Total 1'), facts);
await page.locator('input[aria-label="Estate value (optional, Taka)"]').fill('1,000,000');
await page.waitForTimeout(100);
facts = (await text('[data-id="inh-result"]')).replace(/\s+/g, ' ');
check('estate amount: 333333.33 per share', facts.includes('333333.33'), facts);
// first child dead with two living children (s.40): shares 1/3 spouse, 1/3 second child, 1/6 + 1/6
await page.locator('select[data-id="state-1"]').selectOption('dead');
await page.locator('button', { hasText: 'Add a child of child 1' }).click();
await page.locator('button', { hasText: 'Add a child of child 1' }).click();
await page.waitForTimeout(100);
facts = (await text('[data-id="inh-result"]')).replace(/\s+/g, ' ');
check('s.40 per-stirpes: 1/3, 1/3, 1/6, 1/6', (facts.match(/1\/6/g) || []).length === 2 && (facts.match(/1\/3/g) || []).length === 2, facts);
await page.locator('select[data-id="state-1"]').selectOption('dead');
await shot('14-inheritance');
// no descendants: father alive takes the kindred half
await page.locator('.tree-node').first().locator('button', { hasText: 'Remove' }).first().click();
await page.waitForTimeout(100);
await page.locator('.tree-node').first().locator('button', { hasText: 'Remove' }).first().click();
await page.waitForTimeout(100);
await page.locator('input[data-id="spouse"]').check();
await page.waitForTimeout(100);
check('no relatives given: refuses until confirmed', (await text('.page')).includes('No result is given until you confirm'), await text('.page'));
await page.locator('input[data-id="nokin"]').check();
await page.waitForTimeout(100);
check('confirmed no kindred: spouse takes all', (await text('[data-id="inh-result"]')).replace(/\s+/g, ' ').includes('1'), await text('.page'));
await page.locator('button', { hasText: 'Change religion' }).click();
await page.waitForSelector('button[data-religion="muslim"]');
await page.locator('button[data-religion="muslim"]').click();
check('Muslim module shows the review warning', (await text('.page')).includes('No scholar or lawyer has reviewed these rules yet'));
await page.locator('select[data-id="spouse-kind"]').selectOption('wives');
await page.locator('button', { hasText: 'Add a child' }).click();
await page.locator('button', { hasText: 'Calculate' }).click();
await page.waitForSelector('[data-id="inh-result"]');
facts = (await text('[data-id="inh-result"]')).replace(/\s+/g, ' ');
check('Muslim: wife 1/8 + son 7/8', facts.includes('1/8') && facts.includes('7/8'), facts);
await page.locator('input[data-id="other"]').check();
await page.waitForTimeout(100);
check('other heirs: app refuses to guess', (await text('.page')).includes('no result'), await text('.page'));
await page.locator('.tab[data-tab="home"]').click();

// 11d. government service guides (offline, bundled data)
await page.locator('.tab[data-tab="tools"]').click();
await page.locator('.module-live').nth(2).click();
await page.waitForSelector('[data-service]');
check('service guides: 5 entries listed', (await page.locator('[data-service]').count()) === 5);
check('intro says every item has a source and date', (await text('.page')).includes('source and the date it was checked'));
await page.locator('[data-service="land_record_online"] summary').click();
const rec = (await text('[data-service="land_record_online"]')).replace(/\s+/g, ' ');
check('khatian guide shows official fees 100 / 140 / 20 / 630', ['100', '140', '20', '630'].every((n) => rec.includes(`৳ ${n}`)), rec.slice(0, 400));
check('khatian guide shows official and news source badges', rec.includes('Official') && rec.includes('News'));
check('every external link is https and opens in a new tab', await page.evaluate(() => [...document.querySelectorAll('a.link[target="_blank"]')].every((a) => a.href.startsWith('https://') && a.rel.includes('noopener'))));
check('dlrms official link present', (await page.locator('a[href="https://dlrms.land.gov.bd"]').count()) === 1);
await page.locator('.chip[data-cat="legal_aid"]').click();
check('category filter shows only legal aid', (await page.locator('[data-service]').count()) === 1);
await page.locator('[data-service="legal_aid"] summary').click();
check('legal aid shows 16430 as a phone link and does not claim it is free', (await page.locator('a[href="tel:16430"]').count()) === 1 && !/free/i.test((await text('[data-service="legal_aid"]')).replace(/not say whether the hotline is free/, '')));
await shot('15-services');
await page.locator('.tab[data-tab="home"]').click();

// 12. maintenance mode blocks the app
await page.evaluate(() => __fake.setSetting('maintenance_mode', { enabled: true, message_bn: '', message_en: 'Back soon' }));
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForSelector('.blocked', { timeout: 5000 }).catch(() => {});
check('maintenance mode shows blocked screen', (await page.locator('.blocked').count()) === 1, await page.url());
check('custom maintenance message shown', (await text('.blocked')).includes('Back soon'));
await shot('12-maintenance');
await page.evaluate(() => __fake.setSetting('maintenance_mode', { enabled: false }));
await page.locator('.blocked .btn-primary').click();
await page.waitForSelector('.tab', { timeout: 5000 }).catch(() => {});
check('app recovers after maintenance ends', (await page.locator('.tab').count()) === 4);

// 13. unknown route
await page.evaluate(() => { location.hash = '#/does-not-exist'; });
await page.waitForSelector('.state');
check('unknown route shows not-found page', (await text('.state-title')).includes('not found'));

check('no JS errors or console errors during the whole run', problems.length === 0, problems.join(' | '));

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
