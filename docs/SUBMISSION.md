# EchoDoc submission notes

Paste this into Lablab. Deadline 30 Sep 2026.

## What a judge can run today

```bash
npm install
npm run dev
```

Open http://localhost:3000. The badge says **Live AssemblyAI** when `ASSEMBLYAI_API_KEY` is set. **Simulated encounter** is a scripted backup and is labeled on screen.

## Measured

One spoken turn on 2026-09-25: first agent audio **1379 ms** after the utterance ended (`docs/LIVE_METRICS.json`). That single sample misses the 1.2 s p95 target. Barge-in was not measured on that turn.

## Not in this submission

No public URL. Hosting was skipped. Record the 3-minute consult from `docs/DEMO_VIDEO_SCRIPT.md` on a machine with a microphone before uploading.
