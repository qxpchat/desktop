// Phase 7 — full round-trip from QrShow's "Copy" button into another
// account's add-contact flow.
//
// QrShow has two copy actions, both derived from the raw OPENPGP4FPR
// URI the daemon returns:
//   - "Copy" → bare `OPENPGP4FPR:…` URI (universal — every DC client
//      accepts it in its add-contact input).
//   - "Copy web-link" → canonical `https://i.delta.chat/#…` URL (same
//      payload, link-friendly).
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
  // First expand the rail (tiles + QR-show button live there).
  await page.locator(TID.chatListBurger).click();
  // dc-core's `add_account` auto-selects the new account (see
  // `accounts.rs:new_account`). We restore the daemon's selected
  // account in `provisionSecondAccount`, but that path doesn't fire an
  // `AccountsItemChanged` event, so the SPA's mirror (`accounts.selectedId`)
  // can still be stuck on `secondId`. Click the firstId tile to drive
  // the resync through the same path real users take — otherwise the
  // QR rendered below would belong to `secondId`, and `check_qr` would
  // return `withdrawVerifyContact` (the QR is its own).
  await page.locator(TID.navTabsAccountById(firstId)).click();
  await page.locator(TID.navTabsQrShow).click();
  // Bumped timeout — when this test follows a fresh `provisionSecondAccount`,
  // the daemon's `get_chat_securejoin_qr_code_svg` round-trip is slower
  // than the usual cold-shell open. 30 s is plenty.
  await expect(page.locator(TID.qrShowCard)).toBeVisible({ timeout: 30_000 });

  await page.locator(TID.qrShowCopy).click();
  const rawCode = (await page.evaluate(() => navigator.clipboard.readText())).trim();
  // "Copy" produces the raw OPENPGP4FPR URI — what dc-core emits and
  // every DC-compatible client recognises directly in its add-contact
  // paste box.
  expect(rawCode).toMatch(/^OPENPGP4FPR:/i);

  await page.locator(TID.qrShowCopyWebLink).click();
  const webLink = (await page.evaluate(() => navigator.clipboard.readText())).trim();
  // "Copy web-link" produces the qxp-branded landing URL, derived
  // client-side from the raw URI.
  expect(webLink).toMatch(/^https:\/\/qxp\.chat\/invite\/#/);

  // ---- 2. Drive both forms through the second account's check_qr. ----
  // Raw URI parses directly; the qxp invite URL must first be rewritten
  // back to OPENPGP4FPR (production does this via `fromQxpInviteUrl`).
  const parsedRaw = await mainRpc.call<{ kind: string }>('check_qr', [secondId, rawCode]);
  expect(parsedRaw.kind).toBe('askVerifyContact');

  const rewritten = `OPENPGP4FPR:${webLink
    .replace(/^https:\/\/qxp\.chat\/invite\/?#/i, '')
    .replace('&', '#')}`;
  const parsedWeb = await mainRpc.call<{ kind: string }>('check_qr', [secondId, rewritten]);
  expect(parsedWeb.kind).toBe('askVerifyContact');
});
