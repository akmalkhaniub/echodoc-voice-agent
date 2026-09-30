import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { AssemblyAIVoiceAgentClient } from './voice_agent_client.js';
import { VideoContext } from './video_context.js';
import { TranscriptService } from './transcript_service.js';
import { SAMPLE_TRANSCRIPT } from './sample_content.js';
import { NASA_DEMO } from './nasa_demo_content.js';
import { BriefingContext } from './briefing_context.js';
import { BRIEFING_FEED } from './briefing_content.js';
import { resolveSafePath, isMockMode } from './util.js';
import { LatencyTracker, TurnClock } from './metrics.js';
import { log } from './logger.js';

// Server-wide latency aggregates (exposed on /api/health and /api/metrics).
const turnaroundMs = new LatencyTracker();
const bargeInMs = new LatencyTracker();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local project .env first, then fallback to master hackathons .env
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

type SendToClient = (type: string, payload?: Record<string, unknown>) => void;

function hasApiKey(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_api_key_here');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'VoxDive',
      timestamp: new Date().toISOString(),
      hasApiKey: hasApiKey(),
      mockMode: isMockMode(),
      latency: { turnaroundMs: turnaroundMs.summary(), bargeInMs: bargeInMs.summary() }
    }));
    return;
  }

  // Prometheus-friendly latency metrics.
  if (req.url === '/api/metrics' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      turnaroundMs: turnaroundMs.summary(),
      bargeInMs: bargeInMs.summary(),
      slo: { turnaroundP95TargetMs: 1200, bargeInP95TargetMs: 200 }
    }));
    return;
  }

  // Voice Agent API token minting (browser connects to AssemblyAI directly).
  if (req.url === '/api/token/agent' && req.method === 'GET') {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey || apiKey === 'your_assemblyai_api_key_here') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: 'mock-agent-token-' + Date.now(), isMock: true }));
      return;
    }

    fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300', { headers: { Authorization: `Bearer ${apiKey}` } })
      .then(async (resp) => {
        const data: any = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.token) {
          res.writeHead(resp.status || 502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: data.error || `Upstream token request failed (${resp.status})` }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch((err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // Static File Serving (path-traversal safe)
  const filePath = resolveSafePath(PUBLIC_DIR, req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      const code = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
      res.writeHead(code, { 'Content-Type': 'text/plain' });
      res.end(code === 404 ? '404 Not Found' : 'Internal Server Error');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs: WebSocket) => {
  log.info('ws_client_connected');

  // Per-connection state so concurrent viewers never collide.
  const videoContext = new VideoContext();
  const transcriptService = new TranscriptService(process.env.ASSEMBLYAI_API_KEY);
  let voiceAgentClient: AssemblyAIVoiceAgentClient | null = null;
  let turnClock: TurnClock | null = null;
  let briefingContext: BriefingContext | null = null;   // set in briefing mode

  const sendToClient: SendToClient = (type, payload = {}) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...payload }));
    }
  };

  sendToClient('HELLO', {
    mockMode: isMockMode(),
    hasApiKey: hasApiKey(),
    sampleTitle: SAMPLE_TRANSCRIPT.title,
    slo: { turnaroundP95TargetMs: 1200, bargeInP95TargetMs: 200 }
  });

  const sendTranscriptReady = (source: string) => {
    const r = videoContext.result;
    if (!r) return;
    sendToClient('TRANSCRIPT_READY', {
      source,
      title: r.title,
      sourceUrl: r.sourceUrl,
      durationSec: r.durationSec,
      summary: r.summary,
      chapters: r.chapters,
      segments: r.segments,
      speakers: r.speakers,
      entities: r.entities,
      isMock: r.isMock
    });
  };

  const sendBriefingReady = () => {
    if (!briefingContext) return;
    sendToClient('BRIEFING_READY', {
      count: briefingContext.count,
      briefing: briefingContext.briefingText(),
      videos: briefingContext.videos.map((v) => ({
        id: v.id, title: v.title, sourceUrl: v.sourceUrl, durationSec: v.durationSec,
        summary: v.summary, speakers: v.speakers, chapters: v.chapters, segments: v.segments, entities: v.entities
      }))
    });
  };

  clientWs.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
    if (isBinary) {
      // Only the voice agent consumes mic audio.
      if (voiceAgentClient) voiceAgentClient.sendAudio(data as Buffer);
      return;
    }

    try {
      const msg = JSON.parse(data.toString());

      if (msg.action === 'INGEST_VIDEO') {
        briefingContext = null;
        const url = String(msg.url || '').trim();
        sendToClient('TRANSCRIBING', {
          url,
          isMock: transcriptService.isMock,
          message: transcriptService.isMock
            ? 'No API key set — loading the bundled sample transcript so you can try the full experience offline.'
            : 'Submitting media to AssemblyAI (speech-to-text + diarization + auto-chapters)…'
        });
        try {
          const result = await transcriptService.transcribe(url, { title: msg.title });
          videoContext.load(result);
          sendTranscriptReady('ingest');
        } catch (err) {
          sendToClient('ERROR', { scope: 'ingest', message: (err as Error).message });
        }
      } else if (msg.action === 'LOAD_SAMPLE') {
        briefingContext = null;
        videoContext.load({ ...SAMPLE_TRANSCRIPT });
        sendTranscriptReady('sample');
      } else if (msg.action === 'LOAD_NASA_DEMO') {
        briefingContext = null;
        videoContext.load({ ...NASA_DEMO });
        sendTranscriptReady('nasa');
      } else if (msg.action === 'LOAD_BRIEFING') {
        briefingContext = new BriefingContext([NASA_DEMO, ...BRIEFING_FEED]);
        sendBriefingReady();
      } else if (msg.action === 'START_VOICE_AGENT') {
        if (!briefingContext && !videoContext.hasTranscript) {
          sendToClient('ERROR', { scope: 'agent', message: 'Load a video or briefing before starting the voice agent.' });
          return;
        }
        turnClock = new TurnClock();
        voiceAgentClient = new AssemblyAIVoiceAgentClient(process.env.ASSEMBLYAI_API_KEY, briefingContext ? { briefingContext, voice: msg.voice || 'anna' } : { videoContext, voice: msg.voice || 'anna' });
        const groundLabel = briefingContext ? `your briefing (${briefingContext.count} videos)` : `"${videoContext.title}"`;

        voiceAgentClient.on('session_ready', (ev: any) => sendToClient('VOICE_AGENT_READY', {
          sessionId: ev.sessionId,
          voice: voiceAgentClient?.voice,
          title: briefingContext ? 'Briefing' : videoContext.title,
          message: `Voice agent ready. Ask me anything about ${groundLabel}.`
        }));
        voiceAgentClient.on('user_speech_started', () => {
          sendToClient('USER_SPEECH_STARTED');
          const haltMs = turnClock?.markBargeIn();
          if (haltMs != null) {
            bargeInMs.add(haltMs);
            log.info('barge_in', { haltMs, p95: bargeInMs.summary().p95 });
            sendToClient('INTERRUPTED', { haltMs, summary: bargeInMs.summary() });
          }
        });
        voiceAgentClient.on('user_transcript_delta', (ev: any) => sendToClient('USER_TRANSCRIPT_DELTA', { text: ev.text }));
        voiceAgentClient.on('user_transcript_final', (ev: any) => {
          sendToClient('USER_TRANSCRIPT_FINAL', { text: ev.text });
          turnClock?.markUserStop(); // start the turnaround stopwatch
        });
        voiceAgentClient.on('agent_reply_started', () => {
          sendToClient('AGENT_REPLY_STARTED');
          turnClock?.markReplyStart();
        });
        voiceAgentClient.on('agent_reply_audio', (ev: any) => {
          const turnaround = turnClock?.markFirstAudio();
          if (turnaround != null) {
            turnaroundMs.add(turnaround);
            log.info('turnaround', { ms: turnaround, p95: turnaroundMs.summary().p95 });
            sendToClient('LATENCY', { turnaroundMs: turnaround, summary: turnaroundMs.summary() });
          }
          sendToClient('AGENT_REPLY_AUDIO', { audio: ev.data, format: ev.format });
        });
        voiceAgentClient.on('agent_transcript', (ev: any) => sendToClient('AGENT_TRANSCRIPT', { text: ev.text }));
        voiceAgentClient.on('agent_reply_done', (ev: any) => {
          turnClock?.markReplyDone();
          sendToClient('AGENT_REPLY_DONE', { status: ev.status, interrupted: ev.interrupted });
        });
        voiceAgentClient.on('tool_executed', (ev: any) => sendToClient('TOOL_EXECUTED', { name: ev.name, args: ev.args, result: ev.result }));
        voiceAgentClient.on('error', (err: Error) => sendToClient('ERROR', { scope: 'agent', message: err.message }));
        voiceAgentClient.on('reconnecting', (ev: any) => sendToClient('RECONNECTING', { scope: 'agent', ...ev }));
        voiceAgentClient.on('reconnected', () => sendToClient('RECONNECTED', { scope: 'agent' }));

        await voiceAgentClient.connect();
      } else if (msg.action === 'STOP_VOICE_AGENT') {
        if (voiceAgentClient) { voiceAgentClient.disconnect(); voiceAgentClient = null; }
        sendToClient('VOICE_AGENT_STOPPED');
      } else if (msg.action === 'ASK_COPILOT') {
        const query = String(msg.query || '');
        if (briefingContext) {
          // Cross-video grounded answer, with per-video LeMUR when live.
          let answer: string | null = null;
          if (!transcriptService.isMock) {
            const ids = briefingContext.videos.map((v) => v.id).filter((i) => !i.startsWith('sample-') && !i.startsWith('nasa-scientific'));
            if (ids.length) answer = await transcriptService.askMany(ids, query);
          }
          const grounded = briefingContext.answerQuery(query);
          sendToClient('COPILOT_ANSWER', {
            query,
            answer: answer || grounded.answer,
            citations: grounded.citations,
            engine: answer ? 'lemur' : 'local-retrieval',
            timestamp: new Date().toISOString()
          });
        } else {
          // Single-video: prefer LeMUR when live; fall back to local retrieval.
          let answer: string | null = null;
          const id = videoContext.result?.id;
          if (id && !transcriptService.isMock) answer = await transcriptService.ask(id, query);
          const grounded = answer == null ? videoContext.answerQuery(query) : { answer, citations: videoContext.search(query, 3).map((h) => ({ start: h.start, end: h.end, speaker: h.speaker, text: h.text })) };
          sendToClient('COPILOT_ANSWER', { query, answer: grounded.answer, citations: grounded.citations, engine: answer == null ? 'local-retrieval' : 'lemur', timestamp: new Date().toISOString() });
        }
      } else if (msg.action === 'EXPORT_NOTE') {
        sendToClient('EXPORT_DATA', { markdown: briefingContext ? briefingContext.exportMarkdown() : videoContext.exportMarkdown() });
      } else if (msg.action === 'RUN_SIMULATION') {
        briefingContext = null;
        runSampleWalkthrough(sendToClient, videoContext);
      } else if (msg.action === 'INTERRUPT') {
        const haltMs = turnClock?.markBargeIn();
        if (haltMs != null) {
          bargeInMs.add(haltMs);
          log.info('barge_in', { haltMs, source: 'client_interrupt', p95: bargeInMs.summary().p95 });
          sendToClient('INTERRUPTED', { haltMs, summary: bargeInMs.summary() });
        } else {
          sendToClient('INTERRUPTED', { message: 'Assistant voice playback halted immediately (barge-in).' });
        }
      }
    } catch (err) {
      log.error('ws_message_failed', { message: (err as Error).message });
    }
  });

  clientWs.on('close', () => {
    log.info('ws_client_disconnected');
    if (voiceAgentClient) { voiceAgentClient.disconnect(); voiceAgentClient = null; }
  });
});

/**
 * Offline walkthrough: loads the bundled sample transcript, "plays back" its
 * diarized segments with realistic timing to show the transcript populating,
 * then runs one scripted grounded Q&A exchange. Fully deterministic, no key.
 */
export function runSampleWalkthrough(sendToClient: SendToClient, videoContext: VideoContext): void {
  videoContext.load({ ...SAMPLE_TRANSCRIPT });
  sendToClient('TRANSCRIBING', {
    isMock: true,
    simulated: true,
    message: 'SIMULATED walkthrough — replaying the bundled "Deep Currents" sample transcript. Not a live AssemblyAI session.'
  });

  const segments = videoContext.segments;
  let step = 0;
  const interval = setInterval(() => {
    if (step >= segments.length) {
      clearInterval(interval);
      sendToClient('TRANSCRIPT_READY', {
        source: 'simulation',
        title: videoContext.title,
        sourceUrl: SAMPLE_TRANSCRIPT.sourceUrl,
        durationSec: SAMPLE_TRANSCRIPT.durationSec,
        summary: videoContext.summary,
        chapters: videoContext.chapters,
        segments: videoContext.segments,
        speakers: videoContext.speakers,
        entities: SAMPLE_TRANSCRIPT.entities,
        isMock: true
      });
      // One scripted grounded exchange so the demo shows a real answer.
      const demoQuery = 'How do river interceptors work?';
      const grounded = videoContext.answerQuery(demoQuery);
      sendToClient('COPILOT_ANSWER', { query: demoQuery, answer: grounded.answer, citations: grounded.citations, engine: 'local-retrieval', timestamp: new Date().toISOString() });
      sendToClient('SIMULATION_COMPLETED', { summary: 'Sample transcript loaded and one grounded answer returned. Start the voice agent to talk to it.' });
      return;
    }
    const seg = segments[step];
    sendToClient('TRANSCRIPT_SEGMENT', { start: seg.start, end: seg.end, speaker: seg.speaker, text: seg.text });
    step++;
  }, 700);
}

// Only start listening when run directly (not when imported by tests).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🌊 VoxDive server running on http://localhost:${PORT}`);
    console.log(`🎙️  WebSocket Endpoint: ws://localhost:${PORT}/ws`);
    console.log(`📋 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🔌 Mode: ${isMockMode() ? 'LOCAL SIMULATOR (no API key)' : 'LIVE AssemblyAI'}`);
    console.log(`======================================================\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n🛑 [Server] Received ${signal}, shutting down gracefully...`);
    wss.clients.forEach((client) => { try { client.close(1001, 'Server shutting down'); } catch { /* ignore */ } });
    server.close(() => { console.log('✅ [Server] Closed. Bye.'); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { server };
