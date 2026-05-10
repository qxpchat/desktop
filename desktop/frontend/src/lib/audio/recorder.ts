// Microphone recorder backed by `MediaRecorder`. Picks the most
// deltachat-compatible Opus container the browser actually supports:
//   - Firefox / older Safari → `audio/ogg;codecs=opus`
//   - Chrome / Edge          → `audio/webm;codecs=opus`
// The deltachat core ingests both as `viewtype: Voice` without remuxing —
// modern Delta Chat clients decode webm/opus fine.

const candidates = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
] as const;

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export type RecordingResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private resolveStop: ((r: RecordingResult) => void) | null = null;
  private rejectStop: ((e: unknown) => void) | null = null;

  async start(): Promise<void> {
    const mime = pickMimeType();
    if (!mime) throw new Error('Browser does not support audio recording.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(this.stream, { mimeType: mime });
    this.chunks = [];
    rec.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });
    rec.addEventListener('stop', () => {
      const blob = new Blob(this.chunks, { type: mime });
      const durationMs = Date.now() - this.startedAt;
      this.cleanup();
      this.resolveStop?.({ blob, mimeType: mime, durationMs });
    });
    rec.addEventListener('error', (e) => {
      this.cleanup();
      this.rejectStop?.(e);
    });
    this.rec = rec;
    this.startedAt = Date.now();
    rec.start();
  }

  /** Stop and resolve with the recorded blob. */
  stop(): Promise<RecordingResult> {
    return new Promise<RecordingResult>((resolve, reject) => {
      if (!this.rec) {
        reject(new Error('not recording'));
        return;
      }
      this.resolveStop = resolve;
      this.rejectStop = reject;
      this.rec.stop();
    });
  }

  cancel(): void {
    if (this.rec && this.rec.state !== 'inactive') {
      try {
        this.rec.stop();
      } catch {
        /* ignore */
      }
    }
    this.cleanup();
    this.resolveStop = null;
    this.rejectStop = null;
  }

  isRecording(): boolean {
    return this.rec != null && this.rec.state === 'recording';
  }

  elapsedMs(): number {
    return this.rec ? Date.now() - this.startedAt : 0;
  }

  private cleanup() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.rec = null;
    this.chunks = [];
  }
}
