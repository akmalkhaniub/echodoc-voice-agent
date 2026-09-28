# Roadmap & Milestones: VoxDive
**Hackathon:** AssemblyAI — Voice Agent Hackathon
**Target Submission Deadline:** September 30, 2026

---

> **Status legend:** `[x]` implemented in code · `[~]` partial / stand-in · `[ ]` not started.
> **Reality note:** VoxDive ("talk to any video or podcast") is built on the AssemblyAI Voice Agent rails. Real async STT + diarization + auto-chapters + entity detection, LeMUR summary/Q&A, a transcript-grounded Voice Agent, IDF-weighted retrieval, and a bundled offline sample. Offline suite green, 98% coverage. Live consultation-style recording (demo video) and an optional deploy remain.

## Phase 1: Ingestion & understanding
- [x] Async AssemblyAI transcription (`POST /v2/transcript`) polled to completion.
- [x] Speaker diarization → diarized segments; auto-chapters; entity detection.
- [x] Normalize provider output to a provider-agnostic `TranscriptResult`.
- [x] Bundled original sample transcript so the flow works offline with no key.

## Phase 2: Grounding & retrieval
- [x] `VideoContext` per-connection transcript store.
- [x] IDF-weighted, filler-aware retrieval returning passages with timestamps.
- [x] Refuse-to-over-answer behavior (off-topic queries declined, not invented).
- [x] LeMUR (Claude-powered) summary + grounded Q&A, with local fallback.

## Phase 3: Voice conversation
- [x] Voice Agent API session with `search_transcript` / `get_summary` / `jump_to_topic` tools.
- [x] Full-duplex audio (mic → 16k PCM in, agent → 24k PCM out) + barge-in.
- [x] Server-side turnaround + barge-in latency metrics and HUD.
- [x] Ephemeral Voice Agent token minting (`/api/token/agent`).

## Phase 4: UI, tests, submission
- [x] Single-page UI: source input, chapters, transcript, voice + text chat, latency HUD.
- [x] Offline test suite (sim + unit + metrics + server WS) and 98% coverage gate.
- [x] Live integration suite (`npm run test:live`) for the real AssemblyAI endpoints.
- [~] Optional YouTube audio helper (`scripts/fetch_youtube_audio.ts`, yt-dlp, ToS-flagged).
- [ ] Record ~3-minute demo video (needs a microphone).
- [ ] Submit to Lablab.ai before September 30. *(Optional: rename repo to `voxdive`, deploy a public URL.)*
