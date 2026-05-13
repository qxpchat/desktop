// Phase 1 — backup import.
//
// A temp daemon configures one pool account and exports a `.tar` backup
// to a known location. The test then drives:
//   Welcome → "I Already Have a Profile" → Restore Backup → file picker
// uploading that .tar, expects the chat shell on success.
//
// The pool slot stays leased for the duration so the relay-side mailbox
// stays coherent across export + import.

import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { test, expect } from '../../fixtures/app.js';
import {
  leaseAccounts,
  releaseAccounts,
  type PoolAccount,
} from '../../fixtures/accounts.js';
import { spawnTempDaemon, configureAccount, type TempDaemon } from '../../fixtures/daemon.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(180_000);

const TEMP_DAEMON_PORT = 4042;

let leased: PoolAccount[] = [];
let temp: TempDaemon | null = null;
let backupPath: string | null = null;
let backupHostDir: string | null = null;

test.beforeAll(async () => {
  leased = await leaseAccounts(1);
  temp = await spawnTempDaemon(TEMP_DAEMON_PORT);
  const accountId = await configureAccount(temp, leased[0].email, leased[0].password);

  // export_backup writes `delta-chat-*.tar` into the destination dir; the
  // path isn't returned, so we glob the dir afterwards.
  backupHostDir = await mkdtemp(path.join(tmpdir(), 'qxp-e2e-backup-'));
  await temp.rpc.call('export_backup', [accountId, backupHostDir, null]);
  const entries = await readdir(backupHostDir);
  const tar = entries.find((e) => e.endsWith('.tar'));
  if (!tar) {
    throw new Error(`export_backup produced no .tar in ${backupHostDir}; saw ${entries.join(', ')}`);
  }
  backupPath = path.join(backupHostDir, tar);
});

test.afterAll(async () => {
  if (temp) await temp.shutdown();
  if (backupHostDir) await rm(backupHostDir, { recursive: true, force: true });
  releaseAccounts(leased);
  leased = [];
  temp = null;
  backupPath = null;
  backupHostDir = null;
});

test('Restore Backup with a valid .tar lands in the chat shell', async ({ page }) => {
  if (!backupPath) throw new Error('beforeAll did not produce a backup path');

  // 1. Welcome → alt menu → Restore Backup.
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeRestoreBackup).click();
  await expect(page.locator(TID.onboardingBackupImport)).toBeVisible();

  // 2. Upload the prepared .tar via the picker's hidden <input type="file">.
  await page.locator(TID.onboardingBackupImportPicker).setInputFiles(backupPath);

  // 3. Importing is a heavy RPC + chatmail handshake — chat shell appears
  //    when import_backup + start_io complete.
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(TID.chatList)).toBeVisible();
});
