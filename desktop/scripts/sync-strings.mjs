#!/usr/bin/env node
// Convert the iOS app's `Localizable.xcstrings` (Apple's modern JSON format
// for SwiftUI / iOS 26 string catalogs) into a flat `{ "<source>": "<en>" }`
// map for the desktop frontend's tiny i18n helper (see
// `desktop/frontend/src/lib/i18n/i18n.svelte.ts`).
//
// Usage (from the repo root):
//   node desktop/scripts/sync-strings.mjs
//
// Output: desktop/frontend/public/locales/en.json (overwritten).
//
// The iOS catalog uses the source English string as the key, so the output
// is essentially the identity map — its purpose is to lock in the set of
// canonical strings for translation work, and to serve as the lookup table
// the Vite build serves from `/locales/<lang>.json` (Vite copies anything
// under `public/` to the URL root).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const xcstringsPath = resolve(repoRoot, 'ios/qxp/Localizable.xcstrings');
const outPath = resolve(repoRoot, 'desktop/frontend/public/locales/en.json');

const raw = readFileSync(xcstringsPath, 'utf8');
const catalog = JSON.parse(raw);

if (catalog.sourceLanguage !== 'en') {
  console.error(`expected sourceLanguage=en, got ${catalog.sourceLanguage}`);
  process.exit(1);
}

/** @type {Record<string, string>} */
const out = {};
let total = 0;
let skipped = 0;
for (const [key, entry] of Object.entries(catalog.strings ?? {})) {
  total++;
  if (!key) continue; // empty keys exist in the catalog as placeholders
  const en = entry?.localizations?.en?.stringUnit?.value;
  if (typeof en === 'string') {
    out[key] = en;
  } else {
    // No explicit "en" translation — fall back to the key itself so callers
    // get a sensible string instead of `undefined`.
    out[key] = key;
    skipped++;
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`wrote ${Object.keys(out).length} strings to ${outPath}`);
if (skipped > 0) console.log(`(${skipped} entries had no explicit en value; key used as fallback)`);
console.log(`source: ${xcstringsPath} (${total} total entries)`);
