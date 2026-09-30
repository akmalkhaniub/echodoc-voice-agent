# 📋 VoxDive — Lablab.ai Official Submission Form Content
*Copy and paste these fields directly into the Lablab.ai hackathon submission form.*

---

### 1. Basic Information
* **Project Title:**
  `VoxDive — Talk to Your Team's Video Knowledge`

* **Short Description (under 255 chars):**
  `Every company has hours of trainings, webinars and all-hands nobody rewatches. VoxDive turns that video into something employees can ASK — a voice agent that answers only from what was actually said, cited to the exact moment. Built end-to-end on AssemblyAI.`

* **Technology Tags:**
  `AssemblyAI Voice Agent API`, `LeMUR`, `Speech-to-Text`, `Speaker Diarization`, `Auto-Chapters`, `Real-Time Audio`, `WebSockets`, `TypeScript`, `Docker`

* **Category Tags:**
  `Voice Agents`, `Enterprise`, `Knowledge Management`, `Training & Enablement`, `Productivity`

---

### 2. Long Description

```markdown
### The Problem (a real market, not just a cool demo)
Every organization is sitting on a graveyard of recorded video: onboarding and training sessions, product webinars, all-hands, recorded meetings, compliance briefings. It's expensive to produce and almost never rewatched, because it's searchable only by title. When a new hire asks "what's our refund policy again?" or "how did we decide the Q3 roadmap?", the answer is buried at minute 34 of a two-hour recording nobody will scrub through. The knowledge is captured — and trapped.

Existing "AI meeting" tools (Gong, Fireflies) focus on live *calls*. Enterprise video platforms (Panopto, Kaltura) store and stream, but you still can't *ask* them. And a naive chatbot over transcripts is a non-starter here: in a training or compliance context, a confidently wrong answer is worse than no answer.

### Who it's for
Learning & Development, enablement, and internal-knowledge teams — and the employees who'd rather ask a question than rewatch an hour of video.

### The Solution: VoxDive
Point VoxDive at a recording and it becomes something your team can talk to:

1. **Understand it (AssemblyAI async STT):** speaker diarization, auto-chapters, and entity detection produce a diarized transcript, a chaptered outline, and a summary — automatically.
2. **Answer from it (LeMUR):** LeMUR (Claude-powered) summarizes and answers questions from the transcript.
3. **Talk to it (Voice Agent API):** a full-duplex voice agent answers out loud with turn-taking and barge-in. Every answer is routed through a `search_transcript` tool, so it can **only** speak about what the recording actually contains — and it **cites the timestamp**, so anyone can verify it in one click.

That last point is the wedge: **grounded, cited, non-hallucinating answers** are exactly what a training/compliance buyer needs. Ask about something the recording never covered and VoxDive says so, instead of inventing an answer.

### Why it wins on the AssemblyAI stack
Most voice-AI projects use one AssemblyAI feature. VoxDive chains the whole platform — async STT + diarization + auto-chapters + entity detection + LeMUR + the **Voice Agent API** (with JSON-Schema tool calling) — into one product, and enforces trust through tools rather than hoping the model behaves.

### Market & where it goes
The wedge is "ask your training & knowledge videos." It expands to the whole enterprise video library (adjacent to Panopto/Kaltura for storage and Guru/Glean for knowledge, but *conversational and grounded*), then to support/onboarding self-service and compliance audit trails where the timestamp citation is the evidence.

### Honest scope
This build is the working core: real AssemblyAI transcription + LeMUR + a transcript-grounded Voice Agent, with a media-first UI (real player, diarized speakers, clickable chapters and citations that seek the video, synced transcript). SSO, a persistent multi-video library, and access controls are the productization path, not in this hackathon build. The demo uses a real **public-domain NASA training video** (a stand-in for "a corporate training recording") plus a bundled sample so it runs with no key.
```

---

### ✅ Verified engineering metrics (measured, not claimed)

| What | Evidence | How to check |
| :--- | :--- | :--- |
| Real recording transcribed via AssemblyAI: **STT + diarization (4 speakers) + auto-chapters + entities** | `src/nasa_demo_content.ts`, `scripts/transcribe_demo.ts` | click **NASA demo** in the UI |
| **LeMUR** (Claude-powered) summary + grounded Q&A, with local-retrieval fallback | `src/transcript_service.ts` | `npm run test:live` |
| **Voice Agent API** session grounded by a `search_transcript` tool (won't answer beyond the transcript) | `src/voice_agent_client.ts` | `npm test` |
| **IDF-weighted, filler-aware retrieval** returning passages with timestamps; off-topic queries declined | `src/video_context.ts`, `test/unit_offline.ts` | `npm test` |
| Offline suite green (6 + 38 + 19 + 17 assertions), **98% line coverage** on the logic core | `.c8rc.json` | `npm run coverage` |
| Voice-loop latency HUD; one measured turn **1379 ms** to first agent audio (single sample, honestly reported) | `docs/LIVE_METRICS.json` | `npm run measure:live` |

> Honesty note: the 1379 ms figure is a single spoken turn on the AssemblyAI Voice Agent transport VoxDive uses. The offline sample is bundled content; the NASA demo is a real AssemblyAI transcription of a public-domain video.

---

### 3. Submission Links & Assets
* **Public GitHub Repository:** `https://github.com/akmalkhaniub/voxdive`
* **Cover Image:** `docs/cover.html` → export/screenshot at 1280×720.
* **Slide Deck:** `docs/pitch_deck.html` → Print → Save as PDF.
* **Live Demo:** `npm run tunnel` for a temporary `https://*.trycloudflare.com` URL, or run locally with `npm run dev`.

---

### 🧪 Testing Instructions for Judges

```bash
git clone https://github.com/akmalkhaniub/voxdive.git
cd voxdive
npm install
npm run dev            # http://localhost:3000
```

### Steps to verify in the UI
1. Click **▶ NASA demo** — a real public-domain training video loads in the player with a **4-speaker diarized transcript**, chapters, and a summary (all produced by AssemblyAI).
2. Ask *"Why were the dogs barking?"* — get a grounded answer with a **clickable timestamp citation**; click it to jump the video to that exact moment.
3. Open the **Transcript** tab — click any line to seek; the current line highlights as the video plays.
4. Click **Talk** and ask out loud; try **interrupting** the agent (barge-in) and watch the latency HUD.
5. Ask something the recording never covers (e.g. *"Who painted the Mona Lisa?"*) — VoxDive **declines** instead of inventing an answer.
6. No key needed to explore: **Sample podcast** runs the whole flow offline. `npm test` / `npm run coverage` verify the engine (98%).
```
