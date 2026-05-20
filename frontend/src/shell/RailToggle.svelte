<script lang="ts">
  import Icon from '../lib/Icon.svelte';
  import Badge from '../lib/Badge.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** True when the profile rail is currently visible. */
    open: boolean;
    onToggle: () => void;
    /** Unread roll-up across the profiles hidden while the rail is closed.
     *  When non-zero in the closed state, the badge replaces the chevron and
     *  becomes the clickable affordance to re-open the rail. */
    unread?: number;
  };
  let { open, onToggle, unread = 0 }: Props = $props();
</script>

<button
  class="burger"
  class:active={open}
  title={open ? t('Hide profiles') : t('Show profiles')}
  aria-label={t('Toggle profile rail')}
  aria-pressed={open}
  onclick={onToggle}
  data-testid="rail-toggle"
>
  {#if !open && unread > 0}
    <Badge count={unread} aria-label={t('Unread in other profiles')} />
  {:else}
    <Icon name={open ? 'chevron-left' : 'chevron-right'} size={18} />
  {/if}
</button>

<style>
  .burger {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-fg-secondary);
    flex: 0 0 auto;
    font-size: 18px;
    line-height: 1;
    justify-content: center;
    transition: background 0.1s ease, color 0.1s ease;
  }
  .burger:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .burger.active {
    background: var(--color-bg-hover);
    color: var(--color-accent);
  }
</style>
