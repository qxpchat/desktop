<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl } from '../../lib/files';
  import { t } from '../../lib/i18n/i18n.svelte';

  type Props = {
    message: Message;
    /** Tile colour triple — see MessageBubble. `bg` is the bubble fill
     *  behind the tile (also the puck-icon colour), `accent` fills the puck. */
    bg: string;
    fg: string;
    accent: string;
  };

  let { message, bg, fg, accent }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
  let audio: HTMLAudioElement | undefined = $state();
  let playing = $state(false);
  let progress = $state(0);
  let duration = $state(0);
  let currentTime = $state(0);
  $effect(() => {
    if (message.duration > 0 && duration === 0) duration = message.duration;
  });
  let speed = $state<1 | 1.5 | 2>(1);

  // Waveform — decoded once per cell. We sample the audio buffer into a
  // fixed number of buckets so the bar count is consistent regardless of
  // clip length (otherwise short clips would have ten bars and long clips
  // would have hundreds).
  const BAR_COUNT = 48;
  let peaks = $state<number[]>([]);
  let peaksError = $state(false);

  $effect(() => {
    const u = url;
    if (!u) return;
    peaks = [];
    peaksError = false;
    let cancelled = false;
    void (async () => {
      try {
        const samples = await decodePeaks(u, BAR_COUNT);
        if (!cancelled) peaks = samples;
      } catch {
        if (!cancelled) peaksError = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  onDestroy(() => {
    if (audio) {
      try {
        audio.pause();
      } catch {
        /* nothing */
      }
    }
  });

  function toggle() {
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function onTimeUpdate() {
    if (!audio || !audio.duration) return;
    currentTime = audio.currentTime;
    progress = audio.currentTime / audio.duration;
    if (audio.duration > duration) duration = audio.duration;
  }

  function onLoaded() {
    if (audio?.duration) duration = audio.duration;
  }

  function cycleSpeed() {
    speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    if (audio) audio.playbackRate = speed;
  }

  function fmt(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function onSeek(e: MouseEvent) {
    if (!audio || !audio.duration) return;
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }

  function onSeekKey(e: KeyboardEvent) {
    if (!audio || !audio.duration) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<script lang="ts" module>
  // Single shared AudioContext — Safari/WKWebView caps the number of
  // concurrent contexts at ~6, so allocating one per cell crashes the page
  // after a handful of voice messages.
  let _ctx: AudioContext | null = null;
  function ctx(): AudioContext {
    if (!_ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio not supported');
      _ctx = new Ctor();
    }
    return _ctx;
  }

  /** Fetch the audio file, decode it, and bucket the samples into `bars`
   *  peaks normalised to [0, 1]. Lightweight — only used to draw the
   *  waveform, never to play. */
  export async function decodePeaks(url: string, bars: number): Promise<number[]> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const decoded = await ctx().decodeAudioData(buf);
    const channel = decoded.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
    const out = new Array<number>(bars);
    let max = 0;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * samplesPerBar;
      const end = Math.min(channel.length, start + samplesPerBar);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      out[i] = peak;
      if (peak > max) max = peak;
    }
    // Normalise to fill the available height without clipping silence to 0.
    if (max > 0) for (let i = 0; i < bars; i++) out[i] = out[i] / max;
    return out;
  }
</script>

<div class="voice" style:--cell-bg={bg} style:--cell-fg={fg} style:--cell-accent={accent}>
  <button class="play" onclick={toggle} aria-label={playing ? t('Pause') : t('Play')}>
    {playing ? '❚❚' : '▶'}
  </button>
  <div
    class="wave"
    class:fallback={peaks.length === 0}
    onclick={onSeek}
    onkeydown={onSeekKey}
    role="slider"
    aria-valuemin="0"
    aria-valuemax="1"
    aria-valuenow={progress}
    aria-label={t('Seek voice message')}
    tabindex="0"
  >
    {#if peaks.length > 0}
      {#each peaks as p, i (i)}
        {@const played = i / peaks.length < progress}
        <span
          class="wave-bar"
          class:played
          style:height={`${Math.max(8, Math.round(p * 100))}%`}
        ></span>
      {/each}
    {:else if peaksError}
      <!-- Decode failed (CSP / unsupported codec) — keep the cell usable
           with a thin progress bar instead of a stretched empty box. -->
      <div class="fill" style:width={`${progress * 100}%`}></div>
    {:else}
      <!-- Decoding — placeholder bar so the cell doesn't jump in size. -->
      <div class="fill" style:width={`${progress * 100}%`}></div>
    {/if}
  </div>
  <span class="time">{fmt(Math.max(0, duration - currentTime))}</span>
  <button class="speed" onclick={cycleSpeed} aria-label={t('Playback speed')}>{speed}×</button>
  {#if url}
    <audio
      bind:this={audio}
      src={url}
      preload="metadata"
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      onended={() => (playing = false)}
      ontimeupdate={onTimeUpdate}
      onloadedmetadata={onLoaded}
    >
      <track kind="captions" />
    </audio>
  {/if}
</div>
{#if message.text}
  <div class="caption">{message.text}</div>
{/if}

<style>
  .voice {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 240px;
    color: var(--cell-fg);
  }
  .play {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--cell-accent);
    color: var(--cell-bg);
    font-size: 12px;
    flex: 0 0 auto;
    justify-content: center;
  }
  .wave {
    flex: 1;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
    cursor: pointer;
    /* Keyboard-focus ring; click-driven so the visual outline-on-mousedown
     * is ugly. Only show on `focus-visible`. */
    outline: none;
  }
  .wave:focus-visible {
    outline: 2px solid var(--cell-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .wave-bar {
    flex: 1;
    min-width: 2px;
    max-width: 4px;
    background: color-mix(in srgb, var(--cell-fg) 30%, transparent);
    border-radius: 2px;
    transition: background 0.05s linear;
  }
  .wave-bar.played {
    background: var(--cell-accent);
  }
  /* When decoding hasn't finished yet (or failed), the wave host degrades
   * to the original thin progress bar. */
  .wave.fallback {
    height: 6px;
    background: color-mix(in srgb, var(--cell-fg) 16%, transparent);
    border-radius: 3px;
    overflow: hidden;
    display: block;
    padding: 0;
  }
  .fill {
    height: 100%;
    background: var(--cell-accent);
    transition: width 0.1s linear;
  }
  .time {
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--cell-fg) 65%, transparent);
    flex: 0 0 auto;
  }
  .speed {
    width: 32px;
    height: 24px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--cell-fg) 14%, transparent);
    color: var(--cell-fg);
    font-size: var(--text-xs);
    font-weight: 600;
    flex: 0 0 auto;
  }
  .speed:hover {
    background: color-mix(in srgb, var(--cell-fg) 24%, transparent);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
