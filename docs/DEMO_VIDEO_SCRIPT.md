# 🎬 VoxDive — 3-Minute Video Demonstration Script
**AssemblyAI Voice Agent Hackathon 2026 Submission Video**
*Target length: ~2:45 (5:00 max)*

---

### 🕒 Timeline
* **0:00 – 0:25** — The problem & intro
* **0:25 – 0:55** — What VoxDive does + architecture
* **0:55 – 2:15** — Live demo (ingest → chapters/summary → talk to it)
* **2:15 – 2:45** — Under the hood & honest close

---

## 🎙️ Word-for-word script

### Segment 1 — The problem (0:00 – 0:25)
**[Visual: you on camera, or the VoxDive landing screen]**
> "There are billions of hours of podcasts and videos out there — and the only way to search them is by *title*. If you want to know what someone actually *said* at minute 34, you're stuck scrubbing a timeline.
>
> Meet **VoxDive** — it lets you *talk to* any video or podcast, out loud, and get answers grounded in exactly what was said."

### Segment 2 — What it does (0:25 – 0:55)
**[Visual: architecture slide — STT → diarization → chapters → LeMUR → Voice Agent]**
> "VoxDive is built entirely on AssemblyAI. Paste a media URL and it runs **async speech-to-text with speaker diarization and auto-chapters**, then **LeMUR** — which is Claude-powered — writes the summary and answers questions. Finally, the **Voice Agent API** turns that transcript into something you can have a real spoken conversation with — with interruption and sub-second replies."

### Segment 3 — Live demo (0:55 – 2:15)
**[Visual: screen recording of the app]**
> "Here's a podcast about ocean cleanup. I paste the link and hit **Transcribe**."

**[Show: transcript populating with speaker labels; chapters + summary appear in the left rail]**
> "In seconds I get a **diarized transcript**, an **auto-chaptered outline**, and a **one-paragraph summary** — none of which I had to write."

**[Click: 'Talk to this video'. Speak into the mic:]**
> 🗣️ *"What do the autonomous drones actually do?"*

**[Show: VoxDive answers out loud; the tool-call chip shows `search_transcript`; the answer cites a timestamp]**
> "It answered *from the transcript*, and cited the timestamp — because every answer goes through a `search_transcript` tool. Watch what happens when I interrupt it —"

**[Speak over the agent to trigger barge-in; show the latency HUD]**
> "— it stops instantly. And here's the thing that makes it honest:"

**[Speak:]**
> 🗣️ *"What did they say about the stock market?"*
> "The podcast never mentions it — so VoxDive says so, instead of making something up."

### Segment 4 — Under the hood & close (2:15 – 2:45)
**[Visual: README status table / metrics]**
> "It's TypeScript, strict, with a 98% covered logic core and a live latency HUD. With no API key it runs on a bundled sample so anyone can try it. Everything you saw — transcription, diarization, chapters, summary, and the voice conversation — is AssemblyAI end to end.
>
> That's **VoxDive** — stop scrubbing timelines, and just ask. Thanks for watching."

---

## 🎥 Recording checklist
- Set `ASSEMBLYAI_API_KEY` so the badge reads **Live AssemblyAI** (or demo the sample offline and say so).
- Run `npm run dev`, open `http://localhost:3000`.
- Have one real media URL ready (a Creative-Commons talk or your own upload). If you use the yt-dlp helper, use content you're licensed to use.
- Mic on; do the interrupt (barge-in) beat — it's the memorable moment.
- Show the "it won't answer beyond the transcript" refusal — that's the trust beat.
