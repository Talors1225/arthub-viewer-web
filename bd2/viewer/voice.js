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
      this.volume = window.ArtHubBd2Volume.read();
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
      window.ArtHubBd2Volume.mount(adapter.volumeHost, volume => {
        this.volume = volume;
        if (this.output) this.output.gain.value = volume;
      });
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
      this.choose.replaceChildren(...this.scenes.flatMap((scene, index) =>
        scene.cues?.length ? [new Option(scene.name, String(index))] : []));
      this.choose.hidden = this.choose.options.length < 2;
      this.update();
      this.adapter.skillListChanged?.();
    }

    skillMotion(scene) {
      return scene?.skillMotion ?? (this.index?.nativeSkillActions ? null : scene?.motion);
    }

    skillActions(animations) {
      return this.scenes.flatMap((scene, index) => {
        const motion = this.skillMotion(scene);
        const duration = scene.nativeDuration ?? scene.duration;
        return duration > 0 && (scene.nativeTimeline || (motion?.length && motion.every(clip => animations.has(clip.animation))))
          ? [{ index, name: scene.name, duration, preview: scene.preview, nativeTimeline: scene.nativeTimeline }] : [];
      });
    }

    get skillJob() {
      return this.job?.skill ? this.job : null;
    }

    elapsed(job) {
      return job.start == null ? job.time : job.time + Math.max(0, this.context.currentTime - job.start) * job.rate;
    }

    skillPlayback() {
      const job = this.skillJob;
      return job && {
        index: job.index, duration: job.duration, time: Math.min(job.duration, this.elapsed(job)),
        playing: job.playing, loop: job.loop, ready: Boolean(job.prepared),
      };
    }

    playSkill(index, rate) {
      const scene = this.scenes[index];
      if (!(scene?.nativeTimeline || this.skillMotion(scene)?.length)) return;
      this.stop();
      this.choose.value = String(index);
      return this.play(index, rate);
    }

    setSkillPlayback({time, playing, rate, loop}) {
      const job = this.skillJob;
      if (!job) return;
      if (loop !== undefined) job.loop = loop;
      if (time !== undefined || playing !== undefined || rate !== undefined) {
        job.time = Math.max(0, Math.min(job.duration, time ?? this.elapsed(job)));
        if (playing && job.time >= job.duration) job.time = 0;
        job.playing = playing ?? job.playing;
        job.rate = rate ?? job.rate;
        this.schedule(job);
        if (job.prepared) this.sampleMotion(job, job.time);
      }
      this.update();
      this.adapter.skillStateChanged?.();
    }

    update() {
      this.panel.hidden = !this.adapter.active() || !(this.portrait || this.choose.options.length || this.skillJob);
      this.panel.dataset.playback = !this.job ? 'idle' : !this.job.prepared ? 'loading' : this.job.playing ? 'playing' : 'paused';
      this.button.textContent = this.skillJob ? '退出技能演出' : this.job ? '停止配音' :
        this.portrait ? '播放台词（日语）' : '播放过场配音（日语）';
    }

    stop() {
      if (!this.job) return;
      const job = this.job;
      this.job = null;
      job.controller.abort();
      this.stopNodes(job);
      if (job.nativeTimeline) this.adapter.releaseTimeline?.();
      else this.adapter.releaseMotion?.();
      this.update();
      if (job.skill) this.adapter.skillStateChanged?.();
    }

    stopNodes(job) {
      for (const node of job.nodes.splice(0)) {
        try { node.stop(); } catch {}
        node.disconnect();
      }
    }

    schedule(job) {
      this.stopNodes(job);
      job.start = null;
      if (!job.playing || !job.prepared) return;
      job.start = this.context.currentTime + 0.045;
      for (const { cue, buffer } of job.prepared) {
        const cueRate = cue.timeScale || 1;
        const from = Math.max(job.time, cue.start);
        const clipIn = Math.max(0, cue.clipIn || 0);
        const offset = clipIn + (from - cue.start) * cueRate;
        const until = Math.min(job.duration, cue.length == null ? Infinity : cue.start + cue.length);
        const length = Math.min((until - from) * cueRate, buffer.duration - offset);
        if (!(length > 0)) continue;
        const node = this.context.createBufferSource();
        node.buffer = buffer;
        node.playbackRate.value = cueRate * job.rate;
        node.connect(this.output);
        job.nodes.push(node);
        node.start(job.start + (from - job.time) / job.rate, offset, length);
      }
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
      if (!/^(?:JP|SFX)\/[0-9a-f]{32}\/[\w. -]+\.mp3$/.test(file)) throw Error('无效的配音路径');
      const response = await fetch(new URL(file, this.root), {signal});
      if (!response.ok) throw Error('配音读取失败（HTTP ' + response.status + '）');
      const result = await this.context.decodeAudioData(await response.arrayBuffer());
      if (signal.aborted) throw signal.reason;
      if (this.buffers.size >= 24) this.buffers.delete(this.buffers.keys().next().value);
      this.buffers.set(file, result);
      return result;
    }

    async play(index = null, rate = 1) {
      if (this.job || !this.adapter.active() || !(this.portrait || this.scenes.length)) return;
      const skill = index !== null;
      const scene = !skill && this.portrait ? null : this.scenes[index ?? Number(this.choose.value || 0)];
      const nativeTimeline = skill && scene?.nativeTimeline;
      const motion = skill ? this.skillMotion(scene) : scene?.preview ? null : scene?.motion;
      const duration = nativeTimeline ? scene.nativeDuration ?? scene.duration : scene?.duration;
      if (skill && !(nativeTimeline || motion?.length)) return;
      if (!skill && !this.portrait && !scene?.cues?.length) return;
      const job = {
        controller: new AbortController(), nodes: [], skill, index, nativeTimeline,
        start: null, time: 0, rate, playing: true, loop: false, duration: duration || 0,
        motion: motion || [], prepared: null,
      };
      this.job = job;
      this.update();
      if (skill) this.adapter.skillStateChanged?.();
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!this.context) {
          this.context = new Context();
          this.output = this.context.createGain();
          this.output.gain.value = this.volume;
          this.output.connect(this.context.destination);
        }
        await this.context.resume();
        if (job !== this.job) return;
        const cues = scene?.cues || [{event:this.portrait, start:0, clipIn:0, timeScale:1}];
        const scheduled = nativeTimeline ? scene.timelineCues
          : skill && scene?.skillCues ? [...cues, ...scene.skillCues] : cues;
        const signal = job.controller.signal;
        const loads = scheduled.map(async cue => ({ cue, buffer: await this.buffer(this.pick(cue.event), signal) }));
        const [prepared] = await Promise.all([
          nativeTimeline ? Promise.allSettled(loads).then(results => {
            const decoded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
            if (decoded.length !== results.length && !signal.aborted) {
              this.adapter.error('有 ' + (results.length - decoded.length) + ' 段原版音频未能载入');
            }
            return decoded;
          }) : Promise.all(loads),
          nativeTimeline ? this.adapter.prepareTimeline?.(nativeTimeline, signal)
            : this.adapter.prepareMotion?.(job.motion, signal, skill),
        ]);
        if (job !== this.job) return;
        if (!this.adapter.active()) { this.stop(); return; }
        job.duration ||= prepared[0]?.buffer.duration || 0;
        job.prepared = prepared;
        if (!skill && job.motion.length) this.adapter.resume();
        this.schedule(job);
        this.sampleMotion(job, job.time);
        this.update();
        if (skill) this.adapter.skillStateChanged?.();
      } catch (error) {
        if (job !== this.job) return;
        this.stop();
        this.adapter.error(error.message);
      }
    }

    sampleMotion(job, elapsed) {
      if (job.nativeTimeline) {
        this.adapter.sampleTimeline?.(elapsed);
        return;
      }
      if (!job.motion.length) return;
      const clip = job.motion.findLast(c => c.start <= elapsed) || job.motion[0];
      const time = clip.clipIn + Math.min(clip.length, Math.max(0, elapsed - clip.start)) * clip.timeScale;
      this.adapter.motion(clip, time, job.clip !== clip);
      job.clip = clip;
    }

    frame() {
      if (!this.adapter.active()) {
        this.stop();
        this.update();
        return false;
      }
      if (this.panel.hidden) this.update();
      const job = this.job;
      if (!job || job.start == null) return Boolean(job?.skill);
      let elapsed = this.elapsed(job);
      if (elapsed >= job.duration) {
        if (!job.skill) { this.stop(); return false; }
        if (!job.loop) {
          this.setSkillPlayback({ time: job.duration, playing: false });
          return true;
        }
        elapsed %= job.duration;
        job.time = elapsed;
        this.schedule(job);
      }
      this.sampleMotion(job, elapsed);
      return Boolean(job.nativeTimeline || job.motion.length);
    }
  }
  window.ArtHubBd2Voice = Bd2Voice;
})();
