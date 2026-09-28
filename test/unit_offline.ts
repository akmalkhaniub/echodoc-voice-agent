import assert from 'assert';
import path from 'path';
import { resolveSafePath, isMockMode } from '../src/util.js';
import { VideoContext, formatTimestamp } from '../src/video_context.js';
import { TranscriptService } from '../src/transcript_service.js';
import { AssemblyAIVoiceAgentClient } from '../src/voice_agent_client.js';
import { SAMPLE_TRANSCRIPT } from '../src/sample_content.js';

// Deterministic, offline-only suite — no network, no API key required.
console.log('🧪 Starting VoxDive Offline Unit Suite (no network)...\n');

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

// 2. Mock-mode detection
console.log('\n2️⃣ isMockMode detection...');
const priorMockEnv = process.env.MOCK_STREAMING;
delete process.env.MOCK_STREAMING;
ok('true when key missing', isMockMode(undefined) === true);
ok('true for placeholder key', isMockMode('your_assemblyai_api_key_here') === true);
ok('false for a real-looking key', isMockMode('abc123realkey') === false);
if (priorMockEnv !== undefined) process.env.MOCK_STREAMING = priorMockEnv;

// 3. TranscriptService serves the bundled sample offline
console.log('\n3️⃣ TranscriptService mock mode...');
const svc = new TranscriptService(undefined);
ok('service reports mock mode without a key', svc.isMock === true);
const result = await svc.transcribe('https://example.com/talk.mp3', { title: 'My Talk' });
ok('mock transcribe returns diarized segments', result.segments.length === SAMPLE_TRANSCRIPT.segments.length);
ok('mock transcribe reflects requested title', result.title === 'My Talk');
ok('mock transcribe reflects requested source url', result.sourceUrl === 'https://example.com/talk.mp3');
ok('mock transcribe stays honestly flagged isMock', result.isMock === true);
ok('mock ask() returns null so caller falls back', (await svc.ask('sample-ocean-cleanup', 'anything')) === null);

// 4. VideoContext retrieval + grounding
console.log('\n4️⃣ VideoContext grounded retrieval...');
const ctx = new VideoContext();
ok('answers gracefully with no transcript', ctx.answerQuery('anything').citations.length === 0 && ctx.answerQuery('x').answer.includes('No video'));
ok('empty getters are safe', ctx.title === 'Untitled media' && ctx.segments.length === 0 && ctx.chapters.length === 0 && ctx.speakers.length === 0 && ctx.summary === '');
ok('empty search + jumpToTopic return nothing', ctx.search('river').length === 0 && ctx.jumpToTopic('river') === null);
ctx.load({ ...SAMPLE_TRANSCRIPT });
ok('chapters query lists chapters', /chapters/i.test(ctx.answerQuery('what are the chapters?').answer));
ok('speakers query counts speakers', ctx.answerQuery('who are the speakers?').answer.includes('2 speaker'));
ok('empty query returns no search hits', ctx.search('   ').length === 0);
ok('jumpToTopic returns null on empty topic', ctx.jumpToTopic('') === null);
ok('jumpToTopic returns null when nothing matches', ctx.jumpToTopic('cryptocurrency taxation') === null);
ok('hasTranscript after load', ctx.hasTranscript === true);
ok('search finds river interceptor passages', ctx.search('how do river interceptors work').length > 0);
const riverAns = ctx.answerQuery('how do river interceptors work');
ok('grounded answer cites a timestamp + speaker', /\d+:\d\d/.test(riverAns.answer) && riverAns.citations.length > 0);
ok('summary query returns the summary', ctx.answerQuery('what is this about').answer === SAMPLE_TRANSCRIPT.summary);
ok('off-topic query is honestly declined', ctx.answerQuery('quarterly tax filing deadlines zzz').citations.length === 0);
ok('jumpToTopic locates the drones chapter', /drone/i.test(ctx.jumpToTopic('autonomous drones')?.headline || ''));
ok('exportMarkdown includes transcript + chapters', ctx.exportMarkdown().includes('## Transcript') && ctx.exportMarkdown().includes('## Chapters'));
ok('formatTimestamp renders mm:ss', formatTimestamp(92) === '1:32');

// 5. Voice agent mock + grounded tool execution
console.log('\n5️⃣ AssemblyAIVoiceAgentClient mock mode + grounded tools...');
await new Promise<void>((resolve, reject) => {
  const agentCtx = new VideoContext();
  agentCtx.load({ ...SAMPLE_TRANSCRIPT });
  const client = new AssemblyAIVoiceAgentClient(undefined, { videoContext: agentCtx, isMock: true, voice: 'anna' });
  const t = setTimeout(() => reject(new Error('session_ready never emitted')), 1000);
  client.on('session_ready', async (ev: any) => {
    clearTimeout(t);
    ok('emits session_ready with id', typeof ev.sessionId === 'string');
    const seen: Record<string, any> = {};
    client.on('tool_executed', (res: any) => { seen[res.name] = res.result; });
    await client.executeToolCall({ call_id: 't1', name: 'search_transcript', arguments: { query: 'river interceptors' } });
    ok('search_transcript returns grounded passages', seen['search_transcript']?.grounded === true && seen['search_transcript'].passages.length > 0);
    await client.executeToolCall({ call_id: 't2', name: 'get_summary', arguments: {} });
    ok('get_summary returns the summary + chapters', seen['get_summary']?.chapters.length === SAMPLE_TRANSCRIPT.chapters.length);
    await client.executeToolCall({ call_id: 't3', name: 'jump_to_topic', arguments: { topic: 'offshore gyre' } });
    ok('jump_to_topic returns a timestamp', typeof seen['jump_to_topic']?.timestamp === 'string');
    client.disconnect();
    resolve();
  });
  client.on('error', reject);
  void client.connect();
});

// 6. Tool with no transcript loaded is honestly ungrounded
console.log('\n6️⃣ Tools refuse to invent without a transcript...');
const emptyClient = new AssemblyAIVoiceAgentClient(undefined, { videoContext: new VideoContext(), isMock: true });
await new Promise<void>((resolve) => {
  emptyClient.on('tool_executed', (res: any) => {
    ok('search_transcript reports not grounded without a transcript', res.result.grounded === false);
    resolve();
  });
  void emptyClient.executeToolCall({ call_id: 't4', name: 'search_transcript', arguments: { query: 'anything' } });
});

console.log(`\n🎉 ALL ${passed} VOXDIVE OFFLINE UNIT ASSERTIONS PASSED.\n`);
