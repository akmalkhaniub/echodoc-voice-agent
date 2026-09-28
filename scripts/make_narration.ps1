# Generates scratch narration WAVs from the demo script using Windows built-in TTS.
# Robotic placeholder voice for TIMING only — replace with your own recording.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/make_narration.ps1
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

# Prefer a clearer voice if installed; otherwise fall back to the default.
$preferred = @('Microsoft Zira Desktop','Microsoft David Desktop','Microsoft Hazel Desktop')
foreach ($v in $preferred) {
  try { $synth.SelectVoice($v); break } catch {}
}
$synth.Rate = 0      # -10..10 ; 0 is natural
$synth.Volume = 100

$outDir = Join-Path $PSScriptRoot '..\docs\demo\narration'
$outDir = [System.IO.Path]::GetFullPath($outDir)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$segments = [ordered]@{
  '01_problem' = "There are billions of hours of podcasts and videos out there, and the only way to search them is by title. If you want to know what someone actually said at minute thirty-four, you're stuck scrubbing a timeline. Meet VoxDive. It lets you talk to any video or podcast, out loud, and get answers grounded in exactly what was said."
  '02_what_it_does' = "VoxDive is built entirely on AssemblyAI. Paste a media URL and it runs asynchronous speech to text, with speaker diarization and auto chapters. Then LeMUR, which is Claude powered, writes the summary and answers questions. Finally, the Voice Agent API turns that transcript into something you can have a real spoken conversation with, with interruption and sub second replies."
  '03_demo_intro' = "Here's a podcast about ocean cleanup. I paste the link and hit Transcribe. In seconds I get a diarized transcript, an auto chaptered outline, and a one paragraph summary. None of which I had to write. Now I click, Talk to this video, and ask it a question out loud."
  '04_question_one' = "What do the autonomous drones actually do?"
  '05_demo_grounding' = "It answered from the transcript, and cited the timestamp, because every answer goes through a search transcript tool. Watch what happens when I interrupt it. It stops instantly. And here's the thing that makes it honest."
  '06_question_two' = "What did they say about the stock market?"
  '07_demo_refusal' = "The podcast never mentions it, so VoxDive says so, instead of making something up."
  '08_close' = "It's TypeScript, strict, with a ninety eight percent covered logic core and a live latency meter. With no A P I key it runs on a bundled sample so anyone can try it. Everything you saw, transcription, diarization, chapters, summary, and the voice conversation, is AssemblyAI end to end. That's VoxDive. Stop scrubbing timelines, and just ask. Thanks for watching."
}

# Also build one continuous voiceover track (narration only, excludes the two spoken questions).
$fullVo = @('01_problem','02_what_it_does','03_demo_intro','05_demo_grounding','07_demo_refusal','08_close')

foreach ($key in $segments.Keys) {
  $path = Join-Path $outDir "$key.wav"
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($segments[$key])
  Write-Output "wrote $key.wav"
}

# Continuous VO
$fullPath = Join-Path $outDir '00_full_voiceover.wav'
$synth.SetOutputToWaveFile($fullPath)
foreach ($k in $fullVo) { $synth.Speak($segments[$k]); $synth.Speak(' ') }
Write-Output "wrote 00_full_voiceover.wav"

Write-Output ("voice used: " + $synth.Voice.Name)
$synth.SetOutputToNull()
$synth.Dispose()
