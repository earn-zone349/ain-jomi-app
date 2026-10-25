import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatEffectiveDate, fillPlaceholders, buildVars, loadPages, sqlText, toSeedSql, toStaticHtml } from '../scripts/build-legal.mjs';
import { patchGradle } from '../scripts/android-patch.mjs';
import { checkImports, checkI18n } from '../scripts/check-source.mjs';

test('formatEffectiveDate in both languages', () => {
  assert.deepEqual(formatEffectiveDate('2026-10-22'), { en: '22 October 2026', bn: '২২ অক্টোবর ২০২৬' });
  assert.throws(() => formatEffectiveDate('22/10/2026'));
  assert.throws(() => formatEffectiveDate('2026-13-01'));
});

test('fillPlaceholders rejects unknown placeholders (typos never ship)', () => {
  assert.equal(fillPlaceholders('Hi {{APP_NAME}}', { APP_NAME: 'X' }), 'Hi X');
  assert.throws(() => fillPlaceholders('Hi {{APP_NAMME}}', { APP_NAME: 'X' }), /Unknown placeholder/);
});

test('legal pages: all six texts load, no placeholder left, Bangla and English both non-trivial', () => {
  const pages = loadPages(process.cwd(), { LEGAL_EFFECTIVE_DATE: '2026-10-22', VITE_SUPPORT_EMAIL: 'help@example.com' });
  assert.deepEqual(Object.keys(pages).sort(), ['disclaimer', 'privacy', 'terms']);
  for (const [slug, p] of Object.entries(pages)) {
    for (const lang of ['bn', 'en']) {
      assert.ok(p.body[lang].length > 300, `${slug}.${lang} too short`);
      assert.ok(!p.body[lang].includes('{{'), `${slug}.${lang} has an unfilled placeholder`);
      assert.ok(p.title[lang].length > 3);
    }
  }
  assert.ok(pages.privacy.body.en.includes('help@example.com'));
  assert.ok(pages.privacy.body.bn.includes('২২ অক্টোবর ২০২৬'));
});

test('buildVars falls back when no support email is configured', () => {
  assert.match(buildVars('en', { VITE_SUPPORT_EMAIL: '' }).SUPPORT_EMAIL, /support contact/);
});

test('sqlText picks a dollar-quote tag that cannot collide', () => {
  assert.equal(sqlText('plain'), '$aj$plain$aj$');
  assert.equal(sqlText('has $aj$ inside'), '$ajx$has $aj$ inside$ajx$');
});

test('seed SQL is insert-only and idempotent', () => {
  const pages = loadPages(process.cwd(), {});
  const sql = toSeedSql(pages);
  assert.match(sql, /on conflict \(slug\) do nothing;/);
  assert.equal((sql.match(/\('(disclaimer|terms|privacy)'/g) || []).length, 3);
});

test('static HTML escapes content', () => {
  const html = toStaticHtml('privacy', { title: { bn: 'শিরোনাম', en: 'Title <b>' }, body: { bn: 'শিরোনাম\n\n- <script>x</script>', en: 'Title\n\nA & B "q"' } });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A &amp; B &quot;q&quot;'));
  assert.ok(html.includes('<ul>') && html.includes('</ul>'));
});

const TEMPLATE = `android {
    namespace "bd.ainjomi.app"
    defaultConfig {
        applicationId "bd.ainjomi.app"
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
`;

test('android-patch sets version and (optionally) release signing', () => {
  const plain = patchGradle(TEMPLATE, { versionCode: 42, versionName: '0.1.0' });
  assert.match(plain, /versionCode 42/);
  assert.match(plain, /versionName "0.1.0"/);
  assert.ok(!plain.includes('signingConfigs'));

  const signed = patchGradle(TEMPLATE, { versionCode: 7, versionName: '1.2.3', signing: true });
  assert.match(signed, /signingConfigs \{\s+release \{/);
  assert.match(signed, /release \{\s+signingConfig signingConfigs\.release/);
  assert.ok(signed.indexOf('signingConfigs {') < signed.indexOf('buildTypes {'), 'signingConfigs must be declared before buildTypes');
  // idempotent
  assert.equal(patchGradle(signed, { versionCode: 7, versionName: '1.2.3', signing: true }), signed);
});

test('android-patch fails loudly on a surprising template or bad input', () => {
  assert.throws(() => patchGradle('android {}', { versionCode: 1, versionName: '1.0' }), /versionCode not found/);
  assert.throws(() => patchGradle(TEMPLATE, { versionCode: 0, versionName: '1.0' }));
  assert.throws(() => patchGradle(TEMPLATE, { versionCode: 1, versionName: 'v1' }));
  assert.throws(() => patchGradle(TEMPLATE.replace('buildTypes', 'flavors'), { versionCode: 1, versionName: '1.0', signing: true }), /buildTypes/);
});

test('source checks pass on the real project', async () => {
  assert.deepEqual(checkImports(), []);
  assert.deepEqual(await checkI18n(), []);
});

test('import checker really detects broken imports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ajcheck-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.js'), "export const real = 1;\nexport default function f() {}\n");
  writeFileSync(join(dir, 'src', 'b.js'), "import f, { real, ghost } from './a.js';\nimport x from './missing.js';\nimport './style.css';\n");
  const problems = checkImports(dir);
  assert.ok(problems.some((p) => p.includes("'ghost' is not exported")));
  assert.ok(problems.some((p) => p.includes('cannot resolve ./missing.js')));
  assert.ok(problems.some((p) => p.includes('missing file ./style.css')));
  assert.ok(!problems.some((p) => p.includes("'real'")));
});
