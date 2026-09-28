# Changelog

All notable changes to VoxDive are documented here.
Format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] — 2026-09-29

Initial release for the AssemblyAI Voice Agent Hackathon 2026: **VoxDive — talk to any video or podcast.**

### Core
- **Transcription** (`src/transcript_service.ts`): async AssemblyAI Speech-to-Text with speaker diarization, auto-chapters, and entity detection, polled to completion; **LeMUR** (Claude-powered) one-paragraph summary and grounded Q&A. Bundled original sample transcript (`src/sample_content.ts`) so the full experience runs offline with no API key.
- **Grounded retrieval** (`src/video_context.ts`): per-connection transcript store with IDF-weighted, filler-aware retrieval that returns passages with timestamps and declines topics the recording never covers (no hallucination).
- **Voice Agent** (`src/voice_agent_client.ts`): full-duplex AssemblyAI Voice Agent session with `search_transcript` / `get_summary` / `jump_to_topic` tools, turn detection, and barge-in; ephemeral token minting so the API key never reaches the browser.
- **Server** (`src/server.ts`): WebSocket orchestration for ingest → transcript → voice/text conversation, with a deterministic offline walkthrough.

### UX & observability
- Single-page UI: media-URL input, chapters, diarized transcript, voice + text chat, timestamp citations, and a live latency HUD.
- Server-side turnaround + barge-in latency metrics (`/api/metrics`, `/api/health`), SLO targets (turnaround p95 < 1200 ms, barge-in p95 < 200 ms).
- Web Audio `AudioWorkletProcessor` for 16 kHz PCM mic capture; auto-reconnect with capped exponential backoff.

### Quality
- TypeScript strict; offline suite (simulate + unit + metrics + server WS) green; **98% line coverage** on the logic core (live AssemblyAI paths covered by `npm run test:live`).
- CI on Node 18/20/22; multi-stage Dockerfile; deploy configs for AWS / GCP / Azure / k8s and a free Cloudflare-tunnel path.

### Tooling
- Optional `scripts/fetch_youtube_audio.ts` (yt-dlp helper, ToS-flagged) for extracting audio from content you own or that is CC-licensed; the primary path is any direct media URL.
- `scripts/measure_live_turn.ts` for real voice-loop latency measurement.
