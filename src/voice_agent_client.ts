import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { ClinicalEngine } from './clinical_engine.js';

export interface VoiceAgentOptions {
  token?: string | null;
  voice?: string;
  clinicalEngine?: ClinicalEngine | null;
  isMock?: boolean;
  connectTimeoutMs?: number;
}

export interface ToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, any>;
}

/**
 * AssemblyAI Managed Voice Agent Client (2026 Voice Agent API).
 * Full-duplex speech-in / speech-out with STT + LLM + TTS + turn detection + tools.
 * Endpoint: wss://agents.assemblyai.com/v1/ws  (Auth: Bearer <API_KEY>)
 */
export class AssemblyAIVoiceAgentClient extends EventEmitter {
  apiKey: string | undefined;
  token: string | null;
  voice: string;
  clinicalEngine: ClinicalEngine | null;
  ws: WebSocket | null;
  isConnected: boolean;
  sessionId: string | null;
  isReady: boolean;
  connectTimeoutMs: number;
  isMock: boolean;

  constructor(apiKey?: string, options: VoiceAgentOptions = {}) {
    super();
    this.apiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
    this.token = options.token || null;
    this.voice = options.voice || 'anna';
    this.clinicalEngine = options.clinicalEngine || null;
    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;
    this.isReady = false;
    this.connectTimeoutMs = options.connectTimeoutMs || 12000;
    this.isMock =
      options.isMock ||
      !this.apiKey ||
      this.apiKey === 'your_assemblyai_api_key_here' ||
      process.env.MOCK_STREAMING === 'true';
  }

  /** Connect and initialize Voice Agent session */
  async connect(): Promise<void> {
    if (this.isMock) {
      console.log('⚡ [Voice Agent Client] Running in Mock Mode');
      this.isConnected = true;
      this.isReady = true;
      this.sessionId = 'mock-agent-' + Date.now();
      this.emit('session_ready', { sessionId: this.sessionId, isMock: true });
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const url = this.token
        ? `wss://agents.assemblyai.com/v1/ws?token=${this.token}`
        : 'wss://agents.assemblyai.com/v1/ws';

      const headers: Record<string, string> = {};
      if (this.apiKey && !this.token) headers['Authorization'] = `Bearer ${this.apiKey}`;

      this.ws = new WebSocket(url, { headers });

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const err = new Error(`Voice Agent connection timed out after ${this.connectTimeoutMs}ms (no session.ready)`);
        try { this.ws?.terminate(); } catch { /* ignore */ }
        this.emit('error', err);
        reject(err);
      }, this.connectTimeoutMs);

      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      this.ws.on('open', () => {
        console.log('✅ [Voice Agent Client] WebSocket connected, sending session.update...');
        this.isConnected = true;
        this.sendSessionUpdate();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          this.handleIncomingEvent(JSON.parse(data.toString()), resolveOnce);
        } catch (err) {
          console.error('❌ [Voice Agent Client] JSON parse error:', err);
        }
      });

      this.ws.on('error', (err: Error) => {
        console.error('❌ [Voice Agent Client] WebSocket error:', err.message);
        this.emit('error', err);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`🔌 [Voice Agent Client] Closed with code ${code}: ${reason}`);
        this.isConnected = false;
        this.isReady = false;
        this.emit('close', { code, reason });
      });
    });
  }

  /** Configure agent persona, voice, greeting, and clinical tools */
  sendSessionUpdate(): void {
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
          turn_detection: { vad_threshold: 0.5, min_silence: 200, max_silence: 1000, interrupt_response: true }
        },
        output: { voice: this.voice, format: { encoding: 'audio/pcm' } },
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

  /** Handle Voice Agent API event stream */
  handleIncomingEvent(event: any, resolveConnect?: () => void): void {
    if (event.type === 'session.ready') {
      this.sessionId = event.session_id;
      this.isReady = true;
      console.log(`🎉 [Voice Agent Client] Session ready: ${this.sessionId}`);
      this.emit('session_ready', { sessionId: this.sessionId });
      resolveConnect?.();
    } else if (event.type === 'input.speech.started') {
      this.emit('user_speech_started');
    } else if (event.type === 'transcript.user.delta') {
      this.emit('user_transcript_delta', { text: event.delta });
    } else if (event.type === 'transcript.user') {
      this.emit('user_transcript_final', { text: event.transcript });
    } else if (event.type === 'reply.started') {
      this.emit('agent_reply_started');
    } else if (event.type === 'reply.audio') {
      this.emit('agent_reply_audio', { data: event.data, format: 'pcm16_24khz' });
    } else if (event.type === 'transcript.agent') {
      this.emit('agent_transcript', { text: event.transcript });
    } else if (event.type === 'reply.done') {
      this.emit('agent_reply_done', { status: event.status, interrupted: event.status === 'interrupted' });
    } else if (event.type === 'tool.call') {
      void this.executeToolCall(event);
    }
  }

  /** Execute a flat-schema tool call and send tool.result back to AssemblyAI */
  async executeToolCall(toolCall: ToolCall): Promise<void> {
    const { call_id, name, arguments: args } = toolCall;
    console.log(`🛠️ [Voice Agent Client] Tool Call received: ${name}`, args);

    let result: Record<string, any> = { status: 'success' };

    try {
      if (name === 'check_contraindications') {
        const drugs: string[] = args.drugs || [];
        if (this.clinicalEngine && typeof this.clinicalEngine.checkDrugs === 'function') {
          const alerts = this.clinicalEngine.checkDrugs(drugs);
          result = {
            hasHazard: alerts.length > 0,
            alerts: alerts.map((a) => `${a.severity}: ${a.title} - ${a.description}`),
            testedDrugs: drugs
          };
        } else {
          result = { hasHazard: false, message: 'Clinical engine not connected', testedDrugs: drugs };
        }
      } else if (name === 'get_clinical_summary') {
        if (this.clinicalEngine) {
          const section = args.section || 'all';
          result = {
            section,
            soapNotes: section === 'all' ? this.clinicalEngine.soapNotes : (this.clinicalEngine.soapNotes as any)[section],
            activeAlerts: this.clinicalEngine.activeSafetyAlerts.map((a) => a.title)
          };
        } else {
          result = { message: 'No active clinical notes' };
        }
      }

      console.log(`✅ [Voice Agent Client] Sending tool.result for ${name}:`, result);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'tool.result', call_id, result: JSON.stringify(result) }));
      }
      this.emit('tool_executed', { name, args, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ [Voice Agent Client] Tool execution error for ${name}:`, err);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'tool.result', call_id, result: JSON.stringify({ error: message }) }));
      }
    }
  }

  /** Send PCM16 24kHz audio chunk from user (base64 string or binary buffer) */
  sendAudio(audioData: string | Buffer | Uint8Array): void {
    if (this.isMock || !this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const base64Audio = typeof audioData === 'string' ? audioData : Buffer.from(audioData).toString('base64');
    this.ws.send(JSON.stringify({ type: 'input.audio', audio: base64Audio }));
  }

  /** Disconnect cleanly */
  disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.isConnected = false;
    this.isReady = false;
  }
}
