/* Original NIKKE lobby dialogue + extracted animation event timing.
 * Audio stays outside Spine files. Unknown events/other resource kinds are silent.
 */
(function (root) {
  'use strict';
  const EPS = 1e-7;
  function eventsBetween(events, from, to, duration, loop) {
    if (!(to >= from) || !(duration > 0)) return [];
    const out = [];
    const first = loop ? Math.max(0, Math.floor(Math.max(0, from) / duration)) : 0;
    const last = loop ? Math.floor(Math.max(0, to) / duration) : 0;
    for (let cycle = first; cycle <= last; cycle++) {
      events.forEach((event, index) => {
        const time = Number(event.time);
        if (!Number.isFinite(time) || time < 0 || time > duration + EPS) return;
        const at = cycle * duration + time;
        if (at > from && at <= to + EPS) out.push({ event, at, key: cycle + ':' + index });
      });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  function voiceSetFor(index, id) {
    const match = /^(c\d{3})_(\d{2})$/i.exec(String(id || ''));
    if (!match || !index) return null;
    const exact = match[1].toLowerCase() + '_' + match[2];
    if (index.voiceSets[exact]) return { id: exact, set: index.voiceSets[exact], inherited: false };
    const base = match[1].toLowerCase();
    return index.voiceSets[base] ? { id: base, set: index.voiceSets[base], inherited: true } : null;
  }
  function chooseVoice(clips, last, random = Math.random) {
    const candidates = clips.length > 1 ? clips.filter(name => name !== last) : clips;
    return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : null;
  }

  class Controller {
    constructor(adapter) {
      this.adapter = adapter;
      this.index = null;
      this.context = null;
      this.unlocked = false;
      this.sources = new Set();
      this.raw = new Map();
      this.buffers = new Map();
      this.pending = new Map();
      this.previous = new Map();
      this.failures = new Set();
      this.history = [];
      this.resourceId = '';
      this.generation = 0;
      this.voice = null;
      this.loading = false;
      this.reaction = false;
      this.idleFor = 0;
      this.timeline = null;
      this.wasPaused = true;
      this.disposed = false;
      this.prefs = Object.assign({ enabled: true, voices: true, effects: true, affinity: 'normal', idle: false }, adapter.store.get('portraitAudio', {}));
      this.button = document.getElementById('btnVoice');
      if (!this.button) {
        this.button = document.createElement('button');
        this.button.id = 'btnVoice';
        const strip = document.getElementById('toolStrip');
        strip.insertBefore(this.button, document.getElementById('btnPresetImmersive'));
      }
      this.button.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
      adapter.popup(this.button, popup => this.menu(popup));
      this.updateButton();
      this.onGesture = () => this.unlock();
      document.getElementById('stage').addEventListener('pointerdown', this.onGesture, { capture: true });
      this.onVisibility = () => this.syncPause();
      document.addEventListener('visibilitychange', this.onVisibility);
      this.ready = fetch(adapter.indexURL).then(response => {
        if (!response.ok) throw Error('音频索引 ' + response.status);
        return response.json();
      }).then(index => {
        if (index.version !== 2 || !index.clips || !index.voiceSets || !index.resources) throw Error('音频索引格式不兼容');
        this.index = index;
        this.syncResource();
        this.updateButton();
        return index;
      }).catch(error => { this.indexError = error.message; this.updateButton(); return null; });
    }
    record(type, detail) {
      this.history.push(Object.assign({ type, resource: this.resourceId }, detail));
      if (this.history.length > 100) this.history.shift();
      this.reportState();
    }
    reportState() {
      // Read-only diagnostics for browser verification and playback support.
      if (this.button) this.button.dataset.audioState = JSON.stringify(this.debug());
    }
    updateButton() {
      this.button.classList.toggle('on', this.prefs.enabled);
      this.button.setAttribute('aria-pressed', String(this.prefs.enabled));
      this.button.title = '角色声音设置（' + (this.prefs.enabled ? '开启' : '静音') + '）';
      this.button.setAttribute('aria-label', this.button.title);
      this.reportState();
    }
    menu(popup) {
      // This settings surface must be above the fixed mobile playback/toolbars.
      popup.style.zIndex = '250';
      popup.innerHTML = '<div class="col" style="min-width:220px;max-width:calc(100vw - 32px)"><strong>角色声音 · 日语</strong>'
        + '<label><input type="checkbox" data-pref="enabled"> 开启声音</label>'
        + '<label><input type="checkbox" data-pref="voices"> 点击台词</label>'
        + '<label><input type="checkbox" data-pref="effects"> 动画音效</label>'
        + '<label>台词组 <select data-pref="affinity"><option value="normal">普通</option><option value="love">好感度</option></select></label>'
        + '<label><input type="checkbox" data-pref="idle"> 闲置台词（查看器每30秒）</label>'
        + '<small style="opacity:.65">同一时刻一句台词；点击会触发反应动画。<br>音效时间来自游戏；台词随机规则为查看器近似。</small>'
        + '<small class="audio-availability" style="opacity:.65"></small></div>';
      popup.querySelectorAll('[data-pref]').forEach(input => {
        const key = input.dataset.pref;
        if (input.type === 'checkbox') input.checked = !!this.prefs[key]; else input.value = this.prefs[key];
        input.onchange = () => {
          this.prefs[key] = input.type === 'checkbox' ? input.checked : input.value;
          this.adapter.store.set('portraitAudio', this.prefs);
          if (!this.prefs.enabled || !this.prefs.voices) this.stopVoice();
          if (!this.prefs.enabled || !this.prefs.effects) this.stopEffects();
          this.idleFor = 0;
          this.updateButton();
          this.unlock();
        };
      });
      const found = voiceSetFor(this.index, this.resourceId);
      popup.querySelector('.audio-availability').textContent = this.indexError || (found
        ? '当前台词组：' + found.id + (found.inherited ? '（角色共用）' : '（服装专属）')
        : '当前资源没有已确认的大厅台词，不跨角色配音。');
    }
    audioURL(clip) {
      const url = new URL(clip.url, this.adapter.indexURL).href;
      return typeof root.ARTHUB_COS_RESOLVE === 'function' ? root.ARTHUB_COS_RESOLVE(url) : url;
    }
    async buffer(name) {
      if (this.buffers.has(name)) return this.buffers.get(name);
      if (this.pending.has(name)) return this.pending.get(name);
      const clip = this.index && this.index.clips[name];
      if (!clip) return null;
      const resourceId = this.resourceId;
      const job = (async () => {
        let raw = this.raw.get(name);
        if (!raw) {
          const response = await fetch(this.audioURL(clip));
          if (!response.ok) throw Error(name + ': HTTP ' + response.status);
          raw = await response.arrayBuffer();
          if (resourceId === this.resourceId) this.raw.set(name, raw);
        }
        if (!this.context) return null;
        const buffer = await this.context.decodeAudioData(raw.slice(0));
        if (resourceId === this.resourceId) this.buffers.set(name, buffer);
        return buffer;
      })().catch(error => {
        if (!this.failures.has(name)) { this.failures.add(name); this.record('load-error', { name, error: error.message }); }
        return null;
      }).finally(() => { if (this.pending.get(name) === job) this.pending.delete(name); });
      this.pending.set(name, job);
      return job;
    }
    relevantNames() {
      const names = new Set();
      const resource = this.index && this.index.resources[this.resourceId];
      if (resource) Object.values(resource.animations).flat().forEach(event => { if (this.index.clips[event.name]) names.add(event.name); });
      const voiceSet = voiceSetFor(this.index, this.resourceId);
      if (voiceSet) Object.values(voiceSet.set).forEach(group => Object.values(group).flat().forEach(name => names.add(name)));
      return [...names];
    }
    warm() { return Promise.all(this.relevantNames().map(name => this.buffer(name))); }
    async unlock() {
      if (this.disposed) return;
      if (this.unlocked) { this.warm(); this.syncPause(); return; }
      try {
        if (!this.context) {
          const AudioContext = root.AudioContext || root.webkitAudioContext;
          if (!AudioContext) throw Error('浏览器不支持 Web Audio');
          this.context = new AudioContext();
        }
        await this.context.resume();
        this.unlocked = this.context.state === 'running';
        this.warm();
        this.syncPause();
      } catch (error) { this.record('unlock-error', { error: error.message }); }
    }
    syncResource() {
      const snapshot = this.adapter.snapshot();
      const id = snapshot && snapshot.id || '';
      if (id === this.resourceId) return;
      this.reset();
      this.resourceId = id;
      // Keep decoding memory bounded as users page through hundreds of models.
      this.raw.clear(); this.buffers.clear(); this.pending.clear(); this.failures.clear();
      if (id && this.index && (this.unlocked || !this.adapter.embedded)) this.warm();
    }
    stopSource(source) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect();
      this.sources.delete(source);
    }
    stopVoice() {
      if (this.voice) this.stopSource(this.voice);
      this.voice = null;
      this.adapter.talk(false);
    }
    stopEffects() { [...this.sources].forEach(source => { if (source !== this.voice) this.stopSource(source); }); }
    reset() {
      this.generation++;
      this.loading = false;
      this.reaction = false;
      this.stopVoice(); this.stopEffects();
      this.timeline = null;
      this.idleFor = 0;
    }
    animationChanged(name, options = {}) {
      this.stopEffects();
      if (!options.keepSpeech) { this.stopVoice(); this.reaction = false; this.generation++; this.loading = false; }
      this.timeline = { name, from: -EPS, scheduled: new Set(), lastTime: 0 };
      this.lastAudioClock = this.context?.currentTime;
      this.record('animation', { name, contextTime: this.context?.currentTime || 0 });
      const snapshot = this.adapter.snapshot();
      if (snapshot && this.adapter.duration) this.scheduleEffects({ ...snapshot, animation: name, time: 0,
        duration: this.adapter.duration(name), loop: options.loop ?? snapshot.loop });
    }
    seek() {
      this.reset();
      const snapshot = this.adapter.snapshot();
      if (snapshot) this.timeline = { name: snapshot.animation, from: snapshot.time, scheduled: new Set(), lastTime: snapshot.time };
    }
    syncPause() {
      const snapshot = this.adapter.snapshot();
      const paused = document.hidden || !snapshot || !snapshot.playing || !snapshot.active;
      if (!this.context || !this.unlocked) return;
      if (paused === this.wasPaused && this.context.state === (paused ? 'suspended' : 'running')) return;
      if (paused && !this.wasPaused && this.lastAudioClock != null) {
        this.adapter.advance?.(Math.max(0, this.context.currentTime - this.lastAudioClock));
      }
      this.wasPaused = paused;
      this.lastAudioClock = this.context.currentTime;
      (paused ? this.context.suspend() : this.context.resume()).then(() => this.reportState()).catch(() => {});
    }
    playbackChanged() {
      const s = this.adapter.snapshot();
      const playbackIntent = String(!!s?.playing) + ':' + String(!!s?.active);
      if (playbackIntent !== this.lastPlayingIntent) { this.intentVersion = (this.intentVersion || 0) + 1; this.lastPlayingIntent = playbackIntent; }
      this.syncPause(); this.reportState();
    }
    animationDelta(fallback) {
      if (!this.context || !this.unlocked || this.context.state !== 'running') return fallback;
      const now = this.context.currentTime;
      const delta = this.lastAudioClock == null ? fallback : Math.max(0, now - this.lastAudioClock);
      this.lastAudioClock = now;
      return delta;
    }
    playBuffer(name, kind, when, offset, rate, eventTime) {
      const buffer = this.buffers.get(name);
      if (!buffer || !this.context || offset >= buffer.duration) return null;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = kind === 'voice' ? 1 : rate;
      source.connect(this.context.destination);
      this.sources.add(source);
      source.onended = () => {
        source.disconnect(); this.sources.delete(source);
        if (this.voice === source) { this.voice = null; this.adapter.talk(false); this.record('voice-ended', { name }); }
      };
      source.start(Math.max(when, this.context.currentTime), Math.max(0, offset));
      if (kind === 'voice') this.voice = source;
      this.record(kind, { name, eventTime, when, offset, rate: source.playbackRate.value });
      return source;
    }
    interact(category = 'touch') {
      this.syncResource();
      const snapshot = this.adapter.snapshot();
      if (!snapshot || !/^c\d{3}_\d{2}$/i.test(snapshot.id) || !snapshot.active || !this.prefs.enabled || !this.index) return false;
      const hasReaction = snapshot.animations.includes('action');
      const voiceSet = voiceSetFor(this.index, snapshot.id);
      if (!hasReaction && !voiceSet) return false;
      if (this.loading || this.voice || this.reaction) return true;
      const token = this.generation;
      const intent = this.intentVersion || 0;
      this.loading = true;
      this.idleFor = 0;
      this.unlock().then(() => this.warm()).then(() => {
        if (token !== this.generation || snapshot.id !== this.adapter.snapshot()?.id) return;
        this.loading = false;
        if (intent !== (this.intentVersion || 0)) return;
        let names = voiceSet ? voiceSet.set[category][this.prefs.affinity] : [];
        // A missing affection set may use that same character's normal set, never another costume/character.
        if (!names.length && voiceSet) names = voiceSet.set[category].normal;
        names = names.filter(name => this.buffers.has(name));
        const cursorKey = (voiceSet && voiceSet.id) + ':' + category + ':' + this.prefs.affinity;
        const name = this.prefs.voices ? chooseVoice(names, this.previous.get(cursorKey)) : null;
        if (category === 'touch' && hasReaction) {
          this.reaction = true;
          this.adapter.react('action');
        }
        this.adapter.play();
        this.syncPause();
        if (name && this.context && this.unlocked && !document.hidden) {
          this.previous.set(cursorKey, name);
          this.voice = this.playBuffer(name, 'voice', this.context.currentTime, 0, 1, 0);
          this.adapter.talk(true);
          this.adapter.status('角色台词 · ' + name);
        } else if (this.prefs.voices && voiceSet && !names.length) {
          this.adapter.status('当前台词未加载成功，动画仍可播放；声音设置里可查看台词组');
        }
      }).catch(error => { this.loading = false; this.adapter.status('角色声音加载失败：' + error.message); });
      return true;
    }
    tick() {
      if (this.disposed) return;
      this.syncResource();
      this.syncPause();
      const now = performance.now();
      if (!this.lastReport || now - this.lastReport > 200) { this.lastReport = now; this.reportState(); }
      const s = this.adapter.snapshot();
      if (!s || !s.active || document.hidden || !s.playing) return;
      if (!this.timeline || this.timeline.name !== s.animation) this.animationChanged(s.animation, { keepSpeech: true });
      const timeline = this.timeline;
      if (s.time + EPS < timeline.lastTime) { this.seek(); return; }
      const elapsed = Math.max(0, s.time - timeline.lastTime);
      timeline.lastTime = s.time;
      this.idleFor += elapsed / Math.max(0.01, s.speed);
      if (this.reaction && !s.loop && s.duration > 0 && s.time >= s.duration) {
        this.reaction = false;
        const idle = s.animations.find(name => /^(idle|stand|standing|default)$/i.test(name));
        if (idle) this.adapter.idle(idle);
        return;
      }
      if (this.prefs.idle && this.prefs.voices && this.prefs.enabled && !this.loading && !this.voice && !this.reaction && this.idleFor >= 30) this.interact('stay');
      this.scheduleEffects(s);
    }
    scheduleEffects(s) {
      const timeline = this.timeline;
      if (!timeline || !this.index || !this.prefs.enabled || !this.prefs.effects || !this.unlocked || !this.context || document.hidden) return;
      const events = this.index.resources[s.id]?.animations[s.animation] || [];
      // Schedule at the audio clock, not at the next render frame. One-shot
      // reactions are scheduled in full; loops retain one future cycle.
      const until = s.loop ? (Math.floor(s.time / s.duration) + 2) * s.duration - EPS : s.duration;
      const scheduled = eventsBetween(events, timeline.from, until, s.duration, s.loop);
      for (const entry of scheduled) {
        if (timeline.scheduled.has(entry.key)) continue;
        const clip = this.index.clips[entry.event.name];
        if (!clip || clip.kind !== 'animation-sfx') continue;
        if (!this.buffers.has(entry.event.name)) { this.buffer(entry.event.name); continue; }
        timeline.scheduled.add(entry.key);
        const delay = (entry.at - s.time) / s.speed;
        // Do not burst old effects after buffering or a timeline jump.
        if (delay < -0.15) continue;
        const source = this.playBuffer(entry.event.name, 'effect', this.context.currentTime + Math.max(0, delay), Math.max(0, -delay * s.speed), s.speed, entry.at);
        if (source) { source._key = entry.key; source._when = this.context.currentTime + Math.max(0, delay); }
      }
      timeline.from = s.time - EPS;
      // Keys from previous cycles need not grow forever on a looping animation.
      if (s.loop && s.duration > 0) {
        const oldest = Math.floor(s.time / s.duration) - 1;
        for (const key of timeline.scheduled) if (Number(key.split(':')[0]) < oldest) timeline.scheduled.delete(key);
      }
    }
    speedChanged() {
      const snapshot = this.adapter.snapshot();
      if (!snapshot || !this.context) return;
      for (const source of [...this.sources]) {
        if (source === this.voice) continue;
        if (source._when > this.context.currentTime) {
          this.timeline?.scheduled.delete(source._key);
          this.stopSource(source);
        } else source.playbackRate.setValueAtTime(snapshot.speed, this.context.currentTime);
      }
      if (this.timeline) this.timeline.from = snapshot.time - EPS;
    }
    debug() {
      const snapshot = this.adapter.snapshot();
      return { resource: this.resourceId, indexReady: !!this.index, contextState: this.context?.state || 'locked', voice: !!this.voice, reaction: this.reaction, loading: this.loading, sources: this.sources.size, prefs: { ...this.prefs }, failures: [...this.failures], history: this.history.slice(),
        playback: snapshot ? { animation: snapshot.animation, time: snapshot.time, loop: snapshot.loop, speed: snapshot.speed, playing: snapshot.playing } : null };
    }
    dispose() {
      this.reset(); this.disposed = true;
      document.getElementById('stage').removeEventListener('pointerdown', this.onGesture, { capture: true });
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.context?.close().catch(() => {});
    }
  }
  const api = { Controller, eventsBetween, voiceSetFor, chooseVoice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArtHubPortraitAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
