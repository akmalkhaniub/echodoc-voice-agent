/**
 * BriefingContext — the grounding store for VoxDive Briefings.
 *
 * Holds several transcribed videos (a "feed") and answers questions across ALL
 * of them, always naming which video and timestamp an answer came from. This is
 * the multi-source equivalent of VideoContext: the Voice Agent's `search_briefing`
 * tool calls into it, so every spoken answer is grounded in a real source video.
 *
 * Retrieval is deterministic IDF-weighted keyword scoring over the combined
 * corpus, so it works offline with no API key.
 */
import type { TranscriptResult, BriefingCitation, BriefingAnswer } from './types.js';
import { formatTimestamp } from './video_context.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'that', 'this',
  'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'how', 'why', 'when',
  'where', 'do', 'does', 'did', 'about', 'i', 'you', 'we', 'he', 'she', 'my', 'your',
  'actually', 'really', 'basically', 'honestly', 'exactly', 'just', 'sure', 'okay',
  'yeah', 'like', 'well', 'kind', 'sort', 'mean', 'know', 'think', 'get', 'got',
  'can', 'could', 'would', 'should', 'will', 'me', 'us', 'so', 'if', 'not', 'across', 'all'
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => !STOP_WORDS.has(w) && w.length > 1);
}

interface FlatSeg { videoId: string; videoTitle: string; start: number; end: number; speaker: string; text: string; tokens: Set<string>; }

export class BriefingContext {
  videos: TranscriptResult[];
  private flat: FlatSeg[];

  constructor(videos: TranscriptResult[] = []) {
    this.videos = videos;
    this.flat = [];
    for (const v of videos) {
      for (const s of v.segments) {
        this.flat.push({ videoId: v.id, videoTitle: v.title, start: s.start, end: s.end, speaker: s.speaker, text: s.text, tokens: new Set(tokenize(s.text)) });
      }
    }
  }

  get hasBriefing(): boolean { return this.videos.length > 0 && this.flat.length > 0; }
  get count(): number { return this.videos.length; }

  /** Rank passages across ALL videos by IDF-weighted overlap; return best with source tags. */
  search(query: string, limit = 4): BriefingCitation[] {
    if (!this.hasBriefing) return [];
    const terms = Array.from(new Set(tokenize(query)));
    if (terms.length === 0) return [];
    const n = this.flat.length;
    const idf: Record<string, number> = {};
    for (const t of terms) { let df = 0; for (const f of this.flat) if (f.tokens.has(t)) df++; idf[t] = df === 0 ? 0 : Math.log((n + 1) / (df + 0.5)); }

    const scored = this.flat.map((f) => {
      let score = 0;
      for (const t of terms) if (f.tokens.has(t)) score += idf[t];
      if (f.text.toLowerCase().includes(query.toLowerCase().trim())) score += 5;
      return { f, score };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.f.start - b.f.start)
      .slice(0, limit)
      .map((x) => ({ videoId: x.f.videoId, videoTitle: x.f.videoTitle, start: x.f.start, end: x.f.end, speaker: x.f.speaker, text: x.f.text }));
  }

  /** Grounded cross-video answer; declines when nothing matches (no hallucination). */
  answerQuery(query: string): BriefingAnswer {
    if (!this.hasBriefing) return { answer: 'No briefing is loaded yet.', citations: [] };
    const q = query.toLowerCase().trim();

    if (/\b(summary|summarize|overview|briefing|tl;?dr|what.?s new|catch me up|rundown)\b/.test(q)) {
      return { answer: this.briefingText(), citations: [] };
    }
    if (/how many (videos|sources)|what (videos|sources)/.test(q)) {
      return { answer: `This briefing covers ${this.count} videos: ${this.videos.map((v) => `“${v.title}”`).join(', ')}.`, citations: [] };
    }

    const hits = this.search(query, 4);
    if (hits.length === 0) {
      return { answer: `None of the ${this.count} videos in this briefing cover that. Ask about one of them, or rephrase.`, citations: [] };
    }
    const top = hits[0];
    const quote = top.text.length > 180 ? top.text.slice(0, 180).trim() + '…' : top.text;
    const answer = `In “${top.videoTitle}” at ${formatTimestamp(top.start)}, ${top.speaker} said: “${quote}”`;
    return { answer, citations: hits };
  }

  /** Which source videos touch a topic (for "who covered X?"). */
  sourcesFor(query: string): string[] {
    const hits = this.search(query, 8);
    return Array.from(new Set(hits.map((h) => h.videoTitle)));
  }

  /** Offline briefing script: a lead line + one line per source video. */
  briefingText(): string {
    if (!this.hasBriefing) return 'No videos in this briefing.';
    const lead = `Here's your briefing across ${this.count} videos.`;
    const items = this.videos.map((v, i) => `${i + 1}. “${v.title}” (${formatTimestamp(v.durationSec)}): ${v.summary || 'no summary available.'}`);
    return [lead, ...items].join('\n');
  }

  /** Markdown export of the briefing + per-video summaries and chapters. */
  exportMarkdown(): string {
    let md = `# VoxDive Briefing\n\n**${this.count} videos**\n\n## Briefing\n${this.briefingText()}\n\n`;
    for (const v of this.videos) {
      md += `## ${v.title}\n`;
      md += `**Source:** ${v.sourceUrl}  ·  **Duration:** ${formatTimestamp(v.durationSec)}  ·  **Speakers:** ${v.speakers.join(', ')}\n\n`;
      if (v.summary) md += `${v.summary}\n\n`;
      if (v.chapters.length) { md += `Chapters: ` + v.chapters.map((c) => `${formatTimestamp(c.start)} ${c.headline}`).join('; ') + `\n\n`; }
    }
    md += `---\n*Generated by VoxDive Briefings — Powered by AssemblyAI*`;
    return md;
  }
}
