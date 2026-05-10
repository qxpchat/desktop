#!/usr/bin/env node
// Convert the iOS app's `Localizable.xcstrings` (Apple's modern JSON format
// for SwiftUI / iOS 26 string catalogs) into a flat `{ "<source>": "<en>" }`
// map for the web frontend's tiny i18n helper (see `web/frontend/src/lib/i18n/i18n.ts`).
//
// Usage (from `web/`):
//   node scripts/sync-strings.mjs
//
// Output: web/frontend/locales/en.json (overwritten).
//
// The iOS catalog uses the source English string as the key, so the output
// is essentially the identity map — its purpose is to (a) lock in the set
// of canonical strings for translation work and (b) serve as the lookup
// table the daemon ships from `/locales/<lang>.json`.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const xcstringsPath = resolve(repoRoot, 'ios/qxp/Localizable.xcstrings');
// Vite serves files from `public/` at the URL root, so `/locales/en.json`
// resolves to `web/frontend/public/locales/en.json`.
const outPath = resolve(repoRoot, 'web/frontend/public/locales/en.json');

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
