/**
 * EchoDoc Client Application
 * Handles:
 * - Real-time WebSocket connection to /ws
 * - 16kHz PCM audio microphone streaming
 * - Interactive canvas audio visualizer
 * - Real-time rolling transcript and dynamic SOAP cards
 * - Safety contraindication alert handling & note export
 */

class EchoDocApp {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.isRecording = false;

    // DOM Elements
    this.connectionStatus = document.getElementById('connectionStatus');
    this.modeBadge = document.getElementById('modeBadge');
    this.btnMicToggle = document.getElementById('btnMicToggle');
    this.micText = document.getElementById('micText');
    this.micIcon = document.getElementById('micIcon');
    this.btnVoiceAgentToggle = document.getElementById('btnVoiceAgentToggle');
    this.voiceAgentText = document.getElementById('voiceAgentText');
    this.btnSimulation = document.getElementById('btnSimulation');
    this.btnExport = document.getElementById('btnExport');
    this.btnBargeIn = document.getElementById('btnBargeIn');
    this.transcriptContainer = document.getElementById('transcriptContainer');
    this.partialBox = document.getElementById('partialBox');
    this.partialText = document.getElementById('partialText');
    this.safetyAlertBar = document.getElementById('safetyAlertBar');
    this.alertTitle = document.getElementById('alertTitle');
    this.alertDescription = document.getElementById('alertDescription');
    this.medicationTags = document.getElementById('medicationTags');
    this.copilotForm = document.getElementById('copilotForm');
    this.copilotInput = document.getElementById('copilotInput');
    this.copilotAnswer = document.getElementById('copilotAnswer');

    // Latency HUD (turnaround + barge-in, with SLO coloring)
    this.hudTurnaround = document.getElementById('hudTurnaround');
    this.hudP95 = document.getElementById('hudP95');
    this.hudBargeIn = document.getElementById('hudBargeIn');

    // Reconnect backoff state
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.SLO_TURNAROUND_P95 = 1200;
    this.SLO_BARGE_IN_P95 = 200;

    // Audio Playback Engine (24kHz for Voice Agent speech output)
    this.playbackContext = null;
    this.activeAudioSources = [];
    this.nextPlayTime = 0;
    this.isVoiceAgentActive = false;

    // SOAP quadrant containers
    this.soapSubjective = document.getElementById('soapSubjective');
    this.soapObjective = document.getElementById('soapObjective');
    this.soapAssessment = document.getElementById('soapAssessment');
    this.soapPlan = document.getElementById('soapPlan');

    // Visualizer canvas
    this.canvas = document.getElementById('audioVisualizer');
    this.canvasCtx = this.canvas.getContext('2d');

    this.activeDrugs = new Set();
    this.isMockMode = null;
    this.metricsTimer = null;
    this.initWebSocket();
    this.bindEvents();
    this.bindKeyboard();
    this.pollHealthAndMetrics();
    this.drawEmptyWaveform();
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.updateStatus('Connecting...', 'amber');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.updateStatus('Connected', 'emerald');
      this.reconnectAttempts = 0;
      console.log('✅ Connected to EchoDoc WebSocket');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    this.ws.onclose = () => {
      // Exponential backoff with jitter, capped at 15s.
      this.reconnectAttempts++;
      const backoff = Math.min(15000, 500 * 2 ** (this.reconnectAttempts - 1));
      const delay = backoff + Math.floor(Math.random() * 300);
      this.updateStatus(`Reconnecting in ${Math.round(delay / 1000)}s…`, 'amber');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.initWebSocket(), delay);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      this.updateStatus('Error', 'red');
    };
  }

  updateStatus(text, color) {
    const colors = {
      amber: 'bg-amber-400',
      emerald: 'bg-emerald-400',
      red: 'bg-red-500'
    };
    this.connectionStatus.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full ${colors[color] || 'bg-stone-400'}"></span>
      <span>${text}</span>
    `;
  }

  bindEvents() {
    this.btnMicToggle.addEventListener('click', () => this.toggleMicrophone());
    if (this.btnVoiceAgentToggle) {
      this.btnVoiceAgentToggle.addEventListener('click', () => this.toggleVoiceAgent());
    }
    this.btnSimulation.addEventListener('click', () => this.startSimulation());
    this.btnExport.addEventListener('click', () => this.exportMarkdownNote());
    this.btnBargeIn.addEventListener('click', () => this.triggerBargeIn());

    this.copilotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = this.copilotInput.value.trim();
      if (!query || !this.ws) return;

      this.ws.send(JSON.stringify({ action: 'ASK_COPILOT', query }));
      this.copilotInput.value = '';
    });
  }

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); this.startSimulation(); }
      else if (key === 'm') { e.preventDefault(); this.toggleMicrophone(); }
      else if (key === 'v') { e.preventDefault(); this.toggleVoiceAgent(); }
      else if (key === 'i') { e.preventDefault(); this.triggerBargeIn(); }
      else if (key === 'e') { e.preventDefault(); this.exportMarkdownNote(); }
    });
  }

  setModeBadge(isMock) {
    this.isMockMode = Boolean(isMock);
    if (!this.modeBadge) return;
    const placeholder = document.getElementById('feedPlaceholder');
    if (this.isMockMode) {
      this.modeBadge.className = 'inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900';
      this.modeBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>Simulator</span>';
      this.modeBadge.title = 'No AssemblyAI key — SOAP, alerts, and UI run locally. Voice copilot will not hit the live API.';
      if (placeholder) {
        placeholder.innerHTML = 'No live key. Use <strong class="text-ink font-medium">Simulated encounter</strong> for the scripted Mrs. Davis walkthrough. It is labeled simulated and does not call AssemblyAI.';
      }
    } else {
      this.modeBadge.className = 'inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-900';
      this.modeBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-teal-700"></span><span>Live AssemblyAI</span>';
      this.modeBadge.title = 'Connected with a real AssemblyAI key. STT and Voice Agent hit live endpoints.';
      if (placeholder) {
        placeholder.innerHTML = 'Live key is set. Click <strong class="text-ink font-medium">Talk to copilot</strong> and speak. <strong class="text-ink font-medium">Simulated encounter</strong> is a scripted backup and is not a live session.';
      }
    }
  }

  async pollHealthAndMetrics() {
    const tick = async () => {
      try {
        const health = await fetch('/api/health').then((r) => r.json());
        if (typeof health.mockMode === 'boolean') this.setModeBadge(health.mockMode);
        if (health.latency) this.renderLatencyHud(health.latency.turnaroundMs, health.latency.bargeInMs);
        const metrics = await fetch('/api/metrics').then((r) => r.json());
        if (metrics.turnaroundMs) this.renderLatencyHud(metrics.turnaroundMs, metrics.bargeInMs);
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
        break;

      case 'PARTIAL_TRANSCRIPT':
        if (msg.text) {
          this.partialBox.classList.remove('hidden');
          this.partialText.innerText = msg.text;
        }
        break;

      case 'FINAL_TRANSCRIPT':
        this.partialBox.classList.add('hidden');
        this.appendTranscript(msg.text, msg.speaker || 'Clinician');
        break;

      // --- VOICE AGENT API EVENTS ---
      case 'VOICE_AGENT_READY':
        this.appendTranscript(`🎙️ Voice Agent session online (${msg.voice} voice). Speak directly into your microphone.`, 'System');
        break;

      case 'USER_SPEECH_STARTED':
        // Immediate client-side barge-in interruption of agent speech
        this.stopAudioPlayback();
        this.partialBox.classList.remove('hidden');
        this.partialText.innerText = 'Listening to speech...';
        break;

      case 'USER_TRANSCRIPT_DELTA':
        this.partialBox.classList.remove('hidden');
        this.partialText.innerText = msg.text;
        break;

      case 'USER_TRANSCRIPT_FINAL':
        this.partialBox.classList.add('hidden');
        this.appendTranscript(msg.text, 'Clinician');
        break;

      case 'AGENT_REPLY_STARTED':
        this.partialBox.classList.remove('hidden');
        this.partialText.innerText = 'EchoDoc speaking...';
        break;

      case 'AGENT_REPLY_AUDIO':
        if (msg.audio) {
          this.playPcmChunk(msg.audio, 24000);
        }
        break;

      case 'AGENT_TRANSCRIPT':
        this.partialBox.classList.add('hidden');
        this.appendTranscript(msg.text, 'EchoDoc (Copilot)');
        break;

      case 'AGENT_REPLY_DONE':
        this.partialBox.classList.add('hidden');
        if (msg.interrupted) {
          this.stopAudioPlayback();
        }
        break;

      case 'TOOL_EXECUTED':
        this.appendTranscript(`🛠️ Clinical Sentinel Executed: ${msg.name}`, 'System');
        break;

      case 'SOAP_UPDATE':
        this.updateSoapCards(msg.currentSoap, Boolean(msg.reset));
        break;

      case 'SAFETY_ALERTS':
        if (msg.alerts && msg.alerts.length > 0) {
          const latest = msg.alerts[msg.alerts.length - 1];
          this.alertTitle.innerText = latest.title;
          this.alertDescription.innerText = latest.description;
          this.safetyAlertBar.classList.remove('hidden');
        }
        break;

      case 'COPILOT_ANSWER':
        this.copilotAnswer.classList.remove('hidden');
        this.copilotAnswer.innerHTML = `<strong>Copilot:</strong> ${msg.answer}`;
        break;

      case 'SESSION_STARTED':
        this.appendTranscript(msg.message || 'Session started.', 'System');
        break;

      case 'SIMULATION_COMPLETED':
        this.appendTranscript('— Consultation Encounter Concluded —', 'System');
        break;

      case 'INTERRUPTED':
        this.stopAudioPlayback();
        this.copilotAnswer.classList.remove('hidden');
        this.copilotAnswer.innerHTML = `<span class="text-red-800 font-semibold">Interrupted:</span> assistant audio halted${
          typeof msg.haltMs === 'number' ? ` in ${msg.haltMs}ms` : ''
        }.`;
        if (msg.summary) this.renderLatencyHud(null, msg.summary);
        break;

      case 'LATENCY':
        this.renderLatencyHud(msg.summary, null, msg.turnaroundMs);
        break;

      case 'EXPORT_DATA':
        this.downloadMarkdown(msg.markdown);
        break;

      case 'RECONNECTING':
        this.updateStatus(`Reconnecting ${msg.scope || ''} (try ${msg.attempt})…`, 'amber');
        break;

      case 'RECONNECTED':
        this.updateStatus('Connected', 'emerald');
        this.appendTranscript(`🔄 ${msg.scope === 'agent' ? 'Voice agent' : 'Transcription'} stream reconnected.`, 'System');
        break;

      case 'ERROR':
        console.error('Server error:', msg.message);
        this.appendTranscript(`⚠️ ${msg.message}`, 'System');
        break;
    }
  }

  renderLatencyHud(turnaroundSummary, bargeInSummary, lastTurnaround) {
    const fmt = (v) => (typeof v === 'number' ? `${v}ms` : '—');
    if (this.hudTurnaround && typeof lastTurnaround === 'number') {
      this.hudTurnaround.innerText = fmt(lastTurnaround);
    }
    if (this.hudP95 && turnaroundSummary && turnaroundSummary.count > 0) {
      this.hudP95.innerText = fmt(turnaroundSummary.p95);
      const ok = turnaroundSummary.p95 > 0 && turnaroundSummary.p95 <= this.SLO_TURNAROUND_P95;
      this.hudP95.className = `font-semibold text-2xl leading-none ${ok ? 'text-teal-800' : 'text-amber-800'}`;
    }
    if (this.hudBargeIn && bargeInSummary && bargeInSummary.count > 0) {
      this.hudBargeIn.innerText = fmt(bargeInSummary.p95);
      const ok = bargeInSummary.p95 > 0 && bargeInSummary.p95 <= this.SLO_BARGE_IN_P95;
      this.hudBargeIn.className = `font-semibold text-2xl leading-none ${ok ? 'text-teal-800' : 'text-amber-800'}`;
    }
  }

  downloadMarkdown(markdown) {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SOAP_Note_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  appendTranscript(text, speaker) {
    // Clear initial placeholder if present
    const placeholder = document.getElementById('feedPlaceholder');
    if (placeholder) placeholder.remove();

    const bubble = document.createElement('div');
    const isDoctor = speaker.toLowerCase().includes('doc') || speaker.toLowerCase().includes('clinician');
    const isSystem = speaker === 'System';

    if (isSystem) {
      bubble.className = 'text-center text-[12px] text-mute py-2';
      bubble.innerText = text;
    } else {
      bubble.className = `px-4 py-3 rounded-2xl border ${
        isDoctor ? 'bg-teal-50/80 border-teal-100 text-ink' : 'bg-paper border-line text-ink'
      }`;
      bubble.innerHTML = `
        <div class="flex items-center justify-between text-[12px] mb-1">
          <span class="font-semibold ${isDoctor ? 'text-teal-800' : 'text-stone-700'}">${speaker}</span>
          <span class="text-mute">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <p class="text-[15px] leading-relaxed">${text}</p>
      `;
    }

    this.transcriptContainer.appendChild(bubble);
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
  }

  updateSoapCards(soap, reset = false) {
    if (reset) {
      this.soapSubjective.innerHTML = '<p class="text-mute italic">Awaiting chief complaint…</p>';
      this.soapObjective.innerHTML = '<p class="text-mute italic">Awaiting vitals…</p>';
      this.soapAssessment.innerHTML = '<p class="text-mute italic">Awaiting synthesis…</p>';
      this.soapPlan.innerHTML = '<p class="text-mute italic">Awaiting plan…</p>';
      this.medicationTags.innerHTML = '<span class="text-sm text-mute">None recorded</span>';
      this.safetyAlertBar.classList.add('hidden');
    }
    if (!soap) return;

    if (soap.subjective && soap.subjective.length > 0) {
      this.soapSubjective.innerHTML = soap.subjective.map(item => `<p class="leading-relaxed">${item}</p>`).join('');
    }

    if (soap.objective && soap.objective.length > 0) {
      this.soapObjective.innerHTML = soap.objective.map(item => `<p class="leading-relaxed font-mono">${item}</p>`).join('');
    }

    if (soap.assessment && soap.assessment.length > 0) {
      this.soapAssessment.innerHTML = soap.assessment.map(item => `<p class="leading-relaxed font-medium">${item}</p>`).join('');
    }

    if (soap.plan && soap.plan.length > 0) {
      this.soapPlan.innerHTML = soap.plan.map(item => `<p class="leading-relaxed">${item}</p>`).join('');
    }

    // Refresh medication tags
    const allText = JSON.stringify(soap).toLowerCase();
    const commonDrugs = ['warfarin', 'lisinopril', 'ibuprofen', 'aspirin', 'sildenafil', 'nitroglycerin'];
    const detected = commonDrugs.filter(d => allText.includes(d));

    if (detected.length > 0) {
      this.medicationTags.innerHTML = detected.map(d => `
        <span class="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-900 border border-teal-100">
          ${d}
        </span>
      `).join('');
    }
  }

  startSimulation() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.btnSimulation.disabled = true;
    this.btnSimulation.classList.add('opacity-50');

    this.ws.send(JSON.stringify({ action: 'RUN_SIMULATION' }));

    setTimeout(() => {
      this.btnSimulation.disabled = false;
      this.btnSimulation.classList.remove('opacity-50');
    }, 18000);
  }

  triggerBargeIn() {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({ action: 'INTERRUPT' }));
  }

  async toggleMicrophone() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startPcmCapture({ onActiveCheck }) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    const sendFrame = (pcm, floatData) => {
      if (!onActiveCheck()) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcm);
      }
      if (floatData) this.drawWaveform(floatData);
    };

    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule('/pcm_processor.js');
        this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');
        this.processor.port.onmessage = (event) => {
          const { pcm, floatData } = event.data;
          sendFrame(pcm, floatData);
        };
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        return;
      } catch (workletErr) {
        console.warn('AudioWorklet module loading failed, using fallback:', workletErr);
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

  async startRecording() {
    try {
      this.isRecording = true;
      await this.startPcmCapture({ onActiveCheck: () => this.isRecording });
      this.micText.innerText = 'Stop scribe';
      this.btnMicToggle.classList.remove('bg-teal-800', 'hover:bg-teal-700');
      this.btnMicToggle.classList.add('bg-red-700', 'hover:bg-red-600');

      if (this.ws) {
        this.ws.send(JSON.stringify({ action: 'START_SESSION' }));
      }
    } catch (err) {
      this.isRecording = false;
      alert('Microphone access failed or denied: ' + err.message);
    }
  }

  stopRecording() {
    this.isRecording = false;
    if (this.processor) this.processor.disconnect();
    if (this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();

    this.micText.innerText = 'Start ambient scribe';
    this.btnMicToggle.classList.add('bg-teal-800', 'hover:bg-teal-700');
    this.btnMicToggle.classList.remove('bg-red-700', 'hover:bg-red-600');

    if (this.ws) {
      this.ws.send(JSON.stringify({ action: 'STOP_SESSION' }));
    }
    this.drawEmptyWaveform();
  }

  floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  drawEmptyWaveform() {
    this.canvasCtx.fillStyle = '#f4f1ec';
    this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvasCtx.strokeStyle = '#e7e2d9';
    this.canvasCtx.beginPath();
    this.canvasCtx.moveTo(0, this.canvas.height / 2);
    this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
    this.canvasCtx.stroke();
  }

  drawWaveform(audioData) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.fillStyle = '#f4f1ec';
    this.canvasCtx.fillRect(0, 0, width, height);

    this.canvasCtx.lineWidth = 1.5;
    this.canvasCtx.strokeStyle = '#0f766e';
    this.canvasCtx.beginPath();

    const sliceWidth = width / audioData.length;
    let x = 0;

    for (let i = 0; i < audioData.length; i += 8) {
      const v = audioData[i];
      const y = (v + 1) / 2 * height;
      if (i === 0) this.canvasCtx.moveTo(x, y);
      else this.canvasCtx.lineTo(x, y);
      x += sliceWidth * 8;
    }

    this.canvasCtx.lineTo(width, height / 2);
    this.canvasCtx.stroke();
  }

  async toggleVoiceAgent() {
    if (this.isVoiceAgentActive) {
      this.stopVoiceAgent();
    } else {
      await this.startVoiceAgent();
    }
  }

  async startVoiceAgent() {
    try {
      if (this.isRecording) {
        this.stopRecording();
      }

      this.isVoiceAgentActive = true;
      await this.startPcmCapture({ onActiveCheck: () => this.isVoiceAgentActive });
      if (this.voiceAgentText) this.voiceAgentText.innerText = 'Stop copilot';
      if (this.btnVoiceAgentToggle) {
        this.btnVoiceAgentToggle.classList.remove('bg-stone-900', 'hover:bg-stone-800');
        this.btnVoiceAgentToggle.classList.add('bg-red-700', 'hover:bg-red-600');
      }

      if (this.ws) {
        this.ws.send(JSON.stringify({ action: 'START_VOICE_AGENT', voice: 'anna' }));
      }
    } catch (err) {
      this.isVoiceAgentActive = false;
      alert('Microphone access failed: ' + err.message);
    }
  }

  stopVoiceAgent() {
    this.isVoiceAgentActive = false;
    this.stopAudioPlayback();
    if (this.processor) this.processor.disconnect();
    if (this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();

    if (this.voiceAgentText) this.voiceAgentText.innerText = 'Talk to copilot';
    if (this.btnVoiceAgentToggle) {
      this.btnVoiceAgentToggle.classList.add('bg-stone-900', 'hover:bg-stone-800');
      this.btnVoiceAgentToggle.classList.remove('bg-red-700', 'hover:bg-red-600');
    }

    if (this.ws) {
      this.ws.send(JSON.stringify({ action: 'STOP_VOICE_AGENT' }));
    }
    this.drawEmptyWaveform();
  }

  playPcmChunk(base64Data, sampleRate = 24000) {
    try {
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      if (!this.playbackContext || this.playbackContext.state === 'closed') {
        this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      }

      const audioBuffer = this.playbackContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.copyToChannel(float32Array, 0);

      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);

      const now = this.playbackContext.currentTime;
      const startTime = Math.max(now, this.nextPlayTime || now);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;
      this.activeAudioSources.push(source);

      source.onended = () => {
        const index = this.activeAudioSources.indexOf(source);
        if (index > -1) this.activeAudioSources.splice(index, 1);
      };
    } catch (err) {
      console.error('Audio chunk playback error:', err);
    }
  }

  stopAudioPlayback() {
    if (this.activeAudioSources && this.activeAudioSources.length > 0) {
      this.activeAudioSources.forEach(s => {
        try { s.stop(); } catch (_) {}
      });
      this.activeAudioSources = [];
    }
    if (this.playbackContext) {
      this.nextPlayTime = this.playbackContext.currentTime;
    }
  }

  exportMarkdownNote() {
    // SOAP state lives per-connection on the server, so request it over the socket.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      alert('Not connected — cannot export yet.');
      return;
    }
    this.ws.send(JSON.stringify({
      action: 'EXPORT_NOTE',
      patientName: 'Eleanor Davis',
      physicianName: 'Attending Physician'
    }));
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  new EchoDocApp();
});
