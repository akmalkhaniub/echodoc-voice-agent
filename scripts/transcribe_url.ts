/**
 * Transcribe a public media URL via AssemblyAI and append the result to a JSON
 * fixture (used to build a demo "feed" for VoxDive Briefings).
 *   npx tsx scripts/transcribe_url.ts <url> <id> <title> <outJsonPath>
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
if (!KEY) { console.error('no key'); process.exit(1); }
const API = 'https://api.assemblyai.com';
const ms2s = (ms: number | undefined) => Math.round(((ms || 0) / 1000) * 10) / 10;

const [url, id, title, outPath] = process.argv.slice(2);
if (!url || !id || !title || !outPath) { console.error('args: <url> <id> <title> <outJsonPath>'); process.exit(1); }

console.log(`Submitting ${title}…`);
const sub = await fetch(`${API}/v2/transcript`, {
  method: 'POST', headers: { Authorization: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ audio_url: url, speaker_labels: true, auto_chapters: true, entity_detection: true })
});
const subData: any = await sub.json();
if (!sub.ok || !subData.id) { console.error('submit failed', subData); process.exit(1); }
let data: any = subData;
process.stdout.write('Polling');
while (data.status !== 'completed') {
  if (data.status === 'error') { console.error('\n', data.error); process.exit(1); }
  await new Promise((r) => setTimeout(r, 4000)); process.stdout.write('.');
  data = await (await fetch(`${API}/v2/transcript/${data.id}`, { headers: { Authorization: KEY } })).json();
}
console.log(' done.');

const segments: TranscriptSegment[] = (data.utterances || []).map((u: any) => ({ start: ms2s(u.start), end: ms2s(u.end), speaker: u.speaker ? `Speaker ${u.speaker}` : 'Speaker', text: String(u.text || '').trim() }));
const chapters: Chapter[] = (data.chapters || []).map((c: any) => ({ start: ms2s(c.start), end: ms2s(c.end), headline: String(c.headline || c.gist || 'Chapter').trim(), summary: String(c.summary || '').trim() }));
const speakers = Array.from(new Set(segments.map((s) => s.speaker)));
const entities = Array.from(new Set((data.entities || []).map((e: any) => String(e.text || '').trim()).filter(Boolean))).slice(0, 15) as string[];

let summary = '';
try {
  const lem = await fetch(`${API}/lemur/v3/generate/task`, { method: 'POST', headers: { Authorization: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript_ids: [data.id], prompt: 'Summarize this recording in two sentences. Be specific; do not add anything not in the transcript.' }) });
  const ld: any = await lem.json(); summary = ld.response ? String(ld.response).trim() : chapters.map((c) => c.summary).join(' ');
} catch { summary = chapters.map((c) => c.summary).join(' '); }

const result: TranscriptResult = { id, title, sourceUrl: url, durationSec: Math.round(Number(data.audio_duration) || (segments.at(-1)?.end ?? 0)), segments, chapters, summary, speakers, entities, isMock: false };
const abs = path.resolve(__dirname, '..', outPath);
const arr: TranscriptResult[] = fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf-8')) : [];
arr.push(result);
fs.writeFileSync(abs, JSON.stringify(arr, null, 2));
console.log(`Appended to ${abs} — ${segments.length} segs, ${speakers.length} speakers, ${chapters.length} chapters, ${result.durationSec}s`);
console.log(`Summary: ${summary.slice(0, 140)}`);
