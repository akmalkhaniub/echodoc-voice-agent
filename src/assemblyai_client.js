import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * AssemblyAI Streaming Real-Time Client
 * Connects to wss://api.assemblyai.com/v2/realtime/ws
 * Pushes raw 16kHz Linear PCM audio chunks and streams back partial & final transcripts.
 */
export class AssemblyAIStreamingClient extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();
    this.apiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
    this.sampleRate = options.sampleRate || 16000;
    this.wordBoost = options.wordBoost || [
      'warfarin', 'lisinopril', 'sildenafil', 'nitroglycerin',
      'metformin', 'hypertension', 'systolic', 'diastolic', 'SOAP'
    ];
    this.ws = null;
    this.isConnected = false;
    this.isMock = options.isMock || !this.apiKey || this.apiKey === 'your_assemblyai_api_key_here' || process.env.MOCK_STREAMING === 'true';
  }

  /**
   * Connect to AssemblyAI Streaming WebSocket
   */
  async connect() {
    if (this.isMock) {
      console.log('⚡ [AssemblyAI Client] Running in Mock/Simulator Mode (No API key required)');
      this.isConnected = true;
      this.emit('open', { sessionId: 'mock-session-' + Date.now(), isMock: true });
      return;
    }

    return new Promise((resolve, reject) => {
      const url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${this.sampleRate}&word_boost=${encodeURIComponent(JSON.stringify(this.wordBoost))}`;

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: this.apiKey
        }
      });

      this.ws.on('open', () => {
        console.log('✅ [AssemblyAI Client] Connected to real-time streaming endpoint');
        this.isConnected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          this.handleIncomingMessage(response);
        } catch (err) {
          console.error('❌ [AssemblyAI Client] Parse error:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('❌ [AssemblyAI Client] WebSocket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 [AssemblyAI Client] Closed with code ${code}: ${reason}`);
        this.isConnected = false;
        this.emit('close', { code, reason });
      });
    });
  }

  /**
   * Route incoming AssemblyAI frames to event emitters
   */
  handleIncomingMessage(msg) {
    if (msg.message_type === 'SessionBegins') {
      this.emit('session_begins', msg);
    } else if (msg.message_type === 'PartialTranscript') {
      if (msg.text && msg.text.trim().length > 0) {
        this.emit('partial_transcript', {
          text: msg.text,
          confidence: msg.confidence,
          timestamp: Date.now()
        });
      }
    } else if (msg.message_type === 'FinalTranscript') {
      if (msg.text && msg.text.trim().length > 0) {
        this.emit('final_transcript', {
          text: msg.text,
          confidence: msg.confidence,
          words: msg.words || [],
          timestamp: Date.now()
        });
      }
    } else if (msg.message_type === 'SessionTerminated') {
      this.emit('session_terminated', msg);
    }
  }

  /**
   * Stream raw 16kHz linear PCM audio buffer to AssemblyAI
   * @param {Buffer|Uint8Array} pcmBuffer 
   */
  sendAudio(pcmBuffer) {
    if (this.isMock) {
      // In mock mode, the audio stream triggers simulated transcript steps
      return;
    }

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const base64Audio = Buffer.from(pcmBuffer).toString('base64');
    const payload = JSON.stringify({ audio_data: base64Audio });
    this.ws.send(payload);
  }

  /**
   * Terminate session gracefully
   */
  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ terminate_session: true }));
      this.ws.close();
    }
    this.isConnected = false;
  }
}
