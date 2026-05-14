// Per-spec setup helpers — onboarding via the UI + peer messages via
// direct daemon RPC.
//
// Most Phase 2+ specs need an onboarded user with one or more chats.
// Setting that up via UI clicks for every test would be slow and noisy;
// these helpers wrap the canonical patterns.

import { expect, type Locator, type Page } from '@playwright/test';
import {
  spawnTempDaemon,
  configureAccount,
  RpcClient,
  type TempDaemon,
} from '../fixtures/daemon.js';
import type { PoolAccount } from '../fixtures/accounts.js';
import { TID } from './selectors.js';

/** Main daemon's RPC endpoint. Tests use the test-specific port
 *  (9041 by default, overridable via QXP_TEST_DAEMON_PORT) rather
 *  than prod's 4041 so a running prod app doesn't shadow them. */
const MAIN_DAEMON_PORT = process.env.QXP_TEST_DAEMON_PORT ?? '9041';
const MAIN_DAEMON_URL = `ws://127.0.0.1:${MAIN_DAEMON_PORT}/ws`;

/** Drive the manual-login flow with the given creds and wait for the
 *  chat shell to mount. The page must be on the onboarding welcome
 *  screen when called. Typical wall-clock: 1-3s on a warm relay. */
export async function manualLogin(page: Page, account: PoolAccount): Promise<void> {
  await page.locator(TID.onboardingWelcomeAltToggle).click();
  await page.locator(TID.onboardingWelcomeManualSetup).click();
  await page.locator(TID.onboardingManualAddr).fill(account.email);
  await page.locator(TID.onboardingManualPassword).fill(account.password);
  await page.locator(TID.onboardingManualSubmit).click();
  await page.waitForSelector(TID.appShell, { timeout: 60_000 });
}

/** Peer-side handle: a temp daemon configured with one account plus the
 *  helpers to send messages to a target address. Use this for tests that
 *  need to populate the main user's chatlist from "outside" without
 *  going through the UI for the peer. */
export type Peer = {
  daemon: TempDaemon;
  accountId: number;
  email: string;
  displayName: string;
  /** Set by `pairPeerWithMain`: the verified-1on1 chat with main on the
   *  peer side. When non-null, `sendTo` prefers this chat over creating
   *  one via `create_contact + create_chat_by_contact_id` — the latter
   *  can resolve to an address-only contact, which would send plaintext
   *  and bounce on chatmail's `filtermail` policy, or surface the
   *  message in a separate contact-request chat on main's side. */
  pairedChatId: number | null;
  /** Send `text` to `targetEmail`. If `pairedChatId` is set (i.e. the
   *  peer has handshaked with main via `pairPeerWithMain`), uses that
   *  chat directly. Otherwise falls back to create-contact +
   *  create-chat-by-contact-id. Returns the daemon-side chatId. */
  sendTo(targetEmail: string, text: string): Promise<number>;
  /** Send a message with a given viewtype + file (or location) into the
   *  paired chat. Caller must have called `pairPeerWithMain` first.
   *  Returns the new message's id. */
  sendAttachment(data: {
    viewtype: 'Text' | 'Image' | 'Gif' | 'Video' | 'Audio' | 'Voice' | 'File' | 'Vcard';
    file?: string;
    filename?: string;
    text?: string;
    location?: [number, number];
  }): Promise<number>;
  /** Mark fresh incoming messages on the paired chat as seen — the wire
   *  signal that flips the sender-side state from `delivered` to `read`.
   *  Uses `markseen_msgs` (NOT `marknoticed_chat`); per the dc-core
   *  jsonrpc docs at api.rs:1245, "read receipts aren't sent for
   *  noticed messages" — only seen ones trigger MDN. Polls until the
   *  peer-side chat actually has at least one fresh incoming, so the
   *  caller doesn't race the inbound IMAP fetch. No-op when not paired. */
  markSeen(timeoutMs?: number): Promise<void>;
  /** Shut down the daemon and clean up. */
  cleanup(): Promise<void>;
};

/** Spin up a peer on a non-default port, configure it with `account`,
 *  set its display name, return the helper. */
export async function spawnPeer(
  port: number,
  account: PoolAccount,
): Promise<Peer> {
  const daemon = await spawnTempDaemon(port);
  const accountId = await configureAccount(daemon, account.email, account.password);
  // Display name shows up in the receiver's chat-row name; tests assert
  // on it to disambiguate multiple peers.
  await daemon.rpc.call('set_config', [accountId, 'displayname', account.displayName]);
  // Enable MDN sending — `should_send_mdns` in deltachat-core defaults to
  // `false` when unset, so a peer that never explicitly opted in will
  // never reply with a Message Disposition Notification, leaving the
  // sender's outgoing bubble stuck at `delivered` instead of advancing
  // to `read`. Phase 3 and beyond depend on this signal.
  await daemon.rpc.call('set_config', [accountId, 'mdns_enabled', '1']);
  // start_io so outgoing messages actually leave; without it sends queue
  // forever and the receiver never sees a chat row arrive.
  await daemon.rpc.call('start_io', [accountId]);

  const peer: Peer = {
    daemon,
    accountId,
    email: account.email,
    displayName: account.displayName,
    pairedChatId: null,
    async sendTo(targetEmail, text) {
      let chatId: number;
      if (peer.pairedChatId != null) {
        chatId = peer.pairedChatId;
      } else {
        const contactId = await daemon.rpc.call<number>(
          'create_contact',
          [accountId, targetEmail, ''],
        );
        chatId = await daemon.rpc.call<number>(
          'create_chat_by_contact_id',
          [accountId, contactId],
        );
      }
      await daemon.rpc.call('misc_send_text_message', [accountId, chatId, text]);
      return chatId;
    },
    async sendAttachment(data) {
      if (peer.pairedChatId == null) {
        throw new Error('peer.sendAttachment: call pairPeerWithMain first');
      }
      return await daemon.rpc.call<number>('send_msg', [
        accountId,
        peer.pairedChatId,
        data,
      ]);
    },
    async markSeen(timeoutMs = 30_000) {
      if (peer.pairedChatId == null) return;
      // One-shot: poll up to `timeoutMs` for any fresh incoming, then
      // mark them seen. Returns silently if nothing fresh appears — the
      // caller is expected to loop and retry (cold IMAP can deliver
      // later than the first poll window).
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const freshIds = await daemon.rpc.call<number[]>(
          'get_fresh_msgs',
          [accountId],
        );
        if (freshIds.length > 0) {
          await daemon.rpc.call('markseen_msgs', [accountId, freshIds]);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    async cleanup() {
      await daemon.shutdown();
    },
  };
  return peer;
}

/** Wait until the main user's chat list shows at least one row whose
 *  `data-name` attribute matches `name`. Tests use this after a peer
 *  sends a message — the relay round-trip can take a few seconds. */
export async function waitForChatRowByName(
  page: Page,
  name: string,
  timeoutMs = 45_000,
): Promise<void> {
  await page
    .locator(`[data-testid="chat-list-row"][data-name="${name}"]`)
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
}

/** Establish a verified-1on1 channel between `peer` and the main daemon
 *  via Setup-Contact (programmatic QR scan).
 *
 *  Chatmail relays run `filtermail` which **rejects unencrypted SMTP**,
 *  so a plaintext send from a peer that has never key-exchanged with
 *  main bounces silently. The Setup-Contact handshake is the canonical
 *  way to bootstrap encryption between two fresh chatmail accounts.
 *
 *  Sequence:
 *    1. Connect to main's daemon (port 4041).
 *    2. Ask main for a setup-contact QR (`get_chat_securejoin_qr_code`
 *       with `chat_id=None`).
 *    3. Peer scans it — `secure_join` returns immediately and the rest of
 *       the protocol (4–5 message round-trips) runs in the background.
 *    4. Poll the peer-side chat until `can_send=true`, which only flips
 *       once main's public key has reached the peer and the contact has
 *       been promoted to a key-contact with a known key. That's the
 *       earliest moment plaintext `peer.sendTo` will go out encrypted
 *       and the relay won't drop it.
 *
 *  Prerequisite: `manualLogin` must already have completed so main has
 *  a selected, configured account. */
export async function pairPeerWithMain(peer: Peer): Promise<void> {
  const mainRpc = new RpcClient(MAIN_DAEMON_URL);
  await mainRpc.connect();
  let qr: string;
  try {
    const mainAccountId = await mainRpc.call<number | null>('get_selected_account_id');
    if (mainAccountId == null) {
      throw new Error('pairPeerWithMain: main daemon has no selected account');
    }
    // Belt-and-suspenders: MdnsEnabled defaults to "1" via the strum
    // schema, but we set it explicitly so Phase 3+ specs that depend on
    // the `OutMdnRcvd` state aren't at the mercy of any future default
    // change or configure-time override.
    await mainRpc.call('set_config', [mainAccountId, 'mdns_enabled', '1']);
    qr = await mainRpc.call<string>('get_chat_securejoin_qr_code', [mainAccountId, null]);
  } finally {
    mainRpc.close();
  }

  const chatId = await peer.daemon.rpc.call<number>(
    'secure_join',
    [peer.accountId, qr],
  );

  // Handshake involves several SMTP+IMAP hops. Warm-relay typical is
  // 10–20s; we've seen 60–90s on cold IMAP first-fetch and have hit
  // outliers past 90s under relay queueing pressure, so we give it
  // 150s. Per-spec timeout is 180s — the slack covers two pair calls
  // back-to-back in 2-peer specs.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const chat = await peer.daemon.rpc.call<{ canSend: boolean }>(
      'get_full_chat_by_id',
      [peer.accountId, chatId],
    );
    if (chat.canSend) {
      peer.pairedChatId = chatId;
      return;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error('pairPeerWithMain: secure_join handshake did not complete within 150s');
}

/** Open the MediaBrowser for the chat with the given peer display
 *  name. Opens the chat, then walks chat-info → Media, Audio & Files.
 *  Assumes the chat row exists (caller should `waitForChatRowByName`
 *  first if they just sent a message to seed the chat). */
export async function openMediaBrowser(page: Page, peerDisplayName: string): Promise<void> {
  await openChatByName(page, peerDisplayName);
  await page.locator(TID.chatTopbarInfo).click();
  await page.locator(TID.chatInfo).waitFor({ state: 'visible' });
  await page.locator(TID.chatInfoMedia).click();
  await page.locator(TID.mediaBrowser).waitFor({ state: 'visible' });
}

/** Open Settings on the given section. Opens the NavTabs profile rail
 *  first (it's collapsed by default), clicks the Settings footer
 *  button, then clicks the rail item for the requested section. */
export async function openSettings(
  page: Page,
  section:
    | 'profile'
    | 'appearance'
    | 'chats'
    | 'connectivity'
    | 'blocked'
    | 'backup'
    | 'logs'
    | 'about',
): Promise<void> {
  await page.locator(TID.chatListBurger).click();
  await page.locator(TID.navTabsSettings).click();
  await page.locator(TID.settings).waitFor({ state: 'visible' });
  await page.locator(TID.settingsRailItem(section)).click();
  await page
    .locator(TID.settingsSectionBy(section))
    .waitFor({ state: 'visible' });
}

/** Create a group via the compose flow with `peer` as the sole other
 *  member, name it `groupName`. Returns once the chat-view for the
 *  new group is the active pane (topbar shows the group name).
 *  Doesn't open chat-info — callers that need that follow up with
 *  `createGroupAndOpenInfo`. */
export async function createGroupChat(
  page: Page,
  peerDisplayName: string,
  groupName: string,
): Promise<void> {
  await page.locator(TID.composeButton).click();
  await page.locator(TID.composePane).waitFor({ state: 'visible' });
  await page.locator(TID.composePaneNewGroup).click();
  await page.locator(TID.chooseMembers).waitFor({ state: 'visible' });
  await page.locator(TID.contactRowByName(peerDisplayName)).first().click();
  await page.locator(TID.chooseMembersNext).click();
  await page.locator(TID.groupMetadata).waitFor({ state: 'visible' });
  await page.locator(TID.groupMetadataName).fill(groupName);
  await page.locator(TID.groupMetadataCreate).click();
  await page
    .locator(TID.chatTopbarTitle)
    .filter({ hasText: groupName })
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/** Create a group via the compose flow with `peer` as the sole other
 *  member, name it `groupName`, then open its info pane. Returns once
 *  the chat-info pane is visible.
 *
 *  Several Phase 6 specs need a group as their fixture; this is the
 *  shared preamble. The test owns whatever it does *inside* the info
 *  pane (rename, set ephemeral, remove member, leave). */
export async function createGroupAndOpenInfo(
  page: Page,
  peerDisplayName: string,
  groupName: string,
): Promise<void> {
  await createGroupChat(page, peerDisplayName, groupName);
  await page.locator(TID.chatTopbarInfo).click();
  await page.locator(TID.chatInfo).waitFor({ state: 'visible' });
}

/** Click a chatlist row by display name to open the chat. Waits for the
 *  chat top bar to mount (signal that ChatView's accountId+chatId props
 *  have flowed through). */
export async function openChatByName(page: Page, name: string): Promise<void> {
  await page
    .locator(`[data-testid="chat-list-row"][data-name="${name}"]`)
    .first()
    .click();
  await page
    .locator(TID.chatTopbarTitle)
    .filter({ hasText: name })
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/** Loop `peer.markSeen` against the outgoing bubble's `data-state` until
 *  it reaches `read`, or `timeoutMs` runs out. The retry pattern matters
 *  because a single markSeen call can catch a stale fresh msg (handshake
 *  leftovers) before the actual main→peer message hits peer's IMAP.
 *
 *  Accepts either the live-paired `Peer` or the template-derived
 *  `PairedPeer` — both expose `markSeen`. */
export async function waitForOutgoingRead(
  peer: { markSeen(timeoutMs?: number): Promise<void> },
  bubble: Locator,
  // 180s budget covers the full SMTP-out → relay → peer IMAP poll →
  // peer markseen → peer SMTP → relay → main IMAP poll → main MDN
  // processing round-trip. On chatmail under load, media attachments
  // (mp4, gif) consistently exceed the previous 90s default.
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await peer.markSeen(5_000);
    const state = await bubble.getAttribute('data-state');
    if (state === 'read') return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `waitForOutgoingRead: bubble did not reach state=read within ${timeoutMs}ms`,
  );
}

/** Type `text` into the composer and click send. Returns once the
 *  textarea has been cleared — that's the signal that `sendText`
 *  resolved (the composer clears its draft on a successful send). The
 *  composer must be mounted — call `openChatByName` first. */
export async function sendComposerText(page: Page, text: string): Promise<void> {
  const ta = page.locator(TID.composerTextarea);
  await ta.fill(text);
  await page.locator(TID.composerSend).click();
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel) as HTMLTextAreaElement | null;
      return el != null && el.value === '';
    },
    TID.composerTextarea,
    { timeout: 5_000 },
  );
}

/** Pick `filePath` via the composer's hidden file input, wait for the
 *  attachment-preview row to appear, then click send. Mirrors the
 *  production flow: the file picker stages the attachment in the
 *  composer rather than sending it directly. */
export async function attachAndSendFile(page: Page, filePath: string): Promise<void> {
  await page.locator(TID.composerFileInput).setInputFiles(filePath);
  await expect(page.locator(TID.composerAttachmentBar)).toBeVisible();
  await page.locator(TID.composerSend).click();
}
