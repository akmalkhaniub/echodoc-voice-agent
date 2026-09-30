/**
 * TranscriptService — turns a media URL into a normalized TranscriptResult using
 * AssemblyAI's async Speech-to-Text pipeline (speaker diarization + auto-chapters
 * + entity detection), then a LeMUR summary. Falls back to the bundled sample
 * transcript when no API key is configured, so the full UX is demoable offline.
 *
 * AssemblyAI REST:
 *   POST https://api.assemblyai.com/v2/transcript            (submit)
 *   GET  https://api.assemblyai.com/v2/transcript/:id        (poll)
 *   POST https://api.assemblyai.com/lemur/v3/generate/task   (LeMUR, Claude-powered)
 */

import type { TranscriptResult, TranscriptSegment, Chapter } from './types.js';
import { SAMPLE_TRANSCRIPT } from './sample_content.js';
import { isMockMode } from './util.js';
import { log } from './logger.js';

const API_BASE = 'https://api.assemblyai.com';

export interface TranscribeOptions {
  title?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/* c8 ignore start - helpers used only by the live transcription path (test:live) */
function ms2s(ms: number | undefined): number {
  return Math.round(((ms || 0) / 1000) * 10) / 10;
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Transcribed media';
  } catch {
    return 'Transcribed media';
  }
}
/* c8 ignore stop */

export class TranscriptService {
  apiKey: string | undefined;
  isMock: boolean;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
    this.isMock = isMockMode() || !this.apiKey || this.apiKey === 'your_assemblyai_api_key_here';
  }

  /** Transcribe a public media URL into a normalized, diarized, chaptered result. */
  async transcribe(audioUrl: string, options: TranscribeOptions = {}): Promise<TranscriptResult> {
    if (this.isMock) {
      log.info('transcript_mock_mode', { audioUrl });
      return {
        ...SAMPLE_TRANSCRIPT,
        // Reflect the requested source so the UI shows the user's intent, but
        // stay honest that the CONTENT is the bundled sample.
        title: options.title || SAMPLE_TRANSCRIPT.title,
        sourceUrl: audioUrl || SAMPLE_TRANSCRIPT.sourceUrl,
        isMock: true
      };
    }

    /* c8 ignore start - live AssemblyAI network path; exercised by npm run test:live */
    const headers = { Authorization: this.apiKey as string, 'Content-Type': 'application/json' };

    const submit = await fetch(`${API_BASE}/v2/transcript`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        auto_chapters: true,
        entity_detection: true
      })
    });
    const submitData: any = await submit.json().catch(() => ({}));
    if (!submit.ok || !submitData.id) {
      throw new Error(submitData.error || `Transcript submit failed (${submit.status})`);
    }

    const id: string = submitData.id;
    const pollInterval = options.pollIntervalMs || 3000;
    const deadline = Date.now() + (options.timeoutMs || 10 * 60 * 1000);
    log.info('transcript_submitted', { id });

    // Poll until the job completes.
    let data: any = submitData;
    while (data.status !== 'completed') {
      if (data.status === 'error') throw new Error(data.error || 'Transcription failed');
      if (Date.now() > deadline) throw new Error('Transcription timed out');
      await new Promise((r) => setTimeout(r, pollInterval));
      const poll = await fetch(`${API_BASE}/v2/transcript/${id}`, { headers });
      data = await poll.json().catch(() => ({}));
    }

    const result = this.normalize(id, audioUrl, options.title, data);
    result.summary = await this.summarize(id, result);
    return result;
  }

  /** Map AssemblyAI's transcript response onto our provider-agnostic shape. */
  private normalize(id: string, audioUrl: string, title: string | undefined, data: any): TranscriptResult {
    const utterances: any[] = Array.isArray(data.utterances) ? data.utterances : [];
    const segments: TranscriptSegment[] = utterances.map((u) => ({
      start: ms2s(u.start),
      end: ms2s(u.end),
      speaker: u.speaker ? `Speaker ${u.speaker}` : 'Speaker',
      text: String(u.text || '').trim()
    }));

    // If diarization returned nothing, fall back to the flat transcript text.
    if (segments.length === 0 && data.text) {
      segments.push({ start: 0, end: ms2s(data.audio_duration ? data.audio_duration * 1000 : 0), speaker: 'Speaker', text: String(data.text).trim() });
    }

    const chapters: Chapter[] = (Array.isArray(data.chapters) ? data.chapters : []).map((c: any) => ({
      start: ms2s(c.start),
      end: ms2s(c.end),
      headline: String(c.headline || c.gist || 'Chapter').trim(),
      summary: String(c.summary || '').trim()
    }));

    const speakers = Array.from(new Set(segments.map((s) => s.speaker)));
    const entities = Array.from(
      new Set((Array.isArray(data.entities) ? data.entities : []).map((e: any) => String(e.text || '').trim()).filter(Boolean))
    ).slice(0, 20) as string[];

    return {
      id,
      title: title || titleFromUrl(audioUrl),
      sourceUrl: audioUrl,
      durationSec: Math.round(Number(data.audio_duration) || (segments.at(-1)?.end ?? 0)),
      segments,
      chapters,
      summary: '',
      speakers,
      entities,
      isMock: false
    };
  }

  /** One-paragraph LeMUR summary; degrades to stitched chapter summaries on failure. */
  private async summarize(transcriptId: string, result: TranscriptResult): Promise<string> {
    try {
      const resp = await fetch(`${API_BASE}/lemur/v3/generate/task`, {
        method: 'POST',
        headers: { Authorization: this.apiKey as string, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript_ids: [transcriptId],
          prompt: 'Summarize this recording in one concise paragraph for someone deciding whether to watch it. Be specific about the main claims. Do not add information that is not in the transcript.'
        })
      });
      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data.response) return String(data.response).trim();
      log.warn('lemur_summary_failed', { status: resp.status });
    } catch (err) {
      log.warn('lemur_summary_error', { message: (err as Error).message });
    }
    return result.chapters.map((c) => c.summary).filter(Boolean).join(' ') || 'Summary unavailable.';
  }
  /* c8 ignore stop */

  /**
   * Ask a grounded question over a live transcript via LeMUR (Claude-powered).
   * Returns null on any failure so the caller can fall back to local retrieval.
   */
  async ask(transcriptId: string, question: string): Promise<string | null> {
    if (this.isMock || !transcriptId || transcriptId.startsWith('sample-')) return null;
    /* c8 ignore start - live LeMUR network path; exercised by npm run test:live */
    try {
      const resp = await fetch(`${API_BASE}/lemur/v3/generate/task`, {
        method: 'POST',
        headers: { Authorization: this.apiKey as string, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript_ids: [transcriptId],
          prompt: `Answer this question using ONLY the transcript. If the transcript does not address it, say so plainly. Keep the answer to two sentences and conversational, as it will be read aloud. Question: ${question}`
        })
      });
      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data.response) return String(data.response).trim();
      log.warn('lemur_ask_failed', { status: resp.status });
    } catch (err) {
      log.warn('lemur_ask_error', { message: (err as Error).message });
    }
    return null;
    /* c8 ignore stop */
  }

  /**
   * Ask a grounded question ACROSS several live transcripts via LeMUR (for a briefing).
   * Returns null on any failure so the caller can fall back to local cross-video retrieval.
   */
  async askMany(transcriptIds: string[], question: string): Promise<string | null> {
    if (this.isMock || transcriptIds.length === 0) return null;
    /* c8 ignore start - live LeMUR network path; exercised by npm run test:live */
    try {
      const resp = await fetch(`${API_BASE}/lemur/v3/generate/task`, {
        method: 'POST',
        headers: { Authorization: this.apiKey as string, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript_ids: transcriptIds,
          prompt: `You are briefing someone across ${transcriptIds.length} videos. Answer using ONLY these transcripts, and name which video the answer comes from. If none cover it, say so. Two sentences, conversational, read aloud. Question: ${question}`
        })
      });
      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data.response) return String(data.response).trim();
    } catch (err) {
      log.warn('lemur_askmany_error', { message: (err as Error).message });
    }
    return null;
    /* c8 ignore stop */
  }
}
