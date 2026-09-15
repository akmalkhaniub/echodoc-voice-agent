# Roadmap & Milestones: EchoDoc
**Hackathon:** AssemblyAI - Voice Agent Hackathon  
**Target Submission Deadline:** September 30, 2026 (~14 Days Sprint)  

---

## Phase 1: Real-Time Audio & AssemblyAI WSS (Days 1–4)
- [ ] Implement browser audio worklet capturing 16kHz PCM audio stream.
- [ ] Connect Node.js/Python server to AssemblyAI Real-Time WebSocket STT.
- [ ] Handle partial transcripts and final transcript formatting on the client UI.

## Phase 2: Conversational Core & Fast TTS (Days 5–8)
- [ ] Connect fast LLM reasoning engine (Groq Llama-3.3 / Claude 3.5 Haiku) with streaming output.
- [ ] Integrate low-latency TTS streaming (Cartesia Sonic / ElevenLabs Flash).
- [ ] Implement robust client-side barge-in / audio cut-off upon user speech interruption.

## Phase 3: Clinical SOAP Card & Safety Tool (Days 9–11)
- [ ] Implement background structured extractor extracting JSON for SOAP notes in parallel.
- [ ] Add real-time mock drug interaction tool flagging conflicting prescriptions.
- [ ] Build clean, professional medical UI (Next.js 14, Lucide icons, Tailwind).

## Phase 4: Verification, Video Demo & Submission (Days 12–14)
- [ ] Conduct live mock medical consultation simulating physician-patient conversation.
- [ ] Record 3-minute video showing real-time transcription, instant voice interruption, and auto-generated SOAP notes.
- [ ] Submit project to Lablab.ai event before September 30 deadline.
