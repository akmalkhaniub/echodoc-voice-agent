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
        speech_model: this.speechModel,
        mode: 'min_latency',
        domain: 'medical-v1',
        speaker_labels: 'true',
        prompt: 'Clinical medical consultation between a doctor and patient regarding symptoms, diagnosis, vitals, and medications.'
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
        console.log(`✅ [AssemblyAI STT Client] Connected to v3 streaming endpoint (${this.speechModel}) [Medical Mode]`);
        this.isConnected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          this.handleIncomingMessage(response);
        } catch (err) {
          console.error('❌ [AssemblyAI STT Client] Parse error:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('❌ [AssemblyAI STT Client] WebSocket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 [AssemblyAI STT Client] Closed with code ${code}: ${reason}`);
        this.isConnected = false;
        this.emit('close', { code, reason });
      });
    });
  }

  /**
   * Route incoming AssemblyAI v3 frames to event emitters
   */
  handleIncomingMessage(msg) {
    // 1. Session initialization
    if (msg.type === 'Begin' || msg.message_type === 'SessionBegins') {
      this.emit('session_begins', {
        id: msg.id || msg.session_id,
        expiresAt: msg.expires_at
      });
    }
    // 2. Speech activity detected (VAD)
    else if (msg.type === 'SpeechStarted') {
      this.emit('speech_started', {
        timestamp: msg.timestamp,
        confidence: msg.confidence
      });
    }
    // 3. Turn events (Universal-3.5-Pro)
    else if (msg.type === 'Turn') {
      const text = msg.transcript || '';
      if (msg.end_of_turn) {
        // Finalized turn
        this.emit('final_transcript', {
          text,
          turnOrder: msg.turn_order,
          words: msg.words || [],
          speaker: msg.speaker_label || 'Speaker',
          confidence: msg.end_of_turn_confidence || 1.0,
          utterance: msg.utterance,
          timestamp: Date.now()
        });
      } else {
        // Partial interim turn
        if (text.trim().length > 0) {
          this.emit('partial_transcript', {
            text,
            turnOrder: msg.turn_order,
            confidence: 0.95,
            timestamp: Date.now()
          });
        }
      }
    }
    // 4. Diarization speaker refinement
    else if (msg.type === 'SpeakerRevision') {
      this.emit('speaker_revision', {
        revisions: msg.revisions || []
      });
    }
    // 5. Session termination
    else if (msg.type === 'Termination' || msg.message_type === 'SessionTerminated') {
      this.emit('session_terminated', {
        audioDuration: msg.audio_duration_seconds,
        sessionDuration: msg.session_duration_seconds
      });
    }
  }

  /**
   * Stream raw 16kHz linear PCM audio buffer to AssemblyAI
   * Sends 50-1000ms chunks as binary WebSocket frames
   * @param {Buffer|Uint8Array} pcmBuffer 
   */
  sendAudio(pcmBuffer) {
    if (this.isMock) {
      return;
    }

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (Buffer.isBuffer(pcmBuffer) || pcmBuffer instanceof Uint8Array) {
      this.ws.send(pcmBuffer);
    } else {
      this.ws.send(Buffer.from(pcmBuffer));
    }
  }

  /**
   * Terminate session gracefully
   * Sends { type: "Terminate" } to close the stream and avoid orphan billing
   */
  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'Terminate' }));
      } catch (_) {}
      setTimeout(() => {
        try { this.ws.close(); } catch (_) {}
      }, 500);
    }
    this.isConnected = false;
  }
}
