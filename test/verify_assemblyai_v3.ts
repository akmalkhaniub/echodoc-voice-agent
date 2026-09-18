import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import assert from 'assert';
import { ClinicalEngine } from '../src/clinical_engine.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';
import { isMockMode } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const apiKey = process.env.ASSEMBLYAI_API_KEY;

console.log('🧪 Starting EchoDoc & AssemblyAI 2026 Live Integration Test Suite...\n');
console.log('🔑 API Key Present:', apiKey ? `Yes (${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)})` : 'No');

// This suite makes real network calls to AssemblyAI. Without a live key it would
// fail for reasons unrelated to the code, so skip cleanly (exit 0) instead —
// keeping `npm test` deterministic in CI. Run it explicitly with `npm run test:live`.
if (isMockMode(apiKey)) {
  console.log('\n⏭️  SKIPPED: No live ASSEMBLYAI_API_KEY configured (mock mode).');
  console.log('   Set ASSEMBLYAI_API_KEY and run `npm run test:live` to exercise live endpoints.\n');
  process.exit(0);
}

const key = apiKey as string;

async function runTests(): Promise<void> {
  const clinicalEngine = new ClinicalEngine();

  console.log('\n1️⃣ Testing Realtime STT v3 Token Minting endpoint...');
  const sttRes = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', { headers: { Authorization: key } });
  const sttData: any = await sttRes.json();
  assert(sttRes.ok && sttData.token, 'Should successfully mint STT v3 token');
  console.log('   ✅ STT v3 Token minted successfully:', sttData.token.substring(0, 16) + '...');

  console.log('\n2️⃣ Testing Voice Agent API Token Minting endpoint...');
  const agentRes = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300', { headers: { Authorization: `Bearer ${key}` } });
  const agentData: any = await agentRes.json();
  assert(agentRes.ok && agentData.token, 'Should successfully mint Voice Agent token');
  console.log('   ✅ Voice Agent Token minted successfully:', agentData.token.substring(0, 16) + '...');

  console.log('\n3️⃣ Testing Live Voice Agent API WebSocket session...');
  await new Promise<void>((resolve, reject) => {
    const client = new AssemblyAIVoiceAgentClient(key, { clinicalEngine, voice: 'anna' });
    client.on('session_ready', (ev: any) => {
      console.log('   ✅ Voice Agent session.ready received! Session ID:', ev.sessionId);
      assert(ev.sessionId, 'Session ID must be defined');
      client
        .executeToolCall({ call_id: 'test_call_01', name: 'check_contraindications', arguments: { drugs: ['warfarin', 'ibuprofen'] } })
        .then(() => { client.disconnect(); resolve(); })
        .catch(reject);
    });
    client.on('error', reject);
    client.connect().catch(reject);
  });

  console.log('\n4️⃣ Testing Live Streaming STT v3 WebSocket (Universal-3.5-Pro, Medical Mode)...');
  await new Promise<void>((resolve, reject) => {
    const sttUrl = 'wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&mode=min_latency&domain=medical-v1&speaker_labels=true';
    const ws = new WebSocket(sttUrl, { headers: { Authorization: key } });
    let receivedBegin = false;
    ws.on('message', (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'Begin') {
        receivedBegin = true;
        ws.send(JSON.stringify({ type: 'Terminate' }));
      } else if (msg.type === 'Termination') {
        ws.close();
        resolve();
      }
    });
    ws.on('error', reject);
    setTimeout(() => { if (!receivedBegin) reject(new Error('Timed out waiting for Begin message from STT v3')); }, 10000);
  });

  console.log('\n5️⃣ Testing Clinical Engine SOAP & Contraindications...');
  clinicalEngine.reset();
  clinicalEngine.processUtterance('Patient reports severe headache and hypertension.', 'Clinician');
  clinicalEngine.processUtterance('Prescribed Warfarin 5mg daily.', 'Clinician');
  clinicalEngine.processUtterance('Patient took Ibuprofen yesterday.', 'Clinician');
  assert(clinicalEngine.activeSafetyAlerts.length >= 1, 'Should trigger Warfarin + Ibuprofen hazard');
  assert(clinicalEngine.soapNotes.subjective.length >= 1, 'Should record subjective note');
  console.log('   ✅ Clinical Engine & Safety Alerts confirmed!');

  console.log('\n🎉 ALL 5 LIVE ASSEMBLYAI INTEGRATION TESTS PASSED WITH 100% SUCCESS!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
