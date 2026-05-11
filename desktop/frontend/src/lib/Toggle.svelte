<script lang="ts">
  // iOS-style switch. Modeled on Signal Desktop's `AxoSwitch` (32×18 track,
  // 16px thumb that translates 14px on toggle, accent fill on the left while
  // checked). Replaces raw `<input type="checkbox">` toggles across the
  // settings screens — those don't sit well in row layouts and look like
  // Web 1.0 against everything else.

  type Props = {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    label?: string;
  };

  let { checked, onChange, disabled = false, label }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  class="switch"
  class:on={checked}
  onclick={() => !disabled && onChange(!checked)}
>
  <span class="thumb"></span>
</button>

<style>
  .switch {
    position: relative;
    flex: 0 0 auto;
    width: 32px;
    height: 18px;
    padding: 0;
    border-radius: 9px;
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-hover);
    transition: background 0.15s ease, border-color 0.15s ease;
    cursor: pointer;
  }
  .switch:hover:not(:disabled) {
    filter: brightness(0.97);
  }
  .switch:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .switch.on {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  .thumb {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(0, 0, 0, 0.06);
    transition: transform 0.18s cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  .switch.on .thumb {
    transform: translateX(14px);
  }
</style>
