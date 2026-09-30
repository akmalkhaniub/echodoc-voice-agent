/**
 * Shared domain types for VoxDive.
 * A "transcript result" is the normalized output of AssemblyAI async
 * transcription (speech-to-text + speaker diarization + auto-chapters +
 * entity detection), plus a LeMUR-generated summary.
 */

export interface TranscriptSegment {
  /** Start offset in seconds from the beginning of the media. */
  start: number;
  /** End offset in seconds. */
  end: number;
  /** Diarized speaker label, e.g. "Speaker A". */
  speaker: string;
  text: string;
}

export interface Chapter {
  start: number;
  end: number;
  headline: string;
  summary: string;
}

/** Normalized, provider-agnostic transcript payload consumed by the UI + agent. */
export interface TranscriptResult {
  id: string;
  title: string;
  sourceUrl: string;
  durationSec: number;
  segments: TranscriptSegment[];
  chapters: Chapter[];
  /** One-paragraph LeMUR summary (or a local extractive summary in mock mode). */
  summary: string;
  speakers: string[];
  entities: string[];
  /** True when produced by the offline simulator rather than the live API. */
  isMock: boolean;
}

/** A single grounded answer with the transcript passages it was drawn from. */
export interface GroundedAnswer {
  answer: string;
  citations: Array<{ start: number; end: number; speaker: string; text: string }>;
}

/** A passage citation that also names which source video it came from. */
export interface BriefingCitation {
  videoId: string;
  videoTitle: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
}

/** A grounded answer across a multi-video briefing. */
export interface BriefingAnswer {
  answer: string;
  citations: BriefingCitation[];
}
