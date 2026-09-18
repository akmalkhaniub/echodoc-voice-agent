/**
 * Latency metrics for the voice loop.
 *
 * The number that matters for a real-time voice agent is turnaround: the time from
 * when the user stops speaking (final transcript) to the first byte of agent audio.
 * Barge-in latency is the time from user-speech-during-reply to playback halt.
 */

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  // Nearest-rank method, clamped to valid indices.
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

export interface LatencySummary {
  count: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
  mean: number;
  last: number | null;
}

/** Rolling reservoir of latency samples (ms) with percentile queries. */
export class LatencyTracker {
  private samples: number[] = [];
  constructor(private readonly maxSamples = 500) {}

  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  get last(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1] : null;
  }

  summary(): LatencySummary {
    if (this.samples.length === 0) {
      return { count: 0, p50: 0, p95: 0, min: 0, max: 0, mean: 0, last: null };
    }
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return {
      count: this.samples.length,
      p50: Math.round(percentile(this.samples, 50)),
      p95: Math.round(percentile(this.samples, 95)),
      min: Math.round(Math.min(...this.samples)),
      max: Math.round(Math.max(...this.samples)),
      mean: Math.round(sum / this.samples.length),
      last: Math.round(this.samples[this.samples.length - 1]),
    };
  }

  reset(): void {
    this.samples = [];
  }
}

/**
 * Tracks the timeline of a single conversational turn so the server can compute
 * turnaround and barge-in latencies without re-plumbing the event handlers.
 */
export class TurnClock {
  private userStopAt: number | null = null;
  private replyStartAt: number | null = null;
  private firstAudioReported = false;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** User finished their utterance (final transcript) — start the turnaround stopwatch. */
  markUserStop(): void {
    this.userStopAt = this.now();
    this.firstAudioReported = false;
  }

  /** Agent began composing a reply — barge-in window opens. */
  markReplyStart(): void {
    this.replyStartAt = this.now();
  }

  /**
   * First agent audio chunk arrived. Returns turnaround ms since user stop, or null
   * if we can't attribute it (no user-stop, or already reported for this turn).
   */
  markFirstAudio(): number | null {
    if (this.userStopAt == null || this.firstAudioReported) return null;
    this.firstAudioReported = true;
    return this.now() - this.userStopAt;
  }

  /**
   * User spoke while the agent was replying (barge-in). Returns ms since reply start,
   * or null if there is no active reply to interrupt.
   */
  markBargeIn(): number | null {
    if (this.replyStartAt == null) return null;
    const dt = this.now() - this.replyStartAt;
    this.replyStartAt = null;
    return dt;
  }

  /** Reply finished (or was interrupted) — close the barge-in window. */
  markReplyDone(): void {
    this.replyStartAt = null;
  }
}
