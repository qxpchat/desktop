// Pool fixture — leases test accounts from the `.env`-backed pool.
//
// One pool instance per worker. Tests declare how many accounts they need;
// the fixture hands out the first N slots not already in use. State reset is
// per-test (the `app` fixture wipes the local accounts dir), so the only
// concern at the lease level is parallel-test isolation: two specs running
// in parallel must not lease the same slot.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const TESTS_DIR = path.resolve(path.dirname(__filename), '..');
const ENV_PATH = path.join(TESTS_DIR, '.env');
const TEMPLATES_DIR = path.join(TESTS_DIR, 'fixtures', 'account-templates');
const MANIFEST_PATH = path.join(TEMPLATES_DIR, 'manifest.json');

export type PoolAccount = {
  slot: number;
  email: string;
  password: string;
  displayName: string;
};

let cached: PoolAccount[] | null = null;
let prefix = 'qxp e2e';

async function loadPool(): Promise<PoolAccount[]> {
  if (cached) return cached;
  let text: string;
  try {
    text = await readFile(ENV_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `No pool found at ${ENV_PATH}.\n  Run \`make test-accounts\` first.\n  (${(err as Error).message})`,
    );
  }
  const env = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env.set(k, v);
  }
  prefix = env.get('QXP_TEST_DISPLAY_NAME_PREFIX') ?? 'qxp e2e';

  const accounts: PoolAccount[] = [];
  let n = 1;
  while (true) {
    const email = env.get(`QXP_TEST_ACCT_${n}_EMAIL`);
    const password = env.get(`QXP_TEST_ACCT_${n}_PASSWORD`);
    if (!email || !password) break;
    accounts.push({ slot: n, email, password, displayName: `${prefix} ${n}` });
    n++;
  }
  if (accounts.length === 0) {
    throw new Error(`Pool at ${ENV_PATH} is empty. Run \`make test-accounts\`.`);
  }
  cached = accounts;
  return cached;
}

const inUse = new Set<number>();

export async function leaseAccounts(count: number): Promise<PoolAccount[]> {
  const pool = await loadPool();
  const leased: PoolAccount[] = [];
  for (const acct of pool) {
    if (inUse.has(acct.slot)) continue;
    inUse.add(acct.slot);
    leased.push(acct);
    if (leased.length === count) return leased;
  }
  // Roll back partial lease if we couldn't satisfy the count.
  for (const a of leased) inUse.delete(a.slot);
  throw new Error(
    `Pool has ${pool.length} accounts; ${pool.length - inUse.size + leased.length} free, ${count} requested.\n  Increase QXP_TEST_POOL_SIZE in .env and rerun \`make test-accounts\`.`,
  );
}

export function releaseAccounts(leased: PoolAccount[]): void {
  for (const a of leased) inUse.delete(a.slot);
}

// ---- pre-paired templates ----
//
// Phase 2+ specs lease a *pair* of slots that have already been Setup-
// Contact-paired via `ensure-pool.mjs`. The lease returns the slots plus
// the on-disk template paths the app fixture should copy into the
// daemon's accounts dir. Test setup then skips the 30-90s live
// handshake entirely.

export type PairTemplate = {
  pairId: number;
  main: PoolAccount;
  peer: PoolAccount;
  /** Path on disk to the snapshotted main-daemon accounts dir. */
  mainTemplateDir: string;
  /** Path on disk to the snapshotted peer-daemon accounts dir. */
  peerTemplateDir: string;
  /** Chat id of the verified 1:1 chat on the peer side, captured at
   *  template-build time. */
  peerPairedChatId: number;
};

type ManifestEntry = {
  pairId: number;
  mainSlot: number;
  peerSlot: number;
  mainEmail: string;
  peerEmail: string;
  peerPairedChatId: number;
  createdAt: string;
};

type TrioManifestEntry = {
  trioId: number;
  mainSlot: number;
  peer1Slot: number;
  peer2Slot: number;
  mainEmail: string;
  peer1Email: string;
  peer2Email: string;
  peer1PairedChatId: number;
  peer2PairedChatId: number;
  createdAt: string;
};

let manifestCache: ManifestEntry[] | null = null;
let trioManifestCache: TrioManifestEntry[] | null = null;

async function loadManifestFile(): Promise<{ templates: ManifestEntry[]; trios: TrioManifestEntry[] }> {
  let text: string;
  try {
    text = await readFile(MANIFEST_PATH, 'utf8');
  } catch {
    throw new Error(
      `No template manifest at ${MANIFEST_PATH}.\n  Run \`make test-accounts\` to build pair templates.`,
    );
  }
  const parsed = JSON.parse(text) as {
    version: number;
    templates: ManifestEntry[];
    trios?: TrioManifestEntry[];
  };
  if (parsed?.version !== 1 || !Array.isArray(parsed.templates)) {
    throw new Error(`Template manifest at ${MANIFEST_PATH} is malformed (version != 1).`);
  }
  return { templates: parsed.templates, trios: parsed.trios ?? [] };
}

async function loadManifest(): Promise<ManifestEntry[]> {
  if (manifestCache) return manifestCache;
  const { templates } = await loadManifestFile();
  manifestCache = templates;
  return manifestCache;
}

async function loadTrioManifest(): Promise<TrioManifestEntry[]> {
  if (trioManifestCache) return trioManifestCache;
  const { trios } = await loadManifestFile();
  trioManifestCache = trios;
  return trioManifestCache;
}

const pairsInUse = new Set<number>();
const triosInUse = new Set<number>();

export async function leasePair(): Promise<PairTemplate> {
  const templates = await loadManifest();
  if (templates.length === 0) {
    throw new Error(
      'No pair templates available. Run `make test-accounts` to build them.',
    );
  }
  const pool = await loadPool();
  for (const t of templates) {
    if (pairsInUse.has(t.pairId)) continue;
    const main = pool.find((a) => a.slot === t.mainSlot);
    const peer = pool.find((a) => a.slot === t.peerSlot);
    if (!main || !peer) continue;
    // Drift check: if the slot's email changed after the template was
    // built, the snapshot is stale and we can't safely use it.
    if (main.email !== t.mainEmail || peer.email !== t.peerEmail) continue;
    if (inUse.has(main.slot) || inUse.has(peer.slot)) continue;

    pairsInUse.add(t.pairId);
    inUse.add(main.slot);
    inUse.add(peer.slot);

    return {
      pairId: t.pairId,
      main,
      peer,
      mainTemplateDir: path.join(TEMPLATES_DIR, `pair-${t.pairId}`, 'main'),
      peerTemplateDir: path.join(TEMPLATES_DIR, `pair-${t.pairId}`, 'peer'),
      peerPairedChatId: t.peerPairedChatId,
    };
  }
  throw new Error(
    `No free pair templates (${templates.length} total, ${pairsInUse.size} in use).\n` +
      '  Increase QXP_TEST_TEMPLATE_PAIRS in your environment and rerun `make test-accounts`.',
  );
}

export function releasePair(p: PairTemplate): void {
  pairsInUse.delete(p.pairId);
  inUse.delete(p.main.slot);
  inUse.delete(p.peer.slot);
}

// ---- trio templates (main + 2 pre-paired peers) ----
//
// Used by Phase 2 chatlist specs that need two distinct verified peers
// to seed two chats — load-and-sort, pin, search. Without this, each
// such test does a live secure_join handshake for the second peer
// (Bob) which adds 30-150s and flakes on slow relays.

export type TrioTemplate = {
  trioId: number;
  main: PoolAccount;
  peer1: PoolAccount;
  peer2: PoolAccount;
  mainTemplateDir: string;
  peer1TemplateDir: string;
  peer2TemplateDir: string;
  peer1PairedChatId: number;
  peer2PairedChatId: number;
};

export async function leaseTrio(): Promise<TrioTemplate> {
  const trios = await loadTrioManifest();
  if (trios.length === 0) {
    throw new Error(
      'No trio templates available. Run `make test-accounts` to build them.',
    );
  }
  const pool = await loadPool();
  for (const t of trios) {
    if (triosInUse.has(t.trioId)) continue;
    const main = pool.find((a) => a.slot === t.mainSlot);
    const peer1 = pool.find((a) => a.slot === t.peer1Slot);
    const peer2 = pool.find((a) => a.slot === t.peer2Slot);
    if (!main || !peer1 || !peer2) continue;
    if (
      main.email !== t.mainEmail ||
      peer1.email !== t.peer1Email ||
      peer2.email !== t.peer2Email
    ) {
      continue;
    }
    if (inUse.has(main.slot) || inUse.has(peer1.slot) || inUse.has(peer2.slot)) continue;

    triosInUse.add(t.trioId);
    inUse.add(main.slot);
    inUse.add(peer1.slot);
    inUse.add(peer2.slot);

    return {
      trioId: t.trioId,
      main,
      peer1,
      peer2,
      mainTemplateDir: path.join(TEMPLATES_DIR, `trio-${t.trioId}`, 'main'),
      peer1TemplateDir: path.join(TEMPLATES_DIR, `trio-${t.trioId}`, 'peer1'),
      peer2TemplateDir: path.join(TEMPLATES_DIR, `trio-${t.trioId}`, 'peer2'),
      peer1PairedChatId: t.peer1PairedChatId,
      peer2PairedChatId: t.peer2PairedChatId,
    };
  }
  throw new Error(
    `No free trio templates (${trios.length} total, ${triosInUse.size} in use).\n` +
      '  Increase QXP_TEST_TEMPLATE_TRIOS in your environment and rerun `make test-accounts`.',
  );
}

export function releaseTrio(t: TrioTemplate): void {
  triosInUse.delete(t.trioId);
  inUse.delete(t.main.slot);
  inUse.delete(t.peer1.slot);
  inUse.delete(t.peer2.slot);
}
