// Phase 7 — show own QR.
//
// Click the QR footer button in nav-tabs. QrShow opens, renders an
// SVG, and the URL line carries a valid Delta-Chat invite scheme
// (openpgp4fpr:… or its https mirror).

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('Show QR: own setup-contact QR renders SVG + invite URL', async ({ page }) => {
  // The NavTabs profile rail (which contains the Show-QR footer button)
  // is collapsed by default — toggle it open via the chat-list burger
  // before clicking Show QR.
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsQrShow).click();
  await expect(page.locator(TID.qrShow)).toHaveAttribute('data-scope', 'self');

  // Render is async (daemon call); wait for the card to mount.
  await expect(page.locator(TID.qrShowCard)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TID.qrShowSvg).locator('svg')).toBeVisible();

  const url = await page.locator(TID.qrShowUrl).textContent();
  expect(url).toBeTruthy();
  expect(url!.toLowerCase()).toMatch(/^(openpgp4fpr:|https:\/\/i\.delta\.chat\/)/);
});
