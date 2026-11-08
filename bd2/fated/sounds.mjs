export class FatedSound {
  constructor(model, manifest, root, mode, debug = false) {
    this.model = model;
    this.files = manifest.files;
    this.loops = new Set(manifest.loops || []);
    this.root = root;
    this.mode = mode;
    this.debug = debug;
    this.controller = new AbortController();
    this.buffers = new Map();
    this.history = [];
    this.sources = [];
    this.serial = 0;
  }

  unlock() {
    if (this.mode === 'off' || this.controller.signal.aborted) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      this.context ||= new Audio();
      this.ready = (this.context.state === 'running' ? Promise.resolve() : this.context.resume())
        .then(() => this.startAmbient())
        .catch(error => this.note({ kind: 'error', message: error.message }));
    } catch (error) {
      this.note({ kind: 'error', message: error.message });
    }
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.stopReaction();
    if (mode === 'off') this.stopAmbient();
    else this.unlock();
  }

  buffer(event) {
    const file = this.files[event];
    if (!file || !this.context) return Promise.resolve(null);
    if (!this.buffers.has(event)) {
      const path = file.split('/').map(encodeURIComponent).join('/');
      const url = new URL(path, this.root);
      const job = fetch(url, { signal: this.controller.signal }).then(response => {
        if (!response.ok) throw new Error('音频请求失败 HTTP ' + response.status);
        return response.arrayBuffer();
      }).then(bytes => this.context.decodeAudioData(bytes)).catch(error => {
        this.buffers.delete(event);
        if (!this.controller.signal.aborted) this.note({ kind: 'error', event, message: error.message });
        return null;
      });
      this.buffers.set(event, job);
    }
    return this.buffers.get(event);
  }

  source(buffer, time, loop = false) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(this.context.destination);
    source.start(time);
    return source;
  }

  startAmbient() {
    const event = this.model.ambient;
    if (!this.files[event] || this.ambientJob || this.mode === 'off' || this.controller.signal.aborted) return;
    const job = this.buffer(event).then(buffer => {
      if (job !== this.ambientJob || this.controller.signal.aborted) return;
      if (!buffer) {
        this.ambientJob = null;
        return;
      }
      this.ambientSource = this.source(buffer, this.context.currentTime, true);
      this.note({ kind: 'ambient', events: [event], duration: buffer.duration });
    });
    this.ambientJob = job;
  }

  point(point, kind, index) {
    const key = point.group + '/' + point.id;
    this.play(this.model.points[key]?.[kind]?.[index], kind, key, index);
  }

  score(group, effect) {
    const key = group + '/' + effect.score + '/' + effect.animation;
    this.play(this.model.scores[key], 'score', key, 0);
  }

  async play(cue, kind, key, index) {
    if (!cue || this.mode === 'off' || !this.context) return;
    const events = [cue.fx, this.mode === 'all' && cue.voice].filter(event => this.files[event]);
    this.stopReaction();
    if (!events.length) return;
    const serial = this.serial;
    this.held = kind === 'hold-enter' || kind === 'hold-repeat';
    const buffers = await Promise.all(events.map(event => this.buffer(event)));
    await this.ready;
    if (serial !== this.serial || this.context.state !== 'running' || this.controller.signal.aborted) return;
    const start = this.context.currentTime + 0.01;
    const started = [];
    for (const [i, buffer] of buffers.entries()) {
      if (!buffer) continue;
      const source = this.source(buffer, start, this.loops.has(events[i]));
      this.sources.push(source);
      source.onended = () => {
        source.disconnect();
        this.sources = this.sources.filter(item => item !== source);
      };
      started.push(events[i]);
    }
    if (started.length) this.note({ kind, key, index, events: started, startedAt: start });
  }

  stopReaction() {
    this.serial++;
    this.held = false;
    for (const source of this.sources) source.stop();
    this.sources = [];
  }

  stopHold() {
    if (this.held) this.stopReaction();
  }

  stopAmbient() {
    this.ambientJob = null;
    this.ambientSource?.stop();
    this.ambientSource?.disconnect();
    this.ambientSource = null;
  }

  note(item) {
    if (!this.debug) return;
    this.history.push(item);
    if (this.history.length > 40) this.history.shift();
  }

  snapshot() {
    return { state: this.context?.state || 'locked', mode: this.mode, history: this.history.slice() };
  }

  dispose() {
    this.controller.abort();
    this.stopReaction();
    this.stopAmbient();
    this.buffers.clear();
    this.context?.close().catch(() => {});
  }
}
