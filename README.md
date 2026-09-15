# AssemblyAI - Voice Agent Hackathon

- **Official Challenge URL:** [https://lablab.ai/event/assemblyai-voice-agent](https://lablab.ai/event)
- **Organizer:** AssemblyAI & Lablab.ai
- **Host Platform:** Lablab.ai
- **Submission Deadline:** September 30, 2026 (~14 days remaining)
- **Format:** Online / Global
- **Primary Themes:** Voice AI, Streaming Audio, Real-Time Speech-to-Text (STT), Conversational Agents

---

## 1. Hackathon Objective & Problem Statement
The AssemblyAI Voice Agent Hackathon challenges builders to create real-time, bidirectional voice agents that feel indistinguishable from human conversation. 

Teams must utilize **AssemblyAI’s Streaming Speech-to-Text API** (Universal-2 / Real-time WebSocket STT) to build ultra-responsive conversational systems capable of handling natural interruptions, tool calling, and high emotional or task intelligence.

### Judging Criteria
1. **Speech Pipeline Latency & Flow (30%):** Sub-second response turnaround, fluid turn-taking, and interruption handling (barge-in).
2. **Tool Use & Agentic Capability (25%):** Agent's ability to trigger real-world tools, lookups, and actions seamlessly during speech.
3. **Product Experience & UX (25%):** Audio clarity, natural voice modulation, intuitive web/mobile interface.
4. **Code Quality & Architecture (20%):** Clean WebSocket handling, resilient connection management, and open-source documentation.

---

## 2. Selected Project Concept: EchoDoc (Sub-Second Clinical Voice Scribe & Diagnostic Copilot)
A low-latency, real-time voice copilot for physicians during patient consultations. EchoDoc continuously listens via AssemblyAI's streaming WebSocket, extracts structured SOAP clinical notes live, flags potential medication drug-drug interactions on the fly, and answers doctor queries verbally with instant barge-in support.

---

## 3. Directory Structure
```
assemblyai-voice-agent/
├── README.md               # Challenge rules, links, judging criteria (this file)
├── SPECIFICATION.md        # Real-time WebSocket spec, audio streaming, agent prompts
├── ROADMAP.md              # 14-day rapid sprint milestone plan
├── server/                 # Python / Node.js WebSocket audio proxy & agent brain
├── web/                    # React / Next.js browser audio capture & live SOAP visualizer
└── prompts/                # Clinical extraction & conversational persona prompts
```
