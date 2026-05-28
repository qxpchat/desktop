// Phase 2 — chat-list multiselect + batch actions (T039 / CHATLIST-010).
//
// Desktop-style selection: Ctrl/Cmd+click toggles rows into a set (Shift+click
// extends a range). A selection bar shows the count; right-clicking a selected
// row opens the shared context menu, now acting on the whole set. This spec
// selects two chats and batch-archives them, asserting both leave the inbox.

import { test, expect } from '../../fixtures/app-trio.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('Ctrl+click selects multiple chats; batch archive clears them from the inbox', async ({
  qxpTrio,
  page,
}) => {
  const { peer1, peer2 } = qxpTrio;

  await peer1.sendTo('hi from one');
  await peer2.sendTo('hi from two');

  const row1 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  const row2 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`,
  );
  await expect(row1).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(row2).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Ctrl+click both → both join the selection; bar shows the count.
  await page.keyboard.down('Control');
  await row1.click();
  await expect(row1).toHaveAttribute('data-multi-selected', 'true');
  await row2.click();
  await page.keyboard.up('Control');
  await expect(row2).toHaveAttribute('data-multi-selected', 'true');
  await expect(page.locator(TID.chatListSelectionBar)).toBeVisible();
  await expect(page.locator(TID.chatListSelectionBarCount)).toHaveText('2');

  // Right-click a selected row → menu acts on the whole set. Archive both.
  await row2.click({ button: 'right' });
  await expect(page.locator(TID.chatRowMenu)).toBeVisible();
  await page.locator(TID.chatRowMenuItem('archive')).click();

  // Both rows leave the inbox; the selection clears and the archive link
  // appears (two chats now archived).
  await expect(row1).toHaveCount(0, { timeout: 10_000 });
  await expect(row2).toHaveCount(0);
  await expect(page.locator(TID.chatListSelectionBar)).toHaveCount(0);
  await expect(page.locator(TID.chatListArchiveLink)).toBeVisible();

  // Both are really in the archive view.
  await page.locator(TID.chatListArchiveLink).click();
  await expect(row1).toBeVisible();
  await expect(row2).toBeVisible();
});

test('Cmd/Meta+click toggles a row in and out of the selection', async ({
  qxpTrio,
  page,
}) => {
  const { peer1, peer2 } = qxpTrio;
  await peer1.sendTo('one');
  await peer2.sendTo('two');

  const row1 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  await expect(row1).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Meta+click selects (macOS multiselect modifier; handled via metaKey).
  await page.keyboard.down('Meta');
  await row1.click();
  await expect(row1).toHaveAttribute('data-multi-selected', 'true');
  await expect(page.locator(TID.chatListSelectionBarCount)).toHaveText('1');

  // Meta+click again toggles it back off → selection empties, bar gone.
  await row1.click();
  await page.keyboard.up('Meta');
  await expect(row1).toHaveAttribute('data-multi-selected', 'false');
  await expect(page.locator(TID.chatListSelectionBar)).toHaveCount(0);
});

test('Shift+click after a plain click selects the contiguous range', async ({
  qxpTrio,
  page,
}) => {
  const { peer1, peer2 } = qxpTrio;
  await peer1.sendTo('one');
  await peer2.sendTo('two');

  const row1 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  const row2 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`,
  );
  await expect(row1).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(row2).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Plain click sets the anchor (and opens the chat). Without the anchor a
  // bare Shift+click would just open the row — the bug this guards.
  await row1.click();
  await page.keyboard.down('Shift');
  await row2.click();
  await page.keyboard.up('Shift');

  await expect(row1).toHaveAttribute('data-multi-selected', 'true');
  await expect(row2).toHaveAttribute('data-multi-selected', 'true');
  await expect(page.locator(TID.chatListSelectionBarCount)).toHaveText('2');
});

test('Ctrl+click after opening a chat folds the open chat into the selection', async ({
  qxpTrio,
  page,
}) => {
  const { peer1, peer2 } = qxpTrio;
  await peer1.sendTo('one');
  await peer2.sendTo('two');

  const row1 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer1.displayName}"]`,
  );
  const row2 = page.locator(
    `[data-testid="chat-list-row"][data-name="${peer2.displayName}"]`,
  );
  await expect(row1).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });
  await expect(row2).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Open row1 (plain click), then Ctrl+click row2 to start a multiselect.
  // The open chat must join the set too — otherwise it stays plain while the
  // newly-picked row gets the accent bar (the reported inconsistency).
  await row1.click();
  await page.keyboard.down('Control');
  await row2.click();
  await page.keyboard.up('Control');

  await expect(row1).toHaveAttribute('data-multi-selected', 'true');
  await expect(row2).toHaveAttribute('data-multi-selected', 'true');
  await expect(page.locator(TID.chatListSelectionBarCount)).toHaveText('2');
});
