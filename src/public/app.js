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
    this.btnMicToggle = document.getElementById('btnMicToggle');
    this.micText = document.getElementById('micText');
    this.micIcon = document.getElementById('micIcon');
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

    // SOAP quadrant containers
    this.soapSubjective = document.getElementById('soapSubjective');
    this.soapObjective = document.getElementById('soapObjective');
    this.soapAssessment = document.getElementById('soapAssessment');
    this.soapPlan = document.getElementById('soapPlan');

    // Visualizer canvas
    this.canvas = document.getElementById('audioVisualizer');
    this.canvasCtx = this.canvas.getContext('2d');

    this.activeDrugs = new Set();
    this.initWebSocket();
    this.bindEvents();
    this.drawEmptyWaveform();
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.updateStatus('Connecting...', 'amber');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.updateStatus('Connected', 'emerald');
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
      this.updateStatus('Disconnected', 'red');
      setTimeout(() => this.initWebSocket(), 3000);
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
      <span class="w-2 h-2 rounded-full ${colors[color] || 'bg-slate-400'}"></span>
      <span>${text}</span>
    `;
  }

  bindEvents() {
    this.btnMicToggle.addEventListener('click', () => this.toggleMicrophone());
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

  handleServerMessage(msg) {
    switch (msg.type) {
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

      case 'SOAP_UPDATE':
        this.updateSoapCards(msg.currentSoap);
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
        console.log('Session started:', msg.message);
        break;

      case 'SIMULATION_COMPLETED':
        this.appendTranscript('— Consultation Encounter Concluded —', 'System');
        break;

      case 'INTERRUPTED':
        this.copilotAnswer.classList.remove('hidden');
        this.copilotAnswer.innerHTML = `<span class="text-red-400 font-bold">Interrupted (Barge-in):</span> Assistant audio halted.`;
        break;
    }
  }

  appendTranscript(text, speaker) {
    // Clear initial placeholder if present
    if (this.transcriptContainer.querySelector('.italic')) {
      this.transcriptContainer.innerHTML = '';
    }

    const bubble = document.createElement('div');
    const isDoctor = speaker.toLowerCase().includes('doc') || speaker.toLowerCase().includes('clinician');
    const isSystem = speaker === 'System';

    if (isSystem) {
      bubble.className = 'text-center text-xs text-slate-500 font-mono py-1 border-y border-slate-800/80 my-2';
      bubble.innerText = text;
    } else {
      bubble.className = `p-3 rounded-xl border ${
        isDoctor ? 'bg-cyan-950/20 border-cyan-900/40 text-slate-200' : 'bg-slate-900/60 border-slate-800 text-slate-300'
      }`;
      bubble.innerHTML = `
        <div class="flex items-center justify-between text-[11px] mb-1">
          <span class="font-bold ${isDoctor ? 'text-cyan-400' : 'text-purple-400'}">${speaker}</span>
          <span class="text-slate-500 text-[10px]">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <p class="text-xs leading-relaxed">${text}</p>
      `;
    }

    this.transcriptContainer.appendChild(bubble);
    this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
  }

  updateSoapCards(soap) {
    if (!soap) return;

    if (soap.subjective && soap.subjective.length > 0) {
      this.soapSubjective.innerHTML = soap.subjective.map(item => `<p class="leading-relaxed">${item}</p>`).join('');
    }

    if (soap.objective && soap.objective.length > 0) {
      this.soapObjective.innerHTML = soap.objective.map(item => `<p class="leading-relaxed font-mono">${item}</p>`).join('');
    }

    if (soap.assessment && soap.assessment.length > 0) {
      this.soapAssessment.innerHTML = soap.assessment.map(item => `<p class="leading-relaxed font-semibold text-purple-200">${item}</p>`).join('');
    }

    if (soap.plan && soap.plan.length > 0) {
      this.soapPlan.innerHTML = soap.plan.map(item => `<p class="leading-relaxed text-amber-200">${item}</p>`).join('');
    }

    // Refresh medication tags
    const allText = JSON.stringify(soap).toLowerCase();
    const commonDrugs = ['warfarin', 'lisinopril', 'ibuprofen', 'aspirin', 'sildenafil', 'nitroglycerin'];
    const detected = commonDrugs.filter(d => allText.includes(d));

    if (detected.length > 0) {
      this.medicationTags.innerHTML = detected.map(d => `
        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
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

  async startRecording() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Prefer modern AudioWorkletNode (dedicated audio rendering thread)
      if (this.audioContext.audioWorklet) {
        try {
          await this.audioContext.audioWorklet.addModule('/pcm_processor.js');
          this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');
          this.processor.port.onmessage = (event) => {
            if (!this.isRecording) return;
            const { pcm, floatData } = event.data;
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(pcm);
            }
            if (floatData) {
              this.drawWaveform(floatData);
            }
          };
          source.connect(this.processor);
          this.processor.connect(this.audioContext.destination);
          console.log('⚡ AudioWorklet pipeline initialized successfully');
        } catch (workletErr) {
          console.warn('AudioWorklet module loading failed, using fallback:', workletErr);
          this.initScriptProcessorFallback(source);
        }
      } else {
        this.initScriptProcessorFallback(source);
      }

      this.isRecording = true;
      this.micText.innerText = 'Stop Dictation';
      this.btnMicToggle.classList.remove('bg-cyan-600', 'hover:bg-cyan-500');
      this.btnMicToggle.classList.add('bg-red-600', 'hover:bg-red-500');

      if (this.ws) {
        this.ws.send(JSON.stringify({ action: 'START_SESSION' }));
      }
    } catch (err) {
      alert('Microphone access failed or denied: ' + err.message);
    }
  }

  initScriptProcessorFallback(source) {
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.floatTo16BitPCM(inputData);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcm16);
      }
      this.drawWaveform(inputData);
    };
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stopRecording() {
    this.isRecording = false;
    if (this.processor) this.processor.disconnect();
    if (this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();

    this.micText.innerText = 'Start Live Dictation';
    this.btnMicToggle.classList.add('bg-cyan-600', 'hover:bg-cyan-500');
    this.btnMicToggle.classList.remove('bg-red-600', 'hover:bg-red-500');

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
    this.canvasCtx.fillStyle = '#020617';
    this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvasCtx.strokeStyle = '#1e293b';
    this.canvasCtx.beginPath();
    this.canvasCtx.moveTo(0, this.canvas.height / 2);
    this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
    this.canvasCtx.stroke();
  }

  drawWaveform(audioData) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.fillStyle = '#020617';
    this.canvasCtx.fillRect(0, 0, width, height);

    this.canvasCtx.lineWidth = 1.5;
    this.canvasCtx.strokeStyle = '#06b6d4';
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

  async exportMarkdownNote() {
    try {
      const res = await fetch('/api/export');
      const markdown = await res.text();

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SOAP_Note_${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed exporting note: ' + err.message);
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  new EchoDocApp();
});
