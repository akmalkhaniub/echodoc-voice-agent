# 🌊 VoxDive — Pitch Deck & Executive Summary
**Talk to Any Video or Podcast — Out Loud**
*Built for the AssemblyAI Voice Agent Hackathon 2026 on Lablab.ai*

> Rendered 16:9 deck: open `docs/pitch_deck.html` and Print → Save as PDF.
> Cover image: open `docs/cover.html` and screenshot/export at 1280×720 (PNG or JPG).

---

## Slide 1: Cover & Mission
* **Product:** VoxDive
* **Tagline:** Talk to any video or podcast — answers grounded only in what was actually said, cited by timestamp.
* **Core Technology:** AssemblyAI async STT + Speaker Diarization + Auto-Chapters + Entity Detection + LeMUR + Voice Agent API.
* **Author:** Akmal Khan (@akmalkhaniub)
* **Repo:** https://github.com/akmalkhaniub/voxdive

---

## Slide 2: The Problem
* **Spoken content is a black box.** Billions of hours of podcasts, talks, and videos are searchable only by title — not by what was said.
* **Scrubbing timelines.** To find one claim at minute 34, you drag a slider and hope.
* **Hallucination.** Naïve chatbots over transcripts confidently invent answers the recording never contained.

---

## Slide 3: The Solution — VoxDive
1. **Ingest & understand:** async AssemblyAI STT + diarization + auto-chapters + entity detection → transcript, outline, summary.
2. **Summarize & answer:** LeMUR (Claude-powered) writes the summary and answers questions from the transcript.
3. **Talk to it:** the Voice Agent API turns it into a spoken conversation with barge-in — every answer routed through a `search_transcript` tool, so it can't answer beyond the recording. Ask about an untouched topic → it says so.

---

## Slide 4: How It Works
`Media URL → POST /v2/transcript (diarization + chapters + entities) → LeMUR summary/Q&A → VideoContext (IDF-weighted, timestamped retrieval) → Voice Agent API (tools: search_transcript / get_summary / jump_to_topic, turn detection + barge-in) → Web UI (chapters · transcript · voice + text chat · latency HUD).`

The differentiator: most entries use one AssemblyAI feature; VoxDive chains six into one product and enforces grounding through tool calls.

---

## Slide 5: Why It's Different
* **Trustworthy by construction** — answers come from a tool returning real passages with timestamps.
* **Uses the full platform** — STT + diarization + chapters + entities + LeMUR + Voice Agent.
* **Zero-setup demo** — a bundled sample transcript makes the whole flow work offline.
* **Universally relatable** — a judge pastes their own favorite video and talks to it.

---

## Slide 6: Proof (measured, not claimed)
* **98%** line coverage on the logic core; **78** offline assertions passing.
* **1379 ms** measured voice turnaround (single sample; misses the 1.2 s target — reported honestly).
* TypeScript strict; CI Node 18/20/22; live paths via `npm run test:live`.
* Try it: `npm run dev` → **Try the sample** → ask it anything.

---

## Slide 7: Close
**VoxDive — stop scrubbing timelines. Just ask.** Any video or podcast becomes a grounded, cited, spoken conversation. Built end-to-end on AssemblyAI.
