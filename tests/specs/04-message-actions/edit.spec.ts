// Phase 4 — edit an outgoing text message.

import { test, expect } from '../../fixtures/app-paired.js';
import {
  createGroupChat,
  openChatByName,
  sendComposerText,
  waitForChatRowByName,
} from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(90_000);

test('edit replaces the bubble text and marks it edited', async ({ qxpPaired, page }) => {
  const { peer } = qxpPaired;

  await peer.sendTo('hi');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  await sendComposerText(page, 'orginal typo');

  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: 'orginal typo' },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });

  await outgoing.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('edit')).click();
  await expect(page.locator(TID.composerQuoteBar)).toHaveAttribute('data-mode', 'edit');

  const ta = page.locator(TID.composerTextarea);
  await ta.fill('original (fixed)');
  await page.locator(TID.composerSend).click();

  const edited = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-edited="true"]`,
    { hasText: 'original (fixed)' },
  );
  await expect(edited).toBeVisible({ timeout: 15_000 });
});

test('forwarded outgoing messages omit the Edit context-menu action', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  // Need a distinct chat to forward into so the bubble actually lands as
  // forwarded (rather than just duplicated in the source chat).
  const groupName = `No-edit forward ${Date.now()}`;
  await createGroupChat(page, peer.displayName, groupName);

  await openChatByName(page, peer.displayName);
  const original = `forward-no-edit ${Date.now()}`;
  await sendComposerText(page, original);
  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: original },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });

  // Forward → pick the group → confirm.
  await outgoing.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('forward')).click();
  await page.locator(TID.chatPickerSearch).fill(groupName);
  await page.locator(TID.chatPickerRowByName(groupName)).first().click();
  await page.locator(TID.confirmDialogConfirm).click();

  // Now in the group — the forwarded bubble is outgoing+forwarded.
  const forwarded = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"][data-forwarded="true"]`,
    { hasText: original },
  );
  await expect(forwarded).toBeVisible({ timeout: 15_000 });

  await forwarded.click({ button: 'right' });
  // Edit must not be in the context menu — core rejects edit on forwarded.
  await expect(page.locator(TID.msgContextMenuItem('edit'))).toHaveCount(0);
  // Forward (a non-forwarded-specific action) should still be available.
  await expect(page.locator(TID.msgContextMenuItem('forward'))).toBeVisible();
});

test('editing a long message grows the composer textarea beyond min-height', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;

  await peer.sendTo('hi');
  await waitForChatRowByName(page, peer.displayName, ARRIVAL_TIMEOUT_MS);
  await openChatByName(page, peer.displayName);

  // A body long enough to wrap several lines once seeded into the composer.
  const long = Array.from({ length: 8 }, (_, i) => `line ${i + 1} of the long draft`).join('\n');
  await sendComposerText(page, long);

  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
    { hasText: 'line 1 of the long draft' },
  );
  await expect(outgoing).toBeVisible({ timeout: 10_000 });

  await outgoing.click({ button: 'right' });
  await page.locator(TID.msgContextMenuItem('edit')).click();
  await expect(page.locator(TID.composerQuoteBar)).toHaveAttribute('data-mode', 'edit');

  const ta = page.locator(TID.composerTextarea);
  // Textarea CSS sets min-height: 36px. After seeding a multi-line body the
  // autosize routine should have grown it well past that.
  await expect
    .poll(async () => (await ta.boundingBox())?.height ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(60);
});
