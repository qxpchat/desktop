// Microphone recorder backed by `MediaRecorder`. Picks the most
// universally-playable container the browser actually supports.
//
// Order matters: WebM/Opus is the *least* compatible because iOS and
// macOS Delta Chat can't decode WebM containers natively, even though
// the codec (Opus) is supported when wrapped in Ogg. AAC-in-MP4 plays
// everywhere — every Delta Chat client knows .m4a. Ogg/Opus is the
// fallback for Firefox (no MediaRecorder MP4 support). WebM is last
// resort and almost certainly won't be playable on the other side, but
// at least the recording works.
//
//   - WKWebView / Safari 14.1+ → `audio/mp4;codecs=mp4a.40.2`  (.m4a)
//   - Firefox                  → `audio/ogg;codecs=opus`        (.ogg)
//   - Chrome / Chromium        → `audio/webm;codecs=opus`       (.weba)

const candidates = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
] as const;

/** Maps a chosen MIME to a deltachat-friendly file extension. */
export function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  // `.weba` (audio webm) instead of `.webm` so deltachat-core's mime
  // sniffer doesn't tag it as `video/webm`.
  return 'weba';
}

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
