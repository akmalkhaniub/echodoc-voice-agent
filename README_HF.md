---
title: EchoDoc Clinical Voice Agent
emoji: 🩺
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 3000
pinned: false
suggested_hardware: cpu-basic
license: mit
---

# 🩺 EchoDoc Voice Agent on Hugging Face Spaces

EchoDoc is a sub-second Clinical Voice Scribe and Diagnostic Copilot running on **Hugging Face Spaces (Free CPU Basic: 2 vCPU, 16 GB RAM)** with persistent WebSocket streaming.

## 🚀 Live Space Features
- **Zero Idle Sleepout**: Spaces stay active for smooth real-time evaluation.
- **Microphone Streaming**: Ingests raw PCM/Opus via Web Audio `AudioWorkletNode`.
- **SOAP Extraction**: Generates Subjective, Objective, Assessment, and Plan notes in real-time.
- **Contraindication Sentinel**: Alerts doctors to high-risk drug-drug interactions (e.g. Warfarin + Ibuprofen).

## 🔑 Environment Variables
Set these under **Settings > Variables and secrets**:
- `ASSEMBLYAI_API_KEY`: Your AssemblyAI API token (leave blank to run in self-contained Mock Mode).
- `NODE_ENV`: `production`
- `PORT`: `3000`
