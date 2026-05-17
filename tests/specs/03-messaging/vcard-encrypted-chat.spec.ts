// Phase 3 — vCard "Open chat" must yield an *encrypted* chat.
//
// Regression: VcardCell used `create_contact` (addr + name only), which in
// dc-core's key-contact model produces an *address-contact* — its 1:1 chat
// is unencrypted. Sending into it makes a chatmail server reject the mail
// with `Permanent SMTP error: Encryption needed: Invalid Unencrypted Mail`,
// leaving the outgoing message stuck at state=failed.
//
// The fix: `import_vcard`, which parses the vCard's embedded Autocrypt key
// and creates a *key-contact* → encrypted chat → mail accepted.
//
// Flow: peer2 builds its own keyed self-vCard; peer1 relays it to main as a
// Vcard message; main taps "Open chat" and sends a text — which must reach
// `delivered`/`read`, not `failed`.

import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test, expect } from '../../fixtures/app-trio.js';
import { openChatByName, sendComposerText, waitForOutgoingRead } from '../../helpers/setup.js';
import { TID } from '../../helpers/selectors.js';
import { ARRIVAL_TIMEOUT_MS, DELIVERED_TIMEOUT_MS } from '../../helpers/timeouts.js';

test.setTimeout(300_000);

test('opening a chat from a vCard creates an encrypted chat', async ({ qxpTrio, page }) => {
  const { peer1, peer2 } = qxpTrio;

  // peer2 builds a vCard of itself — includes its Autocrypt public key.
  const vcard = await peer2.rpc.call<string>('make_vcard', [peer2.accountId, [1]]);
  expect(vcard).toContain('BEGIN:VCARD');
  const vcfPath = path.join(tmpdir(), `qxp-peer2-${Date.now()}.vcf`);
  await writeFile(vcfPath, vcard, 'utf8');

  // peer1 relays peer2's keyed vCard to main as a Vcard message.
  await peer1.rpc.call('send_msg', [peer1.accountId, peer1.pairedChatId, {
    viewtype: 'Vcard',
    file: vcfPath,
    filename: 'peer2.vcf',
  }]);

  // main: open peer1's chat, wait for the incoming vCard card.
  await openChatByName(page, peer1.displayName);
  const vcardBubble = page.locator(
    `[data-testid="message-bubble"][data-direction="incoming"][data-view-type="Vcard"]`,
  ).first();
  await expect(vcardBubble).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS });

  // Tap "Open chat" — must import the key and open an encrypted chat.
  await page.locator(TID.composerTextarea).waitFor({ state: 'visible' });
  await vcardBubble.locator('[data-testid="vcard__open"]').click();

  // "Open chat" runs import_vcard + create_chat_by_contact_id, then
  // selectChat() switches the active chat from peer1's to peer2's. Wait
  // for that switch to land — the topbar flips to peer2's name — before
  // touching the composer. Otherwise we race: fill the still-mounted
  // peer1 composer, which then unmounts mid-flow, leaving the freshly
  // mounted (empty → disabled) peer2 send button un-clickable.
  await page
    .locator(TID.chatTopbarTitle)
    .filter({ hasText: peer2.displayName })
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });

  // The composer of the freshly opened chat — send a message into it.
  await page.locator(TID.composerTextarea).waitFor({ state: 'visible' });
  const text = `vcard-encrypted ${Date.now()}`;
  await sendComposerText(page, text);

  // The send must succeed: encrypted → chatmail accepts. The bug would
  // strand it at state=failed (unencrypted → rejected).
  const outgoing = page.locator(
    `[data-testid="message-bubble"][data-direction="outgoing"]`,
  ).filter({ hasText: text }).first();
  await expect(outgoing).toBeVisible({ timeout: 10_000 });
  await expect(outgoing).toHaveAttribute('data-state', 'delivered', {
    timeout: DELIVERED_TIMEOUT_MS,
  });
  await waitForOutgoingRead(peer2, outgoing);
  await expect(outgoing).toHaveAttribute('data-state', 'read');
});
