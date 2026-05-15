<script lang="ts">
  // Ports `ios/qxp/Views/LogView.swift`. Sources differ — iOS reads OSLog,
  // here we pull from the in-memory ring buffer wired to deltachat-core's
  // Info / Warning / Error event stream (see lib/state/logs.svelte.ts).
  // Header mirrors iOS: app/build/UA + `get_system_info` + `get_info` of
  // the selected account.

  import { onMount, tick } from 'svelte';
  import { rpc } from '../lib/rpc';
  import { accounts } from '../lib/state/accounts.svelte';
  import { logs, clearLogs, type LogEntry } from '../lib/state/logs.svelte';
  import Icon from '../lib/Icon.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let header = $state<string>('');
  let redact = $state(false);
  let autoScroll = $state(true);
  let filter = $state<'all' | 'info' | 'warning' | 'error'>('all');
  let listEl: HTMLDivElement | undefined = $state();

  let entries = $derived.by<LogEntry[]>(() => {
    if (filter === 'all') return logs.entries;
    return logs.entries.filter((e) => e.level === filter);
  });

  let displayed = $derived.by(() => {
    const body = entries
      .map((e) => `[${fmt(e.ts)}] [${e.level.toUpperCase()}] (acct=${e.accountId}) ${e.msg}`)
      .join('\n');
    const text = `${header}\n\n${body}`;
    return redact ? redactEmails(text) : text;
  });

  onMount(buildHeader);

  // Auto-scroll to bottom when new entries arrive — debounced via tick so
  // we wait for the DOM update before measuring.
  $effect(() => {
    void logs.entries.length; // dep
    if (!autoScroll || !listEl) return;
    void tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  async function buildHeader() {
    const lines: string[] = [];
    lines.push(
      t('**This log may contain sensitive information. Examine and edit before sharing.**'),
    );
    lines.push('');
    lines.push(`userAgent=${navigator.userAgent}`);
    lines.push(`platform=desktop`);

    try {
      const sys = await rpc.call<Record<string, string>>('get_system_info');
      lines.push('');
      lines.push('--- system_info ---');
      for (const [k, v] of Object.entries(sys)) lines.push(`${k}=${v}`);
    } catch {
      /* offline / pre-handshake */
    }

    if (accounts.selectedId != null) {
      try {
        const info = await rpc.call<Record<string, string>>('get_info', [accounts.selectedId]);
        lines.push('');
        lines.push(`--- account_info (id=${accounts.selectedId}) ---`);
        for (const [k, v] of Object.entries(info)) lines.push(`${k}=${v}`);
      } catch {
        /* same */
      }
    }
    header = lines.join('\n');
  }

  function fmt(d: Date): string {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  // Cheap and intentionally over-broad — same approach as iOS. Better to
  // scrub a few false positives than leak a real address.
  function redactEmails(text: string): string {
    return text.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(displayed);
    } catch {
      /* clipboard denied — webview without permission */
    }
  }

  function counts(): { info: number; warning: number; error: number } {
    let info = 0,
      warning = 0,
      error = 0;
    for (const e of logs.entries) {
      if (e.level === 'info') info++;
      else if (e.level === 'warning') warning++;
      else error++;
    }
    return { info, warning, error };
  }
  let c = $derived(counts());
</script>

<h2>{t('Logs')}</h2>

<div class="toolbar">
  <div class="filters">
    <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>
      {t('All')} <span class="muted">({logs.entries.length})</span>
    </button>
    <button class:active={filter === 'info'} onclick={() => (filter = 'info')}>
      {t('Info')} <span class="muted">({c.info})</span>
    </button>
    <button class:active={filter === 'warning'} onclick={() => (filter = 'warning')}>
      {t('Warning')} <span class="muted">({c.warning})</span>
    </button>
    <button class:active={filter === 'error'} onclick={() => (filter = 'error')}>
      {t('Error')} <span class="muted">({c.error})</span>
    </button>
  </div>
  <div class="actions">
    <label class="toggle">
      <Toggle checked={redact} onChange={(v) => (redact = v)} label={t('Redact addresses')} />
      <span>{t('Redact addresses')}</span>
    </label>
    <label class="toggle">
      <Toggle checked={autoScroll} onChange={(v) => (autoScroll = v)} label={t('Auto-scroll')} />
      <span>{t('Auto-scroll')}</span>
    </label>
    <button class="ghost" onclick={copyAll} title={t('Copy all')}>
      <Icon name="copy" size={14} /> {t('Copy')}
    </button>
    <button class="ghost" onclick={clearLogs} title={t('Clear log buffer')}>
      <Icon name="trash" size={14} /> {t('Clear')}
    </button>
  </div>
</div>

<div class="card">
  <pre class="header" data-testid="settings-logs__header">{redact ? redactEmails(header) : header}</pre>
</div>

<div class="card list" bind:this={listEl} data-testid="settings-logs__list">
  {#if entries.length === 0}
    <p class="empty" data-testid="settings-logs__empty">{t('No log entries yet. Activity will appear here.')}</p>
  {:else}
    {#each entries as e (e.id)}
      <div class="entry" data-testid="settings-logs__entry" data-level={e.level}>
        <span class="ts">{fmt(e.ts)}</span>
        <span class="level">{e.level}</span>
        <span class="acct">a{e.accountId}</span>
        <span class="msg">{redact ? redactEmails(e.msg) : e.msg}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .filters {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-bg-elevated);
  }
  .filters button {
    padding: 6px 12px;
    background: transparent;
    color: var(--color-fg);
    font-size: var(--text-sm);
    border-right: 1px solid var(--color-border);
  }
  .filters button:last-child {
    border-right: none;
  }
  .filters button:hover {
    background: var(--color-bg-hover);
  }
  .filters button.active {
    background: var(--color-bg-selected);
    color: var(--color-accent);
    font-weight: 600;
  }
  .filters .muted {
    color: var(--color-fg-tertiary);
    font-weight: 400;
    margin-left: 4px;
  }
  .actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm);
    color: var(--color-fg-secondary);
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: transparent;
    color: var(--color-fg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }
  .ghost:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    margin-bottom: var(--space-3);
    overflow: hidden;
  }
  .header {
    margin: 0;
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-fg-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
    overflow-y: auto;
    user-select: text;
  }
  .list {
    max-height: 60vh;
    overflow-y: auto;
    padding: 4px 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    user-select: text;
  }
  .empty {
    margin: 0;
    padding: var(--space-3);
    color: var(--color-fg-tertiary);
    font-family: var(--font-sans);
  }
  .entry {
    display: grid;
    grid-template-columns: 90px 60px 50px 1fr;
    gap: var(--space-2);
    padding: 2px var(--space-3);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  }
  .entry:last-child {
    border-bottom: none;
  }
  .entry:hover {
    background: var(--color-bg-hover);
  }
  .ts {
    color: var(--color-fg-tertiary);
  }
  .level {
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .entry[data-level='info'] .level {
    color: var(--color-fg-secondary);
  }
  .entry[data-level='warning'] .level {
    color: var(--color-warning);
  }
  .entry[data-level='error'] .level {
    color: var(--color-danger);
  }
  .entry[data-level='error'] {
    background: color-mix(in srgb, var(--color-danger) 6%, transparent);
  }
  .acct {
    color: var(--color-fg-tertiary);
  }
  .msg {
    color: var(--color-fg);
    word-break: break-word;
    white-space: pre-wrap;
  }
</style>
