# 📋 VoxDive — Lablab.ai Official Submission Form Content
*Copy and paste these fields directly into the Lablab.ai hackathon submission form.*

---

### 1. Basic Information
* **Project Title:**
  `VoxDive — Talk to Any Video or Podcast`

* **Short Description (under 255 chars):**
  `VoxDive turns any video or podcast into a conversation. AssemblyAI transcribes and diarizes it, LeMUR summarizes it, and the Voice Agent API lets you talk to the content out loud — with answers grounded only in what was actually said, cited by timestamp.`

* **Technology Tags:**
  `AssemblyAI Voice Agent API`, `LeMUR`, `Speech-to-Text`, `Speaker Diarization`, `Auto-Chapters`, `Real-Time Audio`, `WebSockets`, `Node.js`, `TypeScript`, `Docker`

* **Category Tags:**
  `Voice Agents`, `Media & Content`, `Productivity`, `Developer Tooling`

---

### 2. Long Description

```markdown
### The Problem
There are billions of hours of podcasts, lectures, and videos — and they're searchable only by title and description. If you want to know what was actually said at minute 34, you scrub a timeline and hope. Long-form spoken content is effectively a black box.

### The Solution: VoxDive
VoxDive turns any video or podcast into something you can have a spoken conversation with. It is built end-to-end on AssemblyAI:

1. **Ingest & Understand (async Speech-to-Text):**
   - Paste a media URL. VoxDive submits it to AssemblyAI with speaker diarization, auto-chapters, and entity detection, and polls to completion.
   - You get a diarized transcript, a chaptered outline, and a one-paragraph summary — automatically.

2. **Summarize & Answer (LeMUR):**
   - LeMUR (Claude-powered) writes the summary and answers typed questions grounded in the transcript.

3. **Talk To It (Voice Agent API):**
   - A full-duplex voice agent lets you ask questions out loud and hear answers, with turn detection and barge-in.
   - Every answer flows through a `search_transcript` tool, so the agent can only speak about what the recording actually contains. Ask about something the video never covered and it says so — instead of hallucinating. Answers cite timestamps.

### Why it's different
Most voice-AI projects use one AssemblyAI feature (usually streaming STT). VoxDive chains the whole stack — async STT + diarization + auto-chapters + entity detection + LeMUR + the Voice Agent API — into a single product, and enforces grounding through tool calls so the experience is trustworthy, not just impressive.

### Honest scope
With no API key, VoxDive serves a bundled, original sample transcript so the full "talk to a video" experience is demoable offline (clearly labeled). YouTube audio can be extracted with an optional yt-dlp helper for content you own or that is CC-licensed; the primary, unambiguous path is any direct media URL.
```

---

### ✅ Verified engineering metrics (measured, not claimed)

| What | Evidence | How to check |
| :--- | :--- | :--- |
| Async **STT + speaker diarization + auto-chapters + entity detection**, polled to completion | `src/transcript_service.ts` | set `ASSEMBLYAI_API_KEY`, `npm run test:live` |
| **LeMUR** (Claude-powered) summary + grounded Q&A, with local-retrieval fallback | `src/transcript_service.ts` | `npm run test:live` |
| **Voice Agent API** session grounded by a `search_transcript` tool (won't answer beyond the transcript) | `src/voice_agent_client.ts` | `npm test` |
| **IDF-weighted, filler-aware retrieval** returning passages with timestamps; off-topic queries declined | `src/video_context.ts`, `test/unit_offline.ts` | `npm test` |
| Offline suite green (6 + 36 + 19 + 17 assertions), **98.4% line coverage** on the logic core | `.c8rc.json` | `npm run coverage` |
| Voice-loop latency HUD; one measured turn **1379 ms** to first agent audio (single sample, misses 1.2 s target — reported honestly) | `docs/LIVE_METRICS.json` | `npm run measure:live` |

> Honesty note: the 1379 ms figure is a single spoken turn on the AssemblyAI Voice Agent transport VoxDive uses; barge-in wasn't measured on it. No deployed public URL; the offline sample is bundled content, not a live transcription.

---

### 3. Submission Links & Assets
* **Public GitHub Repository:**
  `https://github.com/akmalkhaniub/voxdive`

* **Cover Image:** Open `docs/cover.html` and export/screenshot at 1280×720 (PNG or JPG) as the cover image.
* **Slide Deck:** Export `docs/pitch_deck.html` to PDF via browser print.
* **Live Demo:** Run `npm run tunnel` for a temporary `https://*.trycloudflare.com` URL, or run locally with `npm run dev`.

---

### 🧪 Testing Instructions for Judges

```bash
git clone https://github.com/akmalkhaniub/voxdive.git
cd voxdive
npm install

# Try it with zero config (bundled sample transcript, no key needed):
npm run dev            # open http://localhost:3000 → click "Try the sample" → ask questions

# Or run the verification suite:
npm test               # typecheck + offline suite (live tests auto-skip without a key)
npm run coverage       # 98%+ line coverage on the logic core
```

### Steps to verify in the UI
1. Click **Try the sample** — watch the diarized transcript, chapters, and summary populate.
2. Type a question (e.g. *"how do river interceptors work?"*) — get a grounded answer with a **timestamp citation**.
3. Click **Talk to this video** and ask out loud; try **interrupting** the agent (barge-in) and watch the latency HUD.
4. Ask about something the video never mentions — VoxDive declines instead of inventing an answer.
5. With `ASSEMBLYAI_API_KEY` set, paste a real media URL to transcribe live and let LeMUR answer.
