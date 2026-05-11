<script lang="ts">
  import { importBackup } from '../lib/state/onboarding.svelte';
  import ProgressOverlay from './ProgressOverlay.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    onBack: () => void;
  };

  let { onBack }: Props = $props();

  let dragOver = $state(false);
  let uploading = $state(false);
  let errorMsg = $state<string | null>(null);

  async function handleFile(file: File) {
    errorMsg = null;
    if (!file.name.toLowerCase().endsWith('.tar')) {
      errorMsg = 'Backup files must end in `.tar`.';
      return;
    }
    try {
      uploading = true;
      const res = await fetch('/upload?ext=tar', {
        method: 'POST',
        body: file,
        headers: { 'content-type': 'application/octet-stream' },
      });
      uploading = false;
      if (!res.ok) {
        errorMsg = `Upload failed: ${res.status} ${res.statusText}`;
        return;
      }
      const { path } = (await res.json()) as { path: string };
      await importBackup(path);
    } catch (err) {
      uploading = false;
      // importBackup error already surfaced via ProgressOverlay; only show
      // here if upload itself blew up.
      if (errorMsg == null) {
        errorMsg = err instanceof Error ? err.message : String(err);
      }
    }
  }

  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) void handleFile(file);
  }
</script>

<header class="topbar" data-tauri-drag-region>
  <button class="back" onclick={onBack}>‹ {t('Back')}</button>
  <h1>{t('Restore Backup')}</h1>
</header>

<main class="page">
  <div
    class="dropzone"
    class:hover={dragOver}
    role="region"
    aria-label={t('Drop backup file here')}
    ondragenter={(e) => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragover={(e) => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
  >
    <div class="placeholder" aria-hidden="true"></div>
    <h2>{t('Drop a .tar backup file here')}</h2>
    <p class="hint">{t('Or pick one from your device')}</p>
    <label class="picker">
      <input type="file" accept=".tar,application/x-tar" onchange={onPick} />
      <span>{t('Choose file…')}</span>
    </label>
    {#if uploading}
      <p class="status">{t('Uploading to daemon…')}</p>
    {/if}
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>

  <p class="footnote">
    {t('Backups are produced by Delta Chat\'s')}
    <em>{t('Settings → Add Second Device → Export Backup')}</em>.
  </p>
</main>

<ProgressOverlay />

<style>
  .topbar {
    padding: calc(var(--titlebar-gutter)) var(--space-3) 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 48px;
    background: var(--color-bg);
  }
  .back {
    color: var(--color-accent);
    font-size: var(--text-md);
    padding: var(--space-2);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .page {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .dropzone {
    border: 2px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    padding: var(--space-6) var(--space-5);
    text-align: center;
    transition:
      border-color 0.12s,
      background 0.12s;
  }
  .dropzone.hover {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }
  .placeholder {
    width: 56px;
    height: 56px;
    margin: 0 auto var(--space-3);
    border: 2px dashed var(--color-border-strong);
    border-radius: var(--radius-md);
  }
  h2 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .hint {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-fg-secondary);
  }
  .picker {
    display: inline-block;
  }
  .picker input {
    display: none;
  }
  .picker span {
    display: inline-block;
    padding: 10px 16px;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
    cursor: pointer;
  }
  .picker span:hover {
    filter: brightness(1.05);
  }
  .status {
    margin-top: var(--space-3);
    color: var(--color-fg-secondary);
    font-size: var(--text-sm);
  }
  .error {
    margin-top: var(--space-3);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
  .footnote {
    color: var(--color-fg-tertiary);
    font-size: var(--text-sm);
    text-align: center;
    margin: 0;
  }
</style>
