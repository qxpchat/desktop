<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Message } from '../../lib/state/chat.svelte';
  import { fileUrl } from '../../lib/files';

  type Props = {
    message: Message;
  };

  let { message }: Props = $props();

  let url = $derived(fileUrl(message.file ?? undefined));
  let audio: HTMLAudioElement | undefined = $state();
  let playing = $state(false);
  let progress = $state(0);
  let duration = $state(0);
  $effect(() => {
    if (message.duration > 0 && duration === 0) duration = message.duration;
  });
  let speed = $state<1 | 1.5 | 2>(1);

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

<div class="voice">
  <button class="play" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
    {playing ? '❚❚' : '▶'}
  </button>
  <div
    class="bar"
    onclick={onSeek}
    onkeydown={onSeekKey}
    role="slider"
    aria-valuemin="0"
    aria-valuemax="1"
    aria-valuenow={progress}
    aria-label="Seek voice message"
    tabindex="0"
  >
    <div class="fill" style:width={`${progress * 100}%`}></div>
  </div>
  <span class="time">{fmt(audio?.currentTime ?? 0)}/{fmt(duration)}</span>
  <button class="speed" onclick={cycleSpeed} aria-label="Playback speed">{speed}×</button>
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
    padding: 8px;
    background: var(--color-bg-hover);
    border-radius: 12px;
    min-width: 240px;
  }
  .play {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-size: 12px;
    flex: 0 0 auto;
    justify-content: center;
  }
  .bar {
    flex: 1;
    height: 6px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 3px;
    overflow: hidden;
    cursor: pointer;
  }
  .fill {
    height: 100%;
    background: var(--color-accent);
    transition: width 0.1s linear;
  }
  .time {
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--color-fg-secondary);
    flex: 0 0 auto;
  }
  .speed {
    width: 32px;
    height: 24px;
    border-radius: 12px;
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-size: var(--text-xs);
    font-weight: 600;
    flex: 0 0 auto;
  }
  .speed:hover {
    background: var(--color-border);
  }
  .caption {
    margin-top: 6px;
    white-space: pre-wrap;
  }
</style>
