<script lang="ts" module>
  import type { IconName } from '../lib/Icon.svelte';
  export type Props = {
    /** Preview image URL. `null` (or load failure) falls back to `thumbIcon`. */
    thumbUrl: string | null | undefined;
    /** Icon shown when no thumbnail is available (or the image fails). */
    thumbIcon: IconName;
    /** Bold accent label (typically the media kind: "Image", "GIF", …). */
    label: string;
    /** Secondary line (filename, term, …). Truncated with ellipsis. */
    subtitle: string;
    /** Close-button click handler. */
    onClose: () => void;
    /** Forwarded to the root element. */
    'data-testid'?: string;
    /** Forwarded to the close button. */
    closeTestId?: string;
  };
</script>

<script lang="ts">
  // Shared chrome for a single staged-media row above the composer: square
  // thumb + label/subtitle stack + close button. Used by AttachmentBar (real
  // deltachat attachments) and GifPendingPill (staged giphy GIFs). The two
  // call sites had pixel-identical CSS prior to the extract; consolidating
  // here keeps a future style tweak from landing in one bar and not the other.
  import Icon from '../lib/Icon.svelte';
  import IconButton from '../lib/IconButton.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  let {
    thumbUrl,
    thumbIcon,
    label,
    subtitle,
    onClose,
    closeTestId,
    ...rest
  }: Props = $props();

  // Fall back to the icon if the thumbnail fails to load (e.g. a drop from
  // outside the asset-protocol scope, or a file moved after the drop). Reset
  // on every `thumbUrl` change so a fresh row starts hopeful.
  let thumbBroken = $state(false);
  $effect(() => {
    void thumbUrl;
    thumbBroken = false;
  });
</script>

<div class="bar" {...rest}>
  {#if thumbUrl && !thumbBroken}
    <img class="thumb" src={thumbUrl} alt="" onerror={() => (thumbBroken = true)} />
  {:else}
    <span class="icon" aria-hidden="true">
      <Icon name={thumbIcon} size={18} />
    </span>
  {/if}
  <div class="content">
    <span class="label">{label}</span>
    <span class="subtitle">{subtitle}</span>
  </div>
  <IconButton
    variant="subtle"
    size={28}
    icon="x"
    label={t('Cancel')}
    onclick={onClose}
    data-testid={closeTestId}
  />
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-pane);
  }
  .thumb {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    flex: 0 0 auto;
  }
  .icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--color-bg-hover);
    color: var(--color-fg-secondary);
    flex: 0 0 auto;
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .label {
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--color-accent);
  }
  .subtitle {
    font-size: var(--text-sm);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
