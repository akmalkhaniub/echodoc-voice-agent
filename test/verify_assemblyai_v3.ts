import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { TranscriptService } from '../src/transcript_service.js';
import { VideoContext } from '../src/video_context.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';
import { isMockMode } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const apiKey = process.env.ASSEMBLYAI_API_KEY;

console.log('🧪 Starting VoxDive × AssemblyAI Live Integration Test Suite...\n');
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
// AssemblyAI's public sample audio (used throughout their own docs).
const SAMPLE_AUDIO = 'https://assembly.ai/wildfires.mp3';

async function runTests(): Promise<void> {
  console.log('\n1️⃣ Testing Voice Agent API Token Minting endpoint...');
  const agentRes = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300', { headers: { Authorization: `Bearer ${key}` } });
  const agentData: any = await agentRes.json();
  assert(agentRes.ok && agentData.token, 'Should successfully mint Voice Agent token');
  console.log('   ✅ Voice Agent token minted:', agentData.token.substring(0, 16) + '...');

  console.log('\n2️⃣ Testing async transcription (STT + diarization + auto-chapters)...');
  const svc = new TranscriptService(key);
  const result = await svc.transcribe(SAMPLE_AUDIO, { title: 'AssemblyAI Wildfires Sample' });
  assert(result.segments.length > 0, 'Should return transcript segments');
  assert(result.chapters.length > 0, 'Should return auto-chapters');
  assert(result.summary.length > 0, 'Should return a LeMUR summary');
  console.log(`   ✅ ${result.segments.length} segments, ${result.chapters.length} chapters, summary ${result.summary.length} chars`);

  console.log('\n3️⃣ Testing LeMUR grounded Q&A...');
  const answer = await svc.ask(result.id, 'What is the main environmental concern discussed?');
  assert(typeof answer === 'string' && answer!.length > 0, 'LeMUR should return a grounded answer');
  console.log('   🤖 LeMUR:', answer!.slice(0, 120) + '…');

  console.log('\n4️⃣ Testing Live Voice Agent WebSocket session grounded in the transcript...');
  const ctx = new VideoContext();
  ctx.load(result);
  await new Promise<void>((resolve, reject) => {
    const client = new AssemblyAIVoiceAgentClient(key, { videoContext: ctx, voice: 'anna' });
    client.on('session_ready', (ev: any) => {
      console.log('   ✅ Voice Agent session.ready received! Session ID:', ev.sessionId);
      assert(ev.sessionId, 'Session ID must be defined');
      client.on('tool_executed', (res: any) => {
        assert(res.name === 'search_transcript', 'Tool call should be search_transcript');
        client.disconnect();
        resolve();
      });
      client
        .executeToolCall({ call_id: 'test_call_01', name: 'search_transcript', arguments: { query: 'wildfires' } })
        .catch(reject);
    });
    client.on('error', reject);
    client.connect().catch(reject);
  });

  console.log('\n🎉 ALL 4 LIVE ASSEMBLYAI INTEGRATION TESTS PASSED WITH 100% SUCCESS!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
