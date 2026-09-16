import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * AssemblyAI Managed Voice Agent Client (2026 Voice Agent API)
 * Full-duplex speech-in / speech-out with STT + LLM + TTS + turn detection + tool calling.
 * Endpoint: wss://agents.assemblyai.com/v1/ws
 * Auth: Authorization: Bearer <API_KEY>
 * Audio format: PCM16 mono 24 kHz base64-encoded
 */
export class AssemblyAIVoiceAgentClient extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();
    this.apiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
    this.token = options.token || null;
    this.voice = options.voice || 'anna'; // Authoritative live voice ID
    this.clinicalEngine = options.clinicalEngine || null;
    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;
    this.isReady = false;
    this.isMock = options.isMock || !this.apiKey || this.apiKey === 'your_assemblyai_api_key_here' || process.env.MOCK_STREAMING === 'true';
  }

  /**
   * Connect and initialize Voice Agent session
   */
  async connect() {
    if (this.isMock) {
      console.log('⚡ [Voice Agent Client] Running in Mock Mode');
      this.isConnected = true;
      this.isReady = true;
      this.sessionId = 'mock-agent-' + Date.now();
      this.emit('session_ready', { sessionId: this.sessionId, isMock: true });
      return;
    }

    return new Promise((resolve, reject) => {
      const url = this.token
        ? `wss://agents.assemblyai.com/v1/ws?token=${this.token}`
        : 'wss://agents.assemblyai.com/v1/ws';

      const headers = {};
      if (this.apiKey && !this.token) {
        // Bearer prefix is REQUIRED on Voice Agent API
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      this.ws = new WebSocket(url, { headers });

      this.ws.on('open', () => {
        console.log('✅ [Voice Agent Client] WebSocket connected, sending session.update...');
        this.isConnected = true;
        this.sendSessionUpdate();
      });

      this.ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleIncomingEvent(event, resolve);
        } catch (err) {
          console.error('❌ [Voice Agent Client] JSON parse error:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('❌ [Voice Agent Client] WebSocket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 [Voice Agent Client] Closed with code ${code}: ${reason}`);
        this.isConnected = false;
        this.isReady = false;
        this.emit('close', { code, reason });
      });
    });
  }

  /**
   * Configure agent persona, voice, greeting, and clinical tools
   */
  sendSessionUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const sessionUpdate = {
      type: 'session.update',
      session: {
        system_prompt: 'You are EchoDoc, an expert AI clinical diagnostic copilot. You assist doctors during patient consultations by answering clinical queries, reviewing vitals, and checking medication contraindications concisely and accurately. Keep your verbal replies concise, professional, and clinical.',
        greeting: 'Hello Doctor, EchoDoc is ready. How can I assist with your consultation today?',
        input: {
          format: { encoding: 'audio/pcm' },
          keyterms: [
            'warfarin', 'lisinopril', 'ibuprofen', 'metformin', 'sildenafil',
            'nitroglycerin', 'hypertension', 'systolic', 'diastolic', 'SOAP notes'
          ],
          turn_detection: {
            vad_threshold: 0.5,
            min_silence: 200,
            max_silence: 1000,
            interrupt_response: true
          }
        },
        output: {
          voice: this.voice,
          format: { encoding: 'audio/pcm' }
        },
        tools: [
          {
            type: 'function',
            name: 'check_contraindications',
            description: 'Check for severe drug-drug interactions in current consultation or for specified drugs',
            parameters: {
              type: 'object',
              properties: {
                drugs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of drugs to evaluate, e.g. ["warfarin", "ibuprofen"]'
                }
              },
              required: ['drugs']
            }
          },
          {
            type: 'function',
            name: 'get_clinical_summary',
            description: 'Retrieve current structured SOAP clinical notes and recorded vitals',
            parameters: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  enum: ['all', 'subjective', 'objective', 'assessment', 'plan'],
                  description: 'Which SOAP section to retrieve'
                }
              }
            }
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(sessionUpdate));
  }

  /**
   * Handle Voice Agent API event stream
   */
  handleIncomingEvent(event, resolveConnect) {
    // 1. Session Ready
    if (event.type === 'session.ready') {
      this.sessionId = event.session_id;
      this.isReady = true;
      console.log(`🎉 [Voice Agent Client] Session ready: ${this.sessionId}`);
      this.emit('session_ready', { sessionId: this.sessionId });
      if (resolveConnect) resolveConnect();
    }

    // 2. User Speech events
    else if (event.type === 'input.speech.started') {
      this.emit('user_speech_started');
    }
    else if (event.type === 'transcript.user.delta') {
      this.emit('user_transcript_delta', { text: event.delta });
    }
    else if (event.type === 'transcript.user') {
      this.emit('user_transcript_final', { text: event.transcript });
    }

    // 3. Agent Speech & Audio playback
    else if (event.type === 'reply.started') {
      this.emit('agent_reply_started');
    }
    else if (event.type === 'reply.audio') {
      // NOTE: event carries audio in 'data' field (not 'audio')
      this.emit('agent_reply_audio', {
        data: event.data, // base64 PCM16 24kHz
        format: 'pcm16_24khz'
      });
    }
    else if (event.type === 'transcript.agent') {
      this.emit('agent_transcript', { text: event.transcript });
    }
    else if (event.type === 'reply.done') {
      const isInterrupted = event.status === 'interrupted';
      this.emit('agent_reply_done', {
        status: event.status,
        interrupted: isInterrupted
      });
    }

    // 4. Clinical Tool Calls
    else if (event.type === 'tool.call') {
      this.executeToolCall(event);
    }
  }

  /**
   * Execute flat-schema tool call and send tool.result back to AssemblyAI
   */
  async executeToolCall(toolCall) {
    const { call_id, name, arguments: args } = toolCall;
    console.log(`🛠️ [Voice Agent Client] Tool Call received: ${name}`, args);

    let result = { status: 'success' };

    try {
      if (name === 'check_contraindications') {
        const drugs = args.drugs || [];
        if (this.clinicalEngine && typeof this.clinicalEngine.checkDrugs === 'function') {
          const alerts = this.clinicalEngine.checkDrugs(drugs);
          result = {
            hasHazard: alerts.length > 0,
            alerts: alerts.map(a => `${a.severity}: ${a.title} - ${a.description}`),
            testedDrugs: drugs
          };
        } else {
          result = { hasHazard: false, message: 'Clinical engine not connected', testedDrugs: drugs };
        }
      }

      else if (name === 'get_clinical_summary') {
        if (this.clinicalEngine) {
          const section = args.section || 'all';
          result = {
            section,
            soapNotes: section === 'all' ? this.clinicalEngine.soapNotes : this.clinicalEngine.soapNotes[section],
            activeAlerts: this.clinicalEngine.activeSafetyAlerts.map(a => a.title)
          };
        } else {
          result = { message: 'No active clinical notes' };
        }
      }

      console.log(`✅ [Voice Agent Client] Sending tool.result for ${name}:`, result);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'tool.result',
          call_id,
          result: JSON.stringify(result)
        }));
      }

      this.emit('tool_executed', { name, args, result });

    } catch (err) {
      console.error(`❌ [Voice Agent Client] Tool execution error for ${name}:`, err);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'tool.result',
          call_id,
          result: JSON.stringify({ error: err.message })
        }));
      }
    }
  }

  /**
   * Send PCM16 24kHz audio chunk from user
   * @param {string|Buffer} audioData - base64 string or binary buffer
   */
  sendAudio(audioData) {
    if (this.isMock || !this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const base64Audio = typeof audioData === 'string'
      ? audioData
      : Buffer.from(audioData).toString('base64');

    this.ws.send(JSON.stringify({
      type: 'input.audio',
      audio: base64Audio
    }));
  }

  /**
   * Disconnect cleanly
   */
  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.isConnected = false;
    this.isReady = false;
  }
}
