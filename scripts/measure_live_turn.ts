/**
 * One spoken turn against the live AssemblyAI Voice Agent.
 * Writes docs/LIVE_METRICS.json only when first agent audio is observed.
 * Exits 0 on skip (no key) and 2 when the session connects but no audio arrives.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { ClinicalEngine } from '../src/clinical_engine.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';
import { LatencyTracker, TurnClock } from '../src/metrics.js';
import { isMockMode } from '../src/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const key = process.env.ASSEMBLYAI_API_KEY;
if (isMockMode(key)) {
  console.log('SKIP: no live ASSEMBLYAI_API_KEY');
  process.exit(0);
}

const wavPath = path.join(__dirname, 'live_prompt.wav');
const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile('${wavPath.replace(/\\/g, '\\\\')}')
$s.Speak('Doctor, the patient takes warfarin and also took ibuprofen. Is that safe?')
$s.Dispose()
`;
execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });

const wav = fs.readFileSync(wavPath);
if (wav.toString('ascii', 0, 4) !== 'RIFF') throw new Error('speech synth did not write a wav');
const channels = wav.readUInt16LE(22);
const sampleRate = wav.readUInt32LE(24);
const bits = wav.readUInt16LE(34);
let dataOffset = 12;
while (dataOffset < wav.length - 8) {
  const id = wav.toString('ascii', dataOffset, dataOffset + 4);
  const size = wav.readUInt32LE(dataOffset + 4);
  if (id === 'data') { dataOffset += 8; break; }
  dataOffset += 8 + size;
}
const pcm = wav.subarray(dataOffset);
if (bits !== 16 || channels !== 1) {
  console.log(`WAV is ${sampleRate}Hz ${bits}-bit ${channels}ch — sending raw PCM anyway`);
}

function to16kMono(pcm16: Buffer, fromRate: number): Buffer {
  if (fromRate === 16000) return pcm16;
  const src = new Int16Array(pcm16.buffer, pcm16.byteOffset, Math.floor(pcm16.length / 2));
  const dstLen = Math.floor(src.length * 16000 / fromRate);
  const dst = new Int16Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const pos = i * fromRate / 16000;
    const i0 = Math.floor(pos);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const frac = pos - i0;
    dst[i] = Math.round(src[i0] * (1 - frac) + src[i1] * frac);
  }
  return Buffer.from(dst.buffer);
}

const pcm16 = to16kMono(pcm, sampleRate);

const engine = new ClinicalEngine();
const client = new AssemblyAIVoiceAgentClient(key, { clinicalEngine: engine, voice: 'anna', autoReconnect: false });
const clock = new TurnClock();
const turnaround = new LatencyTracker();
const barge = new LatencyTracker();

const audio = await new Promise<number | null>((resolve, reject) => {
  const timer = setTimeout(() => resolve(null), 25000);
  client.on('session_ready', () => {
    const frame = 3200; // 100ms at 16kHz mono s16le
    let offset = 0;
    const pump = setInterval(() => {
      if (offset >= pcm16.length) {
        clearInterval(pump);
        clock.markUserStop();
        return;
      }
      client.sendAudio(pcm16.subarray(offset, offset + frame));
      offset += frame;
    }, 100);
  });
  client.on('agent_reply_started', () => clock.markReplyStart());
  client.on('agent_transcript', (ev: { text?: string }) => {
    console.log('agent_transcript', ev.text);
  });
  client.on('agent_reply_audio', () => {
    const ms = clock.markFirstAudio();
    if (ms != null) {
      turnaround.add(ms);
      clearTimeout(timer);
      client.disconnect();
      resolve(ms);
    }
  });
  client.on('error', (err: Error) => {
    clearTimeout(timer);
    reject(err);
  });
  client.connect().catch(reject);
});

const out = {
  measuredAt: new Date().toISOString(),
  sampleRate: 16000,
  sourceSampleRate: sampleRate,
  spokenTurnaroundMs: audio,
  turnaroundMs: turnaround.summary(),
  bargeInMs: barge.summary(),
  slo: { turnaroundP95TargetMs: 1200, bargeInP95TargetMs: 200 },
  note: audio == null
    ? 'Session path ran; no agent audio arrived, so p95 is not claimed.'
    : 'Single spoken turn. p95 equals this sample until more turns are recorded.'
};
const dest = path.join(__dirname, '../docs/LIVE_METRICS.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
try { fs.unlinkSync(wavPath); } catch { /* ignore */ }
process.exit(audio == null ? 2 : 0);
