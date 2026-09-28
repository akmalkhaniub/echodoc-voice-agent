#!/usr/bin/env bash
# Assembles the VoxDive demo video from captured frames + narration + real agent audio.
# Requires the ffmpeg static build under .tools/. Outputs docs/demo/voxdive_demo.mp4.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd -W)"   # Windows-style path (G:/...) for the native ffmpeg
FF="$ROOT/.tools/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe"
FR="$ROOT/.tools/frames"
NA="$ROOT/docs/demo/narration"
WORK="$ROOT/.tools/build"
OUT="$ROOT/docs/demo/voxdive_demo.mp4"
rm -rf "$WORK"; mkdir -p "$WORK/aud"

# 1) Normalize every source clip to 48kHz stereo s16 so concat is clean.
norm() { "$FF" -y -loglevel error -i "$1" -ar 48000 -ac 2 -c:a pcm_s16le "$WORK/aud/$2"; }
norm "$NA/01_problem.wav"                n01.wav
norm "$NA/02_what_it_does.wav"           n02.wav
norm "$NA/03_demo_intro.wav"             n03.wav
norm "$NA/05_demo_grounding.wav"         n05.wav
norm "$NA/07_demo_refusal.wav"           n07.wav
norm "$NA/08_close.wav"                  n08.wav
norm "$NA/q_interceptors.wav"            q_int.wav
norm "$NA/q_mona.wav"                    q_mona.wav
norm "$NA/agent_reply_interceptors.wav"  a_int.wav
norm "$NA/agent_reply_refusal.wav"       a_ref.wav

# 2) Build per-scene audio by concatenating pieces (identical params → -c copy).
cat_aud() { # $1=out  $2..=inputs
  local out="$1"; shift
  local list="$WORK/${out%.wav}.txt"; : > "$list"
  for f in "$@"; do echo "file '$WORK/aud/$f'" >> "$list"; done
  "$FF" -y -loglevel error -f concat -safe 0 -i "$list" -c copy "$WORK/aud/$out"
}
cat_aud s1.wav n01.wav
cat_aud s2.wav n02.wav
cat_aud s3.wav n03.wav
cat_aud s4.wav q_int.wav a_int.wav n05.wav
cat_aud s5.wav q_mona.wav a_ref.wav n07.wav
cat_aud s6.wav n08.wav

# 3) Build per-scene video: still image for the length of its audio, with a slow zoom.
scene() { # $1=img  $2=aud  $3=out
  "$FF" -y -loglevel error -loop 1 -i "$FR/$1" -i "$WORK/aud/$2" \
    -filter_complex "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v]" \
    -map "[v]" -map 1:a -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "$WORK/$3"
}
scene 1_cover.png   s1.wav scene1.mp4
scene 2_landing.png s2.wav scene2.mp4
scene 3_loaded.png  s3.wav scene3.mp4
scene 4_answer.png  s4.wav scene4.mp4
scene 5_refusal.png s5.wav scene5.mp4
scene 1_cover.png   s6.wav scene6.mp4

# 4) Concatenate all scenes into the final cut.
SL="$WORK/scenes.txt"; : > "$SL"
for i in 1 2 3 4 5 6; do echo "file '$WORK/scene$i.mp4'" >> "$SL"; done
"$FF" -y -loglevel error -f concat -safe 0 -i "$SL" -c copy "$OUT"

DUR=$("$ROOT/.tools/ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$OUT" 2>/dev/null || echo "?")
echo "BUILT $OUT (${DUR}s)"
