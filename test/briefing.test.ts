import assert from 'assert';
import { BriefingContext } from '../src/briefing_context.js';
import type { TranscriptResult } from '../src/types.js';

console.log('🧪 VoxDive Briefing (cross-video grounding) suite...\n');
let passed = 0;
const ok = (label: string, cond: boolean) => { assert(cond, label); passed++; console.log(`   ✅ ${label}`); };

const mk = (id: string, title: string, segs: Array<[number, string, string]>): TranscriptResult => ({
  id, title, sourceUrl: `/media/${id}.mp4`, durationSec: segs.at(-1)![0] + 10,
  segments: segs.map(([start, speaker, text]) => ({ start, end: start + 8, speaker, text })),
  chapters: [], summary: `${title} summary.`, speakers: Array.from(new Set(segs.map((s) => s[1]))), entities: [], isMock: false
});

const feed = [
  mk('vid-rivers', 'River Interceptors Explained', [[4, 'Speaker A', 'River interceptors are solar-powered barges that pull plastic out at the river mouth using a conveyor belt.'], [30, 'Speaker B', 'Most ocean plastic comes from about a thousand rivers, so stopping it there matters most.']]),
  mk('vid-drones', 'Autonomous Cleanup Drones', [[5, 'Speaker A', 'Small autonomous drones skim harbors and classify the debris they collect.'], [40, 'Speaker C', 'The classification data matters more than the plastic, because it tells cities what to ban upstream.']]),
  mk('vid-gyres', 'Offshore Gyre Systems', [[6, 'Speaker A', 'Offshore U-shaped barriers target the Pacific gyres where currents concentrate polyethylene.'], [45, 'Speaker B', 'The newer designs are gentler so they do not harm the surface neuston.']])
];

console.log('1️⃣ Empty + basic state...');
const empty = new BriefingContext([]);
ok('empty briefing has no content', empty.hasBriefing === false && empty.answerQuery('x').citations.length === 0);
const b = new BriefingContext(feed);
ok('loads three videos', b.hasBriefing && b.count === 3);

console.log('\n2️⃣ Cross-video grounded search...');
const drones = b.answerQuery('what do the drones do?');
ok('routes a drones question to the drones video', drones.citations.length > 0 && /drone/i.test(drones.citations[0].videoTitle));
ok('answer names the source video + timestamp', /Autonomous Cleanup Drones/.test(drones.answer) && /\d+:\d\d/.test(drones.answer));
const rivers = b.answerQuery('how do river interceptors work?');
ok('routes an interceptor question to the rivers video', /River Interceptors/.test(rivers.citations[0].videoTitle));
const gyres = b.answerQuery('what about offshore gyre barriers?');
ok('routes a gyre question to the gyre video', /Gyre/.test(gyres.citations[0].videoTitle));

console.log('\n3️⃣ Honesty + meta...');
ok('off-topic question is declined across all videos', b.answerQuery('who painted the mona lisa?').citations.length === 0);
ok('"catch me up" returns the briefing', /briefing across 3/i.test(b.answerQuery('catch me up').answer));
ok('"what videos" lists the sources', /3 videos/.test(b.answerQuery('what videos are in this?').answer));
ok('sourcesFor finds which videos cover a topic', b.sourcesFor('plastic').length >= 1);

console.log('\n4️⃣ Export...');
const md = b.exportMarkdown();
ok('export lists all three videos', md.includes('River Interceptors') && md.includes('Autonomous Cleanup Drones') && md.includes('Offshore Gyre'));

console.log(`\n🎉 ALL ${passed} VOXDIVE BRIEFING ASSERTIONS PASSED.\n`);
