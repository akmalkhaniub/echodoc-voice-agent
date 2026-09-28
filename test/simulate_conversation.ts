import assert from 'assert';
import { TranscriptService } from '../src/transcript_service.js';
import { VideoContext, formatTimestamp } from '../src/video_context.js';

console.log('🧪 Starting VoxDive Automated Verification Test Suite...\n');

// End-to-end offline flow: transcribe (mock) → load → talk to it.
const svc = new TranscriptService(undefined);
const ctx = new VideoContext();

// 1. Async transcription (mock → bundled sample).
console.log('1️⃣ Testing transcription → diarized, chaptered result...');
const result = await svc.transcribe('https://youtu.be/example', { title: 'Deep Currents Ep. 12' });
ctx.load(result);
assert(result.segments.length > 5, 'Should return multiple diarized segments');
assert(result.speakers.length === 2, 'Should detect two speakers');
assert(result.chapters.length >= 3, 'Should generate auto-chapters');
console.log(`   ✅ ${result.segments.length} segments, ${result.speakers.length} speakers, ${result.chapters.length} chapters`);

// 2. Summary present.
console.log('2️⃣ Testing summary...');
assert(result.summary.length > 40, 'Should carry a paragraph summary');
console.log('   ✅ Summary:', result.summary.slice(0, 80) + '…');

// 3. Grounded retrieval returns a real passage with a timestamp.
console.log('3️⃣ Testing grounded retrieval...');
const ans = ctx.answerQuery('how do river interceptors work?');
assert(ans.citations.length > 0, 'Should cite at least one passage');
assert(/\d+:\d\d/.test(ans.answer), 'Answer should include a timestamp');
assert(/interceptor|barge|conveyor|river/i.test(ans.answer), 'Answer should be about interceptors');
console.log('   🤖 A:', ans.answer.slice(0, 120) + '…');

// 4. Chapter navigation.
console.log('4️⃣ Testing topic jump...');
const chapter = ctx.jumpToTopic('autonomous drones');
assert(chapter !== null, 'Should locate a chapter for drones');
assert(/drone/i.test(chapter!.headline), 'Chapter headline should mention drones');
console.log(`   ✅ Jump to ${formatTimestamp(chapter!.start)} — ${chapter!.headline}`);

// 5. Honesty: off-topic questions are declined, not invented.
console.log('5️⃣ Testing that off-topic questions are declined...');
const offTopic = ctx.answerQuery('what are the mortgage interest rates in 1987?');
assert(offTopic.citations.length === 0, 'Off-topic query should return no citations');
console.log('   ✅ Declined:', offTopic.answer.slice(0, 80));

// 6. Export.
console.log('6️⃣ Testing Markdown export...');
const md = ctx.exportMarkdown();
assert(md.includes('## Summary'), 'Export must contain a Summary section');
assert(md.includes('## Chapters'), 'Export must contain a Chapters section');
assert(md.includes('## Transcript'), 'Export must contain a Transcript section');
console.log('   ✅ Export format verified');

console.log('\n🎉 ALL 6 VOXDIVE VERIFICATION TESTS PASSED WITH 100% SUCCESS!\n');
