// Force simulator mode BEFORE importing the server so no live calls are made.
process.env.MOCK_STREAMING = 'true';

import assert from 'assert';
import WebSocket from 'ws';
import type { AddressInfo } from 'net';
import { server } from '../src/server.js';

console.log('🧪 VoxDive server WebSocket integration suite (offline/mock)...\n');

let passed = 0;
function ok(label: string, cond: boolean): void {
  assert(cond, label);
  passed++;
  console.log(`   ✅ ${label}`);
}

function waitFor(ws: WebSocket, type: string, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const onMsg = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg);
      }
    };
    ws.on('message', onMsg);
  });
}

const get = (base: string, p: string) => fetch(base + p).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

await new Promise<void>((resolve) => server.listen(0, resolve));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

try {
  // 1. HTTP: health + metrics expose latency summaries with SLO targets.
  console.log('1️⃣ HTTP health & metrics...');
  const health = await get(base, '/api/health');
  ok('/api/health 200 with latency block', health.status === 200 && !!health.body.latency);
  ok('/api/health identifies VoxDive', health.body.service === 'VoxDive');
  const metrics = await get(base, '/api/metrics');
  ok('/api/metrics exposes SLO targets', metrics.body.slo.turnaroundP95TargetMs === 1200 && metrics.body.slo.bargeInP95TargetMs === 200);

  // 2. WS: HELLO announces mock/live mode + sample title.
  console.log('\n2️⃣ WebSocket hello...');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const helloP = waitFor(ws, 'HELLO');
  await new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
  const hello = await helloP;
  ok('HELLO announces mock mode in the test env', hello.mockMode === true);
  ok('HELLO includes SLO targets', hello.slo?.turnaroundP95TargetMs === 1200);
  ok('HELLO advertises the bundled sample title', typeof hello.sampleTitle === 'string' && hello.sampleTitle.length > 0);

  // 3. WS: ingest (mock → bundled sample) yields a diarized, chaptered transcript.
  // Pre-register the TRANSCRIPT_READY waiter: in mock mode it is emitted in the
  // same tick right after TRANSCRIBING, so awaiting them sequentially would race.
  console.log('\n3️⃣ Ingest + transcript ready...');
  const readyP = waitFor(ws, 'TRANSCRIPT_READY');
  ws.send(JSON.stringify({ action: 'INGEST_VIDEO', url: 'https://example.com/podcast.mp3', title: 'Some Podcast' }));
  const ready = await readyP;
  ok('TRANSCRIPT_READY carries diarized segments', Array.isArray(ready.segments) && ready.segments.length > 0);
  ok('TRANSCRIPT_READY carries auto-chapters', Array.isArray(ready.chapters) && ready.chapters.length > 0);
  ok('TRANSCRIPT_READY carries a summary', typeof ready.summary === 'string' && ready.summary.length > 20);
  ok('TRANSCRIPT_READY is honestly flagged isMock', ready.isMock === true);

  // 4. WS: grounded copilot Q&A over the loaded transcript.
  console.log('\n4️⃣ Grounded copilot Q&A...');
  ws.send(JSON.stringify({ action: 'ASK_COPILOT', query: 'how do river interceptors work?' }));
  const ans = await waitFor(ws, 'COPILOT_ANSWER');
  ok('COPILOT_ANSWER returns a grounded answer', typeof ans.answer === 'string' && ans.answer.length > 0);
  ok('COPILOT_ANSWER cites transcript passages', Array.isArray(ans.citations) && ans.citations.length > 0);
  ok('COPILOT_ANSWER reports the engine used', ans.engine === 'local-retrieval');

  // 5. WS: voice-agent mock handshake reaches VOICE_AGENT_READY.
  console.log('\n5️⃣ Voice-agent handshake (mock)...');
  ws.send(JSON.stringify({ action: 'START_VOICE_AGENT', voice: 'anna' }));
  const agentReady = await waitFor(ws, 'VOICE_AGENT_READY');
  ok('VOICE_AGENT_READY has a session id', typeof agentReady.sessionId === 'string' && agentReady.sessionId.length > 0);
  ok('VOICE_AGENT_READY names the loaded media', typeof agentReady.title === 'string' && agentReady.title.length > 0);

  // 6. WS: export returns portable Markdown of the transcript.
  console.log('\n6️⃣ Export...');
  ws.send(JSON.stringify({ action: 'EXPORT_NOTE' }));
  const exp = await waitFor(ws, 'EXPORT_DATA');
  ok('EXPORT_DATA returns markdown', typeof exp.markdown === 'string');
  ok('export has a Transcript section', exp.markdown.includes('## Transcript'));

  ws.close();
  console.log(`\n🎉 ALL ${passed} VOXDIVE SERVER WS ASSERTIONS PASSED.\n`);
} finally {
  await new Promise<void>((res) => server.close(() => res()));
}
