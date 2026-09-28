/**
 * Bundled demo transcript for VoxDive.
 *
 * This is ORIGINAL content authored for this project (a short fictional
 * two-person podcast about ocean-cleanup technology), not a copy of any real
 * video or transcript. It lets judges run the full "talk to a video"
 * experience with no API key and no download — the offline simulator serves
 * this as if it had just transcribed a media URL.
 */

import type { TranscriptResult } from './types.js';

export const SAMPLE_TRANSCRIPT: TranscriptResult = {
  id: 'sample-ocean-cleanup',
  title: 'Deep Currents — Ep. 12: Can We Actually Clean the Ocean?',
  sourceUrl: 'bundled://voxdive/sample/deep-currents-ep12',
  durationSec: 372,
  isMock: true,
  speakers: ['Speaker A', 'Speaker B'],
  entities: ['Pacific Ocean', 'microplastics', 'autonomous drones', 'river interceptors', 'polyethylene'],
  segments: [
    { start: 4, end: 18, speaker: 'Speaker A', text: "Welcome back to Deep Currents. Today we're asking a question that sounds simple but really isn't: can we actually clean the ocean, or is that just a comforting story we tell ourselves?" },
    { start: 19, end: 41, speaker: 'Speaker B', text: "I love that framing, because the honest answer is both. The big floating cleanup systems get all the headlines, but most of the plastic entering the ocean comes from about a thousand rivers. If you don't stop it at the river, you're mopping the floor with the tap still running." },
    { start: 42, end: 63, speaker: 'Speaker A', text: "So the river interceptors are the unglamorous heroes here. Walk me through how one actually works." },
    { start: 64, end: 92, speaker: 'Speaker B', text: "Sure. An interceptor is basically a solar-powered barge anchored across a river mouth. A floating barrier guides debris onto a conveyor belt, which drops it into dumpsters on board. When the dumpsters are full, a local crew swaps them out. No diesel, no crew standing in the sun all day — the whole thing runs on the current and the sun." },
    { start: 93, end: 115, speaker: 'Speaker A', text: "And the offshore systems, the ones people picture — the giant U-shaped barriers in the Pacific?" },
    { start: 116, end: 148, speaker: 'Speaker B', text: "Those target the accumulation zones, the big gyres where currents concentrate floating polyethylene. The newer designs are slower and gentler on purpose, because the first prototypes were actually harming the neuston — the tiny creatures that live right at the surface. That was a real wake-up call: you can't clean an ecosystem by damaging it." },
    { start: 149, end: 174, speaker: 'Speaker A', text: "That's the tension, isn't it? The cure can't be worse than the disease. Where do autonomous drones fit in?" },
    { start: 175, end: 205, speaker: 'Speaker B', text: "Small autonomous drones are great for harbors and marinas — tight spaces where a big barge can't go. They skim the surface, and increasingly they carry cameras that classify what they pick up. That data matters more than the plastic itself, honestly. If you know a marina is full of polystyrene takeaway containers, you can go upstream and ban the source." },
    { start: 206, end: 233, speaker: 'Speaker A', text: "So the real product is the data, not the debris. That reframes the whole thing as a monitoring problem." },
    { start: 234, end: 268, speaker: 'Speaker B', text: "Exactly. And this is where I get genuinely optimistic. Ten years ago we were guessing at how much microplastic was out there. Now we have continuous sampling, satellite tracking of debris rafts, and machine-learning models that predict where the next accumulation will form. We've gone from anecdote to instrumentation." },
    { start: 269, end: 294, speaker: 'Speaker A', text: "Give me the honest bottom line, though. If someone's listening and feeling hopeless — what should they take away?" },
    { start: 295, end: 332, speaker: 'Speaker B', text: "Two things. First, cleanup works, but only as the last line of defense — the leverage is upstream, in packaging design and river capture. Second, this is one of the rare environmental problems where the trend line is bending the right way. It's slow, it's unglamorous, and it's mostly happening in rivers you've never heard of. But it's real." },
    { start: 333, end: 360, speaker: 'Speaker A', text: "Cleanup as the last line of defense, not the first. That's the line I'm keeping. Thanks for wading through this one with me — we'll put the river data sources in the show notes." }
  ],
  chapters: [
    { start: 4, end: 41, headline: 'Can the ocean actually be cleaned?', summary: 'The episode opens on whether ocean cleanup is real progress or a comforting story, and argues most plastic enters via about a thousand rivers.' },
    { start: 42, end: 92, headline: 'How river interceptors work', summary: 'A solar-powered barge uses a barrier and conveyor to pull debris out at the river mouth, running entirely on current and sun.' },
    { start: 93, end: 148, headline: 'Offshore gyre systems and the neuston problem', summary: 'U-shaped barriers target Pacific accumulation zones; newer, gentler designs avoid harming surface-dwelling neuston.' },
    { start: 149, end: 233, headline: 'Autonomous drones and data as the real product', summary: 'Small drones clean harbors and, more importantly, classify debris so sources can be shut off upstream.' },
    { start: 234, end: 360, headline: 'The optimistic bottom line', summary: 'Instrumentation has replaced guesswork; cleanup is the last line of defense while the real leverage is upstream in packaging and rivers.' }
  ],
  summary:
    "This episode of Deep Currents examines whether ocean cleanup is genuinely effective. The core argument: most ocean plastic enters through roughly a thousand rivers, so solar-powered river interceptors — which pull debris out at the source using barriers and conveyor belts — matter more than the famous offshore systems. Offshore U-shaped barriers target Pacific gyres but had to be redesigned to stop harming surface neuston. Small autonomous drones clean harbors and, crucially, generate classification data that lets cities cut off pollution upstream. The optimistic conclusion is that cleanup works only as a last line of defense, while continuous monitoring and instrumentation have turned the problem from guesswork into something measurable and improving."
};
