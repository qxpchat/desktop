// Phase 9 — image cropper for the self-avatar (T011 / ACCT-010.2 + T147
// / MEDIA-009).
//
// The Settings → Profile screen feeds picked avatar files through
// `lib/ImageCropperDialog.svelte` instead of uploading them as-is. This
// test drives the file-input → cropper-opens → confirm path and asserts
// dc-core's `selfavatar` config ends up set. The cropper's pan/zoom
// gestures are visual polish (covered by manual QA, not Playwright); the
// programmatic test only confirms the round-trip: pick → crop dialog →
// Save → avatar persisted.

import { test, expect } from '../../fixtures/app-paired.js';
import { TID } from '../../helpers/selectors.js';
import { mediaPath } from '../../helpers/media.js';

test.setTimeout(120_000);

test('avatar cropper round-trips a picked file into `selfavatar`', async ({ qxpPaired, page }) => {
  const { mainRpc } = qxpPaired;
  const accountId = await mainRpc.call<number>('get_selected_account_id') as number;

  // Settings → Profile.
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settingsRailItem('profile')).click();

  // Feed the hidden file input directly — bypasses the OS file picker,
  // which Playwright can't drive cross-platform.
  await page.locator(TID.settingsProfileAvatarInput)
    .setInputFiles(mediaPath('test.png'));

  // Cropper dialog opens.
  await expect(page.locator(TID.imageCropperDialog)).toBeVisible({ timeout: 5_000 });

  // Confirm with the default centred crop — Save uploads the cropped PNG
  // and round-trips to `set_config`.
  await page.locator(TID.imageCropperDialogSave).click();
  await expect(page.locator(TID.imageCropperDialog)).toHaveCount(0, { timeout: 10_000 });

  // dc-core now has a `selfavatar` path set. Poll until the round-trip
  // settles (the canvas → blob → upload → set_config chain spans a few
  // event-loop turns).
  await expect.poll(
    async () => {
      const v = await mainRpc.call<string | null>('get_config', [accountId, 'selfavatar']);
      return v ?? '';
    },
    { timeout: 15_000 },
  ).not.toBe('');
});
