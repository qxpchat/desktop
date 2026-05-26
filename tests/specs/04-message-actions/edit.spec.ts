// Phase 4 — edit an outgoing text message.

import { test, expect } from '../../fixtures/app-paired.js';
import {
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
