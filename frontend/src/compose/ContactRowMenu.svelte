<script lang="ts">
  // Right-click context menu for a contact row in ComposePane — the only
  // surface qxp lists standalone contacts on. Singleton at the pane level:
  // rows fire `onContextMenu` upward and the pane mounts one instance with
  // the click coords. Mirrors `ChatRowMenu`.
  import Icon from '../lib/Icon.svelte';
  import Popover from '../lib/Popover.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  type Props = {
    /** Page-coordinate anchor for the menu's top-left. */
    x: number;
    y: number;
    onClose: () => void;
    onDelete: () => void;
  };

  let { x, y, onClose, onDelete }: Props = $props();
</script>

<Popover {x} {y} {onClose} data-testid="contact-row-menu">
  <div class="items">
    <button
      class="danger"
      role="menuitem"
      onclick={() => {
        onDelete();
        onClose();
      }}
      data-testid="contact-row-menu-item"
      data-action="delete"
    >
      <Icon name="trash-2" size={14} />
      {t('Delete contact')}
    </button>
  </div>
</Popover>

<style>
  .items {
    min-width: 180px;
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  .items button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: 8px 10px;
    background: transparent;
    text-align: left;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .items button:hover {
    background: var(--color-bg-hover);
  }
  .items button.danger {
    color: var(--color-danger);
  }
</style>
