# EchoDoc — 3-Minute Demo Script (turnkey)

Goal: a judge sees a real, sub-second, interruptible clinical voice agent and the
measured latency proving it. Record at 1080p, landscape, with the latency HUD visible.

## Pre-flight (2 min before recording)
1. `ASSEMBLYAI_API_KEY` set (real key). Optional: `LOG_JSON=true` for clean logs.
2. `npm run build && npm start` → open `http://localhost:3000`.
3. Confirm the header shows **Connected** and the latency HUD reads `turn — p95 — barge —`.
4. Quiet room, good mic, browser mic permission pre-granted.
5. Open `/api/metrics` in a second tab to show the numbers at the end.

## Beat sheet (3:00)

**0:00–0:20 — Hook.** "Clinicians spend 2 hours on notes for every hour with patients.
EchoDoc listens to the consultation and writes the SOAP note live — and you can *talk* to
it, sub-second, hands-free." Show the clean dashboard.

**0:20–1:10 — Ambient scribe (real STT).** Click **Live Ambient Scribe**. Speak a short
consultation: chief complaint → vitals ("BP 158 over 96") → meds ("patient takes Warfarin…
took Ibuprofen"). Point out: partial transcripts appear instantly; the four SOAP cards fill
live; the **contraindication alert** fires on Warfarin + Ibuprofen. This is the safety hook.

**1:10–2:10 — Voice copilot (real agent + barge-in).** Click **Talk to Voice Copilot**.
Ask aloud: "What was the blood pressure?" → agent answers by voice. Then **interrupt it
mid-sentence** — audio stops instantly. Call out the HUD: **turnaround p95** and
**barge-in** numbers updating live. This is the "it's actually real-time" proof.

**2:10–2:40 — Latency proof.** Cut to the `/api/metrics` tab: show `turnaroundMs.p95`
under the 1200 ms SLO and `bargeInMs.p95` under 200 ms. "Not a mockup — measured."

**2:40–3:00 — Close.** Click **Export Note** → the generated SOAP markdown downloads.
"Real-time transcription, a safety net, and a finished note — in one pass. Built on
AssemblyAI Universal-3.5-Pro streaming and the Voice Agent API."

## What to say about the numbers
- Turnaround = time from you finishing speaking to the agent's first audio byte.
- Barge-in = time from you starting to speak to the agent's audio stopping.
- Both are measured server-side per turn and surfaced on the HUD and `/api/metrics`.

## Failure-proofing
- No key / offline: the app runs the built-in simulator — click **Simulate Encounter**
  to still show the SOAP + alert flow (say up-front it's the offline simulator).
- Network blip mid-demo: the client shows "Reconnecting…" then "reconnected" — mention
  the auto-reconnect as a robustness feature rather than hiding it.
