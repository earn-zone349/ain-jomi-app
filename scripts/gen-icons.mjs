// Generates Android launcher icons from an inline SVG into android-res/ (committed to the repo).
// Needs the "sharp" package, e.g.:  npm i --no-save sharp && node scripts/gen-icons.mjs
// CI copies android-res/ over android/app/src/main/res/ after `cap add android`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GREEN = '#0f5c4d';
const WHITE = '#ffffff';

// Scales of justice, drawn on a 108x108 adaptive-icon canvas, kept inside the 66dp safe zone.
const glyph = (color) => `
  <g fill="none" stroke="${color}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M54 30v46"/>
    <path d="M42 78h24"/>
    <path d="M36 38h36"/>
    <path d="M36 38l-9 19h18z"/>
    <path d="M72 38l-9 19h18z"/>
    <path d="M27 57a9 5 0 0 0 18 0"/>
    <path d="M63 57a9 5 0 0 0 18 0"/>
  </g>`;

const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${glyph(WHITE)}</svg>`;
const legacySvg = (round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="${round ? 54 : 24}" fill="${GREEN}"/><g transform="translate(54 54) scale(1.15) translate(-54 -54)">${glyph(WHITE)}</g></svg>`;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function main() {
  const sharp = (await import('sharp')).default;
  for (const [name, scale] of Object.entries(DENSITIES)) {
    const dir = join('android-res', `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * scale);
    const adaptive = Math.round(108 * scale);
    await sharp(Buffer.from(legacySvg(false)), { density: 384 }).resize(legacy, legacy).png().toFile(join(dir, 'ic_launcher.png'));
    await sharp(Buffer.from(legacySvg(true)), { density: 384 }).resize(legacy, legacy).png().toFile(join(dir, 'ic_launcher_round.png'));
    await sharp(Buffer.from(foregroundSvg), { density: 384 }).resize(adaptive, adaptive).png().toFile(join(dir, 'ic_launcher_foreground.png'));
  }
  mkdirSync(join('android-res', 'values'), { recursive: true });
  writeFileSync(join('android-res', 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${GREEN}</color>\n</resources>\n`);
  mkdirSync('public', { recursive: true });
  await sharp(Buffer.from(legacySvg(false)), { density: 384 }).resize(512, 512).png().toFile(join('public', 'icon-512.png'));
  console.log('icons written to android-res/ and public/icon-512.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
