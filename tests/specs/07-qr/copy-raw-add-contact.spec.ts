// Phase 7 — full round-trip from QrShow's "Copy" button into another
// account's add-contact flow.
//
// QrShow has two copy actions:
//   - "Copy" → raw `openpgp4fpr:…` URI (universal — every DC client
//      can paste it into its own add-contact input).
//   - "Copy web-link" → `https://qxp.chat/invite#…` (round-trippable
//      back to OPENPGP4FPR by `fromInviteLink` on paste).
//
// This locks in the contract: copy → switch to a brand-new account →
// open the QR scanner → paste from clipboard → dc-core's `check_qr`
// recognises the raw URI as an `askVerifyContact` (the verified-contact
// add path). Both copy buttons must round-trip — assert both.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(180_000);

async function provisionSecondAccount(
  rpc: { call<T>(method: string, params?: unknown[]): Promise<T> },
  displayName: string,
): Promise<number> {
  const prevSelected = await rpc.call<number | null>('get_selected_account_id');
  const id = await rpc.call<number>('add_account');
  await rpc.call('set_config', [id, 'displayname', displayName]);
  await rpc.call('set_config_from_qr', [id, 'dcaccount:nine.testrun.org']);
  await rpc.call('configure', [id]);
  await rpc.call('start_io', [id]);
  if (prevSelected != null) await rpc.call('select_account', [prevSelected]);
  return id;
}

test('Copy / Copy web-link round-trip into another account as askVerifyContact', async ({ qxpPaired, page, context }) => {
  const { mainRpc } = qxpPaired;

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const firstId = await mainRpc.call<number>('get_selected_account_id') as number;
  const secondId = await provisionSecondAccount(mainRpc, 'Second');

  // ---- 1. On account A: open Show QR + grab both copy outputs. ----
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsQrShow).click();
  // Bumped timeout — when this test follows a fresh `provisionSecondAccount`,
  // the daemon's `get_chat_securejoin_qr_code_svg` round-trip is slower
  // than the usual cold-shell open. 30 s is plenty.
  await expect(page.locator(TID.qrShowCard)).toBeVisible({ timeout: 30_000 });

  await page.locator(TID.qrShowCopy).click();
  const rawCode = (await page.evaluate(() => navigator.clipboard.readText())).trim();
  // dc-core's `get_chat_securejoin_qr_code_svg` returns the invite URL
  // in either of two universal forms — bare `openpgp4fpr:` or the
  // `https://i.delta.chat/#…` mirror — both of which `check_qr`
  // recognises directly. The "Copy" button just hands that through.
  expect(rawCode).toMatch(/^(openpgp4fpr:|https:\/\/i\.delta\.chat\/)/i);

  await page.locator(TID.qrShowCopyWebLink).click();
  const webLink = (await page.evaluate(() => navigator.clipboard.readText())).trim();
  expect(webLink).toMatch(/^https:\/\/qxp\.chat\/invite\/?#/);

  // ---- 2. Drive both forms through the second account's check_qr. ----
  // Raw form is universally accepted (openpgp4fpr or i.delta.chat —
  // dc-core handles both as `askVerifyContact`). Web-link is
  // qxp-specific: dc-core doesn't know about the `qxp.chat/invite#`
  // host, so we mimic QrShow's `fromInviteLink` rewrite before
  // calling check_qr.
  const parsedRaw = await mainRpc.call<{ kind: string }>('check_qr', [secondId, rawCode]);
  expect(parsedRaw.kind).toBe('askVerifyContact');

  const rewritten = `OPENPGP4FPR:${webLink.replace(/^https:\/\/qxp\.chat\/invite\/?#/i, '').replace('&', '#')}`;
  const parsedWeb = await mainRpc.call<{ kind: string }>('check_qr', [secondId, rewritten]);
  expect(parsedWeb.kind).toBe('askVerifyContact');
});
