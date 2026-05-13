// Test media fixtures for Phase 3 attachment specs.
//
// We don't check binaries into git — instead we materialize minimal valid
// files on first call. The files are tiny (~50–500 bytes each) and just
// good enough that:
//   - the daemon side accepts them via `send_msg` with the matching
//     viewtype (delta-chat-core doesn't deep-validate when the caller
//     explicitly tags the viewtype),
//   - the receiving bubble renders with the right cell.
//
// Bytes are inlined as base64 so this module has no I/O at import time.
// `ensureFixtures()` is idempotent and cheap to call from each spec's
// `beforeAll`.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = path.resolve(__dirname, '..', 'fixtures', 'media');

// 67-byte valid 1×1 transparent PNG.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

// 26-byte smallest possible GIF — 1×1 transparent.
const GIF_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// 28-byte ftyp + 8-byte empty mdat = ~36-byte stub MP4. dc-core stores
// the bytes verbatim and tags as Video; rendering ImageCell logic just
// shows a generic placeholder when probing fails.
// ftyp(mp42, 0, mp42, isom) + mdat(empty)
const MP4_B64 =
  'AAAAGGZ0eXBtcDQyAAAAAG1wNDJpc29tAAAACG1kYXQ=';

// ID3v2 header (10 bytes) + a single silent MP3 frame (~104 bytes). Plays
// as a tick of silence in any MP3-capable player, satisfies dc-core's
// "this looks like audio" sniff.
const MP3_B64 =
  'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAA' +
  'AAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACgACAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICA////////////////////////////////' +
  '////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDgAAAAAAAAAAEoCfymGAA' +
  'AAAAAAAAAAAAAAAAAAA=';

// Minimal-but-valid PDF, ~470 bytes.
const PDF_TEXT = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000054 00000 n
0000000100 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
153
%%EOF
`;

// vCard 3.0. dc-core parses this to extract the contact card preview.
const VCF_TEXT = `BEGIN:VCARD
VERSION:3.0
FN:qxp test contact
N:test;qxp;;;
EMAIL:qxp-test@example.com
END:VCARD
`;

type Fixture = { name: string; content: Buffer };

const FIXTURES: Fixture[] = [
  { name: 'test.png', content: Buffer.from(PNG_B64, 'base64') },
  { name: 'test.gif', content: Buffer.from(GIF_B64, 'base64') },
  { name: 'test.mp4', content: Buffer.from(MP4_B64, 'base64') },
  { name: 'test.mp3', content: Buffer.from(MP3_B64, 'base64') },
  { name: 'test.pdf', content: Buffer.from(PDF_TEXT, 'utf8') },
  { name: 'test.vcf', content: Buffer.from(VCF_TEXT, 'utf8') },
];

let materialized = false;

/** Write all fixture files to `fixtures/media/` if any are missing. Cheap
 *  to call repeatedly: short-circuits after the first successful run. */
export function ensureFixtures(): void {
  if (materialized) return;
  mkdirSync(MEDIA_DIR, { recursive: true });
  for (const f of FIXTURES) {
    const p = path.join(MEDIA_DIR, f.name);
    if (!existsSync(p)) writeFileSync(p, f.content);
  }
  materialized = true;
}

export function mediaPath(name: string): string {
  return path.join(MEDIA_DIR, name);
}
