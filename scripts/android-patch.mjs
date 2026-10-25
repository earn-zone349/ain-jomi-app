// Patches the generated Android project (created by `npx cap add android` in CI):
//   * versionCode / versionName
//   * release signing from environment variables (only when a keystore is provided)
//
// Usage (CI):  node scripts/android-patch.mjs
// Env: VERSION_CODE, VERSION_NAME, and optionally KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
//
// Patching fails loudly if the template does not look as expected, instead of silently shipping
// a wrongly-versioned or unsigned build.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function patchGradle(text, { versionCode, versionName, signing = false }) {
  if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error(`versionCode must be a positive integer, got ${versionCode}`);
  if (!/^\d+(\.\d+){0,3}$/.test(versionName)) throw new Error(`versionName must look like 1.2.3, got "${versionName}"`);

  let out = text;

  if (!/versionCode\s+\d+/.test(out)) throw new Error('build.gradle: versionCode not found');
  if (!/versionName\s+"[^"]*"/.test(out)) throw new Error('build.gradle: versionName not found');
  out = out.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

  if (signing && !out.includes('signingConfigs.release')) {
    const buildTypes = /(\n\s*)buildTypes\s*\{/;
    if (!buildTypes.test(out)) throw new Error('build.gradle: buildTypes block not found');
    out = out.replace(
      buildTypes,
      `$1signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {`,
    );
    const release = /(\n\s*)release\s*\{/;
    if (!release.test(out.slice(out.indexOf('buildTypes {')))) throw new Error('build.gradle: release block not found');
    const idx = out.indexOf('buildTypes {');
    const head = out.slice(0, idx);
    const tail = out.slice(idx).replace(release, `$1release {\n            signingConfig signingConfigs.release`);
    out = head + tail;
  }
  return out;
}

function main() {
  const file = 'android/app/build.gradle';
  if (!existsSync(file)) throw new Error(`${file} not found. Run "npx cap add android" first.`);
  const signing = Boolean(process.env.KEYSTORE_PATH && process.env.KEYSTORE_PASSWORD && process.env.KEY_ALIAS && process.env.KEY_PASSWORD);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const patched = patchGradle(readFileSync(file, 'utf8'), {
    versionCode: Number.parseInt(process.env.VERSION_CODE || '1', 10),
    versionName: process.env.VERSION_NAME || pkg.version,
    signing,
  });
  writeFileSync(file, patched);
  console.log(`android-patch: version ${process.env.VERSION_NAME || pkg.version} (${process.env.VERSION_CODE || 1}), release signing ${signing ? 'ON' : 'OFF (debug build only)'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
