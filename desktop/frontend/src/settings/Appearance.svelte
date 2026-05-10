<script lang="ts">
  import { prefs, savePrefs, type Theme } from '../lib/prefs.svelte';

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

  function setTheme(t: Theme) {
    prefs.theme = t;
    savePrefs();
  }

  function setAccent(c: string) {
    prefs.accent = c;
    savePrefs();
  }
</script>

<h2>Appearance</h2>

<div class="group">
  <h3>Theme</h3>
  <div class="seg" role="radiogroup" aria-label="Theme">
    {#each THEMES as t}
      <button
        role="radio"
        aria-checked={prefs.theme === t}
        class:active={prefs.theme === t}
        onclick={() => setTheme(t)}
      >
        {t}
      </button>
    {/each}
  </div>
</div>

<div class="group">
  <h3>Accent color</h3>
  <div class="swatches" role="radiogroup" aria-label="Accent color">
    {#each swatches as s (s.value + s.label)}
      <button
        class="swatch"
        class:active={prefs.accent.toLowerCase() === s.value.toLowerCase()}
        style:background={s.value}
        onclick={() => setAccent(s.value)}
        aria-label={s.label}
        title={s.label}
      ></button>
    {/each}
  </div>
</div>

<style>
  h2 {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--text-xl);
  }
  h3 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-md);
    font-weight: 600;
  }
  .group {
    margin-bottom: var(--space-4);
  }
  .seg {
    display: inline-flex;
    gap: 1px;
    background: var(--color-border);
    border-radius: var(--radius-md);
    padding: 1px;
  }
  .seg button {
    padding: 6px 14px;
    background: var(--color-bg-pane);
    border-radius: calc(var(--radius-md) - 1px);
    text-transform: capitalize;
    color: var(--color-fg);
  }
  .seg button.active {
    background: var(--color-accent);
    color: var(--color-accent-fg);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(10, 32px);
    gap: 8px;
    max-width: max-content;
  }
  .swatch {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid transparent;
    box-shadow: 0 2px 4px var(--color-shadow);
    padding: 0;
  }
  .swatch.active {
    border-color: var(--color-fg);
  }
</style>
