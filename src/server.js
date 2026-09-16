import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { AssemblyAIStreamingClient } from './assemblyai_client.js';
import { AssemblyAIVoiceAgentClient } from './voice_agent_client.js';
import { ClinicalEngine } from './clinical_engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local project .env first, then fallback to master hackathons .env
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// Shared clinical engine instance
const clinicalEngine = new ClinicalEngine();

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // REST API Routes
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'EchoDoc Voice Agent',
      timestamp: new Date().toISOString(),
      hasApiKey: Boolean(process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_api_key_here'),
      mockMode: process.env.MOCK_STREAMING === 'true' || !process.env.ASSEMBLYAI_API_KEY
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

    fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', {
      headers: { 'Authorization': apiKey }
    })
      .then(resp => resp.json())
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, isMock: true, token: 'fallback-token' }));
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

    fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
      .then(resp => resp.json())
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, isMock: true, token: 'fallback-agent-token' }));
      });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

// Create WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs) => {
  console.log('🔗 [Server] Web Client connected to /ws');

  let assemblyClient = null;
  let voiceAgentClient = null;
  let activeMode = 'STT'; // 'STT' | 'VOICE_AGENT'

  // Helper to send JSON packet to browser client
  const sendToClient = (type, payload = {}) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...payload }));
    }
  };

  clientWs.on('message', async (data, isBinary) => {
    // 1. Binary Audio Frame from browser mic / audio worklet
    if (isBinary) {
      if (activeMode === 'VOICE_AGENT' && voiceAgentClient) {
        voiceAgentClient.sendAudio(data);
      } else if (activeMode === 'STT' && assemblyClient) {
        assemblyClient.sendAudio(data);
      }
      return;
    }

    // 2. Control Messages (JSON)
    try {
      const msg = JSON.parse(data.toString());

      // --- AMBIENT CLINICAL SCRIBE (STT v3) ---
      if (msg.action === 'START_SESSION') {
        activeMode = 'STT';
        clinicalEngine.reset();
        assemblyClient = new AssemblyAIStreamingClient(process.env.ASSEMBLYAI_API_KEY, {
          sampleRate: 16000
        });

        assemblyClient.on('partial_transcript', (data) => {
          sendToClient('PARTIAL_TRANSCRIPT', { text: data.text });
        });

        assemblyClient.on('final_transcript', (data) => {
          sendToClient('FINAL_TRANSCRIPT', { text: data.text, speaker: data.speaker });

          // Process clinical cues into SOAP notes and sentinel alerts
          const updates = clinicalEngine.processUtterance(data.text, data.speaker || 'Clinician');
          if (updates) {
            if (updates.newSoapItems.length > 0) {
              sendToClient('SOAP_UPDATE', {
                items: updates.newSoapItems,
                currentSoap: clinicalEngine.soapNotes
              });
            }
            if (updates.newAlerts.length > 0) {
              sendToClient('SAFETY_ALERTS', { alerts: updates.newAlerts });
            }
          }
        });

        assemblyClient.on('error', (err) => {
          sendToClient('ERROR', { message: err.message });
        });

        await assemblyClient.connect();
        sendToClient('SESSION_STARTED', {
          isMock: assemblyClient.isMock,
          mode: 'STT',
          message: assemblyClient.isMock 
            ? 'Running in local simulator mode. Click "Run Simulated Consultation" or speak with microphone.' 
            : 'Connected directly to live AssemblyAI Streaming v3 WebSocket (Universal-3.5-Pro).'
        });
      }

      else if (msg.action === 'STOP_SESSION') {
        if (assemblyClient) {
          assemblyClient.disconnect();
          assemblyClient = null;
        }
        sendToClient('SESSION_STOPPED', {
          soapNotes: clinicalEngine.soapNotes,
          activeAlerts: clinicalEngine.activeSafetyAlerts
        });
      }

      // --- CONVERSATIONAL VOICE AGENT (Voice Agent API v1) ---
      else if (msg.action === 'START_VOICE_AGENT') {
        activeMode = 'VOICE_AGENT';
        voiceAgentClient = new AssemblyAIVoiceAgentClient(process.env.ASSEMBLYAI_API_KEY, {
          clinicalEngine,
          voice: msg.voice || 'anna'
        });

        voiceAgentClient.on('session_ready', (ev) => {
          sendToClient('VOICE_AGENT_READY', {
            sessionId: ev.sessionId,
            voice: voiceAgentClient.voice,
            message: 'Voice Agent initialized. Speak into your microphone to talk to EchoDoc.'
          });
        });

        voiceAgentClient.on('user_speech_started', () => {
          sendToClient('USER_SPEECH_STARTED');
        });

        voiceAgentClient.on('user_transcript_delta', (ev) => {
          sendToClient('USER_TRANSCRIPT_DELTA', { text: ev.text });
        });

        voiceAgentClient.on('user_transcript_final', (ev) => {
          sendToClient('USER_TRANSCRIPT_FINAL', { text: ev.text });
        });

        voiceAgentClient.on('agent_reply_started', () => {
          sendToClient('AGENT_REPLY_STARTED');
        });

        voiceAgentClient.on('agent_reply_audio', (ev) => {
          // Stream 24kHz PCM16 audio to browser for instant speaker playback
          sendToClient('AGENT_REPLY_AUDIO', {
            audio: ev.data,
            format: ev.format
          });
        });

        voiceAgentClient.on('agent_transcript', (ev) => {
          sendToClient('AGENT_TRANSCRIPT', { text: ev.text });
        });

        voiceAgentClient.on('agent_reply_done', (ev) => {
          sendToClient('AGENT_REPLY_DONE', {
            status: ev.status,
            interrupted: ev.interrupted
          });
        });

        voiceAgentClient.on('tool_executed', (ev) => {
          sendToClient('TOOL_EXECUTED', {
            name: ev.name,
            args: ev.args,
            result: ev.result
          });
          // Also sync any updated SOAP state
          sendToClient('SOAP_UPDATE', {
            currentSoap: clinicalEngine.soapNotes
          });
        });

        voiceAgentClient.on('error', (err) => {
          sendToClient('ERROR', { message: err.message });
        });

        await voiceAgentClient.connect();
      }

      else if (msg.action === 'STOP_VOICE_AGENT') {
        if (voiceAgentClient) {
          voiceAgentClient.disconnect();
          voiceAgentClient = null;
        }
        sendToClient('VOICE_AGENT_STOPPED');
      }

      // --- VOICE COPILOT TEXT QUERY ---
      else if (msg.action === 'ASK_COPILOT') {
        const query = msg.query || '';
        const answer = clinicalEngine.answerClinicalQuery(query);
        sendToClient('COPILOT_ANSWER', {
          query,
          answer,
          timestamp: new Date().toISOString()
        });
      }

      else if (msg.action === 'RUN_SIMULATION') {
        // Built-in realistic clinical consultation replay
        runClinicalSimulation(sendToClient);
      }

      else if (msg.action === 'INTERRUPT') {
        sendToClient('INTERRUPTED', { message: 'Assistant voice playback halted immediately (barge-in).' });
      }

    } catch (err) {
      console.error('❌ [Server] Failed processing client message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('🔌 [Server] Web Client disconnected');
    if (assemblyClient) {
      assemblyClient.disconnect();
      assemblyClient = null;
    }
    if (voiceAgentClient) {
      voiceAgentClient.disconnect();
      voiceAgentClient = null;
    }
  });
});

/**
 * Executes a simulated clinical consultation with realistic timing
 * Demonstrates real-time STT, progressive SOAP updates, and contraindication alert.
 */
function runClinicalSimulation(sendToClient) {
  clinicalEngine.reset();
  sendToClient('SESSION_STARTED', { isMock: true, message: 'Simulating live medical consultation encounter...' });

  const script = [
    {
      speaker: 'Doctor',
      partial: 'Good morning, Mrs. Davis. How can I...',
      final: 'Good morning, Mrs. Davis. What brings you into the clinic today?'
    },
    {
      speaker: 'Patient',
      partial: 'Doctor, I have been having this severe headache...',
      final: 'Doctor, I have been having this severe headache and dizziness for the past 4 days, especially when waking up.'
    },
    {
      speaker: 'Doctor',
      partial: 'Let me check your blood pressure...',
      final: 'Let us take your vital signs. Your blood pressure is 158/96 mmHg and heart rate is 88 bpm.'
    },
    {
      speaker: 'Doctor',
      partial: 'Looking at your chart, you take Warfarin...',
      final: 'I see in your chart that you take Warfarin 5mg daily for your history of deep vein thrombosis.'
    },
    {
      speaker: 'Patient',
      partial: 'Yes, and my knee has been aching, so I took Ibuprofen...',
      final: 'Yes, exactly. And my knee has been aching badly, so I took Ibuprofen 800mg yesterday to help with the joint pain.'
    },
    {
      speaker: 'Doctor',
      partial: 'My assessment is essential hypertension stage two...',
      final: 'My assessment is essential hypertension stage two, and we must urgently address your medications.'
    },
    {
      speaker: 'Doctor',
      partial: 'We will prescribe Lisinopril 10mg daily and discontinue Ibuprofen...',
      final: 'Let us start you on Lisinopril 10mg daily. Discontinue Ibuprofen immediately due to severe bleeding risks with Warfarin, and schedule a follow-up in 2 weeks.'
    }
  ];

  let step = 0;
  const interval = setInterval(() => {
    if (step >= script.length) {
      clearInterval(interval);
      sendToClient('SIMULATION_COMPLETED', {
        summary: 'Consultation concluded. Full SOAP note generated with clinical safety audit.'
      });
      return;
    }

    const current = script[step];

    // Emit partial transcript first (sub-second streaming feel)
    sendToClient('PARTIAL_TRANSCRIPT', { text: current.partial });

    setTimeout(() => {
      // Emit finalized transcript
      sendToClient('FINAL_TRANSCRIPT', { text: current.final, speaker: current.speaker });

      // Run clinical extraction
      const updates = clinicalEngine.processUtterance(current.final, current.speaker);
      if (updates) {
        if (updates.newSoapItems.length > 0) {
          sendToClient('SOAP_UPDATE', {
            items: updates.newSoapItems,
            currentSoap: clinicalEngine.soapNotes
          });
        }
        if (updates.newAlerts.length > 0) {
          sendToClient('SAFETY_ALERTS', { alerts: updates.newAlerts });
        }
      }
    }, 800);

    step++;
  }, 2200);
}

// Start Server
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 EchoDoc Voice Agent Server running on http://localhost:${PORT}`);
  console.log(`🎙️  WebSocket Endpoint: ws://localhost:${PORT}/ws`);
  console.log(`📋 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`======================================================\n`);
});
