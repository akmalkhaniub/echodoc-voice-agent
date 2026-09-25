import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { AssemblyAIStreamingClient } from './assemblyai_client.js';
import { AssemblyAIVoiceAgentClient } from './voice_agent_client.js';
import { ClinicalEngine } from './clinical_engine.js';
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
      service: 'EchoDoc Voice Agent',
      timestamp: new Date().toISOString(),
      hasApiKey: Boolean(process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_api_key_here'),
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

  // 1. Streaming STT v3 Token Minting (Browser Safe)
  if ((req.url === '/api/token' || req.url === '/api/token/stt') && req.method === 'GET') {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey || apiKey === 'your_assemblyai_api_key_here') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: 'mock-stt-token-' + Date.now(), isMock: true }));
      return;
    }

    fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', { headers: { Authorization: apiKey } })
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

  // 2. Voice Agent API Token Minting (Browser Safe)
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
    '.jpg': 'image/jpeg'
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

  // Per-connection clinical state so concurrent consultations never collide.
  const clinicalEngine = new ClinicalEngine();
  let assemblyClient: AssemblyAIStreamingClient | null = null;
  let voiceAgentClient: AssemblyAIVoiceAgentClient | null = null;
  let turnClock: TurnClock | null = null;
  let activeMode: 'STT' | 'VOICE_AGENT' = 'STT';

  const sendToClient: SendToClient = (type, payload = {}) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...payload }));
    }
  };

  sendToClient('HELLO', {
    mockMode: isMockMode(),
    hasApiKey: Boolean(process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_api_key_here'),
    slo: { turnaroundP95TargetMs: 1200, bargeInP95TargetMs: 200 }
  });

  clientWs.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
    if (isBinary) {
      if (activeMode === 'VOICE_AGENT' && voiceAgentClient) voiceAgentClient.sendAudio(data as Buffer);
      else if (activeMode === 'STT' && assemblyClient) assemblyClient.sendAudio(data as Buffer);
      return;
    }

    try {
      const msg = JSON.parse(data.toString());

      if (msg.action === 'START_SESSION') {
        activeMode = 'STT';
        clinicalEngine.reset();
        assemblyClient = new AssemblyAIStreamingClient(process.env.ASSEMBLYAI_API_KEY, { sampleRate: 16000 });

        assemblyClient.on('partial_transcript', (d: any) => sendToClient('PARTIAL_TRANSCRIPT', { text: d.text }));

        assemblyClient.on('final_transcript', (d: any) => {
          sendToClient('FINAL_TRANSCRIPT', { text: d.text, speaker: d.speaker });
          const updates = clinicalEngine.processUtterance(d.text, d.speaker || 'Clinician');
          if (updates) {
            if (updates.newSoapItems.length > 0) sendToClient('SOAP_UPDATE', { items: updates.newSoapItems, currentSoap: clinicalEngine.soapNotes });
            if (updates.newAlerts.length > 0) sendToClient('SAFETY_ALERTS', { alerts: updates.newAlerts });
          }
        });

        assemblyClient.on('error', (err: Error) => sendToClient('ERROR', { message: err.message }));
        assemblyClient.on('reconnecting', (ev: any) => sendToClient('RECONNECTING', { scope: 'stt', ...ev }));
        assemblyClient.on('reconnected', () => sendToClient('RECONNECTED', { scope: 'stt' }));

        await assemblyClient.connect();
        sendToClient('SESSION_STARTED', {
          isMock: assemblyClient.isMock,
          mode: 'STT',
          message: assemblyClient.isMock
            ? 'Running in local simulator mode. Click "Run Simulated Consultation" or speak with microphone.'
            : 'Connected directly to live AssemblyAI Streaming v3 WebSocket (Universal-3.5-Pro).'
        });
      } else if (msg.action === 'STOP_SESSION') {
        if (assemblyClient) { assemblyClient.disconnect(); assemblyClient = null; }
        sendToClient('SESSION_STOPPED', { soapNotes: clinicalEngine.soapNotes, activeAlerts: clinicalEngine.activeSafetyAlerts });
      } else if (msg.action === 'START_VOICE_AGENT') {
        activeMode = 'VOICE_AGENT';
        turnClock = new TurnClock();
        voiceAgentClient = new AssemblyAIVoiceAgentClient(process.env.ASSEMBLYAI_API_KEY, { clinicalEngine, voice: msg.voice || 'anna' });

        voiceAgentClient.on('session_ready', (ev: any) => sendToClient('VOICE_AGENT_READY', {
          sessionId: ev.sessionId,
          voice: voiceAgentClient?.voice,
          message: 'Voice Agent initialized. Speak into your microphone to talk to EchoDoc.'
        }));
        voiceAgentClient.on('user_speech_started', () => {
          sendToClient('USER_SPEECH_STARTED');
          // Barge-in: user spoke while the agent was replying — measure halt latency.
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
          const updates = clinicalEngine.processUtterance(ev.text, 'Clinician');
          if (updates) {
            if (updates.newSoapItems.length > 0) sendToClient('SOAP_UPDATE', { items: updates.newSoapItems, currentSoap: clinicalEngine.soapNotes });
            if (updates.newAlerts.length > 0) sendToClient('SAFETY_ALERTS', { alerts: updates.newAlerts });
          }
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
        voiceAgentClient.on('tool_executed', (ev: any) => {
          sendToClient('TOOL_EXECUTED', { name: ev.name, args: ev.args, result: ev.result });
          sendToClient('SOAP_UPDATE', { currentSoap: clinicalEngine.soapNotes });
          if (ev.result?.hasHazard && clinicalEngine.activeSafetyAlerts.length > 0) {
            sendToClient('SAFETY_ALERTS', { alerts: clinicalEngine.activeSafetyAlerts });
          }
        });
        voiceAgentClient.on('error', (err: Error) => sendToClient('ERROR', { message: err.message }));
        voiceAgentClient.on('reconnecting', (ev: any) => sendToClient('RECONNECTING', { scope: 'agent', ...ev }));
        voiceAgentClient.on('reconnected', () => sendToClient('RECONNECTED', { scope: 'agent' }));

        await voiceAgentClient.connect();
      } else if (msg.action === 'STOP_VOICE_AGENT') {
        if (voiceAgentClient) { voiceAgentClient.disconnect(); voiceAgentClient = null; }
        sendToClient('VOICE_AGENT_STOPPED');
      } else if (msg.action === 'ASK_COPILOT') {
        const query = msg.query || '';
        sendToClient('COPILOT_ANSWER', { query, answer: clinicalEngine.answerClinicalQuery(query), timestamp: new Date().toISOString() });
      } else if (msg.action === 'EXPORT_NOTE') {
        sendToClient('EXPORT_DATA', {
          markdown: clinicalEngine.exportMarkdown({
            patientName: msg.patientName,
            physicianName: msg.physicianName
          })
        });
      } else if (msg.action === 'RUN_SIMULATION') {
        runClinicalSimulation(sendToClient, clinicalEngine);
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
    if (assemblyClient) { assemblyClient.disconnect(); assemblyClient = null; }
    if (voiceAgentClient) { voiceAgentClient.disconnect(); voiceAgentClient = null; }
  });
});

/**
 * Executes a simulated clinical consultation with realistic timing.
 * Demonstrates real-time STT, progressive SOAP updates, and a contraindication alert.
 */
export function runClinicalSimulation(sendToClient: SendToClient, clinicalEngine: ClinicalEngine): void {
  clinicalEngine.reset();
  sendToClient('SESSION_STARTED', {
    isMock: true,
    simulated: true,
    message: 'SIMULATED encounter — scripted Mrs. Davis consult. This is not a live AssemblyAI session.'
  });
  sendToClient('SOAP_UPDATE', { currentSoap: clinicalEngine.soapNotes, reset: true });

  const script: Array<{ speaker: string; partial: string; final: string }> = [
    { speaker: 'Doctor', partial: 'Good morning, Mrs. Davis. How can I...', final: 'Good morning, Mrs. Davis. What brings you into the clinic today?' },
    { speaker: 'Patient', partial: 'Doctor, I have been having this severe headache...', final: 'Doctor, I have been having this severe headache and dizziness for the past 4 days, especially when waking up.' },
    { speaker: 'Doctor', partial: 'Let me check your blood pressure...', final: 'Let us take your vital signs. Your blood pressure is 158/96 mmHg and heart rate is 88 bpm.' },
    { speaker: 'Doctor', partial: 'Looking at your chart, you take Warfarin...', final: 'I see in your chart that you take Warfarin 5mg daily for your history of deep vein thrombosis.' },
    { speaker: 'Patient', partial: 'Yes, and my knee has been aching, so I took Ibuprofen...', final: 'Yes, exactly. And my knee has been aching badly, so I took Ibuprofen 800mg yesterday to help with the joint pain.' },
    { speaker: 'Doctor', partial: 'My assessment is essential hypertension stage two...', final: 'My assessment is essential hypertension stage two, and we must urgently address your medications.' },
    { speaker: 'Doctor', partial: 'We will prescribe Lisinopril 10mg daily and discontinue Ibuprofen...', final: 'Let us start you on Lisinopril 10mg daily. Discontinue Ibuprofen immediately due to severe bleeding risks with Warfarin, and schedule a follow-up in 2 weeks.' }
  ];

  let step = 0;
  const interval = setInterval(() => {
    if (step >= script.length) {
      clearInterval(interval);
      sendToClient('SIMULATION_COMPLETED', { summary: 'Consultation concluded. Full SOAP note generated with clinical safety audit.' });
      return;
    }

    const current = script[step];
    sendToClient('PARTIAL_TRANSCRIPT', { text: current.partial });

    setTimeout(() => {
      sendToClient('FINAL_TRANSCRIPT', { text: current.final, speaker: current.speaker });
      const updates = clinicalEngine.processUtterance(current.final, current.speaker);
      if (updates) {
        if (updates.newSoapItems.length > 0) sendToClient('SOAP_UPDATE', { items: updates.newSoapItems, currentSoap: clinicalEngine.soapNotes });
        if (updates.newAlerts.length > 0) sendToClient('SAFETY_ALERTS', { alerts: updates.newAlerts });
      }
    }, 800);

    step++;
  }, 2200);
}

// Only start listening when run directly (not when imported by tests).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 EchoDoc Voice Agent Server running on http://localhost:${PORT}`);
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
