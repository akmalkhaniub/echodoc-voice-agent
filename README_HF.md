---
title: VoxDive — Talk to Any Video
emoji: 🌊
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 3000
pinned: false
suggested_hardware: cpu-basic
license: mit
---

# 🌊 VoxDive on Hugging Face Spaces

VoxDive lets you **talk to any video or podcast**. It runs on **Hugging Face Spaces (Free CPU Basic)** with persistent WebSocket streaming for the Voice Agent.

## 🚀 Features
- **Ingest any media URL** — AssemblyAI async STT + speaker diarization + auto-chapters + entity detection.
- **LeMUR summary + grounded Q&A** (Claude-powered).
- **Talk to the content** — full-duplex Voice Agent with barge-in; every answer routed through a `search_transcript` tool so it never answers beyond the transcript.
- **Offline sample** — with no key, a bundled transcript makes the whole flow demoable.

## 🔑 Environment Variables
Set these under **Settings > Variables and secrets**:
- `ASSEMBLYAI_API_KEY`: your AssemblyAI token (leave blank to run in self-contained sample/mock mode).
- `NODE_ENV`: `production`
- `PORT`: `3000`
