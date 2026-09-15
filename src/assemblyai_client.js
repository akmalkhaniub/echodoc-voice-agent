import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * AssemblyAI Streaming Real-Time Client (Universal-3.5-Pro / v3 ready)
 * Connects to wss://streaming.assemblyai.com/v3/ws or v2 fallback endpoint
 * Pushes raw 16kHz Linear PCM audio chunks and streams back partial & final transcripts.
 */
export class AssemblyAIStreamingClient extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();
    this.apiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
    this.token = options.token || null;
    this.sampleRate = options.sampleRate || 16000;
    this.speechModel = options.speechModel || 'universal-3-5-pro';
    this.wordBoost = options.wordBoost || [
      'warfarin', 'lisinopril', 'sildenafil', 'nitroglycerin',
      'metformin', 'hypertension', 'systolic', 'diastolic', 'SOAP', 'vital signs'
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
      console.log('⚡ [AssemblyAI Client] Running in Mock/Simulator Mode (Universal-3.5-Pro emulation)');
      this.isConnected = true;
      this.emit('open', { sessionId: 'mock-session-' + Date.now(), isMock: true });
      return;
    }

    return new Promise((resolve, reject) => {
      // Latest AssemblyAI v3 streaming WebSocket URL
      const v3Params = new URLSearchParams({
        sample_rate: this.sampleRate.toString(),
        encoding: 'pcm_s16le',
        speech_model: this.speechModel
      });

      if (this.token) {
        v3Params.set('token', this.token);
      }

      const v3Url = `wss://streaming.assemblyai.com/v3/ws?${v3Params.toString()}`;
      
      const headers = {};
      if (this.apiKey && !this.token) {
        headers['Authorization'] = this.apiKey;
      }

      this.ws = new WebSocket(v3Url, { headers });

      this.ws.on('open', () => {
        console.log(`✅ [AssemblyAI Client] Connected to v3 streaming endpoint (${this.speechModel})`);
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
   * Route incoming AssemblyAI frames to event emitters (handles both v3 and v2 shapes)
   */
  handleIncomingMessage(msg) {
    // Session initialization
    if (msg.message_type === 'SessionBegins' || msg.message_type === 'SessionBegin' || msg.type === 'SessionBegin') {
      this.emit('session_begins', msg);
    }
    // Partial transcript / Interim turn
    else if (msg.message_type === 'PartialTranscript' || (msg.type === 'Turn' && !msg.end_of_turn)) {
      const text = msg.text || msg.transcript || '';
      if (text.trim().length > 0) {
        this.emit('partial_transcript', {
          text,
          confidence: msg.confidence || 0.95,
          timestamp: Date.now()
        });
      }
    }
    // Final transcript / Completed turn
    else if (msg.message_type === 'FinalTranscript' || (msg.type === 'Turn' && msg.end_of_turn)) {
      const text = msg.text || msg.transcript || '';
      if (text.trim().length > 0) {
        this.emit('final_transcript', {
          text,
          confidence: msg.confidence || 0.98,
          words: msg.words || [],
          timestamp: Date.now()
        });
      }
    }
    // Session Termination
    else if (msg.message_type === 'SessionTerminated' || msg.type === 'SessionTerminated') {
      this.emit('session_terminated', msg);
    }
  }

  /**
   * Stream raw 16kHz linear PCM audio buffer to AssemblyAI
   * Supports both binary WebSocket frames and base64 JSON encapsulation
   * @param {Buffer|Uint8Array} pcmBuffer 
   */
  sendAudio(pcmBuffer) {
    if (this.isMock) {
      return;
    }

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // AssemblyAI v3 supports direct binary PCM16 transmission
    if (Buffer.isBuffer(pcmBuffer) || pcmBuffer instanceof Uint8Array) {
      this.ws.send(pcmBuffer);
    } else {
      const base64Audio = Buffer.from(pcmBuffer).toString('base64');
      this.ws.send(JSON.stringify({ audio_data: base64Audio }));
    }
  }

  /**
   * Terminate session gracefully
   */
  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ terminate_session: true }));
      } catch (_) {}
      this.ws.close();
    }
    this.isConnected = false;
  }
}
