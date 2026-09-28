/**
 * VoxDive client.
 * - WebSocket to /ws
 * - Ingest a media URL (or the bundled sample) → diarized transcript, chapters, summary
 * - Talk to the video: full-duplex Voice Agent (mic → PCM → WS, agent audio → playback)
 * - Text copilot Q&A grounded in the transcript, with timestamp citations
 */

class VoxDiveApp {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;

    // DOM
    this.connectionStatus = document.getElementById('connectionStatus');
    this.modeBadge = document.getElementById('modeBadge');
    this.urlInput = document.getElementById('urlInput');
    this.btnTranscribe = document.getElementById('btnTranscribe');
    this.btnLoadSample = document.getElementById('btnLoadSample');
    this.mediaTitle = document.getElementById('mediaTitle');
    this.mediaMeta = document.getElementById('mediaMeta');
    this.summaryText = document.getElementById('summaryText');
    this.chaptersList = document.getElementById('chaptersList');
    this.transcriptContainer = document.getElementById('transcriptContainer');
    this.partialBox = document.getElementById('partialBox');
    this.partialText = document.getElementById('partialText');
    this.btnVoiceAgentToggle = document.getElementById('btnVoiceAgentToggle');
    this.voiceAgentText = document.getElementById('voiceAgentText');
    this.btnBargeIn = document.getElementById('btnBargeIn');
    this.btnExport = document.getElementById('btnExport');
    this.copilotForm = document.getElementById('copilotForm');
    this.copilotInput = document.getElementById('copilotInput');
    this.copilotAnswer = document.getElementById('copilotAnswer');
    this.hudTurnaround = document.getElementById('hudTurnaround');
    this.hudP95 = document.getElementById('hudP95');
    this.hudBargeIn = document.getElementById('hudBargeIn');
    this.canvas = document.getElementById('audioVisualizer');
    this.canvasCtx = this.canvas.getContext('2d');

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.SLO_TURNAROUND_P95 = 1200;
    this.SLO_BARGE_IN_P95 = 200;

    this.playbackContext = null;
    this.activeAudioSources = [];
    this.nextPlayTime = 0;
    this.isVoiceAgentActive = false;
    this.hasTranscript = false;
    this.isMockMode = null;
    this.metricsTimer = null;

    this.initWebSocket();
    this.bindEvents();
    this.pollHealthAndMetrics();
    this.drawEmptyWaveform();
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    this.updateStatus('Connecting…', 'amber');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => { this.updateStatus('Connected', 'emerald'); this.reconnectAttempts = 0; };
    this.ws.onmessage = (event) => {
      try { this.handleServerMessage(JSON.parse(event.data)); }
      catch (err) { console.error('WS parse error:', err); }
    };
    this.ws.onclose = () => {
      this.reconnectAttempts++;
      const backoff = Math.min(15000, 500 * 2 ** (this.reconnectAttempts - 1));
      const delay = backoff + Math.floor(Math.random() * 300);
      this.updateStatus(`Reconnecting in ${Math.round(delay / 1000)}s…`, 'amber');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.initWebSocket(), delay);
    };
    this.ws.onerror = () => this.updateStatus('Error', 'red');
  }

  updateStatus(text, color) {
    const colors = { amber: 'bg-amber-400', emerald: 'bg-emerald-400', red: 'bg-red-500' };
    this.connectionStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${colors[color] || 'bg-slate-400'}"></span><span>${text}</span>`;
  }

  bindEvents() {
    this.btnTranscribe.addEventListener('click', () => this.ingestUrl());
    this.urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.ingestUrl(); } });
    this.btnLoadSample.addEventListener('click', () => this.loadSample());
    this.btnVoiceAgentToggle.addEventListener('click', () => this.toggleVoiceAgent());
    this.btnBargeIn.addEventListener('click', () => this.triggerBargeIn());
    this.btnExport.addEventListener('click', () => this.exportTranscript());
    this.copilotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = this.copilotInput.value.trim();
      if (!query || !this.ws) return;
      if (!this.hasTranscript) { this.showAnswer('Load a video first, then ask.', []); return; }
      this.appendTranscript(query, 'You');
      this.ws.send(JSON.stringify({ action: 'ASK_COPILOT', query }));
      this.copilotInput.value = '';
    });
  }

  setModeBadge(isMock) {
    this.isMockMode = Boolean(isMock);
    if (!this.modeBadge) return;
    if (this.isMockMode) {
      this.modeBadge.className = 'inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900';
      this.modeBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>Simulator</span>';
      this.modeBadge.title = 'No AssemblyAI key — ingestion serves the bundled sample transcript and the voice agent runs offline.';
    } else {
      this.modeBadge.className = 'inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-900';
      this.modeBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-600"></span><span>Live AssemblyAI</span>';
      this.modeBadge.title = 'Real AssemblyAI key set. Ingestion and the voice agent hit live endpoints.';
    }
  }

  async pollHealthAndMetrics() {
    const tick = async () => {
      try {
        const health = await fetch('/api/health').then((r) => r.json());
        if (typeof health.mockMode === 'boolean') this.setModeBadge(health.mockMode);
        if (health.latency) this.renderLatencyHud(health.latency.turnaroundMs, health.latency.bargeInMs);
      } catch (_) { /* server may be restarting */ }
    };
    tick();
    clearInterval(this.metricsTimer);
    this.metricsTimer = setInterval(tick, 4000);
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'HELLO':
        this.setModeBadge(msg.mockMode);
        if (msg.sampleTitle && this.btnLoadSample) this.btnLoadSample.title = `Loads: ${msg.sampleTitle}`;
        break;

      case 'TRANSCRIBING':
        this.setBusy(true);
        this.appendSystem(msg.message || 'Transcribing…');
        break;

      case 'TRANSCRIPT_SEGMENT':
        // Streamed during the offline walkthrough as the transcript "populates".
        this.appendTranscript(msg.text, msg.speaker, msg.start);
        break;

      case 'TRANSCRIPT_READY':
        this.setBusy(false);
        this.onTranscriptReady(msg);
        break;

      case 'VOICE_AGENT_READY':
        this.appendSystem(`🎙️ Voice agent online (${msg.voice}). ${msg.message || ''}`);
        break;

      case 'USER_SPEECH_STARTED':
        this.stopAudioPlayback();
        this.showPartial('Listening…');
        break;
      case 'USER_TRANSCRIPT_DELTA':
        this.showPartial(msg.text);
        break;
      case 'USER_TRANSCRIPT_FINAL':
        this.hidePartial();
        this.appendTranscript(msg.text, 'You');
        break;
      case 'AGENT_REPLY_STARTED':
        this.showPartial('VoxDive is answering…');
        break;
      case 'AGENT_REPLY_AUDIO':
        if (msg.audio) this.playPcmChunk(msg.audio, 24000);
        break;
      case 'AGENT_TRANSCRIPT':
        this.hidePartial();
        this.appendTranscript(msg.text, 'VoxDive');
        break;
      case 'AGENT_REPLY_DONE':
        this.hidePartial();
        if (msg.interrupted) this.stopAudioPlayback();
        break;

      case 'TOOL_EXECUTED':
        this.renderToolCall(msg);
        break;

      case 'COPILOT_ANSWER':
        this.showAnswer(msg.answer, msg.citations || [], msg.engine);
        this.appendTranscript(msg.answer, 'VoxDive');
        break;

      case 'INTERRUPTED':
        this.stopAudioPlayback();
        if (msg.summary) this.renderLatencyHud(null, msg.summary);
        break;

      case 'LATENCY':
        this.renderLatencyHud(msg.summary, null, msg.turnaroundMs);
        break;

      case 'SIMULATION_COMPLETED':
        this.appendSystem('— Walkthrough complete. Start the voice agent to talk to it. —');
        break;

      case 'EXPORT_DATA':
        this.downloadMarkdown(msg.markdown);
        break;

      case 'RECONNECTING':
        this.updateStatus(`Reconnecting ${msg.scope || ''} (try ${msg.attempt})…`, 'amber');
        break;
      case 'RECONNECTED':
        this.updateStatus('Connected', 'emerald');
        this.appendSystem('🔄 Voice agent stream reconnected.');
        break;

      case 'ERROR':
        this.setBusy(false);
        this.appendSystem(`⚠️ ${msg.message}`);
        break;
    }
  }

  onTranscriptReady(msg) {
    this.hasTranscript = true;
    this.mediaTitle.innerText = msg.title || 'Transcribed media';
    const mins = Math.floor((msg.durationSec || 0) / 60);
    const secs = (msg.durationSec || 0) % 60;
    const speakerCount = (msg.speakers || []).length;
    const mockTag = msg.isMock ? ' · sample' : '';
    this.mediaMeta.innerText = `${mins}:${String(secs).padStart(2, '0')} · ${speakerCount} speaker${speakerCount === 1 ? '' : 's'} · ${(msg.chapters || []).length} chapters${mockTag}`;

    if (msg.summary) {
      this.summaryText.innerText = msg.summary;
      this.summaryText.classList.remove('italic', 'text-mute');
    }

    // Chapters
    this.chaptersList.innerHTML = '';
    (msg.chapters || []).forEach((c) => {
      const li = document.createElement('button');
      li.className = 'w-full text-left px-3 py-2 rounded-lg border border-line hover:border-indigo-300 hover:bg-indigo-50/40 transition';
      li.innerHTML = `<span class="mono text-[11px] text-indigo-700">${this.fmt(c.start)}</span> <span class="text-[13px] font-medium text-ink">${c.headline}</span><p class="text-[12px] text-mute mt-0.5 leading-snug">${c.summary || ''}</p>`;
      li.addEventListener('click', () => { this.copilotInput.value = c.headline; this.copilotInput.focus(); });
      this.chaptersList.appendChild(li);
    });

    // Transcript (replace, unless it was streamed live already)
    if (msg.source !== 'simulation' && Array.isArray(msg.segments)) {
      this.transcriptContainer.innerHTML = '';
      msg.segments.forEach((s) => this.appendTranscript(s.text, s.speaker, s.start));
    }

    this.btnVoiceAgentToggle.disabled = false;
    this.btnVoiceAgentToggle.classList.remove('opacity-50', 'cursor-not-allowed');
    this.btnExport.disabled = false;
    this.btnExport.classList.remove('opacity-50');
    this.appendSystem(`✅ Ready. Ask about "${msg.title}" below, or start the voice agent.`);
  }

  renderToolCall(msg) {
    const r = msg.result || {};
    let detail = '';
    if (msg.name === 'search_transcript') detail = r.grounded ? `${r.passages.length} passage(s)` : 'no match';
    else if (msg.name === 'jump_to_topic') detail = r.grounded ? `→ ${r.timestamp} ${r.headline}` : 'no chapter';
    else if (msg.name === 'get_summary') detail = 'summary + chapters';
    this.appendSystem(`🛠️ ${msg.name}(${msg.args?.query || msg.args?.topic || ''}) — ${detail}`);
  }

  ingestUrl() {
    const url = this.urlInput.value.trim();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!url) { this.loadSample(); return; }
    this.resetContent();
    this.ws.send(JSON.stringify({ action: 'INGEST_VIDEO', url }));
  }

  loadSample() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.resetContent();
    this.ws.send(JSON.stringify({ action: 'RUN_SIMULATION' }));
  }

  resetContent() {
    this.hasTranscript = false;
    this.transcriptContainer.innerHTML = '';
    this.chaptersList.innerHTML = '<p class="text-[13px] text-mute italic">Chapters appear after transcription…</p>';
    this.summaryText.innerText = 'The summary will appear here once a video is transcribed.';
    this.summaryText.classList.add('italic', 'text-mute');
    this.copilotAnswer.classList.add('hidden');
  }

  setBusy(busy) {
    this.btnTranscribe.disabled = busy;
    this.btnTranscribe.classList.toggle('opacity-50', busy);
    this.btnTranscribe.innerText = busy ? 'Transcribing…' : 'Transcribe';
  }

  fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  showPartial(text) { this.partialBox.classList.remove('hidden'); this.partialText.innerText = text; }
  hidePartial() { this.partialBox.classList.add('hidden'); }

  appendSystem(text) {
    const el = document.createElement('div');
    el.className = 'text-center text-[12px] text-mute py-2';
    el.innerText = text;
    this.transcriptContainer.appendChild(el);
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
  }

  appendTranscript(text, speaker, start) {
    const bubble = document.createElement('div');
    const isYou = speaker === 'You';
    const isAgent = speaker === 'VoxDive';
    let accent = 'bg-paper border-line text-ink';
    if (isYou) accent = 'bg-indigo-50/70 border-indigo-100 text-ink';
    else if (isAgent) accent = 'bg-violet-50/70 border-violet-100 text-ink';
    const ts = typeof start === 'number' ? `<span class="mono text-[11px] text-mute">${this.fmt(start)}</span>` : '';
    bubble.className = `px-4 py-2.5 rounded-2xl border ${accent}`;
    bubble.innerHTML = `<div class="flex items-center justify-between text-[12px] mb-0.5"><span class="font-semibold ${isYou ? 'text-indigo-800' : isAgent ? 'text-violet-800' : 'text-slate-700'}">${speaker}</span>${ts}</div><p class="text-[14px] leading-relaxed">${text}</p>`;
    this.transcriptContainer.appendChild(bubble);
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
  }

  showAnswer(answer, citations, engine) {
    this.copilotAnswer.classList.remove('hidden');
    let html = `<div class="flex items-center gap-2 mb-1"><strong class="text-violet-800">VoxDive</strong>`;
    if (engine) html += `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${engine === 'lemur' ? 'LeMUR' : 'local retrieval'}</span>`;
    html += `</div><p class="text-[14px] leading-relaxed">${answer}</p>`;
    if (citations && citations.length > 0) {
      html += `<div class="mt-2 pt-2 border-t border-line space-y-1">`;
      citations.forEach((c) => {
        html += `<p class="text-[12px] text-mute"><span class="mono text-indigo-700">${this.fmt(c.start)}</span> ${c.speaker}: "${c.text.slice(0, 120)}${c.text.length > 120 ? '…' : ''}"</p>`;
      });
      html += `</div>`;
    }
    this.copilotAnswer.innerHTML = html;
  }

  renderLatencyHud(turnaroundSummary, bargeInSummary, lastTurnaround) {
    const fmt = (v) => (typeof v === 'number' ? `${v}ms` : '—');
    if (this.hudTurnaround && typeof lastTurnaround === 'number') this.hudTurnaround.innerText = fmt(lastTurnaround);
    if (this.hudP95 && turnaroundSummary && turnaroundSummary.count > 0) {
      this.hudP95.innerText = fmt(turnaroundSummary.p95);
      const ok = turnaroundSummary.p95 > 0 && turnaroundSummary.p95 <= this.SLO_TURNAROUND_P95;
      this.hudP95.className = `font-semibold text-2xl leading-none ${ok ? 'text-indigo-800' : 'text-amber-800'}`;
    }
    if (this.hudBargeIn && bargeInSummary && bargeInSummary.count > 0) {
      this.hudBargeIn.innerText = fmt(bargeInSummary.p95);
      const ok = bargeInSummary.p95 > 0 && bargeInSummary.p95 <= this.SLO_BARGE_IN_P95;
      this.hudBargeIn.className = `font-semibold text-2xl leading-none ${ok ? 'text-indigo-800' : 'text-amber-800'}`;
    }
  }

  triggerBargeIn() { if (this.ws) this.ws.send(JSON.stringify({ action: 'INTERRUPT' })); }

  exportTranscript() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.hasTranscript) return;
    this.ws.send(JSON.stringify({ action: 'EXPORT_NOTE' }));
  }

  downloadMarkdown(markdown) {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VoxDive_Transcript_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Voice agent (full-duplex audio) ----
  async toggleVoiceAgent() {
    if (this.isVoiceAgentActive) this.stopVoiceAgent();
    else await this.startVoiceAgent();
  }

  async startVoiceAgent() {
    if (!this.hasTranscript) { this.appendSystem('⚠️ Load a video before starting the voice agent.'); return; }
    try {
      this.isVoiceAgentActive = true;
      await this.startPcmCapture({ onActiveCheck: () => this.isVoiceAgentActive });
      this.voiceAgentText.innerText = 'Stop talking';
      this.btnVoiceAgentToggle.classList.remove('bg-indigo-700', 'hover:bg-indigo-600');
      this.btnVoiceAgentToggle.classList.add('bg-red-700', 'hover:bg-red-600');
      if (this.ws) this.ws.send(JSON.stringify({ action: 'START_VOICE_AGENT', voice: 'anna' }));
    } catch (err) {
      this.isVoiceAgentActive = false;
      alert('Microphone access failed: ' + err.message);
    }
  }

  stopVoiceAgent() {
    this.isVoiceAgentActive = false;
    this.stopAudioPlayback();
    if (this.processor) this.processor.disconnect();
    if (this.mediaStream) this.mediaStream.getTracks().forEach((t) => t.stop());
    if (this.audioContext) this.audioContext.close();
    this.voiceAgentText.innerText = 'Talk to this video';
    this.btnVoiceAgentToggle.classList.add('bg-indigo-700', 'hover:bg-indigo-600');
    this.btnVoiceAgentToggle.classList.remove('bg-red-700', 'hover:bg-red-600');
    if (this.ws) this.ws.send(JSON.stringify({ action: 'STOP_VOICE_AGENT' }));
    this.drawEmptyWaveform();
  }

  async startPcmCapture({ onActiveCheck }) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    const sendFrame = (pcm, floatData) => {
      if (!onActiveCheck()) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(pcm);
      if (floatData) this.drawWaveform(floatData);
    };
    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule('/pcm_processor.js');
        this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');
        this.processor.port.onmessage = (event) => { const { pcm, floatData } = event.data; sendFrame(pcm, floatData); };
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        return;
      } catch (workletErr) {
        console.warn('AudioWorklet load failed, using fallback:', workletErr);
      }
    }
    this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      sendFrame(this.floatTo16BitPCM(inputData), inputData);
    };
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  playPcmChunk(base64Data, sampleRate = 24000) {
    try {
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32768;
      if (!this.playbackContext || this.playbackContext.state === 'closed') {
        this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      }
      const audioBuffer = this.playbackContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.copyToChannel(float32Array, 0);
      const src = this.playbackContext.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(this.playbackContext.destination);
      const now = this.playbackContext.currentTime;
      const startTime = Math.max(now, this.nextPlayTime || now);
      src.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;
      this.activeAudioSources.push(src);
      src.onended = () => { const i = this.activeAudioSources.indexOf(src); if (i > -1) this.activeAudioSources.splice(i, 1); };
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }

  stopAudioPlayback() {
    this.activeAudioSources.forEach((s) => { try { s.stop(); } catch (_) {} });
    this.activeAudioSources = [];
    if (this.playbackContext) this.nextPlayTime = this.playbackContext.currentTime;
  }

  drawEmptyWaveform() {
    this.canvasCtx.fillStyle = '#f5f4fb';
    this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvasCtx.strokeStyle = '#e2e0f0';
    this.canvasCtx.beginPath();
    this.canvasCtx.moveTo(0, this.canvas.height / 2);
    this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
    this.canvasCtx.stroke();
  }

  drawWaveform(audioData) {
    const width = this.canvas.width, height = this.canvas.height;
    this.canvasCtx.fillStyle = '#f5f4fb';
    this.canvasCtx.fillRect(0, 0, width, height);
    this.canvasCtx.lineWidth = 1.5;
    this.canvasCtx.strokeStyle = '#4f46e5';
    this.canvasCtx.beginPath();
    const sliceWidth = width / audioData.length;
    let x = 0;
    for (let i = 0; i < audioData.length; i += 8) {
      const y = (audioData[i] + 1) / 2 * height;
      if (i === 0) this.canvasCtx.moveTo(x, y);
      else this.canvasCtx.lineTo(x, y);
      x += sliceWidth * 8;
    }
    this.canvasCtx.lineTo(width, height / 2);
    this.canvasCtx.stroke();
  }
}

window.addEventListener('DOMContentLoaded', () => new VoxDiveApp());
