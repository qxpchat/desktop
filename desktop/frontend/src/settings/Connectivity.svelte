<script lang="ts">
  // Ports `ios/qxp/Views/ConnectivityView.swift`. Four logical sections in
  // the iOS UI we mirror here: Relays (transports + add/edit/remove/set
  // default), Outgoing Messages (SMTP status parsed from the core's
  // connectivity HTML), Status (raw text fallback when the parser misses),
  // and Proxy (navigates to a sub-view). Per-transport status lines + quota
  // bars come from the same HTML parser as iOS uses — fragile but the only
  // way to surface deltachat-core's diagnostic info without a structured RPC.
  import { onMount } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { onEvent } from '../lib/events';
  import Icon from '../lib/Icon.svelte';
  import Proxy from './Proxy.svelte';
  import TransportForm, { type LoginParam } from './TransportForm.svelte';

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

  type ConnectivityLine = { text: string; dot: Dot };

  type IncomingTransport = {
    domain: string;
    lines: ConnectivityLine[];
    quota: { percent: number; label: string } | null;
  };

  type ParsedConnectivity = {
    incoming: IncomingTransport[];
    smtp: ConnectivityLine | null;
  };

  type RelayInfo = {
    addr: string;
    domain: string;
    isUnpublished: boolean;
    connections: ConnectivityLine[];
    quota: { percent: number; label: string } | null;
    param: EnteredLoginParam;
  };

  // View state — `main` is the Relays/SMTP/Proxy list; `proxy` is the
  // proxy sub-screen. Modeled inside this component instead of as a
  // top-level route because Settings is a single-pane layout.
  let view = $state<'main' | 'proxy'>(initialView === 'proxy' ? 'proxy' : 'main');

  let relays = $state<RelayInfo[]>([]);
  let defaultAddr = $state('');
  let smtp = $state<ConnectivityLine | null>(null);
  let rawStatus = $state<string | null>(null);
  let connectivity = $state(0);
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
      const [list, addr, conn, proxyOn, html] = await Promise.all([
        rpc.call<TransportListEntry[]>('list_transports_ex', [id]),
        rpc.call<string | null>('get_config', [id, 'configured_addr']),
        rpc.call<number>('get_connectivity', [id]),
        rpc.call<string | null>('get_config', [id, 'proxy_enabled']),
        rpc.call<string>('get_connectivity_html', [id]),
      ]);
      defaultAddr = addr ?? '';
      connectivity = conn;
      proxyEnabled = proxyOn === '1';

      const parsed = parseConnectivityHtml(html);
      relays = list.map((t) => {
        const domain = t.param.addr.split('@').at(-1) ?? t.param.addr;
        const match = parsed.incoming.find((i) => i.domain.toLowerCase() === domain.toLowerCase());
        return {
          addr: t.param.addr,
          domain,
          isUnpublished: t.isUnpublished,
          connections: match?.lines ?? [],
          quota: match?.quota ?? null,
          param: t.param,
        };
      });
      smtp = parsed.smtp;

      // Fallback when the parser finds neither incoming nor outgoing — still
      // surface *something* so users aren't left guessing.
      if (parsed.incoming.length === 0 && !parsed.smtp) {
        const stripped = stripTags(html).replace(/\s+/g, ' ').trim();
        rawStatus = stripped || null;
      } else {
        rawStatus = null;
      }
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

  // HTML parser -----------------------------------------------------------
  //
  // Ported from ConnectivityView.swift's parseConnectivityHtml. The core
  // emits HTML in `get_connectivity_html`; this teases out the structured
  // bits (per-transport status + quota, SMTP line) so we can render them in
  // native rows instead of a blob of HTML.

  function parseConnectivityHtml(html: string): ParsedConnectivity {
    const result: ParsedConnectivity = { incoming: [], smtp: null };

    const h3Regex = /<h3>([\s\S]*?)<\/h3>/g;
    const headings: { title: string; tagStart: number; contentStart: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = h3Regex.exec(html)) != null) {
      headings.push({
        title: stripTags(m[1]).toLowerCase(),
        tagStart: m.index,
        contentStart: m.index + m[0].length,
      });
    }
    if (headings.length === 0) return result;

    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].contentStart;
      const end = i + 1 < headings.length ? headings[i + 1].tagStart : html.length;
      const content = html.slice(start, end);
      const title = headings[i].title;
      if (title.includes('incoming')) {
        result.incoming = parseIncoming(content);
      } else if (title.includes('outgoing')) {
        result.smtp = parseSmtp(content);
      }
    }
    return result;
  }

  function parseIncoming(content: string): IncomingTransport[] {
    const transportRegex = /<li class="transport">([\s\S]*?)<\/li>\s*<\/ul>/g;
    const out: IncomingTransport[] = [];
    let m: RegExpExecArray | null;
    while ((m = transportRegex.exec(content)) != null) {
      const block = m[1];
      const [statusPart, quotaPart] = block.split('<ul class="quota-list">');

      const boldMatch = /<b>(.*?):<\/b>/.exec(statusPart);
      if (!boldMatch) continue;
      const domain = stripTags(boldMatch[1]).trim();

      const lines: ConnectivityLine[] = [];
      for (const raw of statusPart.split('<br')) {
        const dot = dotColor(raw);
        const text = stripTags(raw)
          .replace(/^\s*\/>/, '')
          .trim()
          .replace(/\s+/g, ' ');
        if (text) lines.push({ text, dot });
      }

      let quota: IncomingTransport['quota'] = null;
      if (quotaPart) {
        const pctMatch = /<div class="progress[^"]*"[^>]*>(\d+)%<\/div>/.exec(quotaPart);
        if (pctMatch) {
          const pct = parseInt(pctMatch[1], 10) || 0;
          const barIdx = quotaPart.indexOf('<div class="bar"');
          const before = barIdx >= 0 ? quotaPart.slice(0, barIdx) : quotaPart;
          quota = { percent: pct, label: stripTags(before).trim() };
        }
      }

      out.push({ domain, lines, quota });
    }
    return out;
  }

  function parseSmtp(content: string): ConnectivityLine | null {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/;
    const m = liRegex.exec(content);
    if (!m) return null;
    const text = stripTags(m[1]).trim().replace(/\s+/g, ' ');
    if (!text) return null;
    return { text, dot: dotColor(m[1]) };
  }

  function dotColor(html: string): Dot {
    if (html.includes('green')) return 'green';
    if (html.includes('yellow')) return 'yellow';
    if (html.includes('red')) return 'red';
    return 'gray';
  }

  function stripTags(html: string): string {
    // The core's connectivity HTML carries a `<style>` block at the top
    // (CSS for the progress bar, dot colors, etc.). A bare tag-stripping
    // regex leaves the CSS rules behind as plain text — drop the contents
    // of `<style>` and `<script>` first.
    return html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '');
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
  <h2>Connectivity</h2>

  <!-- Section: Relays -->
  <section class="group">
    <header class="group-header">Relays</header>
    <div class="card">
      <ul class="list">
        {#each relays as r (r.addr)}
          <li class="relay-row">
            <button
              class="relay-main"
              onclick={() => void setDefault(r.addr)}
              disabled={busy}
              aria-label={`Set ${r.addr} as default`}
            >
              <div class="relay-head">
                <span class="email">{r.addr}</span>
                {#if r.addr === defaultAddr}
                  <Icon name="check" size={14} stroke={2.5} />
                {/if}
              </div>
              {#if r.addr === defaultAddr}
                <div class="sub">Used for sending</div>
              {:else if r.isUnpublished}
                <div class="sub">Hidden from contacts</div>
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
              <button
                class="link"
                disabled={busy}
                onclick={() => (editForm = r.param)}
                title="Edit"
                aria-label="Edit"
              >
                <Icon name="pencil" size={14} />
              </button>
              {#if r.addr !== defaultAddr}
                <button
                  class="link"
                  disabled={busy}
                  onclick={() => void toggleHidden(r)}
                  title={r.isUnpublished ? 'Show' : 'Hide'}
                >
                  {r.isUnpublished ? 'Show' : 'Hide'}
                </button>
                <button
                  class="danger"
                  disabled={busy}
                  onclick={() => (removeTarget = r)}
                  title="Remove"
                >
                  Remove
                </button>
              {/if}
            </div>
          </li>
        {/each}
        {#if loaded && relays.length === 0}
          <li class="muted">No relays configured.</li>
        {/if}
        <li class="add-row">
          <button class="link add" onclick={openAddOptions} disabled={busy}>
            <Icon name="plus" size={14} /> Add Relay
          </button>
        </li>
      </ul>
    </div>
    <p class="footer-note">Messages are received on all relays.</p>
  </section>

  <!-- Section: Outgoing Messages -->
  {#if smtp}
    <section class="group">
      <header class="group-header">Outgoing Messages</header>
      <div class="card">
        <div class="status-line">
          <span class="dot" data-dot={smtp.dot}></span>
          <span>{smtp.text}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- Section: Status (fallback) -->
  {#if rawStatus}
    <section class="group">
      <header class="group-header">Status</header>
      <div class="card">
        <p class="raw">{rawStatus}</p>
      </div>
    </section>
  {/if}

  <!-- Section: Proxy nav -->
  <section class="group">
    <div class="card">
      <button class="nav-row" onclick={() => (view = 'proxy')} disabled={busy}>
        <span class="nav-left">
          <Icon name="shield-check" size={16} />
          <span>Proxy</span>
        </span>
        <span class="nav-right">
          {#if proxyEnabled}<span class="badge muted">On</span>{/if}
          <Icon name="chevron-right" size={14} />
        </span>
      </button>
    </div>
  </section>

  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}

  <!-- Add-options chooser -->
  {#if addOptionsOpen}
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="dialog small">
        <h3>Add Relay</h3>
        <div class="chooser">
          <button onclick={findRelays}>Find Relays…</button>
          <button onclick={chooseManual}>Manual Setup</button>
          <button onclick={choosePaste}>Paste Account Code</button>
        </div>
        <div class="actions">
          <button onclick={() => (addOptionsOpen = false)}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Paste-QR modal -->
  {#if pasteOpen}
    <div class="overlay" role="dialog" aria-modal="true">
      <div class="dialog">
        <h3>Paste Account Code</h3>
        <p>Paste a <code>DCACCOUNT:…</code> code from the relay you want to add.</p>
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          bind:value={pasteValue}
          placeholder="DCACCOUNT:https://…"
          autofocus
          rows="3"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
        ></textarea>
        <div class="actions">
          <button onclick={() => (pasteOpen = false)} disabled={busy}>Cancel</button>
          <button class="primary" onclick={submitPaste} disabled={busy || !pasteValue.trim()}>
            {busy ? 'Adding…' : 'Add'}
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
        <h3>Remove {removeTarget.domain}?</h3>
        <p>This relay will be deleted from this account.</p>
        <div class="actions">
          <button onclick={() => (removeTarget = null)} disabled={busy}>Cancel</button>
          <button class="danger primary" onclick={confirmRemove} disabled={busy}>
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xl);
  }
  .group {
    margin-bottom: var(--space-5);
  }
  .group-header {
    text-transform: uppercase;
    font-size: var(--text-xs);
    color: var(--color-fg-tertiary);
    letter-spacing: 0.06em;
    margin: 0 0 var(--space-2) var(--space-3);
  }
  .footer-note {
    margin: var(--space-2) var(--space-3) 0;
    color: var(--color-fg-tertiary);
    font-size: var(--text-xs);
  }
  .card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    overflow: hidden;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list > li {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    padding: 10px var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .list > li:last-child {
    border-bottom: none;
  }
  .relay-row {
    align-items: center;
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
    font-family: ui-monospace, monospace;
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
  .link {
    background: transparent;
    color: var(--color-accent);
    font-size: var(--text-sm);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .link:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .danger {
    background: transparent;
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
  .danger:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .add-row {
    padding: 8px var(--space-3);
  }
  .add {
    font-size: var(--text-md);
  }
  .muted {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    padding: 8px var(--space-3);
  }
  .raw {
    margin: 0;
    padding: 10px var(--space-3);
    color: var(--color-fg-secondary);
    font-size: var(--text-xs);
    user-select: text;
  }
  .nav-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px var(--space-3);
    background: transparent;
    color: var(--color-fg);
  }
  .nav-row:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
  .nav-left {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }
  .nav-right {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-fg-tertiary);
  }
  .badge {
    padding: 1px 6px;
    border-radius: 8px;
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .badge.muted {
    background: var(--color-bg-hover);
    color: var(--color-fg-secondary);
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
  .dialog code {
    font-family: ui-monospace, monospace;
    font-size: 0.95em;
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
    font-family: ui-monospace, monospace;
    font-size: var(--text-sm);
    resize: vertical;
    min-height: 72px;
  }
  .dialog textarea:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
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
