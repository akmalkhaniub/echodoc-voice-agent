# VoxDive submission notes

Paste into Lablab. Deadline 30 Sep 2026. Full form copy is in `LABLAB_SUBMISSION.md`.

## What a judge can run today

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Try the sample** to load a bundled podcast transcript and immediately ask it questions (works with no key). With `ASSEMBLYAI_API_KEY` set, the badge reads **Live AssemblyAI**: paste a real media URL to transcribe it for real, and the voice agent + LeMUR answers go live.

## What's real vs. simulated

- **Real:** async STT + speaker diarization + auto-chapters + entity detection (`POST /v2/transcript`), LeMUR summary + Q&A (`/lemur/v3/generate/task`), Voice Agent API session with `search_transcript`/`get_summary`/`jump_to_topic` tools, ephemeral token minting, IDF-weighted grounded retrieval, latency HUD.
- **Simulated fallback:** with no key, ingestion serves a bundled original sample transcript and the voice agent runs offline. Clearly labeled in the UI.

## Verified metrics

- Offline suite: `simulate_conversation` (6) + `unit_offline` (36) + `metrics` (19) + `server_ws` (17) all pass; **98.4% line coverage** on the logic core (`npm run coverage`). Live paths are exercised by `npm run test:live`.
- Voice-loop latency: one spoken turn against the AssemblyAI Voice Agent measured **1379 ms** to first audio (`docs/LIVE_METRICS.json`, `npm run measure:live`). Same Voice Agent transport VoxDive uses; single sample, misses the 1.2 s p95 target and says so.

## Not in this submission

- No deployed public URL (hosting skipped; `npm run tunnel` gives a temporary Cloudflare URL for the demo).
- Record the ~3-minute demo from `docs/DEMO_VIDEO_SCRIPT.md` on a machine with a microphone.
- YouTube ingestion is via the optional `npm run fetch:youtube` (yt-dlp) helper — use only on content you own or that is CC-licensed. The primary path is any direct media URL.
