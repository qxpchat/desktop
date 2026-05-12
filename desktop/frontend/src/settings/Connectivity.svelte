<script lang="ts">
  // Three logical sections: Relays (transports + add/edit/remove/set default),
  // Outgoing Messages (SMTP status), and Proxy (navigates to a sub-view).
  // Per-transport status lines + quota bars come from the qxp-only
  // `get_connectivity_report` RPC — a structured equivalent of core's HTML
  // diagnostics. Strings inside the report are pre-localized by core.
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';
  import Icon from '../lib/Icon.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import Proxy from './Proxy.svelte';
  import TransportForm, { type LoginParam } from './TransportForm.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** Initial sub-view — set by deep-links (e.g. the QrShow shield button
     *  routes directly into 'proxy'). */
    initialView?: string | undefined;
  };

  let { initialView }: Props = $props();

  // Mirrors `TransportListEntry` / `EnteredLoginParam` (camelCase) — see
  // libs/deltachat-core-rust/deltachat-jsonrpc/src/api/types/login_param.rs.
  type EnteredLoginParam = LoginParam;

  type TransportListEntry = {
    param: EnteredLoginParam;
    isUnpublished: boolean;
  };

  type Dot = 'green' | 'yellow' | 'red' | 'gray';

  type ConnectivityLine = { dot: Dot; text: string };

  type QuotaInfo = { percent: number; label: string };

  // Mirrors `ConnectivityReport` from libs/deltachat-core-rust/src/scheduler/
  // connectivity_report.rs (exposed via deltachat-jsonrpc as
  // `get_connectivity_report`). Field names are serde-camelCased; the Dot
  // enum is serialized in lowercase.
  type TransportReport = {
    addr: string;
    lines: ConnectivityLine[];
    quota: QuotaInfo | null;
  };

  type ConnectivityReport = {
    transports: TransportReport[];
    smtp: ConnectivityLine;
  };

  type RelayInfo = {
    addr: string;
    domain: string;
    isUnpublished: boolean;
    connections: ConnectivityLine[];
    quota: QuotaInfo | null;
    param: EnteredLoginParam;
  };

  // View state — `main` is the Relays/SMTP/Proxy list; `proxy` is the
  // proxy sub-screen. Modeled inside this component instead of as a
  // top-level route because Settings is a single-pane layout. We snapshot
  // `initialView` *once* (it's a one-shot deep-link parameter) — afterwards
  // the user steers via the in-component back button.
  // svelte-ignore state_referenced_locally
  let view = $state<'main' | 'proxy'>(initialView === 'proxy' ? 'proxy' : 'main');

  let relays = $state<RelayInfo[]>([]);
  let defaultAddr = $state('');
  let smtp = $state<ConnectivityLine | null>(null);
  let proxyEnabled = $state(false);
  let loaded = $state(false);
  let busy = $state(false);
  let errorMsg = $state<string | null>(null);

  // Add-relay flow:
  // 1) `addOptionsOpen` — confirmation-style chooser (manual / paste-qr).
  // 2) `pasteOpen` — DCACCOUNT:/DCLOGIN: paste modal.
  // 3) `manualForm` — TransportForm modal in 'add' mode.
  // 4) `editForm`   — TransportForm modal in 'edit' mode.
  // 5) `removeTarget` — confirmation before delete_transport.
  let addOptionsOpen = $state(false);
  let pasteOpen = $state(false);
  let pasteValue = $state('');
  let manualForm = $state(false);
  let editForm = $state<EnteredLoginParam | null>(null);
  let removeTarget = $state<RelayInfo | null>(null);

  onMount(load);

  async function load() {
    if (accounts.selectedId == null) return;
    const id = accounts.selectedId;
    try {
      const [list, addr, proxyOn, report] = await Promise.all([
        rpc.call<TransportListEntry[]>('list_transports_ex', [id]),
        rpc.call<string | null>('get_config', [id, 'configured_addr']),
        rpc.call<string | null>('get_config', [id, 'proxy_enabled']),
        rpc.call<ConnectivityReport>('get_connectivity_report', [id]),
      ]);
      defaultAddr = addr ?? '';
      proxyEnabled = proxyOn === '1';

      relays = list.map((t) => {
        const domain = t.param.addr.split('@').at(-1) ?? t.param.addr;
        // Exact addr join — the report carries the transport addr verbatim,
        // so there's no ambiguity for accounts sharing a domain.
        const match = report.transports.find((tr) => tr.addr === t.param.addr);
        return {
          addr: t.param.addr,
          domain,
          isUnpublished: t.isUnpublished,
          connections: match?.lines ?? [],
          quota: match?.quota ?? null,
          param: t.param,
        };
      });
      smtp = report.smtp;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      loaded = true;
    }
  }

  onEvent('ConnectivityChanged', () => void load());
  // Emitted after backup-restore and around transport changes.
  onEvent('AccountsItemChanged', () => void load());

  // Actions ---------------------------------------------------------------

  async function setDefault(addr: string) {
    if (accounts.selectedId == null || addr === defaultAddr) return;
    busy = true;
    errorMsg = null;
    try {
      await rpc.call('set_config', [accounts.selectedId, 'configured_addr', addr]);
      defaultAddr = addr;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function toggleHidden(r: RelayInfo) {
    if (accounts.selectedId == null) return;
    busy = true;
    errorMsg = null;
    try {
      await rpc.call('set_transport_unpublished', [
        accounts.selectedId,
        r.addr,
        !r.isUnpublished,
      ]);
      await load();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function confirmRemove() {
    if (!removeTarget || accounts.selectedId == null) return;
    const addr = removeTarget.addr;
    removeTarget = null;
    busy = true;
    errorMsg = null;
    try {
      await rpc.call('delete_transport', [accounts.selectedId, addr]);
      await load();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function openAddOptions() {
    addOptionsOpen = true;
  }

  function findRelays() {
    addOptionsOpen = false;
    window.open('https://chatmail.at/relays', '_blank', 'noopener');
  }

  function chooseManual() {
    addOptionsOpen = false;
    manualForm = true;
  }

  function choosePaste() {
    addOptionsOpen = false;
    pasteValue = '';
    pasteOpen = true;
  }

  async function submitPaste() {
    if (accounts.selectedId == null) return;
    const qr = pasteValue.trim();
    if (!qr) return;
    busy = true;
    errorMsg = null;
    try {
      await rpc.call('add_transport_from_qr', [accounts.selectedId, qr]);
      pasteOpen = false;
      pasteValue = '';
      await load();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function submitManual(param: EnteredLoginParam) {
    if (accounts.selectedId == null) return;
    const wasEdit = editForm != null;
    manualForm = false;
    editForm = null;
    busy = true;
    errorMsg = null;
    try {
      // `add_or_update_transport` upserts by addr — same RPC for add and edit.
      await rpc.call('add_or_update_transport', [accounts.selectedId, param]);
      await load();
    } catch (err) {
      errorMsg = `${wasEdit ? 'Edit' : 'Add'} failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      busy = false;
    }
  }

  function quotaTint(percent: number): Dot {
    if (percent >= 95) return 'red';
    if (percent >= 80) return 'yellow';
    return 'gray';
  }
</script>

{#if view === 'proxy'}
  <Proxy onBack={() => (view = 'main')} bind:proxyEnabled />
{:else}
  <h2>{t('Connectivity')}</h2>

  <SettingsSection title={t('Relays')} footer={t('Messages are received on all relays.')}>
    {#each relays as r (r.addr)}
      <div class="relay">
        <button
          class="relay-main"
          onclick={() => void setDefault(r.addr)}
          disabled={busy}
          aria-label={t('Set {addr} as default', { addr: r.addr })}
        >
          <div class="relay-head">
            <span class="email">{r.addr}</span>
            {#if r.addr === defaultAddr}
              <Icon name="check" size={14} stroke={2.5} />
            {/if}
          </div>
          {#if r.addr === defaultAddr}
            <div class="sub">{t('Used for sending')}</div>
          {:else if r.isUnpublished}
            <div class="sub">{t('Hidden from contacts')}</div>
          {/if}
          {#each r.connections as line (line.text)}
            <div class="status-line">
              <span class="dot dot-sm" data-dot={line.dot}></span>
              <span>{line.text}</span>
            </div>
          {/each}
          {#if r.quota}
            <div class="quota">
              <span class="sub">{r.quota.label}</span>
              <div class="bar">
                <div
                  class="fill"
                  data-dot={quotaTint(r.quota.percent)}
                  style:width="{Math.min(r.quota.percent, 100)}%"
                ></div>
              </div>
            </div>
          {/if}
        </button>
        <div class="row-actions">
          <button class="icon-btn" disabled={busy} onclick={() => (editForm = r.param)} aria-label={t('Edit')} title={t('Edit')}>
            <Icon name="pencil" size={14} />
          </button>
          {#if r.addr !== defaultAddr}
            <button
              class="icon-btn"
              disabled={busy}
              onclick={() => void toggleHidden(r)}
              aria-label={r.isUnpublished ? t('Show on contacts') : t('Hide from contacts')}
              title={r.isUnpublished ? t('Show on contacts') : t('Hide from contacts')}
            >
              <Icon name={r.isUnpublished ? 'lightbulb' : 'lightbulb-off'} size={14} />
            </button>
            <button
              class="icon-btn danger"
              disabled={busy}
              onclick={() => (removeTarget = r)}
              aria-label={t('Remove')}
              title={t('Remove')}
            >
              <Icon name="trash" size={14} />
            </button>
          {/if}
        </div>
      </div>
    {/each}
    {#if loaded && relays.length === 0}
      <p class="muted-row">{t('No relays configured.')}</p>
    {/if}
    <SettingsRow label={t('Add Relay')} icon="plus" onClick={openAddOptions} />
  </SettingsSection>

  {#if smtp}
    <SettingsSection title={t('Outgoing Messages')}>
      <div class="status-line row-line">
        <span class="dot" data-dot={smtp.dot}></span>
        <span>{smtp.text}</span>
      </div>
    </SettingsSection>
  {/if}

  <SettingsSection>
    <SettingsRow
      label={t('Proxy')}
      icon="shield-check"
      onClick={() => (view = 'proxy')}
      right={proxyOnSnippet}
    />
  </SettingsSection>

  {#snippet proxyOnSnippet()}
    {#if proxyEnabled}<span class="badge-on">{t('On')}</span>{/if}
    <Icon name="chevron-right" size={14} />
  {/snippet}

  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}

  <!-- Add-options chooser -->
  {#if addOptionsOpen}
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="dialog small">
        <h3>{t('Add Relay')}</h3>
        <div class="chooser">
          <button onclick={findRelays}>{t('Find Relays…')}</button>
          <button onclick={chooseManual}>{t('Manual Setup')}</button>
          <button onclick={choosePaste}>{t('Paste Account Code')}</button>
        </div>
        <div class="actions">
          <button onclick={() => (addOptionsOpen = false)}>{t('Cancel')}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Paste-QR modal -->
  {#if pasteOpen}
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="dialog">
        <h3>{t('Paste Account Code')}</h3>
        <p>{t('Paste a DCACCOUNT:… code from the relay you want to add.')}</p>
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          bind:value={pasteValue}
          placeholder="DCACCOUNT:https://…"
          autofocus
          rows="3"
          spellcheck="false"
          autocapitalize="off"
        ></textarea>
        <div class="actions">
          <button onclick={() => (pasteOpen = false)} disabled={busy}>{t('Cancel')}</button>
          <button class="primary" onclick={submitPaste} disabled={busy || !pasteValue.trim()}>
            {busy ? t('Adding…') : t('Add')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Manual transport form (add) -->
  {#if manualForm}
    <TransportForm
      mode="add"
      onSubmit={submitManual}
      onCancel={() => (manualForm = false)}
    />
  {/if}

  <!-- Manual transport form (edit) -->
  {#if editForm}
    <TransportForm
      mode="edit"
      existing={editForm}
      onSubmit={submitManual}
      onCancel={() => (editForm = null)}
    />
  {/if}

  <!-- Remove confirmation -->
  {#if removeTarget}
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="dialog small">
        <h3>{t('Remove {domain}?', { domain: removeTarget.domain })}</h3>
        <p>{t('This relay will be deleted from this account.')}</p>
        <div class="actions">
          <button onclick={() => (removeTarget = null)} disabled={busy}>{t('Cancel')}</button>
          <button class="danger primary" onclick={confirmRemove} disabled={busy}>
            {busy ? t('Removing…') : t('Remove')}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .relay {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 8px 0;
  }
  .relay + .relay {
    border-top: 1px solid var(--color-border);
  }
  .relay-main {
    flex: 1;
    min-width: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    /* In a flex column the global button reset's `align-items: center;
     * justify-content: center` would centre the relay-row content along
     * both axes — push to the top-left corner instead. */
    align-items: flex-start;
    justify-content: flex-start;
    gap: 4px;
  }
  .relay-main:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .relay-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .email {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .status-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .dot-sm {
    width: 6px;
    height: 6px;
  }
  .dot[data-dot='green'] {
    background: #34c759;
  }
  .dot[data-dot='yellow'] {
    background: #ffcc00;
  }
  .dot[data-dot='red'] {
    background: #ff3b30;
  }
  .dot[data-dot='gray'] {
    background: var(--color-fg-tertiary);
  }
  .quota {
    margin-top: 2px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--color-bg-hover);
    overflow: hidden;
    margin-top: 4px;
  }
  .fill {
    height: 100%;
  }
  .fill[data-dot='red'] {
    background: #ff3b30;
  }
  .fill[data-dot='yellow'] {
    background: #ffcc00;
  }
  .fill[data-dot='gray'] {
    background: var(--color-fg-tertiary);
  }
  .row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;
  }
  .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
    justify-content: center;
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .icon-btn.danger {
    color: var(--color-danger);
  }
  .icon-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .muted-row {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    padding: 8px 0;
    margin: 0;
  }
  .row-line {
    padding: 8px 0;
  }
  .badge-on {
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
    margin: var(--space-3) 0;
  }

  /* Dialog / modal shared styles */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(4px);
  }
  .dialog {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    width: min(480px, calc(100vw - 2 * var(--space-4)));
    box-shadow: 0 16px 48px var(--color-shadow);
  }
  .dialog.small {
    width: min(360px, calc(100vw - 2 * var(--space-4)));
  }
  .dialog h3 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .dialog p {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-fg-secondary);
  }
  .dialog textarea {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 var(--space-4) 0;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    resize: vertical;
    min-height: 72px;
  }
  .dialog textarea:focus {
    outline: none;
  }
  .chooser {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .chooser button {
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-weight: 500;
    text-align: left;
    justify-content: flex-start;
  }
  .chooser button:hover {
    background: var(--color-bg-selected);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
  .actions button {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .actions .primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .actions .danger.primary {
    background: var(--color-danger);
    color: white;
  }
  .actions .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
