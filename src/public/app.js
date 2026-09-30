/**
 * VoxDive client — media-first UI.
 * Real media player (video/YouTube/audio/cover) + diarized transcript with
 * play-synced highlighting, clickable chapters and timestamp citations that
 * seek the player, plus a full-duplex Voice Agent grounded in the transcript.
 */
const SPEAKER_COLORS = [
  { chip: 'bg-indigo-100 text-indigo-800 border-indigo-200', name: 'text-indigo-800' },
  { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', name: 'text-emerald-800' },
  { chip: 'bg-amber-100 text-amber-800 border-amber-200', name: 'text-amber-800' },
  { chip: 'bg-rose-100 text-rose-800 border-rose-200', name: 'text-rose-800' },
  { chip: 'bg-sky-100 text-sky-800 border-sky-200', name: 'text-sky-800' },
  { chip: 'bg-violet-100 text-violet-800 border-violet-200', name: 'text-violet-800' }
];

class VoxDiveApp {
  constructor() {
    this.ws = null; this.audioContext = null; this.mediaStream = null; this.processor = null;
    this.playbackContext = null; this.activeAudioSources = []; this.nextPlayTime = 0;
    this.isVoiceAgentActive = false; this.hasTranscript = false; this.isMockMode = null; this.metricsTimer = null;
    this.reconnectAttempts = 0; this.reconnectTimer = null;
    this.SLO_TURNAROUND_P95 = 1200; this.SLO_BARGE_IN_P95 = 200;

    this.segments = []; this.sourceUrl = ''; this.mediaKind = 'none';
    this.player = null; this.thumbVideo = null; this.thumbCache = {}; this.speakerColor = {};

    const $ = (id) => document.getElementById(id);
    this.connectionStatus = $('connectionStatus'); this.modeBadge = $('modeBadge');
    this.urlInput = $('urlInput'); this.btnTranscribe = $('btnTranscribe'); this.btnNasaDemo = $('btnNasaDemo'); this.btnLoadSample = $('btnLoadSample'); this.btnBriefing = $('btnBriefing');
    this.isBriefing = false; this.briefingVideos = [];
    this.mediaHero = $('mediaHero'); this.mediaTitle = $('mediaTitle'); this.mediaMeta = $('mediaMeta'); this.speakerChips = $('speakerChips');
    this.summaryText = $('summaryText'); this.chaptersList = $('chaptersList');
    this.tabConversation = $('tabConversation'); this.tabTranscript = $('tabTranscript');
    this.btnCollapse = $('btnCollapse'); this.mainGrid = $('mainGrid'); this.leftRail = $('leftRail'); this.collapsed = false;
    this.conversationPanel = $('conversationPanel'); this.transcriptPanel = $('transcriptPanel');
    this.chatContainer = $('chatContainer'); this.partialBox = $('partialBox'); this.partialText = $('partialText');
    this.copilotAnswer = $('copilotAnswer'); this.copilotForm = $('copilotForm'); this.copilotInput = $('copilotInput');
    this.btnVoiceAgentToggle = $('btnVoiceAgentToggle'); this.voiceAgentText = $('voiceAgentText'); this.btnBargeIn = $('btnBargeIn'); this.btnExport = $('btnExport');
    this.hudTurnaround = $('hudTurnaround'); this.hudP95 = $('hudP95'); this.hudBargeIn = $('hudBargeIn');
    this.canvas = $('audioVisualizer'); this.canvasCtx = this.canvas.getContext('2d');

    this.initWebSocket(); this.bindEvents(); this.pollHealthAndMetrics(); this.drawEmptyWaveform();
  }

  // ---------- WebSocket ----------
  initWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.updateStatus('Connecting…', 'amber');
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws.onopen = () => { this.updateStatus('Connected', 'emerald'); this.reconnectAttempts = 0; };
    this.ws.onmessage = (e) => { try { this.handleServerMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    this.ws.onclose = () => {
      this.reconnectAttempts++;
      const delay = Math.min(15000, 500 * 2 ** (this.reconnectAttempts - 1)) + Math.floor(Math.random() * 300);
      this.updateStatus(`Reconnecting in ${Math.round(delay / 1000)}s…`, 'amber');
      clearTimeout(this.reconnectTimer); this.reconnectTimer = setTimeout(() => this.initWebSocket(), delay);
    };
    this.ws.onerror = () => this.updateStatus('Error', 'red');
  }
  updateStatus(t, c) { const m = { amber: 'bg-amber-400', emerald: 'bg-emerald-400', red: 'bg-red-500' }; this.connectionStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${m[c] || 'bg-slate-400'}"></span><span>${t}</span>`; }

  bindEvents() {
    this.btnTranscribe.addEventListener('click', () => this.ingestUrl());
    this.urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.ingestUrl(); } });
    this.btnNasaDemo.addEventListener('click', () => this.send({ action: 'LOAD_NASA_DEMO' }, true));
    this.btnBriefing.addEventListener('click', () => this.send({ action: 'LOAD_BRIEFING' }, true));
    this.btnLoadSample.addEventListener('click', () => this.send({ action: 'RUN_SIMULATION' }, true));
    this.btnCollapse.addEventListener('click', () => this.toggleSidebar());
    this.tabConversation.addEventListener('click', () => this.switchTab('conversation'));
    this.tabTranscript.addEventListener('click', () => this.switchTab('transcript'));
    this.btnVoiceAgentToggle.addEventListener('click', () => this.toggleVoiceAgent());
    this.btnBargeIn.addEventListener('click', () => this.send({ action: 'INTERRUPT' }));
    this.btnExport.addEventListener('click', () => { if (this.hasTranscript) this.send({ action: 'EXPORT_NOTE' }); });
    this.copilotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = this.copilotInput.value.trim(); if (!q) return;
      if (!this.hasTranscript) { this.showAnswer('Load a video first, then ask.', []); return; }
      this.appendChat(q, 'You'); this.send({ action: 'ASK_COPILOT', query: q }); this.copilotInput.value = '';
    });
  }
  send(obj, resetFirst) { if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return; if (resetFirst) this.resetContent(); this.ws.send(JSON.stringify(obj)); }

  ingestUrl() { const u = this.urlInput.value.trim(); if (!u) { this.send({ action: 'LOAD_NASA_DEMO' }, true); return; } this.send({ action: 'INGEST_VIDEO', url: u }, true); }

  toggleSidebar() {
    this.collapsed = !this.collapsed;
    this.leftRail.classList.toggle('hidden', this.collapsed);
    this.mainGrid.classList.toggle('md:grid-cols-[minmax(360px,4fr)_5fr]', !this.collapsed);
    this.mainGrid.classList.toggle('md:grid-cols-1', this.collapsed);
    // flip the chevron
    this.btnCollapse.querySelector('path').setAttribute('d', this.collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7');
    this.btnCollapse.title = this.collapsed ? 'Show the side panel' : 'Collapse the side panel for more space';
  }

  switchTab(which) {
    const conv = which === 'conversation';
    this.conversationPanel.classList.toggle('hidden', !conv);
    this.transcriptPanel.classList.toggle('hidden', conv);
    this.tabConversation.classList.toggle('active', conv);
    this.tabTranscript.classList.toggle('active', !conv);
  }

  // ---------- server messages ----------
  handleServerMessage(msg) {
    switch (msg.type) {
      case 'HELLO': this.setModeBadge(msg.mockMode); break;
      case 'TRANSCRIBING': this.setBusy(true); this.appendSystem(msg.message || 'Transcribing…'); break;
      case 'TRANSCRIPT_SEGMENT': break; // (sample walkthrough streams; final state arrives in TRANSCRIPT_READY)
      case 'TRANSCRIPT_READY': this.setBusy(false); this.onTranscriptReady(msg); break;
      case 'BRIEFING_READY': this.setBusy(false); this.onBriefingReady(msg); break;
      case 'VOICE_AGENT_READY': this.appendSystem(`🎙️ Voice agent online. ${msg.message || ''}`); break;
      case 'USER_SPEECH_STARTED': this.stopAudioPlayback(); this.showPartial('Listening…'); break;
      case 'USER_TRANSCRIPT_DELTA': this.showPartial(msg.text); break;
      case 'USER_TRANSCRIPT_FINAL': this.hidePartial(); this.appendChat(msg.text, 'You'); break;
      case 'AGENT_REPLY_STARTED': this.showPartial('VoxDive is answering…'); break;
      case 'AGENT_REPLY_AUDIO': if (msg.audio) this.playPcmChunk(msg.audio, 24000); break;
      case 'AGENT_TRANSCRIPT': this.hidePartial(); this.appendChat(msg.text, 'VoxDive'); break;
      case 'AGENT_REPLY_DONE': this.hidePartial(); if (msg.interrupted) this.stopAudioPlayback(); break;
      case 'TOOL_EXECUTED': this.appendSystem(`🛠️ ${msg.name}(${msg.args?.query || msg.args?.topic || ''})`); break;
      case 'COPILOT_ANSWER': this.appendChat(msg.answer, 'VoxDive', msg.citations || [], msg.engine); break;
      case 'INTERRUPTED': this.stopAudioPlayback(); if (msg.summary) this.renderLatencyHud(null, msg.summary); break;
      case 'LATENCY': this.renderLatencyHud(msg.summary, null, msg.turnaroundMs); break;
      case 'SIMULATION_COMPLETED': break;
      case 'EXPORT_DATA': this.downloadMarkdown(msg.markdown); break;
      case 'RECONNECTING': this.updateStatus(`Reconnecting ${msg.scope || ''}…`, 'amber'); break;
      case 'RECONNECTED': this.updateStatus('Connected', 'emerald'); break;
      case 'ERROR': this.setBusy(false); this.appendSystem(`⚠️ ${msg.message}`); break;
    }
  }

  onTranscriptReady(msg) {
    this.hasTranscript = true;
    this.segments = msg.segments || [];
    this.sourceUrl = msg.sourceUrl || '';
    this.mediaKind = this.mediaKindOf(this.sourceUrl);

    // speaker colors
    this.speakerColor = {};
    (msg.speakers || []).forEach((s, i) => { this.speakerColor[s] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]; });

    this.renderMedia(msg.title);
    this.mediaTitle.innerText = msg.title || 'Transcribed media';
    const mins = Math.floor((msg.durationSec || 0) / 60), secs = (msg.durationSec || 0) % 60;
    const nsp = (msg.speakers || []).length;
    this.mediaMeta.innerText = `${mins}:${String(secs).padStart(2, '0')} · ${nsp} speaker${nsp === 1 ? '' : 's'} · ${(msg.chapters || []).length} chapter${(msg.chapters || []).length === 1 ? '' : 's'}${msg.isMock ? ' · sample' : ''}`;
    this.speakerChips.innerHTML = (msg.speakers || []).map((s) => `<span class="text-[11px] px-2 py-0.5 rounded-full border ${(this.speakerColor[s] || SPEAKER_COLORS[0]).chip}">${s}</span>`).join('');

    if (msg.summary) { this.summaryText.innerText = msg.summary; this.summaryText.classList.remove('italic', 'text-mute'); }
    this.renderChapters(msg.chapters || []);
    this.renderTranscriptPanel();

    this.btnVoiceAgentToggle.disabled = false; this.btnVoiceAgentToggle.classList.remove('opacity-50', 'cursor-not-allowed');
    this.btnExport.disabled = false; this.btnExport.classList.remove('opacity-50');
    this.chatContainer.querySelector('.py-10')?.remove();
    this.appendSystem(`✅ Ready — ask about “${msg.title}”, or open the Transcript tab.`);
  }

  onBriefingReady(msg) {
    this.isBriefing = true; this.hasTranscript = true; this.briefingVideos = msg.videos || [];
    this.mediaTitle.innerText = 'Your briefing';
    this.mediaMeta.innerText = `${msg.count} videos · ask across all of them`;
    this.speakerChips.innerHTML = '';
    if (msg.briefing) { this.summaryText.innerText = msg.briefing; this.summaryText.classList.remove('italic', 'text-mute'); }

    // Source-video list (click to load into the player)
    this.chaptersList.innerHTML = '<div class="text-[11px] uppercase tracking-wide text-mute mb-1">In this briefing</div>';
    this.briefingVideos.forEach((v) => {
      const b = document.createElement('button');
      b.className = 'briefing-src w-full text-left px-3 py-2 rounded-lg border border-line hover:border-violet-300 hover:bg-violet-50/40 transition'; b.dataset.vid = v.id;
      const mins = Math.floor((v.durationSec || 0) / 60), secs = (v.durationSec || 0) % 60;
      b.innerHTML = `<div class="text-[13px] font-medium text-ink">${v.title}</div><p class="text-[12px] text-mute mt-0.5">${mins}:${String(secs).padStart(2, '0')} · ${(v.speakers || []).length} speaker(s)</p>`;
      b.addEventListener('click', () => this.loadBriefingVideo(v.id));
      this.chaptersList.appendChild(b);
    });

    this.loadBriefingVideo(this.briefingVideos[0]?.id, null, false);
    this.btnVoiceAgentToggle.disabled = false; this.btnVoiceAgentToggle.classList.remove('opacity-50', 'cursor-not-allowed');
    this.btnExport.disabled = false; this.btnExport.classList.remove('opacity-50');
    this.chatContainer.querySelector('.py-10')?.remove();
    this.appendSystem(`✅ Briefing ready across ${msg.count} videos. Ask "catch me up", or ask anything — I'll tell you which video it's from and jump you there.`);
  }

  loadBriefingVideo(videoId, seekSec, announce = true) {
    const v = this.briefingVideos.find((x) => x.id === videoId);
    if (!v) return;
    this.sourceUrl = v.sourceUrl; this.mediaKind = this.mediaKindOf(this.sourceUrl); this.segments = v.segments || [];
    this.speakerColor = {}; (v.speakers || []).forEach((s, i) => { this.speakerColor[s] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]; });
    this.renderMedia(v.title);
    this.renderTranscriptPanel();
    this.chaptersList.querySelectorAll('.briefing-src').forEach((el) => el.classList.toggle('bg-violet-50', el.dataset.vid === videoId));
    if (typeof seekSec === 'number') setTimeout(() => this.seekTo(seekSec), 300);
    if (announce) this.appendSystem(`▶ ${v.title}`);
  }

  // ---------- media ----------
  mediaKindOf(url) {
    if (!url) return 'none';
    if (/(?:youtube\.com\/watch\?v=|youtu\.be\/)/.test(url)) return 'youtube';
    if (url.startsWith('/media/') || /\.(mp4|webm|ogv|m4v|mov)(\?|#|$)/i.test(url)) return 'video';
    if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(url)) return 'audio';
    return 'art';
  }
  youtubeId(url) { const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; }

  renderMedia(title) {
    this.player = null; this.thumbVideo = null; this.thumbCache = {};
    this.mediaHero.className = 'rounded-2xl overflow-hidden bg-slate-900 aspect-video relative';
    if (this.mediaKind === 'video') {
      this.mediaHero.innerHTML = `<video id="player" class="w-full h-full object-contain bg-black" controls playsinline crossorigin="anonymous" src="${this.sourceUrl}"></video>`;
      this.player = document.getElementById('player');
      this.player.addEventListener('timeupdate', () => this.syncHighlight(this.player.currentTime));
      // offscreen video for citation thumbnails (same-origin only)
      this.thumbVideo = document.createElement('video');
      this.thumbVideo.crossOrigin = 'anonymous'; this.thumbVideo.muted = true; this.thumbVideo.preload = 'auto'; this.thumbVideo.src = this.sourceUrl;
    } else if (this.mediaKind === 'youtube') {
      const id = this.youtubeId(this.sourceUrl);
      this.ytId = id;
      this.mediaHero.innerHTML = `<iframe id="ytframe" class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${id}?rel=0" frameborder="0" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    } else if (this.mediaKind === 'audio') {
      this.mediaHero.innerHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-4 text-center"><svg class="w-12 h-12 mb-2 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="1.5" d="M9 19V6l12-2v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"/></svg><div class="text-sm font-medium">${title || 'Audio'}</div></div><audio id="player" class="absolute bottom-2 left-2 right-2 w-[calc(100%-1rem)]" controls src="${this.sourceUrl}"></audio>`;
      this.player = document.getElementById('player');
      this.player.addEventListener('timeupdate', () => this.syncHighlight(this.player.currentTime));
    } else {
      this.mediaHero.innerHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-900 text-white p-5 text-center"><div class="text-[11px] uppercase tracking-widest text-indigo-200 mb-1">Bundled sample · no real media</div><div class="brand text-xl leading-tight">${title || 'VoxDive'}</div></div>`;
    }
  }

  seekTo(seconds) {
    if (this.mediaKind === 'youtube' && this.ytId) {
      const f = document.getElementById('ytframe');
      if (f) f.src = `https://www.youtube-nocookie.com/embed/${this.ytId}?rel=0&start=${Math.floor(seconds)}&autoplay=1`;
      return;
    }
    if (this.player) { try { this.player.currentTime = Math.max(0, seconds); this.player.play().catch(() => {}); } catch (_) {} }
  }

  async captureThumb(seconds) {
    if (this.mediaKind !== 'video' || !this.thumbVideo) return null;
    const key = Math.round(seconds);
    if (this.thumbCache[key]) return this.thumbCache[key];
    try {
      const v = this.thumbVideo;
      await new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('thumb timeout')), 4000);
        const onSeek = () => { clearTimeout(to); v.removeEventListener('seeked', onSeek); res(); };
        const start = () => { v.currentTime = Math.max(0.1, seconds); };
        if (v.readyState >= 2) { v.addEventListener('seeked', onSeek, { once: true }); start(); }
        else v.addEventListener('loadeddata', () => { v.addEventListener('seeked', onSeek, { once: true }); start(); }, { once: true });
      });
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      c.getContext('2d').drawImage(v, 0, 0, 160, 90);
      const url = c.toDataURL('image/jpeg', 0.7);
      this.thumbCache[key] = url; return url;
    } catch (_) { return null; }
  }

  // ---------- chapters / transcript ----------
  renderChapters(chapters) {
    this.chaptersList.innerHTML = '';
    if (chapters.length === 0) { this.chaptersList.innerHTML = '<p class="text-[13px] text-mute italic">No chapters for this media.</p>'; return; }
    chapters.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'w-full text-left px-3 py-2 rounded-lg border border-line hover:border-indigo-300 hover:bg-indigo-50/40 transition';
      b.innerHTML = `<span class="mono text-[11px] text-indigo-700">${this.fmt(c.start)}</span> <span class="text-[13px] font-medium text-ink">${c.headline}</span><p class="text-[12px] text-mute mt-0.5 leading-snug">${c.summary || ''}</p>`;
      b.addEventListener('click', () => { this.seekTo(c.start); });
      this.chaptersList.appendChild(b);
    });
  }

  renderTranscriptPanel() {
    this.transcriptPanel.innerHTML = '';
    this.segments.forEach((s, i) => {
      const col = this.speakerColor[s.speaker] || SPEAKER_COLORS[0];
      const row = document.createElement('div');
      row.className = 'seg px-3 py-2 rounded-lg border border-line'; row.dataset.index = i;
      row.innerHTML = `<div class="flex items-center gap-2 text-[12px] mb-0.5"><span class="mono text-mute">${this.fmt(s.start)}</span><span class="font-semibold ${col.name}">${s.speaker}</span></div><p class="text-[14px] leading-relaxed">${s.text}</p>`;
      row.addEventListener('click', () => this.seekTo(s.start));
      this.transcriptPanel.appendChild(row);
    });
  }

  syncHighlight(t) {
    if (this.transcriptPanel.classList.contains('hidden')) return;
    let active = -1;
    for (let i = 0; i < this.segments.length; i++) { if (t >= this.segments[i].start && t < (this.segments[i].end || 1e9)) { active = i; break; } }
    const rows = this.transcriptPanel.children;
    for (const r of rows) if (r.dataset) r.classList.remove('active');
    if (active >= 0) {
      const r = this.transcriptPanel.querySelector(`[data-index="${active}"]`);
      if (r && !r.classList.contains('active')) { r.classList.add('active'); r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
  }

  // ---------- chat / answers ----------
  appendSystem(text) {
    const el = document.createElement('div'); el.className = 'text-center text-[12px] text-mute py-1.5'; el.innerText = text;
    this.chatContainer.appendChild(el); this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }
  appendChat(text, who, citations, engine) {
    const isYou = who === 'You', isAgent = who === 'VoxDive';
    const bubble = document.createElement('div');
    bubble.className = `px-4 py-2.5 rounded-2xl border ${isYou ? 'bg-indigo-50/70 border-indigo-100' : isAgent ? 'bg-violet-50/70 border-violet-100' : 'bg-white border-line'}`;
    const badge = engine ? `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ml-2">${engine === 'lemur' ? 'LeMUR' : 'grounded'}</span>` : '';
    bubble.innerHTML = `<div class="text-[12px] mb-0.5 font-semibold ${isYou ? 'text-indigo-800' : isAgent ? 'text-violet-800' : 'text-slate-700'}">${who}${badge}</div><p class="text-[14px] leading-relaxed">${text}</p>`;
    if (citations && citations.length) bubble.appendChild(this.citeRow(citations));
    this.chatContainer.appendChild(bubble); this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }
  citeRow(citations) {
    const wrap = document.createElement('div'); wrap.className = 'mt-2 pt-2 border-t border-line flex flex-wrap gap-1.5';
    citations.forEach((c) => {
      const chip = document.createElement('button');
      chip.className = 'cite inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100';
      if (c.videoTitle) {
        const short = c.videoTitle.length > 26 ? c.videoTitle.slice(0, 24) + '…' : c.videoTitle;
        chip.innerHTML = `<span class="font-medium">${short}</span> <span class="mono">${this.fmt(c.start)}</span>`;
        chip.title = `${c.videoTitle} — ${c.speaker}: ${c.text}`;
        chip.addEventListener('click', () => this.loadBriefingVideo(c.videoId, c.start));
      } else {
        chip.innerHTML = `<span class="mono">${this.fmt(c.start)}</span> jump`;
        chip.title = `${c.speaker}: ${c.text}`;
        chip.addEventListener('click', () => this.seekTo(c.start));
        this.captureThumb(c.start).then((url) => { if (url) { const img = document.createElement('img'); img.src = url; img.className = 'h-8 w-auto rounded border border-indigo-100 cursor-pointer'; img.addEventListener('click', () => this.seekTo(c.start)); wrap.appendChild(img); } });
      }
      wrap.appendChild(chip);
    });
    return wrap;
  }
  showAnswer(answer, citations, engine) {
    this.copilotAnswer.classList.remove('hidden');
    let html = `<div class="flex items-center gap-2 mb-1"><strong class="text-violet-800">VoxDive</strong>`;
    if (engine) html += `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${engine === 'lemur' ? 'LeMUR' : 'local retrieval'}</span>`;
    html += `</div><p class="text-[14px] leading-relaxed">${answer}</p>`;
    this.copilotAnswer.innerHTML = html;
    if (citations && citations.length) this.copilotAnswer.appendChild(this.citeRow(citations));
  }
  showPartial(t) { this.partialBox.classList.remove('hidden'); this.partialText.innerText = t; }
  hidePartial() { this.partialBox.classList.add('hidden'); }

  resetContent() {
    this.hasTranscript = false; this.isBriefing = false; this.briefingVideos = []; this.segments = []; this.player = null; this.thumbCache = {};
    this.chatContainer.innerHTML = ''; this.transcriptPanel.innerHTML = '';
    this.chaptersList.innerHTML = '<p class="text-[13px] text-mute italic">Chapters appear after transcription…</p>';
    this.summaryText.innerText = 'The summary appears here once a video is transcribed.'; this.summaryText.classList.add('italic', 'text-mute');
    this.speakerChips.innerHTML = ''; this.copilotAnswer.classList.add('hidden'); this.switchTab('conversation');
  }
  setBusy(b) { this.btnTranscribe.disabled = b; this.btnTranscribe.classList.toggle('opacity-50', b); this.btnTranscribe.innerText = b ? 'Transcribing…' : 'Transcribe'; }
  fmt(s) { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  setModeBadge(isMock) {
    this.isMockMode = Boolean(isMock);
    if (isMock) { this.modeBadge.className = 'inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900'; this.modeBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>Simulator</span>'; }
    else { this.modeBadge.className = 'inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-900'; this.modeBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-600"></span><span>Live AssemblyAI</span>'; }
  }
  async pollHealthAndMetrics() {
    const tick = async () => { try { const h = await fetch('/api/health').then((r) => r.json()); if (typeof h.mockMode === 'boolean') this.setModeBadge(h.mockMode); if (h.latency) this.renderLatencyHud(h.latency.turnaroundMs, h.latency.bargeInMs); } catch (_) {} };
    tick(); clearInterval(this.metricsTimer); this.metricsTimer = setInterval(tick, 4000);
  }
  renderLatencyHud(turn, barge, last) {
    const f = (v) => (typeof v === 'number' ? `${v}ms` : '—');
    if (this.hudTurnaround && typeof last === 'number') this.hudTurnaround.innerText = f(last);
    if (this.hudP95 && turn && turn.count > 0) { this.hudP95.innerText = f(turn.p95); this.hudP95.className = `font-semibold text-xl leading-none ${turn.p95 <= this.SLO_TURNAROUND_P95 ? 'text-indigo-800' : 'text-amber-800'}`; }
    if (this.hudBargeIn && barge && barge.count > 0) { this.hudBargeIn.innerText = f(barge.p95); this.hudBargeIn.className = `font-semibold text-xl leading-none ${barge.p95 <= this.SLO_BARGE_IN_P95 ? 'text-indigo-800' : 'text-amber-800'}`; }
  }
  downloadMarkdown(md) { if (!md) return; const b = new Blob([md], { type: 'text/markdown' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `VoxDive_Transcript_${new Date().toISOString().split('T')[0]}.md`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); }

  // ---------- voice agent (full-duplex) ----------
  async toggleVoiceAgent() { if (this.isVoiceAgentActive) this.stopVoiceAgent(); else await this.startVoiceAgent(); }
  async startVoiceAgent() {
    if (!this.hasTranscript) { this.appendSystem('⚠️ Load a video first.'); return; }
    try {
      this.isVoiceAgentActive = true;
      await this.startPcmCapture({ onActiveCheck: () => this.isVoiceAgentActive });
      this.voiceAgentText.innerText = 'Stop';
      this.btnVoiceAgentToggle.classList.remove('bg-indigo-700', 'hover:bg-indigo-600'); this.btnVoiceAgentToggle.classList.add('bg-red-700', 'hover:bg-red-600');
      this.send({ action: 'START_VOICE_AGENT', voice: 'anna' });
    } catch (err) { this.isVoiceAgentActive = false; alert('Microphone access failed: ' + err.message); }
  }
  stopVoiceAgent() {
    this.isVoiceAgentActive = false; this.stopAudioPlayback();
    if (this.processor) this.processor.disconnect(); if (this.mediaStream) this.mediaStream.getTracks().forEach((t) => t.stop()); if (this.audioContext) this.audioContext.close();
    this.voiceAgentText.innerText = 'Talk';
    this.btnVoiceAgentToggle.classList.add('bg-indigo-700', 'hover:bg-indigo-600'); this.btnVoiceAgentToggle.classList.remove('bg-red-700', 'hover:bg-red-600');
    this.send({ action: 'STOP_VOICE_AGENT' }); this.drawEmptyWaveform();
  }
  async startPcmCapture({ onActiveCheck }) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    const src = this.audioContext.createMediaStreamSource(this.mediaStream);
    const sendFrame = (pcm, f) => { if (!onActiveCheck()) return; if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(pcm); if (f) this.drawWaveform(f); };
    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule('/pcm_processor.js');
        this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');
        this.processor.port.onmessage = (e) => sendFrame(e.data.pcm, e.data.floatData);
        src.connect(this.processor); this.processor.connect(this.audioContext.destination); return;
      } catch (e) { console.warn('worklet failed', e); }
    }
    this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); sendFrame(this.floatTo16BitPCM(d), d); };
    src.connect(this.processor); this.processor.connect(this.audioContext.destination);
  }
  floatTo16BitPCM(f) { const b = new ArrayBuffer(f.length * 2); const v = new DataView(b); for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); v.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); } return b; }
  playPcmChunk(b64, rate = 24000) {
    try {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(bytes.buffer); const f32 = new Float32Array(i16.length); for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
      if (!this.playbackContext || this.playbackContext.state === 'closed') this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: rate });
      const buf = this.playbackContext.createBuffer(1, f32.length, rate); buf.copyToChannel(f32, 0);
      const s = this.playbackContext.createBufferSource(); s.buffer = buf; s.connect(this.playbackContext.destination);
      const now = this.playbackContext.currentTime; const start = Math.max(now, this.nextPlayTime || now); s.start(start); this.nextPlayTime = start + buf.duration; this.activeAudioSources.push(s);
      s.onended = () => { const i = this.activeAudioSources.indexOf(s); if (i > -1) this.activeAudioSources.splice(i, 1); };
    } catch (e) { console.error(e); }
  }
  stopAudioPlayback() { this.activeAudioSources.forEach((s) => { try { s.stop(); } catch (_) {} }); this.activeAudioSources = []; if (this.playbackContext) this.nextPlayTime = this.playbackContext.currentTime; }

  drawEmptyWaveform() { const c = this.canvasCtx; c.fillStyle = '#f5f4fb'; c.fillRect(0, 0, this.canvas.width, this.canvas.height); c.strokeStyle = '#e2e0f0'; c.beginPath(); c.moveTo(0, this.canvas.height / 2); c.lineTo(this.canvas.width, this.canvas.height / 2); c.stroke(); }
  drawWaveform(d) { const w = this.canvas.width, h = this.canvas.height, c = this.canvasCtx; c.fillStyle = '#f5f4fb'; c.fillRect(0, 0, w, h); c.lineWidth = 1.5; c.strokeStyle = '#4f46e5'; c.beginPath(); const sw = w / d.length; let x = 0; for (let i = 0; i < d.length; i += 8) { const y = (d[i] + 1) / 2 * h; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); x += sw * 8; } c.lineTo(w, h / 2); c.stroke(); }
}

window.addEventListener('DOMContentLoaded', () => new VoxDiveApp());
