# 📋 EchoDoc — Lablab.ai Official Submission Form Content
*Copy and paste these exact fields directly into the Lablab.ai hackathon submission form.*

---

### 1. Basic Information
* **Project Title:**
  `EchoDoc — Sub-Second Clinical Voice Scribe & Diagnostic Copilot`

* **Short Description (under 255 chars):**
  `EchoDoc is a dual-pipeline Voice AI clinical workspace combining AssemblyAI Universal-3.5-Pro Streaming for real-time SOAP note generation with the Voice Agent API for spoken doctor copilot Q&A, clinical tool execution, and drug interaction sentinels.`

* **Technology Tags:**
  `AssemblyAI Voice Agent API`, `Universal-3.5-Pro`, `Speech-to-Text`, `Real-Time Audio`, `WebSockets`, `Healthcare AI`, `Clinical Decision Support`, `Node.js`, `Docker`

* **Category Tags:**
  `Healthcare / Biotech`, `Productivity`, `Voice Agents`, `Developer Tooling`

---

### 2. Long Description (Comprehensive Write-up)

```markdown
### The Problem: The Physician Burnout Crisis & Silent Medication Errors
Modern clinicians spend up to two hours documenting in electronic health records (EHRs) for every single hour of direct patient contact. This administrative burden leads to widespread clinical burnout, diminished bedside empathy, and late-night "pajama time" charting. Worse still, in rapid-paced consultations, dangerous medication contraindications are often overlooked until after prescriptions are dispensed.

### The Solution: EchoDoc Dual-Pipeline Architecture
EchoDoc transforms clinical encounters by deploying a two-way, dual-pipeline Voice AI workspace powered exclusively by AssemblyAI's newest 2026 infrastructure:

1. **Ambient Clinical Scribing (AssemblyAI Universal-3.5-Pro Streaming v3):**
   - Continuously ingests 16kHz microphone audio through browser Web Audio AudioWorklets.
   - Utilizes AssemblyAI's `domain: "medical-v1"` tuning, sub-second `min_latency` mode, and speaker diarization.
   - Automatically parses clinical dialogue into real-time 4-quadrant structured SOAP notes: Subjective complaints, Objective vitals (e.g. BP 158/96 mmHg), Clinical Assessment, and Treatment Plans.

2. **Conversational Diagnostic Copilot (AssemblyAI Voice Agent API v1):**
   - Provides a full-duplex conversational voice assistant with natural speech output (`anna` voice).
   - Equips clinicians with flat-schema clinical tools (`check_contraindications`, `get_clinical_summary`) executed directly against the local clinical inference engine.
   - Features hardware-level barge-in interruptibility: speaking immediately halts assistant audio playback without awkward delays.

3. **Active Pharmacology Safety Sentinel:**
   - Evaluates detected medications against critical Drug-Drug Interaction (DDI) rules in real time.
   - Instantly intercepts lethal combinations (e.g. Warfarin + NSAIDs, Sildenafil + Nitrates) with bright visual alerts and proactive voice warnings before the clinician finishes the consultation.

### Key Technological Innovations
- **Sub-600ms Turn Finalization:** Zero perceived latency for live clinical transcription.
- **Ephemeral Token Minting:** Browser clients connect securely via short-lived tokens minted by the backend without ever exposing raw API keys.
- **Graceful Lifecycle Management:** Automatic `{ type: "Terminate" }` protocol preventing orphan WebSocket charges.
- **One-Click Clinical Markdown Export:** Instant export to standardized markdown notes ready for EHR ingestion.
- **Zero-Cost Free Tier Deployment:** Built with automated Cloudflare Tunnels, Docker containers, and Hugging Face Space templates for cost-free demo accessibility.

### Conclusion & Impact
EchoDoc restores humanity to healthcare by allowing doctors to maintain eye contact with their patients while AI handles the documentation and guards patient safety.
```

---

### 3. Submission Links & Assets
* **Public GitHub Repository:**
  `https://github.com/akmalkhaniub/echodoc-voice-agent`

* **Cover Image File:**
  Attach [`docs/assets/cover.jpg`](file:///g:/ReplitProjects/hackathons/assemblyai-voice-agent/docs/assets/cover.jpg) (16:9 4K render).

* **Slide Presentation (Pitch Deck):**
  Export [`docs/pitch_deck.html`](file:///g:/ReplitProjects/hackathons/assemblyai-voice-agent/docs/pitch_deck.html) to PDF via browser print.

* **Live Demo Application:**
  Launch using `npm run tunnel` to obtain a public `https://*.trycloudflare.com` URL for judges.
