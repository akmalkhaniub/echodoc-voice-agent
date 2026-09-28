import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { VideoContext } from './video_context.js';
import { formatTimestamp } from './video_context.js';
import { computeBackoff } from './util.js';
import { log } from './logger.js';

export interface VoiceAgentOptions {
  token?: string | null;
  voice?: string;
  videoContext?: VideoContext | null;
  isMock?: boolean;
  connectTimeoutMs?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
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
  videoContext: VideoContext | null;
  ws: WebSocket | null;
  isConnected: boolean;
  sessionId: string | null;
  isReady: boolean;
  connectTimeoutMs: number;
  isMock: boolean;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private intentionalClose = false;

  constructor(apiKey?: string, options: VoiceAgentOptions = {}) {
    super();
    this.apiKey = apiKey || process.env.ASSEMBLYAI_API_KEY;
    this.token = options.token || null;
    this.voice = options.voice || 'anna';
    this.videoContext = options.videoContext || null;
    this.ws = null;
    this.isConnected = false;
    this.sessionId = null;
    this.isReady = false;
    this.connectTimeoutMs = options.connectTimeoutMs || 12000;
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 4;
    this.isMock =
      options.isMock ||
      !this.apiKey ||
      this.apiKey === 'your_assemblyai_api_key_here' ||
      process.env.MOCK_STREAMING === 'true';
  }

  /** Connect and initialize Voice Agent session */
  async connect(): Promise<void> {
    if (this.isMock) {
      log.info('agent_mock_mode');
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
        log.info('agent_ws_open');
        this.isConnected = true;
        this.sendSessionUpdate();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          this.handleIncomingEvent(JSON.parse(data.toString()), resolveOnce);
        } catch (err) {
          log.error('agent_parse_error', { message: (err as Error).message });
        }
      });

      this.ws.on('error', (err: Error) => {
        log.error('agent_ws_error', { message: err.message });
        this.emit('error', err);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        log.info('agent_ws_closed', { code, reason: reason.toString() });
        this.isConnected = false;
        this.isReady = false;
        this.emit('close', { code, reason });
        this.maybeReconnect(code);
      });
    });
  }

  /** Re-establish the agent session after an unexpected drop, with capped backoff. */
  private maybeReconnect(code: number): void {
    if (this.intentionalClose || !this.autoReconnect || this.isMock) return;
    if (code === 1000) return; // normal closure
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error(`Voice Agent reconnect gave up after ${this.reconnectAttempts} attempts`));
      return;
    }
    this.reconnectAttempts++;
    const delay = computeBackoff(this.reconnectAttempts);
    log.warn('agent_reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
    setTimeout(() => {
      this.connect()
        .then(() => {
          this.reconnectAttempts = 0;
          this.emit('reconnected');
          log.info('agent_reconnected');
        })
        .catch((err) => log.error('agent_reconnect_failed', { message: (err as Error).message }));
    }, delay).unref?.();
  }

  /** Configure agent persona, voice, greeting, and transcript-grounded tools */
  sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const title = this.videoContext?.title || 'the loaded media';
    const sessionUpdate = {
      type: 'session.update',
      session: {
        system_prompt:
          `You are VoxDive, a voice assistant that lets a person have a spoken conversation with a specific video or podcast — currently "${title}". ` +
          'You may ONLY use facts found in that transcript. Before answering any question about the content, call search_transcript and base your answer on what it returns. ' +
          'For "what is this about" style questions, call get_summary. To point the listener to a section, call jump_to_topic. ' +
          'If the tools return nothing relevant, say the recording does not cover that rather than guessing. ' +
          'Keep replies short and conversational since they are read aloud, and cite the timestamp when you quote the speaker.',
        greeting: `VoxDive here. I've listened to "${title}". Ask me anything about it, or say "give me the summary".`,
        input: {
          format: { encoding: 'audio/pcm' },
          keyterms: (this.videoContext?.speakers || []).concat(this.videoContext?.result?.entities || []).slice(0, 12),
          turn_detection: { vad_threshold: 0.5, min_silence: 200, max_silence: 1000, interrupt_response: true }
        },
        output: { voice: this.voice, format: { encoding: 'audio/pcm' } },
        tools: [
          {
            type: 'function',
            name: 'search_transcript',
            description: 'Search the loaded video/podcast transcript and return the most relevant passages with their timestamps. Call this before answering any question about the content.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'What to look for, e.g. "how do river interceptors work"' }
              },
              required: ['query']
            }
          },
          {
            type: 'function',
            name: 'get_summary',
            description: 'Get the one-paragraph summary and the chapter list for the loaded media.',
            parameters: { type: 'object', properties: {} }
          },
          {
            type: 'function',
            name: 'jump_to_topic',
            description: 'Find the chapter that best matches a topic so the listener can jump to that timestamp.',
            parameters: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'The topic to locate, e.g. "autonomous drones"' }
              },
              required: ['topic']
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
      log.info('agent_session_ready', { sessionId: this.sessionId });
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
    log.info('agent_tool_call', { name, args });

    let result: Record<string, any> = { status: 'success' };

    try {
      if (!this.videoContext || !this.videoContext.hasTranscript) {
        result = { grounded: false, message: 'No transcript is loaded yet.' };
      } else if (name === 'search_transcript') {
        const query = typeof args.query === 'string' ? args.query : '';
        const hits = this.videoContext.search(query, 3);
        result = {
          grounded: hits.length > 0,
          passages: hits.map((h) => ({ timestamp: formatTimestamp(h.start), speaker: h.speaker, text: h.text })),
          message: hits.length > 0 ? undefined : 'The transcript does not appear to cover that.'
        };
      } else if (name === 'get_summary') {
        result = {
          grounded: true,
          title: this.videoContext.title,
          summary: this.videoContext.summary,
          chapters: this.videoContext.chapters.map((c) => ({ timestamp: formatTimestamp(c.start), headline: c.headline }))
        };
      } else if (name === 'jump_to_topic') {
        const topic = typeof args.topic === 'string' ? args.topic : '';
        const chapter = this.videoContext.jumpToTopic(topic);
        result = chapter
          ? { grounded: true, timestamp: formatTimestamp(chapter.start), headline: chapter.headline, summary: chapter.summary }
          : { grounded: false, message: `No chapter matches "${topic}".` };
      }

      log.debug('agent_tool_result', { name });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'tool.result', call_id, result: JSON.stringify(result) }));
      }
      this.emit('tool_executed', { name, args, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('agent_tool_error', { name, message: (err as Error).message });
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

  /** Disconnect cleanly. Suppresses auto-reconnect. */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.isConnected = false;
    this.isReady = false;
  }
}
