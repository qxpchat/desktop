// Onboarding state machine + flow drivers.
//
// One channel for all four flows (instant signup, manual login, restore
// backup file, receive backup over QR). The phase transitions to one of
// {configuring, importing, receiving} during a flow and either back to idle
// (success) or `failed` (error / cancel).

import { rpc, RpcError } from '../rpc';
import { onEvent } from '../events';
import { refreshAccounts } from './accounts.svelte';
import { reloadChatlist } from './chatlist.svelte';

/** Chatmail relay new instant accounts register on, unless a scanned
 *  `dcaccount:` QR overrides it. Mirrors iOS `DcConfigKey.defaultChatmailDomain`.
 *  The E2E suite sets `VITE_DEFAULT_RELAY` so onboarding tests mint accounts
 *  on a shared test relay rather than the production qxp.chat relay. */
export const DEFAULT_RELAY = import.meta.env.VITE_DEFAULT_RELAY || 'qxp.chat';

export type OnboardingPhase =
  | { kind: 'idle' }
  | { kind: 'configuring'; progress: number }
  | { kind: 'importing'; progress: number }
  | { kind: 'receiving'; progress: number }
  | { kind: 'failed'; message: string };

export type OnboardingState = {
  phase: OnboardingPhase;
};

export const onboarding = $state<OnboardingState>({
  phase: { kind: 'idle' },
});

/** Proxy URL the user wants the new account to register through. Set
 *  pre-onboarding via `setPendingProxy` (from `ProxyDialog`); applied
 *  inside `runOnboardingFlow` right after `add_account` so dc-core's
 *  `configure` reaches the relay through the proxy. Kept as a separate
 *  rune (not nested in `phase`) because it persists across flow
 *  attempts — the user can retry signup without re-entering. */
export const pendingProxy = $state<{ url: string | null }>({ url: null });

export function setPendingProxy(url: string | null): void {
  pendingProxy.url = url && url.trim() ? url.trim() : null;
}

let pendingAccountId: number | null = null;

// Live event handlers. Idempotent — they only mutate state when the matching
// flow is active.
onEvent('ConfigureProgress', (ev) => {
  const phase = onboarding.phase;
  if (phase.kind !== 'configuring') return;
  const progress = Number(ev.event.progress);
  if (progress === 0) {
    const comment = (ev.event.comment as string | null | undefined) ?? 'Configuration failed';
    onboarding.phase = { kind: 'failed', message: comment };
  } else if (progress < 1000) {
    onboarding.phase = { kind: 'configuring', progress };
  }
  // 1000 (success) is handled by the awaiting `configure` call resolving.
});

onEvent('ImexProgress', (ev) => {
  const phase = onboarding.phase;
  if (phase.kind !== 'importing' && phase.kind !== 'receiving') return;
  const progress = Number(ev.event.progress);
  if (progress === 0) {
    onboarding.phase = { kind: 'failed', message: 'Backup operation failed' };
  } else if (progress < 1000) {
    onboarding.phase = { ...phase, progress };
  }
});

function errorMessage(err: unknown): string {
  if (err instanceof RpcError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

// Re-reads `onboarding.phase.kind` widened to the full union. TypeScript's
// control-flow analysis narrows the rune away across `await` boundaries (it
// doesn't know that the event poll loop in `events.ts` can flip the phase to
// 'failed' between yields), so callers in catch blocks need this escape hatch.
function currentPhaseKind(): OnboardingPhase['kind'] {
  return onboarding.phase.kind;
}

/** Shared skeleton for all four onboarding flows. Owns:
 *  - phase transition into the initial in-flight kind
 *  - `add_account` + `select_account` bookkeeping
 *  - `start_io` after `steps` resolves
 *  - phase back to idle + refresh fan-out on success
 *  - pending-account cleanup + failed phase + rethrow on error
 *
 *  Each flow function passes the `initial` phase + its flow-specific
 *  middle (set_config, configure, import_backup, get_backup, …). */
async function runOnboardingFlow(
  initial: OnboardingPhase,
  steps: (accountId: number) => Promise<void>,
): Promise<void> {
  onboarding.phase = initial;
  let accountId = 0;
  try {
    accountId = await rpc.call<number>('add_account');
    pendingAccountId = accountId;
    await rpc.call('select_account', [accountId]);
    // Apply the pending onboarding-time proxy before `configure` runs —
    // the relay handshake then goes through it. `set_config_from_qr`
    // parses the URL the same way the Settings → Proxy dialog does.
    if (pendingProxy.url) {
      await rpc.call('set_config_from_qr', [accountId, pendingProxy.url]);
      await rpc.call('set_config', [accountId, 'proxy_enabled', '1']);
    }
    await steps(accountId);
    await rpc.call('start_io', [accountId]);
    onboarding.phase = { kind: 'idle' };
    pendingAccountId = null;
    await refreshAccounts();
    // Force the chatlist to refetch — the daemon's DB just gained a full
    // set of chats/contacts (especially after `get_backup` / `import_backup`),
    // but the chatlist rune can already be pinned to this account id, which
    // would make `setActiveAccount` a no-op.
    reloadChatlist();
  } catch (err) {
    pendingAccountId = null;
    if (accountId !== 0) {
      try {
        await rpc.call('remove_account', [accountId]);
      } catch {
        /* best-effort cleanup */
      }
    }
    if (currentPhaseKind() !== 'failed') {
      onboarding.phase = { kind: 'failed', message: errorMessage(err) };
    }
    throw err;
  }
}

export async function createInstantAccount(
  displayName: string,
  qr?: string,
  avatarPath?: string | null,
): Promise<void> {
  await runOnboardingFlow({ kind: 'configuring', progress: 0 }, async (accountId) => {
    await rpc.call('set_config', [accountId, 'displayname', displayName]);
    if (avatarPath) await rpc.call('set_config', [accountId, 'selfavatar', avatarPath]);
    await rpc.call('set_config_from_qr', [accountId, qr ?? `dcaccount:${DEFAULT_RELAY}`]);
    await rpc.call('configure', [accountId]);
  });
}

export async function importBackup(filePath: string): Promise<void> {
  await runOnboardingFlow({ kind: 'importing', progress: 0 }, async (accountId) => {
    await rpc.call('import_backup', [accountId, filePath, null]);
  });
}

export async function receiveBackup(qrText: string): Promise<void> {
  await runOnboardingFlow({ kind: 'receiving', progress: 0 }, async (accountId) => {
    // `check_qr` is the daemon's authoritative QR parser — it tells a usable
    // pair code (`backup2`) apart from one written by a too-new core
    // (`backupTooNew`) and from anything that isn't a pairing code at all.
    const qr = await rpc.call<{ kind: string }>('check_qr', [accountId, qrText]);
    if (qr.kind === 'backupTooNew') {
      throw new Error(
        'This backup was made by a newer app version. Update this device, then try again.',
      );
    }
    if (qr.kind !== 'backup2') {
      throw new Error('That code is not a device-pairing code.');
    }
    await rpc.call('get_backup', [accountId, qrText]);
  });
}

/** DCLOGIN onboarding — the scanned URL embeds addr + password + every
 *  server config key. dc-core's `set_config_from_qr` parses and writes
 *  them all, then `configure` validates against the real server. No
 *  displayname requirement: dc-core derives it from `addr` when blank,
 *  and the user can still set it later in Settings → Profile. */
export async function loginFromQr(qr: string): Promise<void> {
  await runOnboardingFlow({ kind: 'configuring', progress: 0 }, async (accountId) => {
    await rpc.call('set_config_from_qr', [accountId, qr]);
    await rpc.call('configure', [accountId]);
  });
}

/** Invite-driven onboarding: signs up an instant account on the default
 *  chatmail relay, then runs `secure_join` against the invite QR so the
 *  inviter shows up as a verified contact (or the user joins the invited
 *  group). The two RPCs are sequenced so the secure-join handshake has
 *  a configured account to send from. `secure_join` errors are
 *  surfaced via `onboarding.phase = failed` but the account itself is
 *  left intact — the user can retry the invite later. */
export async function signupAndSecureJoin(
  displayName: string,
  qr: string,
  avatarPath?: string | null,
): Promise<void> {
  await createInstantAccount(displayName, undefined, avatarPath);
  let accountId: number;
  try {
    accountId = (await rpc.call<number | null>('get_selected_account_id')) ?? 0;
  } catch {
    return;
  }
  if (accountId === 0) return;
  try {
    await rpc.call<number>('secure_join', [accountId, qr]);
  } catch (err) {
    onboarding.phase = { kind: 'failed', message: errorMessage(err) };
    throw err;
  }
}

export async function loginManually(
  addr: string,
  mailPw: string,
  advanced: Record<string, string> = {},
): Promise<void> {
  await runOnboardingFlow({ kind: 'configuring', progress: 0 }, async (accountId) => {
    await rpc.call('set_config', [accountId, 'addr', addr]);
    await rpc.call('set_config', [accountId, 'mail_pw', mailPw]);
    for (const [k, v] of Object.entries(advanced)) {
      if (v) await rpc.call('set_config', [accountId, k, v]);
    }
    await rpc.call('configure', [accountId]);
  });
}

export async function cancelOnboarding(): Promise<void> {
  if (pendingAccountId != null) {
    try {
      await rpc.call('stop_ongoing_process', [pendingAccountId]);
    } catch {
      /* core may already have completed/torn down — ignore */
    }
  }
  // The awaiting flow function's catch path will reset state.
}

export function resetOnboarding(): void {
  onboarding.phase = { kind: 'idle' };
}
