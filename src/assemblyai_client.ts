import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { computeBackoff } from './util.js';
import { log } from './logger.js';

export interface StreamingClientOptions {
  token?: string | null;
  sampleRate?: number;
  speechModel?: string;
  wordBoost?: string[];
  isMock?: boolean;
  connectTimeoutMs?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

/**
 * AssemblyAI Streaming Real-Time Client (Universal-3.5-Pro / v3).
 * Connects to wss://streaming.assemblyai.com/v3/ws, streams raw 16kHz Linear PCM
 * audio chunks, and emits partial & final transcripts.
 */
export class AssemblyAIStreamingClient extends EventEmitter {
  apiKey: string | undefined;
  token: string | null;
  sampleRate: number;
  speechModel: string;
  wordBoost: string[];
  ws: WebSocket | null;
  isConnected: boolean;
  connectTimeoutMs: number;
  isMock: boolean;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private intentionalClose = false;

  constructor(apiKey?: string, options: StreamingClientOptions = {}) {
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
    this.connectTimeoutMs = options.connectTimeoutMs || 10000;
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 4;
    this.isMock =
      options.isMock ||
      !this.apiKey ||
      this.apiKey === 'your_assemblyai_api_key_here' ||
      process.env.MOCK_STREAMING === 'true';
  }

  /** Connect to AssemblyAI Streaming WebSocket */
  async connect(): Promise<void> {
    if (this.isMock) {
      log.info('stt_mock_mode');
      this.isConnected = true;
      this.emit('open', { sessionId: 'mock-session-' + Date.now(), isMock: true });
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const v3Params = new URLSearchParams({
        sample_rate: this.sampleRate.toString(),
        encoding: 'pcm_s16le',
        speech_model: this.speechModel,
        mode: 'min_latency',
        domain: 'medical-v1',
        speaker_labels: 'true',
        prompt: 'Clinical medical consultation between a doctor and patient regarding symptoms, diagnosis, vitals, and medications.'
      });
      if (this.token) v3Params.set('token', this.token);

      const v3Url = `wss://streaming.assemblyai.com/v3/ws?${v3Params.toString()}`;
      const headers: Record<string, string> = {};
      if (this.apiKey && !this.token) headers['Authorization'] = this.apiKey;

      this.ws = new WebSocket(v3Url, { headers });

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const err = new Error(`AssemblyAI STT connection timed out after ${this.connectTimeoutMs}ms`);
        try { this.ws?.terminate(); } catch { /* ignore */ }
        this.emit('error', err);
        reject(err);
      }, this.connectTimeoutMs);

      this.ws.on('open', () => {
        log.info('stt_connected', { speechModel: this.speechModel });
        this.isConnected = true;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          this.handleIncomingMessage(JSON.parse(data.toString()));
        } catch (err) {
          log.error('stt_parse_error', { message: (err as Error).message });
        }
      });

      this.ws.on('error', (err: Error) => {
        log.error('stt_ws_error', { message: err.message });
        this.emit('error', err);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        log.info('stt_ws_closed', { code, reason: reason.toString() });
        this.isConnected = false;
        this.emit('close', { code, reason });
        this.maybeReconnect(code);
      });
    });
  }

  /** Re-establish the stream after an unexpected drop, with capped backoff. */
  private maybeReconnect(code: number): void {
    if (this.intentionalClose || !this.autoReconnect || this.isMock) return;
    if (code === 1000) return; // normal closure
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error(`STT reconnect gave up after ${this.reconnectAttempts} attempts`));
      return;
    }
    this.reconnectAttempts++;
    const delay = computeBackoff(this.reconnectAttempts);
    log.warn('stt_reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
    setTimeout(() => {
      this.connect()
        .then(() => {
          this.reconnectAttempts = 0;
          this.emit('reconnected');
          log.info('stt_reconnected');
        })
        .catch((err) => log.error('stt_reconnect_failed', { message: (err as Error).message }));
    }, delay).unref?.();
  }

  /** Route incoming AssemblyAI v3 frames to event emitters */
  handleIncomingMessage(msg: any): void {
    if (msg.type === 'Begin' || msg.message_type === 'SessionBegins') {
      this.emit('session_begins', { id: msg.id || msg.session_id, expiresAt: msg.expires_at });
    } else if (msg.type === 'SpeechStarted') {
      this.emit('speech_started', { timestamp: msg.timestamp, confidence: msg.confidence });
    } else if (msg.type === 'Turn') {
      const text = msg.transcript || '';
      if (msg.end_of_turn) {
        this.emit('final_transcript', {
          text,
          turnOrder: msg.turn_order,
          words: msg.words || [],
          speaker: msg.speaker_label || 'Speaker',
          confidence: msg.end_of_turn_confidence || 1.0,
          utterance: msg.utterance,
          timestamp: Date.now()
        });
      } else if (text.trim().length > 0) {
        this.emit('partial_transcript', { text, turnOrder: msg.turn_order, confidence: 0.95, timestamp: Date.now() });
      }
    } else if (msg.type === 'SpeakerRevision') {
      this.emit('speaker_revision', { revisions: msg.revisions || [] });
    } else if (msg.type === 'Termination' || msg.message_type === 'SessionTerminated') {
      this.emit('session_terminated', {
        audioDuration: msg.audio_duration_seconds,
        sessionDuration: msg.session_duration_seconds
      });
    }
  }

  /** Stream raw 16kHz linear PCM audio buffer to AssemblyAI */
  sendAudio(pcmBuffer: Buffer | Uint8Array): void {
    if (this.isMock) return;
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (Buffer.isBuffer(pcmBuffer) || pcmBuffer instanceof Uint8Array) {
      this.ws.send(pcmBuffer);
    } else {
      this.ws.send(Buffer.from(pcmBuffer));
    }
  }

  /** Terminate session gracefully (avoids orphan billing). Suppresses auto-reconnect. */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'Terminate' })); } catch { /* ignore */ }
      setTimeout(() => { try { this.ws?.close(); } catch { /* ignore */ } }, 500);
    }
    this.isConnected = false;
  }
}
