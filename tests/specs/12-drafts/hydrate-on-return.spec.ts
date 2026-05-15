// Phase 12 — drafts: hydrate on app reload.
//
// Drafts live in localStorage, so a full page reload (browser refresh,
// not a daemon restart) must restore the user's in-flight text the
// next time they open the same chat.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('draft text survives a page reload', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  const draft = `survives reload ${Date.now()}`;

  // Type a draft into peer's chat composer.
  await openChatByName(page, peer.displayName);
  await page.locator(TID.composerTextarea).fill(draft);

  // Reload: SPA boots fresh against the same daemon + localStorage.
  await page.reload();

  // Chat is no longer selected after reload — pick it again. Then the
  // composer's hydration effect reads the localStorage entry.
  await openChatByName(page, peer.displayName);
  await expect(page.locator(TID.composerTextarea)).toHaveValue(draft);
});
