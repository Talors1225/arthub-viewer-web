/* Local BD2 voice playback. Cues and variants come from the extracted game data. */
(() => {
  class Bd2Voice {
    constructor(adapter) {
      this.adapter = adapter;
      this.root = new URL(adapter.root, location.href);
      this.current = null;
      this.scenes = [];
      this.job = null;
      this.last = new Map();
      this.buffers = new Map();
      this.index = null;
      const panel = document.createElement('div');
      panel.className = 'bd2-voice-controls';
      panel.hidden = true;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', '棕色尘埃2配音');
      const choose = document.createElement('select');
      choose.className = 'ctl';
      choose.setAttribute('aria-label', '配音场景');
      choose.onchange = () => this.stop();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ctl';
      button.onclick = () => this.job ? this.stop() : this.play();
      panel.append(choose, button);
      document.body.append(panel);
      this.panel = panel;
      this.choose = choose;
      this.button = button;
      this.ready = fetch(new URL('index.json', this.root))
        .then(r => { if (!r.ok) throw Error('配音索引读取失败'); return r.json(); })
        .then(data => {
          if (data.schemaVersion !== 1) throw Error('配音索引版本不兼容');
          this.index = data;
          this.syncSelection();
        }).catch(error => this.adapter.error(error.message));
    }

    select(id, variant) {
      this.stop();
      this.current = id ? {id, variant: String(variant)} : null;
      this.syncSelection();
    }

    syncSelection() {
      const {id, variant} = this.current || {};
      this.portrait = this.index?.portraits[id];
      this.scenes = this.index?.cutscenes[id]?.[variant] || [];
      this.choose.replaceChildren(...this.scenes.map((scene, index) => new Option(scene.name, String(index))));
      this.choose.hidden = this.scenes.length < 2;
      this.update();
    }

    update() {
      this.panel.hidden = !this.adapter.active() || !(this.portrait || this.scenes.length);
      this.panel.dataset.playback = !this.job ? 'idle' : this.job.start == null ? 'loading' : 'playing';
      this.button.textContent = this.job ? '停止配音' : this.portrait ? '播放台词（日语）' : '播放过场配音（日语）';
    }

    stop() {
      if (!this.job) return;
      const job = this.job;
      this.job = null;
      job.controller.abort();
      for (const node of job.nodes) {
        try { node.stop(); } catch {}
        node.disconnect();
      }
      this.update();
    }

    tap() {
      if (!this.portrait) return;
      this.stop();
      this.play();
    }

    pick(event) {
      const files = this.index.events[event];
      if (!files?.length) throw Error('未找到原版配音');
      const previous = this.last.get(event);
      const choices = files.length === 1 ? files : files.filter(file => file !== previous);
      const selected = choices[Math.floor(Math.random() * choices.length)];
      this.last.set(event, selected);
      return selected;
    }

    async buffer(file, signal) {
      if (this.buffers.has(file)) return this.buffers.get(file);
      if (!/^JP\/[0-9a-f]{32}\/[\w. -]+\.mp3$/.test(file)) throw Error('无效的配音路径');
      const response = await fetch(new URL(file, this.root), {signal});
      if (!response.ok) throw Error('配音读取失败（HTTP ' + response.status + '）');
      const result = await this.context.decodeAudioData(await response.arrayBuffer());
      if (signal.aborted) throw signal.reason;
      if (this.buffers.size >= 24) this.buffers.delete(this.buffers.keys().next().value);
      this.buffers.set(file, result);
      return result;
    }

    async play() {
      if (this.job || !this.adapter.active() || !(this.portrait || this.scenes.length)) return;
      const job = {controller: new AbortController(), nodes: [], start: null};
      this.job = job;
      this.update();
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        this.context ||= new Context();
        await this.context.resume();
        if (job !== this.job) return;
        const scene = this.portrait ? null : this.scenes[Number(this.choose.value || 0)];
        const cues = scene?.cues || [{event:this.portrait, start:0, clipIn:0, timeScale:1}];
        const prepared = await Promise.all(cues.map(async cue => ({
          cue, buffer: await this.buffer(this.pick(cue.event), job.controller.signal),
        })));
        if (job !== this.job || !this.adapter.active()) return;
        job.start = this.context.currentTime + 0.06;
        job.duration = scene?.duration || prepared[0].buffer.duration;
        job.motion = scene?.motion || [];
        if (job.motion.length) this.adapter.resume();
        for (const {cue,buffer} of prepared) {
          const node = this.context.createBufferSource();
          node.buffer = buffer;
          node.playbackRate.value = cue.timeScale || 1;
          const offset = Math.max(0, cue.clipIn || 0);
          const available = buffer.duration - offset;
          const length = Math.min(available, cue.length == null ? available : cue.length * node.playbackRate.value);
          if (!(length > 0)) continue;
          node.connect(this.context.destination);
          job.nodes.push(node);
          node.start(job.start + cue.start, offset, length);
        }
        this.update();
      } catch (error) {
        if (job !== this.job) return;
        this.stop();
        this.adapter.error(error.message);
      }
    }

    frame() {
      if (!this.adapter.active()) {
        this.stop();
        this.update();
        return false;
      }
      if (this.panel.hidden) this.update();
      const job = this.job;
      if (!job || job.start == null) return false;
      const elapsed = Math.max(0, this.context.currentTime - job.start);
      if (elapsed >= job.duration) { this.stop(); return false; }
      if (!job.motion.length) return false;
      const clip = job.motion.findLast(c => c.start <= elapsed) || job.motion[0];
      const time = clip.clipIn + Math.min(clip.length, Math.max(0, elapsed - clip.start)) * clip.timeScale;
      this.adapter.motion(clip, time, job.clip !== clip);
      job.clip = clip;
      return true;
    }
  }
  window.ArtHubBd2Voice = Bd2Voice;
})();
