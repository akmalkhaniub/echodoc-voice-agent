// Force simulator mode BEFORE importing the server so no live calls are made.
process.env.MOCK_STREAMING = 'true';

import assert from 'assert';
import WebSocket from 'ws';
import type { AddressInfo } from 'net';
import { server } from '../src/server.js';

console.log('🧪 EchoDoc server WebSocket integration suite (offline/mock)...\n');

let passed = 0;
function ok(label: string, cond: boolean): void {
  assert(cond, label);
  passed++;
  console.log(`   ✅ ${label}`);
}

function waitFor(ws: WebSocket, type: string, timeoutMs = 3000): Promise<any> {
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
  const metrics = await get(base, '/api/metrics');
  ok('/api/metrics exposes SLO targets', metrics.body.slo.turnaroundP95TargetMs === 1200 && metrics.body.slo.bargeInP95TargetMs === 200);

  // 2. WS: HELLO announces mock/live mode, then export returns a SOAP note.
  console.log('\n2️⃣ WebSocket hello + export flow...');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const helloP = waitFor(ws, 'HELLO');
  await new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
  const hello = await helloP;
  ok('HELLO announces mock mode in the test env', hello.mockMode === true);
  ok('HELLO includes SLO targets', hello.slo?.turnaroundP95TargetMs === 1200);
  ws.send(JSON.stringify({ action: 'EXPORT_NOTE', patientName: 'Jane Doe' }));
  const exp = await waitFor(ws, 'EXPORT_DATA');
  ok('EXPORT_DATA returns markdown', typeof exp.markdown === 'string');
  ok('note has SOAP headers', exp.markdown.includes('S — Subjective') && exp.markdown.includes('P — Plan'));
  ok('note carries patient name', exp.markdown.includes('Jane Doe'));

  // 3. WS: voice-agent mock handshake reaches VOICE_AGENT_READY.
  console.log('\n3️⃣ Voice-agent handshake (mock)...');
  ws.send(JSON.stringify({ action: 'START_VOICE_AGENT', voice: 'anna' }));
  const ready = await waitFor(ws, 'VOICE_AGENT_READY');
  ok('VOICE_AGENT_READY has a session id', typeof ready.sessionId === 'string' && ready.sessionId.length > 0);

  // 4. WS: copilot Q&A answers over the socket.
  console.log('\n4️⃣ Copilot Q&A...');
  ws.send(JSON.stringify({ action: 'ASK_COPILOT', query: 'any contraindications?' }));
  const ans = await waitFor(ws, 'COPILOT_ANSWER');
  ok('COPILOT_ANSWER returns a string answer', typeof ans.answer === 'string' && ans.answer.length > 0);

  ws.close();
  console.log(`\n🎉 ALL ${passed} ECHODOC SERVER WS ASSERTIONS PASSED.\n`);
} finally {
  await new Promise<void>((res) => server.close(() => res()));
}
