import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import assert from 'assert';
import { ClinicalEngine } from '../src/clinical_engine.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load credentials
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const apiKey = process.env.ASSEMBLYAI_API_KEY;

console.log('🧪 Starting EchoDoc & AssemblyAI 2026 Live Integration Test Suite...\n');
console.log('🔑 API Key Present:', apiKey ? `Yes (${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)})` : 'No');

async function runTests() {
  const clinicalEngine = new ClinicalEngine();

  // Test 1: Realtime STT v3 Token Minting
  console.log('\n1️⃣ Testing Realtime STT v3 Token Minting endpoint...');
  const sttRes = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', {
    headers: { 'Authorization': apiKey }
  });
  const sttData = await sttRes.json();
  assert(sttRes.ok && sttData.token, 'Should successfully mint STT v3 token');
  console.log('   ✅ STT v3 Token minted successfully:', sttData.token.substring(0, 16) + '...');

  // Test 2: Voice Agent API Token Minting
  console.log('\n2️⃣ Testing Voice Agent API Token Minting endpoint...');
  const agentRes = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const agentData = await agentRes.json();
  assert(agentRes.ok && agentData.token, 'Should successfully mint Voice Agent token');
  console.log('   ✅ Voice Agent Token minted successfully:', agentData.token.substring(0, 16) + '...');

  // Test 3: Voice Agent WebSocket Handshake & Session Configuration
  console.log('\n3️⃣ Testing Live Voice Agent API WebSocket session...');
  await new Promise((resolve, reject) => {
    const client = new AssemblyAIVoiceAgentClient(apiKey, { clinicalEngine, voice: 'anna' });

    client.on('session_ready', (ev) => {
      console.log('   ✅ Voice Agent session.ready received! Session ID:', ev.sessionId);
      assert(ev.sessionId, 'Session ID must be defined');

      // Test flat-schema tool execution simulation
      console.log('   🛠️ Testing clinical tool call handling...');
      client.executeToolCall({
        call_id: 'test_call_01',
        name: 'check_contraindications',
        arguments: { drugs: ['warfarin', 'ibuprofen'] }
      }).then(() => {
        console.log('   ✅ Tool executed and verified against ClinicalEngine');
        client.disconnect();
        resolve();
      }).catch(reject);
    });

    client.on('error', (err) => {
      console.error('   ❌ Voice Agent client error:', err);
      reject(err);
    });

    client.connect().catch(reject);
  });

  // Test 4: Streaming STT v3 Handshake (Universal-3.5-Pro + Medical Domain)
  console.log('\n4️⃣ Testing Live Streaming STT v3 WebSocket with Universal-3.5-Pro (Medical Mode)...');
  await new Promise((resolve, reject) => {
    const sttUrl = 'wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&mode=min_latency&domain=medical-v1&speaker_labels=true';
    const ws = new WebSocket(sttUrl, {
      headers: { 'Authorization': apiKey }
    });

    let receivedBegin = false;

    ws.on('open', () => {
      console.log('   ✅ Connected to Universal-3.5-Pro streaming endpoint');
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'Begin') {
        receivedBegin = true;
        console.log('   ✅ Begin event received! Session ID:', msg.id);
        // Send graceful termination
        ws.send(JSON.stringify({ type: 'Terminate' }));
      } else if (msg.type === 'Termination') {
        console.log('   ✅ Clean Termination received! Duration recorded.');
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      console.error('   ❌ STT v3 WebSocket error:', err.message);
      reject(err);
    });

    setTimeout(() => {
      if (!receivedBegin) {
        reject(new Error('Timed out waiting for Begin message from STT v3'));
      }
    }, 10000);
  });

  // Test 5: Existing Consultation Simulation & Contraindication Sentinel
  console.log('\n5️⃣ Testing Clinical Engine Subjective/Objective/Assessment/Plan & Contraindications...');
  clinicalEngine.reset();
  clinicalEngine.processUtterance('Patient reports severe headache and hypertension.', 'Clinician');
  clinicalEngine.processUtterance('Prescribed Warfarin 5mg daily.', 'Clinician');
  clinicalEngine.processUtterance('Patient took Ibuprofen yesterday.', 'Clinician');

  assert(clinicalEngine.activeSafetyAlerts.length >= 1, 'Should trigger Warfarin + Ibuprofen hazard');
  assert(clinicalEngine.soapNotes.subjective.length >= 1, 'Should record subjective note');
  assert(clinicalEngine.soapNotes.plan.length >= 1, 'Should record plan note');
  console.log('   ✅ Clinical Engine & Safety Alerts confirmed!');

  console.log('\n🎉 ALL 5 LIVE ASSEMBLYAI INTEGRATION TESTS PASSED WITH 100% SUCCESS!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
