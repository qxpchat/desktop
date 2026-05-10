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

async function safeRemove(accountId: number): Promise<void> {
  try {
    await rpc.call('remove_account', [accountId]);
  } catch {
    /* nothing to do — best-effort cleanup */
  }
}

export async function createInstantAccount(displayName: string, qr?: string): Promise<void> {
  onboarding.phase = { kind: 'configuring', progress: 0 };
  let accountId = 0;
  try {
    accountId = await rpc.call<number>('add_account');
    pendingAccountId = accountId;
    await rpc.call('select_account', [accountId]);
    await rpc.call('set_config', [accountId, 'displayname', displayName]);
    await rpc.call('set_config_from_qr', [accountId, qr ?? 'dcaccount:nine.testrun.org']);
    await rpc.call('configure', [accountId]);
    await rpc.call('start_io', [accountId]);
    onboarding.phase = { kind: 'idle' };
    pendingAccountId = null;
    await refreshAccounts();
    reloadChatlist();
  } catch (err) {
    pendingAccountId = null;
    if (accountId !== 0) await safeRemove(accountId);
    if (currentPhaseKind() !== 'failed') {
      onboarding.phase = { kind: 'failed', message: errorMessage(err) };
    }
    throw err;
  }
}

export async function importBackup(filePath: string): Promise<void> {
  onboarding.phase = { kind: 'importing', progress: 0 };
  let accountId = 0;
  try {
    accountId = await rpc.call<number>('add_account');
    pendingAccountId = accountId;
    await rpc.call('select_account', [accountId]);
    await rpc.call('import_backup', [accountId, filePath, null]);
    await rpc.call('start_io', [accountId]);
    onboarding.phase = { kind: 'idle' };
    pendingAccountId = null;
    await refreshAccounts();
    reloadChatlist();
  } catch (err) {
    pendingAccountId = null;
    if (accountId !== 0) await safeRemove(accountId);
    if (currentPhaseKind() !== 'failed') {
      onboarding.phase = { kind: 'failed', message: errorMessage(err) };
    }
    throw err;
  }
}

export async function receiveBackup(qrText: string): Promise<void> {
  onboarding.phase = { kind: 'receiving', progress: 0 };
  let accountId = 0;
  try {
    accountId = await rpc.call<number>('add_account');
    pendingAccountId = accountId;
    await rpc.call('select_account', [accountId]);
    await rpc.call('get_backup', [accountId, qrText]);
    await rpc.call('start_io', [accountId]);
    onboarding.phase = { kind: 'idle' };
    pendingAccountId = null;
    await refreshAccounts();
    // Force the chatlist to refetch — the daemon's DB just gained a full set
    // of chats/contacts via the iroh-net transfer, but the chatlist rune
    // can already be pinned to this account id (e.g. when this is the
    // first/only configured account) which makes `setActiveAccount` a no-op.
    reloadChatlist();
  } catch (err) {
    pendingAccountId = null;
    if (accountId !== 0) await safeRemove(accountId);
    if (currentPhaseKind() !== 'failed') {
      onboarding.phase = { kind: 'failed', message: errorMessage(err) };
    }
    throw err;
  }
}

export async function loginManually(
  addr: string,
  mailPw: string,
  advanced: Record<string, string> = {},
): Promise<void> {
  onboarding.phase = { kind: 'configuring', progress: 0 };
  let accountId = 0;
  try {
    accountId = await rpc.call<number>('add_account');
    pendingAccountId = accountId;
    await rpc.call('select_account', [accountId]);
    await rpc.call('set_config', [accountId, 'addr', addr]);
    await rpc.call('set_config', [accountId, 'mail_pw', mailPw]);
    for (const [k, v] of Object.entries(advanced)) {
      if (v) await rpc.call('set_config', [accountId, k, v]);
    }
    await rpc.call('configure', [accountId]);
    await rpc.call('start_io', [accountId]);
    onboarding.phase = { kind: 'idle' };
    pendingAccountId = null;
    await refreshAccounts();
    reloadChatlist();
  } catch (err) {
    pendingAccountId = null;
    if (accountId !== 0) await safeRemove(accountId);
    if (currentPhaseKind() !== 'failed') {
      onboarding.phase = { kind: 'failed', message: errorMessage(err) };
    }
    throw err;
  }
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
