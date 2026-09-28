/**
 * Captures the AssemblyAI Voice Agent's spoken reply to a question as a WAV file,
 * grounded in the bundled sample transcript. Real agent voice, pulled straight
 * from the Voice Agent WebSocket (no mic, no loopback) — for assembling a demo.
 *
 * Usage:
 *   npm run capture:reply -- "your question" out.wav
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { VideoContext } from '../src/video_context.js';
import { SAMPLE_TRANSCRIPT } from '../src/sample_content.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';
import { isMockMode } from '../src/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const question = process.argv[2] || 'What do the autonomous drones actually do?';
const outWav = path.resolve(process.argv[3] || path.join(__dirname, '../docs/demo/narration/agent_reply.wav'));

const key = process.env.ASSEMBLYAI_API_KEY;
if (isMockMode(key)) { console.log('SKIP: no live ASSEMBLYAI_API_KEY'); process.exit(0); }

// Synthesize the question to a WAV, then send it to the agent as PCM.
const qWav = path.join(__dirname, `_q_${Date.now()}.wav`);
execFileSync('powershell', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
  `$s.SetOutputToWaveFile('${qWav.replace(/\\/g, '\\\\')}'); $s.Speak('${question.replace(/'/g, "''")}'); $s.Dispose()`
], { stdio: 'inherit' });

const wav = fs.readFileSync(qWav);
const sampleRate = wav.readUInt32LE(24);
let dataOffset = 12;
while (dataOffset < wav.length - 8) {
  const id = wav.toString('ascii', dataOffset, dataOffset + 4);
  const size = wav.readUInt32LE(dataOffset + 4);
  if (id === 'data') { dataOffset += 8; break; }
  dataOffset += 8 + size;
}
const pcm = wav.subarray(dataOffset);

function to16kMono(pcm16: Buffer, fromRate: number): Buffer {
  if (fromRate === 16000) return pcm16;
  const src = new Int16Array(pcm16.buffer, pcm16.byteOffset, Math.floor(pcm16.length / 2));
  const dstLen = Math.floor(src.length * 16000 / fromRate);
  const dst = new Int16Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const pos = i * fromRate / 16000;
    const i0 = Math.floor(pos);
    const i1 = Math.min(src.length - 1, i0 + 1);
    dst[i] = Math.round(src[i0] * (1 - (pos - i0)) + src[i1] * (pos - i0));
  }
  return Buffer.from(dst.buffer);
}
const pcm16 = to16kMono(pcm, sampleRate);

function writeWav(dest: string, audio: Buffer, rate: number): void {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + audio.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(audio.length, 40);
  fs.writeFileSync(dest, Buffer.concat([header, audio]));
}

const videoContext = new VideoContext();
videoContext.load({ ...SAMPLE_TRANSCRIPT });
const client = new AssemblyAIVoiceAgentClient(key, { videoContext, voice: 'anna', autoReconnect: false });

const chunks: Buffer[] = [];
let transcript = '';
let idleTimer: NodeJS.Timeout | null = null;
let questionSent = false;   // ignore the greeting; only keep audio after the question

await new Promise<void>((resolve, reject) => {
  const hardStop = setTimeout(() => finalize(), 40000);
  function finalize() {
    clearTimeout(hardStop);
    if (idleTimer) clearTimeout(idleTimer);
    try { client.disconnect(); } catch { /* ignore */ }
    resolve();
  }
  client.on('session_ready', () => {
    // Give the greeting a moment to play out, then send the question.
    setTimeout(() => {
      const frame = 3200; let offset = 0;
      const pump = setInterval(() => {
        if (offset >= pcm16.length) {
          clearInterval(pump);
          questionSent = true;           // from here on, captured audio is the ANSWER
          return;
        }
        client.sendAudio(pcm16.subarray(offset, offset + frame));
        offset += frame;
      }, 100);
    }, 2500);
  });
  client.on('agent_transcript', (ev: { text?: string }) => { if (questionSent && ev.text) transcript += ev.text; });
  client.on('agent_reply_audio', (ev: { data?: string }) => {
    if (!questionSent) return;            // discard the greeting audio
    if (ev.data) chunks.push(Buffer.from(ev.data, 'base64'));
    // Cap the clip: 24kHz mono 16-bit → 2 bytes/sample. Stop after ~14s of answer.
    const secs = chunks.reduce((n, c) => n + c.length, 0) / 2 / 24000;
    if (secs >= 14) { finalize(); return; }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(finalize, 1800);   // finalize 1.8s after the answer stops
  });
  client.on('error', (err: Error) => { clearTimeout(hardStop); reject(err); });
  client.connect().catch(reject);
});

try { fs.unlinkSync(qWav); } catch { /* ignore */ }

if (chunks.length === 0) { console.log('NO_AUDIO: agent produced no audio'); process.exit(2); }
const audio = Buffer.concat(chunks);
fs.mkdirSync(path.dirname(outWav), { recursive: true });
writeWav(outWav, audio, 24000);
const seconds = (audio.length / 2 / 24000).toFixed(1);
console.log(`OK wrote ${outWav} (${seconds}s, ${audio.length} bytes)`);
console.log(`AGENT_SAID: ${transcript.trim() || '(no transcript captured)'}`);
process.exit(0);
