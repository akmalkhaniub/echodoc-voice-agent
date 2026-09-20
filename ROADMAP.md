# Roadmap & Milestones: EchoDoc
**Hackathon:** AssemblyAI - Voice Agent Hackathon  
**Target Submission Deadline:** September 30, 2026 (~14 Days Sprint)  

---

> **Status legend (updated 2026-09-18):** `[x]` implemented in code · `[~]` partial / stand-in (working prototype, not yet the full production stack named) · `[ ]` not started.
> **Reality note:** Strongest project in the set. Real AssemblyAI v3 streaming WebSocket client with a mock fallback, PCM audio worklet, barge-in, and clinical SOAP extraction (1,813 LOC, 2 passing test files). UI is a static HTML/Tailwind dashboard rather than Next.js; live consultation + video + submission still pending.

## Phase 1: Real-Time Audio & AssemblyAI WSS (Days 1–4)
- [x] Implement browser audio worklet capturing 16kHz PCM audio stream.
- [x] Connect Node.js/Python server to AssemblyAI Real-Time WebSocket STT.
- [x] Handle partial transcripts and final transcript formatting on the client UI.

## Phase 2: Conversational Core & Fast TTS (Days 5–8)
- [~] Connect fast LLM reasoning engine (Groq Llama-3.3 / Claude 3.5 Haiku) with streaming output.
- [~] Integrate low-latency TTS streaming (Cartesia Sonic / ElevenLabs Flash).
- [x] Implement robust client-side barge-in / audio cut-off upon user speech interruption.

## Phase 3: Clinical SOAP Card & Safety Tool (Days 9–11)
- [x] Implement background structured extractor extracting JSON for SOAP notes in parallel.
- [x] Add real-time mock drug interaction tool flagging conflicting prescriptions.
- [x] Build clean, professional medical UI (Next.js 14, Lucide icons, Tailwind). *(static HTML/Tailwind, not Next.js — clinical dashboard with live/sim badge, HUD, SOAP, barge-in)*

## Phase 4: Verification, Video Demo & Submission (Days 12–14)
- [~] Conduct live mock medical consultation simulating physician-patient conversation. *(Simulate Encounter is wired; live-key recording still pending)*
- [ ] Record 3-minute video showing real-time transcription, instant voice interruption, and auto-generated SOAP notes.
- [ ] Submit project to Lablab.ai event before September 30 deadline.
