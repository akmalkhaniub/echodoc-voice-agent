/**
 * Optional helper: extract an audio file from a YouTube URL with yt-dlp so it
 * can be handed to VoxDive / AssemblyAI as a media URL.
 *
 * ⚠️  ToS NOTE: Downloading audio from YouTube may violate YouTube's Terms of
 * Service depending on the video and your use. Use this ONLY on content you own
 * or that is licensed for reuse (e.g. Creative Commons). VoxDive's primary,
 * unambiguous path is a direct audio/media URL — this script is a convenience
 * for local experimentation, not a core dependency.
 *
 * Requires yt-dlp on PATH:  https://github.com/yt-dlp/yt-dlp
 *
 * Usage:
 *   npm run fetch:youtube -- "https://www.youtube.com/watch?v=..." [outDir]
 *
 * It prints the local audio file path. To transcribe it with AssemblyAI you
 * still need a publicly reachable URL (upload the file, or use AssemblyAI's
 * file-upload endpoint); this script deliberately stops at local extraction.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const url = process.argv[2];
const outDir = process.argv[3] || path.resolve('media');

if (!url) {
  console.error('Usage: npm run fetch:youtube -- "<youtube-url>" [outDir]');
  process.exit(1);
}

if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
  console.error('Refusing: not a YouTube URL. For other sources, pass the direct audio URL straight to VoxDive.');
  process.exit(1);
}

const hasYtDlp = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8' }).status === 0;
if (!hasYtDlp) {
  console.error('yt-dlp not found on PATH. Install it from https://github.com/yt-dlp/yt-dlp');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const outTemplate = path.join(outDir, '%(title)s.%(ext)s');

console.log('⚠️  Ensure this video is yours or licensed for reuse before downloading (YouTube ToS).');
console.log(`⬇️  Extracting audio from ${url} …`);

const res = spawnSync(
  'yt-dlp',
  ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outTemplate, url],
  { stdio: 'inherit' }
);

if (res.status !== 0) {
  console.error('yt-dlp failed.');
  process.exit(res.status || 1);
}

console.log(`\n✅ Audio saved under ${outDir}.`);
console.log('Next: make it reachable by URL (upload it), then paste that URL into VoxDive.');
