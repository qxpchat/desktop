<script lang="ts" module>
  /** A batch of files awaiting confirmation before being sent as N separate
   *  messages (deltachat is one-file-per-message). `send` fans them out. */
  export type MultiBatch = { names: string[]; send: () => Promise<void> };
</script>

<script lang="ts">
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let {
    batch,
    onClose,
    onError,
  }: {
    batch: MultiBatch | null;
    onClose: () => void;
    onError: (message: string) => void;
  } = $props();

  async function run() {
    const b = batch;
    if (!b) return;
    try {
      await b.send();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }
</script>

<ConfirmDialog
  open={batch != null}
  title={t('Send {count} files?', { count: batch?.names.length ?? 0 })}
  message={batch?.names.join(', ')}
  confirmLabel={t('Send')}
  onConfirm={() => void run()}
  {onClose}
  data-testid="multi-send-confirm"
/>
