# 🌊 VoxDive — Talk to Any Video or Podcast

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js: v18+](https://img.shields.io/badge/Node.js-v18%2B-brightgreen.svg)](https://nodejs.org)
[![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org)
[![AssemblyAI: STT + LeMUR + Voice Agent](https://img.shields.io/badge/AssemblyAI-STT%20%2B%20LeMUR%20%2B%20Voice%20Agent-6d28d9.svg)](https://www.assemblyai.com)
[![Web Audio: AudioWorklet](https://img.shields.io/badge/WebAudio-AudioWorklet-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
[![Tests: Offline suite passing](https://img.shields.io/badge/Tests-offline%20suite%20passing-emerald.svg)](./test)

> **Built for the [AssemblyAI Voice Agent Hackathon (Lablab.ai)](https://lablab.ai/event/assemblyai-voice-agent)**  
> *Submission Deadline: September 30, 2026*

VoxDive turns any video or podcast into something you can **have a spoken conversation with**. Paste a media URL (or a YouTube link) and VoxDive uses AssemblyAI's async **Speech-to-Text + speaker diarization + auto-chapters** to transcribe it, **LeMUR** (Claude-powered) to summarize and answer questions, and the **Voice Agent API** to let you talk to the content out loud — ask questions, get answers grounded *only* in what was actually said, with timestamp citations and barge-in. Every spoken answer flows through a tool (`search_transcript`) so the agent can't invent things the recording never covered.

---

## ✅ Implementation Status (honest snapshot)

| Area | Status | Notes |
| :--- | :--- | :--- |
| AssemblyAI async STT + diarization + auto-chapters | **Real** | `POST /v2/transcript` with `speaker_labels`, `auto_chapters`, `entity_detection`; polled to completion in `src/transcript_service.ts`. Falls back to a bundled sample transcript when no key. |
| LeMUR (Claude-powered) summary + grounded Q&A | **Real** | `POST /lemur/v3/generate/task` for the one-paragraph summary and text-copilot answers; degrades to local retrieval offline. |
| AssemblyAI Voice Agent API | **Real** | Live `wss://agents.assemblyai.com/v1/ws` with session config + `search_transcript` / `get_summary` / `jump_to_topic` tools; mock fallback. |
| Ephemeral token minting | **Real** | Server-side `/api/token/agent`; API key never sent to the browser. |
| Transcript grounding + retrieval | **Real (deterministic)** | Token-overlap retrieval over diarized segments returns passages with timestamps — offline-safe and used as the agent's tool + fallback. |
| Web UI | **Static HTML/JS** | Single-page app in `src/public/` (source input, chapters, transcript, voice + text chat). |
| YouTube audio extraction | **Optional helper** | `scripts/fetch_youtube_audio.ts` (yt-dlp) — **use only on content you own or that is CC-licensed**; the primary path is any direct media URL. |

**Runs with no API key:** set nothing (or `MOCK_STREAMING=true`) and the app serves the bundled *Deep Currents* sample transcript, so the full "talk to a video" experience is demoable offline.

> ⚠️ **Content note:** downloading audio from YouTube may violate its Terms of Service. VoxDive's core path is a direct/CC-licensed media URL; the yt-dlp helper is a local convenience for content you're allowed to use.

## 🧪 Testing

This project is written in **TypeScript** (strict mode). Sources live in `src/*.ts`;
the browser assets in `src/public/` stay as plain JS.

```bash
npm install
npm run typecheck      # tsc --noEmit over src + test
npm run build          # compile to dist/ and bundle public assets
npm start              # run the compiled server (dist/server.js)
npm run dev            # run from source with tsx watch

npm run test:offline   # deterministic, no network, no key (sim + 20 unit assertions)
npm run test:live      # exercises live AssemblyAI endpoints; auto-skips without a key
npm test               # typecheck + offline suite + live suite (live auto-skips)
```

`npm run verify` runs the full gate (typecheck + offline tests + build). The CI workflow
lives at `ci/ci.workflow.yml` (move it to `.github/workflows/ci.yml` once your push token
has the GitHub `workflow` scope) and runs typecheck + build + offline suite on Node 18/20/22.

## 📊 Observability & latency SLOs

The voice loop is instrumented for the metric that decides a real-time agent — turnaround
(user stop → first agent audio) and barge-in (user speech → playback halt):

- Live **latency HUD** in the header (turnaround / p95 / barge-in), colored against the SLO.
- `GET /api/metrics` → `{ turnaroundMs, bargeInMs, slo }` with p50/p95/min/max/mean.
- `GET /api/health` includes the same latency block.
- **SLO targets:** turnaround **p95 < 1200 ms**, barge-in **p95 < 200 ms**.
- **Live measurement (2026-09-25):** one spoken turn (Windows TTS, resampled to 16 kHz PCM) against the Voice Agent. Session `sess_ccd84262f2f64e17ae58eba09b5da51a`. First agent audio **1379 ms** after the utterance finished, so this single-sample p95 is **1379 ms** and does **not** yet clear the 1200 ms target. Barge-in was not measured on that turn (no interrupt). Raw JSON: `docs/LIVE_METRICS.json`. Re-run with `npm run measure:live`.
- Structured JSON logs (`LOG_JSON=true` / `NODE_ENV=production`); `LOG_LEVEL` gates verbosity.
- Both upstream WebSocket clients auto-reconnect with capped exponential backoff.

## 🚀 Deploy

Container-first; the multi-stage `Dockerfile` compiles TS → `dist` and ships a minimal
runtime with a `/api/health` HEALTHCHECK.

```bash
# Fly.io (config in fly.toml)
fly launch --copy-config --no-deploy && fly secrets set ASSEMBLYAI_API_KEY=... && fly deploy
# Render (render.yaml): connect the repo; set ASSEMBLYAI_API_KEY in the dashboard
```

Set `ASSEMBLYAI_API_KEY` as a secret; leave it unset to run the built-in simulator.

---

## 🌟 Architecture

```
[ Media URL / YouTube link ]
        │
        ▼
[ TranscriptService ]  POST /v2/transcript  (AssemblyAI async)
  ├── speaker_labels    → diarized segments
  ├── auto_chapters     → chaptered outline
  ├── entity_detection  → key entities
  └── LeMUR /lemur/v3/generate/task → one-paragraph summary
        │
        ▼
[ VideoContext ]  per-connection transcript store
  ├── IDF-weighted, filler-aware retrieval (passages + timestamps)
  └── refuses to answer beyond the transcript
        │
        ├──► Text copilot  (LeMUR live / local retrieval offline)
        │
        ▼
[ Voice Agent API ]  wss://agents.assemblyai.com/v1/ws
  ├── tools: search_transcript · get_summary · jump_to_topic
  ├── turn detection + barge-in (interrupt)
  └── audio in (mic → 16k PCM) ↔ audio out (24k PCM)
        │
        ▼
[ Web UI ]  source input · chapters · transcript · voice + text chat · latency HUD
```

### 1. Grounding through tools, not prompts
Every question the voice agent answers goes through the `search_transcript` tool (`src/voice_agent_client.ts`), which returns real passages with timestamps from `VideoContext`. The agent is instructed to answer only from tool output, so it declines topics the recording never covers instead of hallucinating.

### 2. The whole AssemblyAI stack, chained
Async STT + speaker diarization + auto-chapters + entity detection + LeMUR + the Voice Agent API — combined into one product (`src/transcript_service.ts`, `src/voice_agent_client.ts`), rather than using a single feature in isolation.

### 3. Offline-safe by design
With no API key, ingestion serves a bundled original sample transcript and retrieval runs locally, so the full "talk to a video" flow is demoable with zero setup. IDF-weighted retrieval keeps salient terms winning over conversational filler.

### 4. Ephemeral token auth + zero-jank audio
Short-lived Voice Agent tokens are minted server-side (`/api/token/agent`) so the API key never reaches the browser. Mic capture uses a Web Audio `AudioWorkletProcessor` (`src/public/pcm_processor.js`) for 16 kHz PCM with no main-thread jank.

---

## 📁 Repository Structure

```
assemblyai-voice-agent/            # (repo may be renamed voxdive)
├── src/
│   ├── transcript_service.ts   # AssemblyAI async STT + diarization + chapters + LeMUR
│   ├── video_context.ts        # per-connection transcript store + grounded retrieval
│   ├── voice_agent_client.ts   # Voice Agent API client + transcript-grounded tools
│   ├── sample_content.ts       # bundled original demo transcript (offline)
│   ├── types.ts                # shared domain types
│   ├── server.ts               # HTTP/WebSocket server, token minting, orchestration
│   └── public/                 # app.js · pcm_processor.js · index.html
├── scripts/
│   ├── measure_live_turn.ts    # real voice-loop latency measurement
│   └── fetch_youtube_audio.ts  # optional yt-dlp helper (ToS-flagged)
├── test/                       # simulate_conversation · unit_offline · metrics · server_ws · verify_assemblyai_v3 (live)
├── SPECIFICATION.md · ROADMAP.md · package.json · README.md
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js `v20+` (tested on `v24.14.0`)
- AssemblyAI API key (optional — the bundled sample runs with no key)

### Setup & run
```bash
git clone https://github.com/akmalkhaniub/voxdive.git
cd voxdive
npm install

cp .env.example .env       # optional: set ASSEMBLYAI_API_KEY=your_key_here
npm run dev                # http://localhost:3000
```
In the browser:
- Click **Try the sample** to load the bundled podcast transcript and ask it questions (no key needed).
- Paste a media URL and hit **Transcribe** (with a key) to transcribe it for real.
- Click **Talk to this video** to have a spoken conversation; try **Interrupt** (barge-in).

---

## 🧪 Automated Verification Suite

```bash
npm run test:offline    # deterministic, no network, no key
```

### Verification Results
```
🎉 ALL 6 VOXDIVE VERIFICATION TESTS PASSED WITH 100% SUCCESS!
🎉 ALL 36 VOXDIVE OFFLINE UNIT ASSERTIONS PASSED.
🎉 ALL 19 VOXDIVE METRICS ASSERTIONS PASSED.
🎉 ALL 17 VOXDIVE SERVER WS ASSERTIONS PASSED.
```
Line coverage on the logic core is **98%+** (`npm run coverage`); live AssemblyAI paths are exercised by `npm run test:live`.

---

## ⚖️ License
MIT License. Created by Akmal Khan for the AssemblyAI Voice Agent Hackathon 2026.
