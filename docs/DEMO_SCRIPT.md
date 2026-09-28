# VoxDive — 3-Minute Demo Script (turnkey)

Goal: a judge sees any video turned into a diarized transcript + chapters + summary, then
*talks to it* and gets grounded, timestamp-cited answers — and sees it refuse to make things up.
Record at 1080p, landscape, with the latency HUD visible.

## Pre-flight (2 min before recording)
1. `ASSEMBLYAI_API_KEY` set (real key) so the badge reads **Live AssemblyAI**. (Or demo the bundled sample offline and say so.)
2. `npm run dev` → open `http://localhost:3000`. Confirm the header shows **Connected**.
3. Have one media URL ready — a Creative-Commons talk or your own upload (or use `npm run fetch:youtube` on content you're licensed to use).
4. Quiet room, good mic, browser mic permission pre-granted.

## Beat sheet (3:00)

**0:00–0:20 — Hook.** "There are billions of hours of podcasts and video, and you can only
search them by title. VoxDive lets you *talk to* any of them." Show the clean landing screen.

**0:20–1:00 — Ingest (real STT).** Paste the URL, hit **Transcribe**. As it completes, point
out the left rail filling in: a **diarized transcript**, an **auto-chaptered outline**, and a
**one-paragraph summary** — "none of which I wrote; that's AssemblyAI STT, diarization, and
LeMUR."

**1:00–2:05 — Talk to it (Voice Agent + grounding).** Click **Talk to this video**. Ask aloud:
"What did they actually conclude about X?" The agent answers by voice; show the `search_transcript`
tool chip and the **timestamp citation** in the answer. Then **interrupt it mid-sentence** — audio
stops instantly; call out the **turnaround / barge-in** numbers on the HUD.

**2:05–2:35 — The trust beat.** Ask something the video never covers ("what did they say about
the stock market?"). VoxDive says it isn't covered instead of inventing an answer. "That's the
whole point — it's grounded in the transcript through a tool call."

**2:35–3:00 — Close.** Click **Export** → the transcript + summary + chapters download as Markdown.
"Transcription, diarization, chapters, summary, and a grounded voice conversation — all AssemblyAI,
end to end. Stop scrubbing timelines. Just ask."

## What to say about the numbers
- Turnaround = time from you finishing speaking to the agent's first audio byte.
- Barge-in = time from you starting to speak to the agent's audio stopping.
- Both are measured server-side per turn and shown on the HUD and `/api/metrics`.

## Failure-proofing
- No key / offline: click **Try the sample** to run the whole flow on the bundled *Deep Currents*
  transcript (say up-front it's the offline sample).
- Network blip mid-demo: the client shows "Reconnecting…" then reconnects — mention the
  auto-reconnect as a robustness feature rather than hiding it.
