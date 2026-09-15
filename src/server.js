import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { AssemblyAIStreamingClient } from './assemblyai_client.js';
import { ClinicalEngine } from './clinical_engine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

  if (req.url === '/api/token' && req.method === 'GET') {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey || apiKey === 'your_assemblyai_api_key_here') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: 'mock-ephemeral-token-' + Date.now(), isMock: true }));
      return;
    }

    // Request ephemeral token from AssemblyAI
    fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expires_in: 480 })
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

  // Helper to send JSON packet to browser client
  const sendToClient = (type, payload = {}) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...payload }));
    }
  };

  clientWs.on('message', async (data, isBinary) => {
    // 1. Binary Audio Frame (16kHz PCM from browser AudioWorklet / Mic)
    if (isBinary) {
      if (assemblyClient) {
        assemblyClient.sendAudio(data);
      }
      return;
    }

    // 2. Control Messages (JSON)
    try {
      const msg = JSON.parse(data.toString());

      if (msg.action === 'START_SESSION') {
        clinicalEngine.reset();
        assemblyClient = new AssemblyAIStreamingClient(process.env.ASSEMBLYAI_API_KEY, {
          sampleRate: 16000
        });

        assemblyClient.on('partial_transcript', (data) => {
          sendToClient('PARTIAL_TRANSCRIPT', { text: data.text });
        });

        assemblyClient.on('final_transcript', (data) => {
          sendToClient('FINAL_TRANSCRIPT', { text: data.text });

          // Process clinical cues
          const updates = clinicalEngine.processUtterance(data.text, 'Clinician');
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
          message: assemblyClient.isMock 
            ? 'Running in local simulator mode. Click "Run Simulated Consultation" or speak with microphone.' 
            : 'Connected directly to live AssemblyAI Streaming WebSocket.'
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
