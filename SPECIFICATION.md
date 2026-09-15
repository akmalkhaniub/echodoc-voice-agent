# Technical Specification: EchoDoc
**Project Name:** EchoDoc (AssemblyAI Voice Agent Hackathon)  
**Status:** Ready for Implementation  
**Version:** 1.0.0  

---

## 1. System Architecture
EchoDoc operates on a full-duplex WebSocket architecture. Audio recorded from the client microphone is streamed in 16kHz PCM chunks to an intermediate server that pipes directly into AssemblyAI's Streaming WebSocket STT. Partial and final transcripts feed into an event-driven LLM pipeline that emits streaming audio responses via Cartesia / ElevenLabs while populating a live clinical note.

```mermaid
graph TD
    A[Browser Mic: 16kHz PCM] -->|Client WebSocket| B[EchoDoc Gateway Server]
    B -->|WSS Audio Chunks| C[AssemblyAI Streaming STT]
    C -->|Partial & Final Transcripts| B
    B -->|Stream to UI| D[Next.js Clinical Dashboard]
    B -->|User Utterance Finalized| E[Clinical LLM Agent]
    E -->|Real-Time SOAP Extraction| F[Live SOAP Note Card]
    E -->|Drug Interaction Check| G[Pharma Knowledge Tool]
    E -->|Verbal Answer Stream| H[Ultra-Low Latency TTS (Cartesia)]
    H -->|Binary Audio Chunks| B
    B -->|Audio Playback Stream| A
```

---

## 2. Low-Latency Pipeline Specification

### 2.1 Audio Encoding & WebSocket Streaming
- Sample Rate: 16,000 Hz, 16-bit Linear PCM, Mono.
- Buffer frame duration: 100ms per frame chunk to optimize packet overhead without introducing latency.

### 2.2 Turn-Taking & Interruption (Barge-In)
- When AssemblyAI emits a `PartialTranscript` while the assistant TTS is playing, client immediately halts audio playback and sends a `CANCEL_STREAM` packet to the server to prevent conflicting audio.

### 2.3 Real-Time SOAP Clinical Structuring
The LLM continuously parses the conversation into the 4 standard clinical quadrants:
- **Subjective (S):** Patient's reported symptoms, history of present illness.
- **Objective (O):** Physical examination findings, vital signs mentioned.
- **Assessment (A):** Differential diagnosis and clinical synthesis.
- **Plan (P):** Prescribed drugs, diagnostic orders, follow-up instructions.

---

## 3. Data Protocols

### 3.1 Client-to-Server Message Format
```typescript
type ClientMessage = 
  | { type: 'AUDIO_CHUNK'; data: string /* base64 PCM */ }
  | { type: 'BARGE_IN_TRIGGERED' }
  | { type: 'SESSION_CONTROL'; action: 'START' | 'PAUSE' | 'FINALIZE' };
```

### 3.2 Server-to-Client Message Format
```typescript
type ServerMessage =
  | { type: 'TRANSCRIPT'; isFinal: boolean; text: string; speaker?: string }
  | { type: 'SOAP_UPDATE'; section: 'S' | 'O' | 'A' | 'P'; content: string }
  | { type: 'SAFETY_WARNING'; message: string; severity: 'HIGH' | 'MEDIUM' }
  | { type: 'AUDIO_RESPONSE_CHUNK'; data: string /* base64 audio */ };
```

---

## 4. Acceptance Criteria
1. End-to-end latency from speaker silence to first audio byte response `< 850ms`.
2. Clean interruption handling: speaking while agent talks instantly silences playback.
3. Automatically generates structured, human-readable SOAP clinical note from a 2-minute mock doctor-patient consultation.
