# 🎬 EchoDoc — 3-Minute Video Demonstration Script
**AssemblyAI Voice Agent Hackathon 2026 Submission Video**  
*Target Video Length: 2 minutes 45 seconds (Max 5 mins allowed)*

---

### 🕒 Timeline Breakdown
* **0:00 – 0:30 (30s):** The Problem & Executive Intro
* **0:30 – 1:00 (30s):** The EchoDoc Dual-Pipeline Architecture
* **1:00 – 2:15 (75s):** Live Working Prototype Demonstration
  * Ambient Scribe in action (SOAP notes generating sub-second)
  * Real-time Contraindication Sentinel intercepting lethal drug hazard
  * Two-way Spoken Dialogue with Voice Copilot (`anna` voice & barge-in)
* **2:15 – 2:45 (30s):** Under The Hood & Closing

---

## 🎙️ Video Recording Script (Word-for-Word)

### Segment 1: The Problem & Introduction (0:00 – 0:30)
**[Visual: Presenter on camera or Slide 1 Cover]**
> *"Hi everyone! Clinicians today spend two full hours typing notes in electronic health records for every single hour they spend with patients. This administrative burden causes historic physician burnout, detracts from patient empathy, and worst of all—hasty documentation often leads to missed drug-drug interactions that endanger patient lives.*
>
> *Introducing **EchoDoc**—a sub-second clinical voice scribe and conversational diagnostic copilot powered by AssemblyAI."*

---

### Segment 2: The Solution & Architecture (0:30 – 1:00)
**[Visual: Slide 3 Architecture / Dual Pipeline]**
> *"EchoDoc is built on a dual-pipeline Voice AI architecture:*
> *First, our **Ambient Clinical Scribe** uses AssemblyAI's flagship **Universal-3.5-Pro Streaming API** with `domain: "medical-v1"` and speaker diarization. It passively listens to doctor-patient conversations and extracts structured SOAP notes in real time.*
> *Second, our **Voice Diagnostic Copilot** leverages AssemblyAI’s **Voice Agent API** for full-duplex spoken dialogue, clinical tool calling, and instant barge-in interruptibility.*
>
> *Let's see it live!"*

---

### Segment 3: Live Application Demonstration (1:00 – 2:15)
**[Visual: Screen recording of EchoDoc Web Dashboard at `http://localhost:3000` or public URL]**

#### A. Ambient Clinical Scribing
**[Action: Click "Simulate Encounter" or "Live Ambient Scribe" and speak into mic]**
> *"Here is the EchoDoc clinical dashboard. When a consultation begins, audio streams at 16kHz via WebSockets directly to AssemblyAI.
> Notice how quickly words are transcribed. In under 600 milliseconds, our clinical inference engine parses the dialogue into four structured SOAP quadrants: Subjective symptoms, Objective vitals, Clinical Assessment, and Treatment Plan.*
>
> *Look at the Objective quadrant: blood pressure 158 over 96 is captured instantly."*

#### B. Real-Time Contraindication Sentinel
**[Action: Doctor prescribes Warfarin, then patient mentions taking Ibuprofen]**
> *"Now watch what happens when a dangerous medication is mentioned.
> The doctor prescribes Warfarin, and the patient mentions taking Ibuprofen yesterday for knee pain.
> Immediately, a bright red Contraindication Alert triggers at the top of the screen!
> EchoDoc warns the clinician of a severe GI bleeding risk before a prescription is ever signed."*

#### C. Spoken Dialogue with Voice Copilot
**[Action: Click "Talk to Voice Copilot". Ask verbally: "EchoDoc, what was the patient's blood pressure?"]**
> *"Now, the physician wants to consult the AI assistant.
> I click 'Talk to Voice Copilot' to launch AssemblyAI's Voice Agent API.*
>
> **Doctor (Speaking):** 'EchoDoc, what was the blood pressure reading?'
> **EchoDoc AI (Anna Voice):** 'The recorded blood pressure is 158 over 96 mmHg with a pulse of 88 beats per minute.'
>
> **Doctor (Speaking):** 'Are there any drug interactions with Warfarin?'
> **EchoDoc AI (Anna Voice):** 'Warning: Concomitant use of Warfarin with Ibuprofen presents a severe hemorrhage risk due to impaired platelet aggregation.'
>
> *Notice that if I speak while EchoDoc is talking, the assistant halts its audio output immediately with hardware-level barge-in."*

---

### Segment 4: Under The Hood & Closing (2:15 – 2:45)
**[Visual: GitHub repository + terminal test logs]**
> *"Under the hood, EchoDoc uses:
> - AssemblyAI Universal-3.5-Pro Streaming STT (v3)
> - AssemblyAI Voice Agent API (v1) with flat-schema clinical tool execution
> - Node.js ESM microservices with zero-cost Cloudflare and Docker deployment
>
> All 12 automated integration tests pass with 100% reliability.
>
> EchoDoc brings empathy back to healthcare by letting doctors talk to their patients while AI handles the charting and guards their safety.
>
> Thank you to AssemblyAI and Lablab.ai!"*

---

### 🛠️ Recording Checklist for the Creator:
1. Open [`http://localhost:3000`](http://localhost:3000) in full screen (F11 or maximize).
2. Set microphone permissions to allowed.
3. Keep OBS Studio or Loom set to 1080p (1920x1080) at 60 FPS.
4. Record audio in a quiet room so the voice agent answers crisply.
5. Export as MP4 and upload to YouTube as Unlisted/Public for the Lablab submission.
