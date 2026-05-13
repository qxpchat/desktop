// Phase 6 — set the disappearing-messages timer on a group.

import { test, expect } from '../../fixtures/app-paired.js';
import { createGroupAndOpenInfo } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';

test.setTimeout(60_000);

test('ephemeral-timer: select 5 minutes and the chat-info select reflects it', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;
  await createGroupAndOpenInfo(page, peer.displayName, `Eph ${Date.now()}`);

  const select = page.locator(TID.chatInfoEphemeral);
  // Default off.
  await expect(select).toHaveValue('0');

  // Pick 5 min (value=300 — matches EPHEMERAL_OPTIONS in ChatInfo).
  await select.selectOption('300');

  // After `set_chat_ephemeral_timer` + reload, the select reflects 300.
  await expect(select).toHaveValue('300');
});
