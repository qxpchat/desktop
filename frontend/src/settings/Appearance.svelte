<script lang="ts">
  import {
    prefs,
    savePrefs,
    getAccent,
    setAccent,
    setMinimizeToTray,
    type Theme,
  } from '../lib/prefs.svelte';
  import { accounts } from '../lib/state/accounts.svelte';
  import SettingsSection from '../lib/SettingsSection.svelte';
  import SettingsRow from '../lib/SettingsRow.svelte';
  import SegmentedControl from '../lib/SegmentedControl.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import { t } from '../lib/i18n/i18n.svelte';

  // macOS always hides on close (native dock pattern, no tray needed), so the
  // toggle would be a no-op there. Browser mode has no tray surface either.
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const isMac =
    typeof navigator !== 'undefined' &&
    (/Mac|Darwin/i.test(navigator.userAgent) || navigator.platform.startsWith('Mac'));
  const showTrayToggle = isTauri && !isMac;

  // Accent is a per-profile setting — the picker reads + writes the
  // override for the currently-active account. Theme / text-size remain
  // app-wide.
  let activeAccent = $derived(getAccent(accounts.selectedId));

  const THEMES: Theme[] = ['system', 'light', 'dark'];

  // Mirror of iOS `AppearanceSettings.ChatColor` — 10 hues × 2 shades, with
  // the dark shade derived from the light one via HSB (saturation × 1.2,
  // brightness × 0.7) — matches `darkBrightnessFactor` / `darkSaturationFactor`
  // in `ios/qxp/State/AppearanceSettings.swift`.
  const HUES: { name: string; rgb: [number, number, number] }[] = [
    { name: 'teal', rgb: [0x22, 0xcc, 0xaa] },
    { name: 'blue', rgb: [0x00, 0x7a, 0xff] },
    { name: 'indigo', rgb: [0x58, 0x56, 0xd6] },
    { name: 'purple', rgb: [0xaf, 0x52, 0xde] },
    { name: 'pink', rgb: [0xff, 0x2d, 0x55] },
    { name: 'red', rgb: [0xff, 0x3b, 0x30] },
    { name: 'orange', rgb: [0xff, 0x95, 0x00] },
    { name: 'green', rgb: [0x34, 0xc7, 0x59] },
    { name: 'yellow', rgb: [0xff, 0xcc, 0x00] },
    { name: 'cyan', rgb: [0x30, 0xb0, 0xc0] },
  ];

  function hex(r: number, g: number, b: number): string {
    const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  function rgbToHsb(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s, v];
  }

  function hsbToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const hh = h / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hh < 1) [r, g, b] = [c, x, 0];
    else if (hh < 2) [r, g, b] = [x, c, 0];
    else if (hh < 3) [r, g, b] = [0, c, x];
    else if (hh < 4) [r, g, b] = [0, x, c];
    else if (hh < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = v - c;
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function darken(rgb: [number, number, number]): string {
    const [h, s, v] = rgbToHsb(...rgb);
    const [r, g, b] = hsbToRgb(h, Math.min(1, s * 1.2), v * 0.7);
    return hex(r, g, b);
  }

  function lightHex(rgb: [number, number, number]): string {
    return hex(rgb[0], rgb[1], rgb[2]);
  }

  // Light row first, then dark row — matches iOS `allCases` ordering.
  const swatches = [
    ...HUES.map((h) => ({ value: lightHex(h.rgb), label: h.name })),
    ...HUES.map((h) => ({ value: darken(h.rgb), label: `${h.name} dark` })),
  ];

  function setTheme(theme: Theme) {
    prefs.theme = theme;
    savePrefs();
  }

  function pickAccent(c: string) {
    setAccent(accounts.selectedId, c);
  }

  const TEXT_SIZES = $derived([
    { label: t('Small'), value: 0.85 },
    { label: t('Default'), value: 1 },
    { label: t('Large'), value: 1.15 },
    { label: t('X-Large'), value: 1.3 },
  ]);

  const THEME_LABELS: Record<Theme, () => string> = {
    system: () => t('System'),
    light: () => t('Light'),
    dark: () => t('Dark'),
  };

  function setTextScale(v: number) {
    prefs.textScale = v;
    savePrefs();
  }

  const themeOptions = $derived(
    THEMES.map((th) => ({
      value: th,
      label: THEME_LABELS[th](),
      testId: 'settings-appearance__theme-option',
      data: { 'data-theme': th },
    })),
  );
  const textSizeOptions = $derived(
    TEXT_SIZES.map((s) => ({ value: s.value, label: s.label })),
  );
</script>

<h2>{t('Appearance')}</h2>

<SettingsSection title={t('Theme')}>
  <SegmentedControl
    options={themeOptions}
    value={prefs.theme}
    onChange={setTheme}
    ariaLabel={t('Theme')}
    data-testid="settings-appearance__theme"
  />
</SettingsSection>

<SettingsSection>
  <div class="preview" aria-hidden="true" data-testid="settings-appearance__preview">
    <div class="bubble incoming">{t('Hello!')}</div>
    <div class="bubble outgoing">{t('Hey, how are you?')}</div>
  </div>
</SettingsSection>

<SettingsSection title={t('Accent color')}>
  <div class="swatches" role="radiogroup" aria-label={t('Accent color')} data-testid="settings-appearance__accent">
    {#each swatches as s (s.value + s.label)}
      <button
        class="swatch"
        class:active={activeAccent.toLowerCase() === s.value.toLowerCase()}
        style:background={s.value}
        onclick={() => pickAccent(s.value)}
        aria-label={s.label}
        title={s.label}
        data-testid="settings-appearance__accent-swatch"
        data-color={s.value}
      ></button>
    {/each}
  </div>
</SettingsSection>

<SettingsSection
  title={t('Text size')}
  footer={t('Affects every text element using the size tokens — most of the app.')}
>
  <SegmentedControl
    options={textSizeOptions}
    value={prefs.textScale}
    onChange={setTextScale}
    ariaLabel={t('Text size')}
  />
</SettingsSection>

{#if showTrayToggle}
  <SettingsSection
    title={t('Window')}
    footer={t(
      'On GNOME the tray icon requires the AppIndicator extension; without it the hidden window can only be brought back from the taskbar.',
    )}
  >
    <SettingsRow
      label={t('Minimize to tray')}
      description={t('Closing the window hides it to the system tray instead of quitting.')}
      right={trayToggle}
    />
  </SettingsSection>

  {#snippet trayToggle()}
    <span data-testid="settings-appearance__minimize-to-tray" data-checked={prefs.minimizeToTray}>
      <Toggle
        checked={prefs.minimizeToTray}
        onChange={setMinimizeToTray}
        label={t('Minimize to tray')}
      />
    </span>
  {/snippet}
{/if}

<style>
  h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(10, 32px);
    gap: 10px;
    max-width: max-content;
  }
  .swatch {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid transparent;
    padding: 0;
    cursor: pointer;
    transition: transform 0.08s ease;
  }
  .swatch:hover {
    transform: scale(1.06);
  }
  .swatch.active {
    border-color: var(--color-fg);
    box-shadow: 0 0 0 2px var(--color-bg);
  }
  .preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    max-width: 420px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }
  .bubble {
    padding: 8px 14px;
    border-radius: 16px;
    font-size: var(--text-md);
    max-width: 80%;
  }
  .incoming {
    align-self: flex-start;
    background: var(--color-bg-elevated);
    color: var(--color-fg);
  }
  .outgoing {
    align-self: flex-end;
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
</style>
