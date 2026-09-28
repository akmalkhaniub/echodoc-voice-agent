# Scratch narration track

These `.wav` files are **placeholder Windows-TTS narration for timing only** — a robotic
scratch track, not submission-quality voice. Regenerate them any time with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/make_narration.ps1
```

(The generated `.wav` files are gitignored; the generator script is committed.)

## Files (match the beats in `docs/DEMO_VIDEO_SCRIPT.md`)
| File | Use |
| :--- | :--- |
| `00_full_voiceover.wav` | Continuous narration (~2 min), excludes the two spoken-to-app questions |
| `01_problem.wav` | 0:00–0:25 intro |
| `02_what_it_does.wav` | 0:25–0:55 architecture |
| `03_demo_intro.wav` | ingest → transcript/chapters/summary |
| `04_question_one.wav` | spoken question: "What do the autonomous drones actually do?" |
| `05_demo_grounding.wav` | tool-call + citation + barge-in |
| `06_question_two.wav` | spoken question: "What did they say about the stock market?" |
| `07_demo_refusal.wav` | it declines the off-topic question |
| `08_close.wav` | metrics + close |

## How to use it
1. Screen-record the app (`npm run dev` → drive the flow in `DEMO_VIDEO_SCRIPT.md`).
2. Drop these WAVs onto the timeline to lock timing, then **replace them with your own voice**
   for the final cut. The per-segment files let you nudge each beat independently.
