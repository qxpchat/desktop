// Phase 1 — backup receive (add as second device).
//
// Two devices: A (already-configured "old" device) provides a backup
// over loopback HTTP; B (the device under test) scans/pastes the pair
// code and downloads the account from A.
//
// A is a temp daemon on :4042 with a leased pool account configured.
// `provide_backup` is fired without `await` (it blocks until B connects);
// `get_backup_qr` returns the DCBACKUP… code synchronously once the
// provider state is up. B then drives:
//   Welcome → Add as Second Device → Paste Code Manually → Pair → confirm
// and expects the chat shell.
//
// The pool slot stays leased so A's mailbox state is coherent throughout.

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
let provideBackupPromise: Promise<unknown> | null = null;
let pairQr: string | null = null;

test.beforeAll(async () => {
  leased = await leaseAccounts(1);
  temp = await spawnTempDaemon(TEMP_DAEMON_PORT);
  const accountId = await configureAccount(temp, leased[0].email, leased[0].password);

  // `provide_backup` is the long-running side of the transfer — it
  // resolves only after the receiver completes `get_backup`. Fire and
  // don't await. We keep the promise so afterAll can swallow its
  // rejection cleanly when we tear the daemon down.
  provideBackupPromise = temp.rpc
    .call('provide_backup', [accountId])
    .catch(() => { /* expected to error / abort on teardown */ });

  // Poll get_backup_qr until provide_backup has registered the provider
  // state. Typically immediate (<200ms) but the call shape returns
  // an error before state is set up.
  const deadline = Date.now() + 15_000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      pairQr = await temp.rpc.call<string>('get_backup_qr', [accountId]);
      if (pairQr && /^DCBACKUP\d*:/i.test(pairQr)) break;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!pairQr) {
    throw new Error(`get_backup_qr never returned a usable code; last error: ${String(lastErr)}`);
  }
});

test.afterAll(async () => {
  // Tearing down the temp daemon kills provide_backup; the awaiting
  // promise rejects, which we already swallowed in beforeAll.
  if (temp) await temp.shutdown();
  await provideBackupPromise;
  releaseAccounts(leased);
  leased = [];
  temp = null;
  pairQr = null;
});

test('Add as Second Device pairs and lands in the chat shell', async ({ page }) => {
  if (!pairQr) throw new Error('beforeAll did not produce a pair QR');

  // 1. Welcome → alt menu → Add as Second Device.
  await expect(page.locator(TID.onboardingWelcome)).toBeVisible();
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeAddSecondDevice).click();
  await expect(page.locator(TID.onboardingBackupReceive)).toBeVisible();

  // 2. Camera path is unavailable in headless Chromium AND the qxp
  // Scanner stubs to no-op under QXP_TEST_MODE — use the manual paste
  // form. (Also exercises the paste-flow code path which is otherwise
  // untested.)
  await page.locator(TID.onboardingBackupReceivePasteOpen).click();
  await page.locator(TID.onboardingBackupReceivePasteInput).fill(pairQr);
  await page.locator(TID.onboardingBackupReceivePasteSubmit).click();

  // 3. The "Pair this device?" confirmation dialog opens. Confirm → the
  // receiver-side get_backup RPC fires; the chat shell mounts once
  // import + start_io complete.
  await page.locator(TID.onboardingBackupReceiveConfirm).click();
  await expect(page.locator(TID.appShell)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(TID.chatList)).toBeVisible();
});
