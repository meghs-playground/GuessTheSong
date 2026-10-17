/**
 * AudioEngine – fetches a preview URL, decodes it into an AudioBuffer,
 * and plays an exact sub-range [startSec, startSec+durationSec].
 *
 * Web Audio API is used so we can start/stop at precise offsets —
 * <audio> elements have ~100ms scheduling imprecision, fatal for 0.1s clips.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private onEndCallback: (() => void) | null = null

  /** Lazily create (or resume) the AudioContext after user gesture */
  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /** Fetch and decode audio. Throws on network or decode error. */
  async load(url: string): Promise<void> {
    this.stop()
    this.buffer = null
    const ctx = this.getCtx()
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Audio fetch failed: ${resp.status}`)
    const arrayBuffer = await resp.arrayBuffer()
    this.buffer = await ctx.decodeAudioData(arrayBuffer)
  }

  /**
   * Play a sub-range of the loaded buffer.
   * @param durationSec seconds to play from the start of the preview
   * @param onEnd called when playback reaches the end naturally
   */
  play(durationSec: number, onEnd?: () => void): void {
    if (!this.buffer) throw new Error('No audio loaded')
    this.stop()

    const ctx = this.getCtx()
    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer

    this.source.connect(ctx.destination)

    this.onEndCallback = onEnd ?? null
    this.source.onended = () => {
      this.source = null
      this.onEndCallback?.()
    }

    // Start at offset 0 for the given duration
    this.source.start(ctx.currentTime, 0, durationSec)
  }

  /** Stop any active playback immediately */
  stop(): void {
    if (this.source) {
      try {
        this.source.onended = null
        this.source.stop()
      } catch {
        // Already stopped
      }
      this.source = null
    }
  }

  /** True if a clip is currently playing */
  get isPlaying(): boolean {
    return this.source !== null
  }

  /** Duration of the loaded preview in seconds, or 0 */
  get duration(): number {
    return this.buffer?.duration ?? 0
  }

  dispose(): void {
    this.stop()
    this.ctx?.close()
    this.ctx = null
    this.buffer = null
  }
}
