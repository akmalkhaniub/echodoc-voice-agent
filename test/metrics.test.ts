import assert from 'assert';
import { LatencyTracker, TurnClock, percentile } from '../src/metrics.js';

console.log('🧪 EchoDoc metrics suite (latency + turn clock)...\n');

let passed = 0;
function ok(label: string, cond: boolean): void {
  assert(cond, label);
  passed++;
  console.log(`   ✅ ${label}`);
}

// 1. percentile — nearest-rank
console.log('1️⃣ percentile()...');
const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
ok('p50 of 1..100 (by tens) = 50', percentile(xs, 50) === 50);
ok('p95 = 100', percentile(xs, 95) === 100);
ok('p0/empty safe', percentile([], 95) === 0);
ok('single sample', percentile([42], 95) === 42);

// 2. LatencyTracker summary
console.log('\n2️⃣ LatencyTracker...');
const lt = new LatencyTracker();
[300, 400, 500, 600, 700].forEach((v) => lt.add(v));
const s = lt.summary();
ok('count tracks samples', s.count === 5);
ok('mean correct', s.mean === 500);
ok('min/max correct', s.min === 300 && s.max === 700);
ok('last reflects newest', lt.last === 700);
lt.add(-5); // invalid ignored
lt.add(NaN); // invalid ignored
ok('rejects invalid samples', lt.count === 5);

// 3. reservoir cap
const capped = new LatencyTracker(3);
[1, 2, 3, 4, 5].forEach((v) => capped.add(v));
ok('reservoir capped to maxSamples', capped.count === 3 && capped.summary().min === 3);

// 4. TurnClock — turnaround & barge-in with an injected clock
console.log('\n3️⃣ TurnClock (injected clock)...');
let now = 0;
const clock = new TurnClock(() => now);
now = 1000; clock.markUserStop();       // user stops speaking
now = 1120; clock.markReplyStart();     // agent starts composing
now = 1350;
const turnaround = clock.markFirstAudio();
ok('turnaround = firstAudio - userStop (350ms)', turnaround === 350);
ok('turnaround only reported once per turn', clock.markFirstAudio() === null);

// barge-in: user speaks during a reply
now = 2000; clock.markReplyStart();
now = 2150;
const halt = clock.markBargeIn();
ok('barge-in = now - replyStart (150ms)', halt === 150);
ok('barge-in null when no active reply', clock.markBargeIn() === null);

// no user stop -> no turnaround attribution
const clock2 = new TurnClock(() => now);
ok('firstAudio null without userStop', clock2.markFirstAudio() === null);

console.log(`\n🎉 ALL ${passed} ECHODOC METRICS ASSERTIONS PASSED.\n`);
