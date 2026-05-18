// Phase 3 — inline-markdown rendering in message text.
//
// `**bold**` → <strong>, `_italic_` → <em>, `` `code` `` → <code>.
// Markers are consumed; intra-word underscores (snake_case) are left
// alone. Uses `app-paired` so an incoming bubble is one `peer.sendTo`
// away.

import { test, expect } from '../../fixtures/app-paired.js';
import { openChatByName } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(120_000);

test('message text renders **bold**, _italic_ and `code` markdown', async ({
  qxpPaired,
  page,
}) => {
  const { peer } = qxpPaired;
  await openChatByName(page, peer.displayName);

  const tag = Date.now();
  await peer.sendTo(
    `md ${tag} **strong words** and _slanted_ and \`do_it()\` and plain_snake_case`,
  );

  const bubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"]`,
    { hasText: `md ${tag}` },
  );
  await expect(bubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  const textEl = bubble.locator(TID.messageBubbleText);
  await expect(textEl.locator('strong')).toHaveText('strong words');
  await expect(textEl.locator('em')).toHaveText('slanted');
  // Code span stays literal — its `_` is not reinterpreted as italic.
  await expect(textEl.locator('code')).toHaveText('do_it()');
  // Markers consumed; underscores inside a word survive untouched.
  await expect(textEl).not.toContainText('**');
  await expect(textEl).toContainText('plain_snake_case');
});
