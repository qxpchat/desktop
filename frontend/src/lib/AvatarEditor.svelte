<script lang="ts" module>
  export type Props = {
    /** Display name — drives the initials fallback when `imagePath` is null. */
    name: string;
    /** Accent colour for the initials disc. */
    color: string;
    /** Daemon-relative path or absolute URL for the current avatar image,
     *  or `null` when no avatar is set. */
    imagePath: string | null;
    /** Diameter in CSS px. Defaults to 96 (the size used by the chat-info
     *  header + onboarding form; settings/Profile passes the same). */
    size?: number;
    /**
     * Called when the user picks + crops a new image, or asks to remove
     * the current one. `blob === null` means "remove the avatar". The
     * caller is responsible for any upload / `set_config` / refresh.
     */
    onChange: (blob: Blob | null) => void | Promise<void>;
    disabled?: boolean;
    /** Forwarded to the wrapping button so E2E can target the widget. */
    'data-testid'?: string;
    /** Optional aria-label override for the main button. */
    ariaLabel?: string;
  };
</script>

<script lang="ts">
  // One avatar-edit control to rule them all: chat-info group avatar,
  // settings Profile, instant signup. Renders an Avatar with a small
  // pencil badge; clicking either opens a Popover with "Change photo"
  // and (when applicable) "Remove photo". The cropper dialog handles
  // the pan/zoom + PNG export — this component just owns the menu, the
  // hidden file input, and the click suppress.

  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';
  import MenuItem from './MenuItem.svelte';
  import ImageCropperDialog from './ImageCropperDialog.svelte';
  import { t } from './i18n/i18n.svelte';

  let {
    name,
    color,
    imagePath,
    size = 96,
    onChange,
    disabled = false,
    'data-testid': testid,
    ariaLabel,
  }: Props = $props();

  let menuFor = $state<{ x: number; y: number } | null>(null);
  let cropSrc = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  function openMenu(e: MouseEvent) {
    if (disabled) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Anchor menu at the bottom-right of the avatar — sits next to the
    // pencil badge naturally and avoids viewport top-clipping in the
    // onboarding form, where the avatar is near the page top.
    menuFor = { x: rect.right - 4, y: rect.bottom + 4 };
  }

  function chooseFile() {
    menuFor = null;
    fileInput?.click();
  }

  function removeAvatar() {
    menuFor = null;
    void onChange(null);
  }

  function onPicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    cropSrc = URL.createObjectURL(file);
  }

  function onCropConfirm(blob: Blob) {
    const src = cropSrc;
    cropSrc = null;
    if (src) URL.revokeObjectURL(src);
    void onChange(blob);
  }

  function onCropCancel() {
    const src = cropSrc;
    cropSrc = null;
    if (src) URL.revokeObjectURL(src);
  }
</script>

<button
  type="button"
  class="editor"
  style="--avatar-size: {size}px;"
  onclick={openMenu}
  {disabled}
  aria-label={ariaLabel ?? (imagePath ? t('Change profile picture') : t('Upload profile picture'))}
  data-testid={testid}
>
  <Avatar {name} {color} {imagePath} {size} />
  <span class="badge" aria-hidden="true">
    <Icon name="pencil" size={14} />
  </span>
</button>

<input
  bind:this={fileInput}
  type="file"
  accept="image/*"
  hidden
  onchange={onPicked}
  data-testid={testid ? `${testid}__file-input` : undefined}
/>

{#if menuFor != null}
  {@const m = menuFor}
  <Popover
    x={m.x}
    y={m.y}
    onClose={() => (menuFor = null)}
    ariaLabel={t('Profile picture')}
    data-testid={testid ? `${testid}__menu` : undefined}
  >
    <MenuItem
      icon="upload"
      label={imagePath ? t('Change photo') : t('Upload photo')}
      onclick={chooseFile}
      data-testid={testid ? `${testid}__menu-change` : undefined}
    />
    {#if imagePath}
      <MenuItem
        icon="trash"
        danger
        label={t('Remove photo')}
        onclick={removeAvatar}
        data-testid={testid ? `${testid}__menu-remove` : undefined}
      />
    {/if}
  </Popover>
{/if}

<ImageCropperDialog
  open={cropSrc != null}
  src={cropSrc}
  onConfirm={onCropConfirm}
  onClose={onCropCancel}
/>

<style>
  .editor {
    position: relative;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    width: var(--avatar-size);
    height: var(--avatar-size);
    /* Suppress WebKit's native drag on the inner img + text selection on
       the initials fallback so picks open the menu cleanly. */
    -webkit-user-drag: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .editor:hover:not(:disabled) {
    filter: brightness(0.95);
  }
  .editor:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-bg-elevated);
    border: 2px solid var(--color-bg);
    color: var(--color-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px var(--color-shadow);
  }
</style>
