/**
 * One-off: upload the local NASA demo video to AssemblyAI, transcribe it
 * (STT + diarization + auto-chapters + entity detection + LeMUR summary), and
 * write the result to src/nasa_demo_content.ts as a bundled REAL demo.
 *
 *   npm run build && node dist/scripts/transcribe_demo.js   (or: tsx scripts/transcribe_demo.ts)
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TranscriptResult, TranscriptSegment, Chapter } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const KEY = process.env.ASSEMBLYAI_API_KEY;
if (!KEY || KEY === 'your_assemblyai_api_key_here') { console.error('no key'); process.exit(1); }
const API = 'https://api.assemblyai.com';
const ms2s = (ms: number | undefined) => Math.round(((ms || 0) / 1000) * 10) / 10;

const mediaPath = path.resolve(__dirname, '../src/public/media/nasa_scientific_method.mp4');
const playbackUrl = '/media/nasa_scientific_method.mp4';
const title = 'NASA SCI Files — The Scientific Method';

console.log('Uploading', mediaPath, `(${(fs.statSync(mediaPath).size / 1e6).toFixed(1)} MB)…`);
const bytes = fs.readFileSync(mediaPath);
const up = await fetch(`${API}/v2/upload`, { method: 'POST', headers: { Authorization: KEY, 'Content-Type': 'application/octet-stream' }, body: bytes });
const upData: any = await up.json();
if (!up.ok || !upData.upload_url) { console.error('upload failed', upData); process.exit(1); }
console.log('Uploaded. Submitting transcript…');

const sub = await fetch(`${API}/v2/transcript`, {
  method: 'POST',
  headers: { Authorization: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ audio_url: upData.upload_url, speaker_labels: true, auto_chapters: true, entity_detection: true })
});
const subData: any = await sub.json();
if (!sub.ok || !subData.id) { console.error('submit failed', subData); process.exit(1); }
const id = subData.id;

let data: any = subData;
process.stdout.write('Polling');
while (data.status !== 'completed') {
  if (data.status === 'error') { console.error('\nerror', data.error); process.exit(1); }
  await new Promise((r) => setTimeout(r, 4000));
  process.stdout.write('.');
  data = await (await fetch(`${API}/v2/transcript/${id}`, { headers: { Authorization: KEY } })).json();
}
console.log(' done.');

const segments: TranscriptSegment[] = (data.utterances || []).map((u: any) => ({
  start: ms2s(u.start), end: ms2s(u.end), speaker: u.speaker ? `Speaker ${u.speaker}` : 'Speaker', text: String(u.text || '').trim()
}));
const chapters: Chapter[] = (data.chapters || []).map((c: any) => ({
  start: ms2s(c.start), end: ms2s(c.end), headline: String(c.headline || c.gist || 'Chapter').trim(), summary: String(c.summary || '').trim()
}));
const speakers = Array.from(new Set(segments.map((s) => s.speaker)));
const entities = Array.from(new Set((data.entities || []).map((e: any) => String(e.text || '').trim()).filter(Boolean))).slice(0, 20) as string[];

// LeMUR summary
let summary = '';
try {
  const lem = await fetch(`${API}/lemur/v3/generate/task`, {
    method: 'POST', headers: { Authorization: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript_ids: [id], prompt: 'Summarize this recording in one concise paragraph. Be specific and do not add information not in the transcript.' })
  });
  const ld: any = await lem.json();
  summary = ld.response ? String(ld.response).trim() : chapters.map((c) => c.summary).join(' ');
} catch { summary = chapters.map((c) => c.summary).join(' '); }

const result: TranscriptResult = {
  id: 'nasa-scientific-method', title, sourceUrl: playbackUrl,
  durationSec: Math.round(Number(data.audio_duration) || (segments.at(-1)?.end ?? 0)),
  segments, chapters, summary, speakers, entities, isMock: false
};

const out = `/**
 * REAL bundled demo: NASA SCI Files "The Scientific Method" (public domain, NASA-original).
 * Source video: https://archive.org/details/NasaSciFiles-TheScientificMethod
 * Transcript/chapters/summary produced by AssemblyAI (STT + diarization + auto-chapters + LeMUR).
 * Regenerate with: npm run transcribe:demo
 */
import type { TranscriptResult } from './types.js';

export const NASA_DEMO: TranscriptResult = ${JSON.stringify(result, null, 2)};
`;
const dest = path.resolve(__dirname, '../src/nasa_demo_content.ts');
fs.writeFileSync(dest, out);
console.log(`\nWrote ${dest}`);
console.log(`Segments: ${segments.length}, speakers: ${speakers.length}, chapters: ${chapters.length}, duration: ${result.durationSec}s`);
console.log(`Summary: ${summary.slice(0, 160)}…`);
