import assert from 'assert';
import path from 'path';
import { resolveSafePath, isMockMode } from '../src/util.js';
import { ClinicalEngine } from '../src/clinical_engine.js';
import { AssemblyAIStreamingClient } from '../src/assemblyai_client.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';

// Deterministic, offline-only suite — no network, no API key required.
console.log('🧪 Starting EchoDoc Offline Unit Suite (no network)...\n');

let passed = 0;
function ok(label: string, cond: boolean): void {
  assert(cond, label);
  passed++;
  console.log(`   ✅ ${label}`);
}

// 1. Path-traversal guard
console.log('1️⃣ resolveSafePath rejects directory traversal...');
const PUB = path.resolve('/srv/app/public');
ok('serves index.html for "/"', resolveSafePath(PUB, '/') === path.join(PUB, 'index.html'));
ok('serves a normal asset', resolveSafePath(PUB, '/app.js') === path.join(PUB, 'app.js'));
ok('strips query strings', resolveSafePath(PUB, '/app.js?v=2') === path.join(PUB, 'app.js'));
ok('blocks ../ escape', resolveSafePath(PUB, '/../server.js') === null);
ok('blocks encoded ..%2f escape', resolveSafePath(PUB, '/..%2f..%2f.env') === null);
ok('blocks malformed encoding', resolveSafePath(PUB, '/%E0%A4%A') === null);

// 2. Mock-mode detection (isolate from a MOCK_STREAMING override in the environment)
console.log('\n2️⃣ isMockMode detection...');
const priorMockEnv = process.env.MOCK_STREAMING;
delete process.env.MOCK_STREAMING;
ok('true when key missing', isMockMode(undefined) === true);
ok('true for placeholder key', isMockMode('your_assemblyai_api_key_here') === true);
ok('false for a real-looking key', isMockMode('abc123realkey') === false);
if (priorMockEnv !== undefined) process.env.MOCK_STREAMING = priorMockEnv;

// 3. Streaming client mock connect emits open
console.log('\n3️⃣ AssemblyAIStreamingClient mock mode...');
await new Promise<void>((resolve, reject) => {
  const client = new AssemblyAIStreamingClient(undefined, { isMock: true });
  const t = setTimeout(() => reject(new Error('mock open never emitted')), 1000);
  client.on('open', (ev: any) => {
    clearTimeout(t);
    ok('emits open with mock session id', typeof ev.sessionId === 'string' && ev.isMock === true);
    client.sendAudio(Buffer.from([0, 1, 2]));
    ok('sendAudio is a safe no-op in mock mode', true);
    client.disconnect();
    resolve();
  });
  void client.connect();
});

// 4. Voice agent client mock connect + tool execution against ClinicalEngine
console.log('\n4️⃣ AssemblyAIVoiceAgentClient mock mode + tool call...');
await new Promise<void>((resolve, reject) => {
  const engine = new ClinicalEngine();
  const client = new AssemblyAIVoiceAgentClient(undefined, { clinicalEngine: engine, isMock: true, voice: 'anna' });
  const t = setTimeout(() => reject(new Error('session_ready never emitted')), 1000);
  client.on('session_ready', async (ev: any) => {
    clearTimeout(t);
    ok('emits session_ready with id', typeof ev.sessionId === 'string');
    client.on('tool_executed', (res: any) => {
      ok('check_contraindications flags Warfarin + Ibuprofen', res.result.hasHazard === true);
      client.disconnect();
      resolve();
    });
    await client.executeToolCall({ call_id: 'unit_1', name: 'check_contraindications', arguments: { drugs: ['warfarin', 'ibuprofen'] } });
  });
  client.on('error', reject);
  void client.connect();
});

// 5. Clinical engine edge cases
console.log('\n5️⃣ ClinicalEngine edge cases...');
const engine = new ClinicalEngine();
ok('ignores empty utterance', engine.processUtterance('') === null);
ok('ignores non-string utterance', engine.processUtterance(null) === null);
engine.processUtterance('Patient reports severe headache.', 'Patient');
engine.processUtterance('Patient reports severe headache.', 'Patient');
ok('de-duplicates identical subjective lines', engine.soapNotes.subjective.length === 1);
engine.processUtterance('Started on Warfarin 5mg.', 'Doctor');
ok('single drug produces no alert', engine.activeSafetyAlerts.length === 0);
engine.processUtterance('Also took Ibuprofen 800mg.', 'Patient');
engine.processUtterance('Also took Ibuprofen 800mg.', 'Patient');
ok('contraindication alert fires exactly once', engine.activeSafetyAlerts.length === 1);
ok('checkDrugs matches sildenafil + nitroglycerin', engine.checkDrugs(['sildenafil', 'nitroglycerin']).length === 1);
ok('exportMarkdown includes SOAP headers', engine.exportMarkdown().includes('S — Subjective'));
const vitalsOnly = new ClinicalEngine();
vitalsOnly.processUtterance('Let us take your vital signs. Your blood pressure is 158/96 mmHg and heart rate is 88 bpm.', 'Doctor');
ok('vitals land in Objective', vitalsOnly.soapNotes.objective.length === 1);
ok('vitals do not leak into Plan', vitalsOnly.soapNotes.plan.length === 0);

console.log(`\n🎉 ALL ${passed} ECHODOC OFFLINE UNIT ASSERTIONS PASSED.\n`);
