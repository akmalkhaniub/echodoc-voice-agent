/**
 * VideoContext — the grounding store for VoxDive.
 *
 * Holds one media item's transcript (diarized segments), auto-chapters, and
 * summary, and answers questions *only* from that transcript. It is the
 * equivalent of a per-connection knowledge base: the Voice Agent's tools call
 * into it, so every spoken answer is grounded in what was actually said.
 *
 * Retrieval here is deterministic keyword/overlap scoring so it works offline
 * with no API key. When a live AssemblyAI key is present, the server prefers
 * LeMUR (see transcript_service.ts) and falls back to this for resilience.
 */

import type { TranscriptResult, TranscriptSegment, Chapter, GroundedAnswer } from './types.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'that', 'this',
  'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'how', 'why', 'when',
  'where', 'do', 'does', 'did', 'about', 'i', 'you', 'we', 'he', 'she', 'my', 'your',
  // Conversational fillers that shouldn't drive retrieval.
  'actually', 'really', 'basically', 'honestly', 'exactly', 'just', 'sure', 'okay',
  'yeah', 'like', 'well', 'kind', 'sort', 'mean', 'know', 'think', 'get', 'got',
  'can', 'could', 'would', 'should', 'will', 'would', 'me', 'us', 'so', 'if', 'not'
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => !STOP_WORDS.has(w) && w.length > 1);
}

/** mm:ss formatter for citations and exports. */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export class VideoContext {
  result: TranscriptResult | null;

  constructor() {
    this.result = null;
  }

  reset(): void {
    this.result = null;
  }

  /** Load a transcribed media item as the active grounding context. */
  load(result: TranscriptResult): void {
    this.result = result;
  }

  get hasTranscript(): boolean {
    return Boolean(this.result && this.result.segments.length > 0);
  }

  get title(): string {
    return this.result?.title || 'Untitled media';
  }

  get segments(): TranscriptSegment[] {
    return this.result?.segments || [];
  }

  get chapters(): Chapter[] {
    return this.result?.chapters || [];
  }

  get summary(): string {
    return this.result?.summary || '';
  }

  get speakers(): string[] {
    return this.result?.speakers || [];
  }

  /**
   * Rank transcript segments against a query by IDF-weighted token overlap and
   * return the best passages with timestamps. Deterministic and offline-safe.
   * IDF weighting means a rare, salient term (e.g. "drones") outranks a common
   * one (e.g. "ocean") that appears in many segments, so the top hit is the
   * passage actually about the query rather than the earliest loose match.
   */
  search(query: string, limit = 3): TranscriptSegment[] {
    if (!this.result) return [];
    const terms = Array.from(new Set(tokenize(query)));
    if (terms.length === 0) return [];

    const segTokenSets = this.result.segments.map((seg) => new Set(tokenize(seg.text)));
    const n = this.result.segments.length;

    // Document frequency + IDF per query term across segments.
    const idf: Record<string, number> = {};
    for (const term of terms) {
      let df = 0;
      for (const set of segTokenSets) if (set.has(term)) df++;
      idf[term] = df === 0 ? 0 : Math.log((n + 1) / (df + 0.5));
    }

    const scored = this.result.segments.map((seg, i) => {
      let score = 0;
      for (const term of terms) if (segTokenSets[i].has(term)) score += idf[term];
      // Bonus for exact phrase containment so verbatim quotes rank first.
      if (seg.text.toLowerCase().includes(query.toLowerCase().trim())) score += 5;
      return { seg, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.seg.start - b.seg.start)
      .slice(0, limit)
      .map((x) => x.seg);
  }

  /**
   * Build a grounded answer from the transcript for a natural-language query.
   * Used as the copilot text path and as the offline fallback for the agent's
   * search_transcript tool. Never invents content — if nothing matches, it says so.
   */
  answerQuery(query: string): GroundedAnswer {
    if (!this.hasTranscript) {
      return { answer: 'No video has been loaded yet. Paste a media URL and transcribe it first.', citations: [] };
    }

    const q = query.toLowerCase().trim();

    if (/\b(summary|summarize|what.*about|overview|tl;?dr|gist)\b/.test(q)) {
      return { answer: this.summary || 'No summary is available for this media.', citations: [] };
    }

    if (/\b(chapters?|sections?|topics?|outline)\b/.test(q) && this.chapters.length > 0) {
      const list = this.chapters.map((c) => `${formatTimestamp(c.start)} — ${c.headline}`).join('; ');
      return { answer: `This media has ${this.chapters.length} chapters: ${list}.`, citations: [] };
    }

    if (/\b(who|speakers?|how many people)\b/.test(q) && this.speakers.length > 0) {
      return { answer: `${this.speakers.length} speaker(s) were detected: ${this.speakers.join(', ')}.`, citations: [] };
    }

    const hits = this.search(query, 3);
    if (hits.length === 0) {
      return { answer: `The transcript doesn't appear to cover that. Try asking about one of the chapters, or rephrase.`, citations: [] };
    }

    const top = hits[0];
    const answer = `At ${formatTimestamp(top.start)}, ${top.speaker} said: "${top.text}"`;
    return {
      answer,
      citations: hits.map((h) => ({ start: h.start, end: h.end, speaker: h.speaker, text: h.text }))
    };
  }

  /** Find the chapter whose headline/summary best matches a topic phrase. */
  jumpToTopic(topic: string): Chapter | null {
    if (!this.result || this.chapters.length === 0) return null;
    const terms = new Set(tokenize(topic));
    if (terms.size === 0) return null;

    let best: { chapter: Chapter; score: number } | null = null;
    for (const chapter of this.chapters) {
      const tokens = tokenize(`${chapter.headline} ${chapter.summary}`);
      let score = 0;
      for (const t of tokens) if (terms.has(t)) score++;
      if (score > 0 && (!best || score > best.score)) best = { chapter, score };
    }
    return best?.chapter || null;
  }

  /** Export the transcript, summary, and chapters as portable Markdown. */
  exportMarkdown(): string {
    if (!this.result) return '# VoxDive\n\n_No media loaded._\n';
    const r = this.result;

    let md = `# ${r.title}\n`;
    md += `**Source:** ${r.sourceUrl || 'uploaded media'}  \n`;
    md += `**Duration:** ${formatTimestamp(r.durationSec)}  \n`;
    md += `**Speakers:** ${r.speakers.join(', ') || 'n/a'}  \n`;
    md += `**Transcribed by:** VoxDive (AssemblyAI Speech-to-Text + Diarization + LeMUR)\n\n`;

    if (r.summary) md += `## Summary\n${r.summary}\n\n`;

    if (r.chapters.length > 0) {
      md += `## Chapters\n`;
      for (const c of r.chapters) md += `- **${formatTimestamp(c.start)}** — ${c.headline}: ${c.summary}\n`;
      md += `\n`;
    }

    if (r.entities.length > 0) md += `## Key entities\n${r.entities.join(', ')}\n\n`;

    md += `## Transcript\n`;
    for (const seg of r.segments) {
      md += `**[${formatTimestamp(seg.start)}] ${seg.speaker}:** ${seg.text}\n\n`;
    }

    md += `---\n*Generated by VoxDive — Powered by AssemblyAI*`;
    return md;
  }
}
