# 🩺 EchoDoc — Real-Time Clinical Voice Scribe & Diagnostic Copilot

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js: v24](https://img.shields.io/badge/Node.js-v24.x-brightgreen.svg)](https://nodejs.org)
[![AssemblyAI: v3 Streaming](https://img.shields.io/badge/AssemblyAI-Universal--3.5--Pro-purple.svg)](https://www.assemblyai.com)
[![Web Audio: AudioWorklet](https://img.shields.io/badge/WebAudio-AudioWorklet-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
[![Tests: 100% Passing](https://img.shields.io/badge/Tests-7%2F7%20Passed-emerald.svg)](./test)

> **Built for the [AssemblyAI Voice Agent Hackathon (Lablab.ai)](https://lablab.ai/event/assemblyai-voice-agent)**  
> *Submission Deadline: September 30, 2026*

EchoDoc is an ultra-low-latency, real-time clinical voice copilot engineered for physicians during live patient encounters. Built on the **AssemblyAI v3 Streaming WebSocket protocol (`universal-3-5-pro`)** and **Web Audio `AudioWorkletProcessor`**, EchoDoc continuously streams ambient 16kHz linear PCM audio, generates progressive clinical SOAP notes live, continuously monitors for severe drug-drug contraindications (e.g., Warfarin + NSAIDs), and provides instant verbal Copilot answers with zero-latency barge-in support.

---

## 🌟 Key Innovations & 2026 Architecture

```
[ Ambient Microphone ]
        │
        ▼ (16kHz Mono Float32)
[ Web Audio AudioWorkletProcessor ] (Off-UI Thread, Zero-Jank)
        │
        ▼ (16-bit Linear PCM Transferable Buffers)
[ Local WebSocket Bridge: /ws ]
        │
        ▼ (Direct Binary Stream)
[ AssemblyAI v3 Streaming: wss://streaming.assemblyai.com/v3/ws ]
  ├── speech_model: universal-3-5-pro
  ├── Ephemeral Token Auth (/api/token)
  └── Custom Medical Word-Boost (warfarin, lisinopril, SOAP, etc.)
        │
        ├──► Interim Turns (Sub-300ms Partial Transcripts)
        └──► Final Turns (Committed Clinical Utterance)
                 │
                 ▼
     [ Clinical NLP & Sentinel Engine ]
        ├── Dynamic SOAP Note Extractor (S / O / A / P Quadrants)
        ├── Real-Time Drug Interaction Sentinel (Contraindication Shield)
        └── Instant Barge-In Copilot (Conversational Q&A)
```

### 1. Zero-Jank Audio Pipeline via `AudioWorkletNode`
Replaces deprecated `ScriptProcessorNode` with modern Web Audio `AudioWorkletProcessor` (`src/public/pcm_processor.js`) running on a dedicated real-time audio rendering thread. Converts microphone input into 16-bit linear PCM with zero main-thread dropped frames.

### 2. AssemblyAI v3 Streaming WebSocket with Universal-3.5-Pro
Directly streams to `wss://streaming.assemblyai.com/v3/ws` with `speech_model=universal-3-5-pro` and specialized medical vocabulary boosts (e.g., *warfarin, lisinopril, sildenafil, nitroglycerin, hypertension*).

### 3. Ephemeral Client Token Authentication (`/api/token`)
Issues short-lived streaming tokens via AssemblyAI token endpoint (`POST /v2/realtime/token`), keeping production API keys securely protected on the server side.

### 4. Real-Time Clinical Sentinel & Drug Contraindications
Instantly analyzes doctor-patient speech. Flagging dangerous combinations (e.g., **Warfarin + Ibuprofen** hemorrhage risks) within milliseconds before a prescription is written.

### 5. Interactive Web Mission Control
Live interactive visualizer featuring an oscilloscope audio canvas, dual-speaker conversational bubbles, dynamic 4-quadrant SOAP cards, and one-click markdown EHR export.

---

## 📁 Repository Structure

```
assemblyai-voice-agent/
├── src/
│   ├── assemblyai_client.js    # AssemblyAI v3 Universal-3.5-Pro streaming client
│   ├── clinical_engine.js      # SOAP extractor & drug contraindication sentinel
│   ├── server.js               # Node.js HTTP/WebSocket server & token exchange
│   └── public/
│       ├── app.js              # Client application & AudioWorklet orchestrator
│       ├── pcm_processor.js    # AudioWorkletProcessor for 16kHz PCM conversion
│       └── index.html          # Interactive clinical mission control dashboard
├── test/
│   └── simulate_consultation.js # Automated 7-step clinical verification suite
├── SPECIFICATION.md            # Technical design specification
├── ROADMAP.md                  # Hackathon execution sprint plan
├── package.json
└── README.md
```

---

## 🚀 Quickstart & Installation

### Prerequisites
- Node.js `v20.0.0+` (Tested on `v24.14.0`)
- AssemblyAI API Key (Optional — built-in simulation mode runs out of the box without keys)

### Setup
```bash
# Clone the repository
git clone https://github.com/akmalkhaniub/echodoc-voice-agent.git
cd echodoc-voice-agent

# Install dependencies
npm install

# (Optional) Add your AssemblyAI API key
cp .env.example .env
# Edit .env: ASSEMBLYAI_API_KEY=your_key_here
```

### Launch the Mission Control Dashboard
```bash
npm start
# Server starts at http://localhost:3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
- Click **"Run Simulated Consultation"** to witness real-time speech transcription, progressive SOAP extraction, and instant contraindication alerts.
- Or click **"Start Live Dictation"** to speak via your microphone using the `AudioWorklet` pipeline.
- Click **"Export SOAP Note (.md)"** to download the clinical chart.

---

## 🧪 Automated Verification Suite

Run the automated test suite verifying all 7 clinical intelligence modules:
```bash
node test/simulate_consultation.js
```

### Verification Results
```
🧪 Starting EchoDoc Automated Verification Test Suite...

1️⃣ Testing Subjective symptom extraction...
   ✅ Subjective extraction passed: • reports severe headache and dizziness for the past 4 days.
2️⃣ Testing Objective vitals extraction...
   ✅ Objective extraction passed: • Physical exam: blood pressure is 158/96 mmHg, pulse is 88 bpm.
3️⃣ Testing Assessment diagnostic extraction...
   ✅ Assessment extraction passed: • essential hypertension stage two.
4️⃣ Testing Plan & Rx extraction...
   ✅ Plan extraction passed: • Let us prescribe Lisinopril 10mg daily and schedule follow-up in 2 weeks.
5️⃣ Testing Real-Time Contraindication Sentinel...
   ⚠️ Safety Hazard Detected: Contraindicated Pair: WARFARIN + IBUPROFEN
   📝 Hazard Details: Severe hemorrhage / GI bleeding risk: Concomitant use of Warfarin with NSAIDs impairs platelet aggregation and damages gastric mucosa.
   ✅ Contraindication Sentinel verified successfully!
6️⃣ Testing Conversational Copilot Q&A...
   💬 Q: "What was the blood pressure reading?"
   🤖 A: The recorded blood pressure is Physical exam: blood pressure is 158/96 mmHg, pulse is 88 bpm..
   💬 Q: "Are there any drug interactions?"
   🤖 A: Warning: Contraindicated Pair: WARFARIN + IBUPROFEN...
7️⃣ Testing Clinical Note Export...
   ✅ Export format verified successfully!

🎉 ALL 7 ECHODOC TESTS PASSED WITH 100% SUCCESS!
```

---

## ⚖️ License
MIT License. Created by Akmal Khan for the AssemblyAI Voice Agent Hackathon 2026.
