import { pointInArea } from './core.mjs?v=20261015-2';

export const trackFor = action => action.sType < 6 ? 1 : (action.content?.trackIndex ?? action.index);
const realIndex = action => action.content?.trackIndex ?? action.index;

export class InteractionController {
  constructor(model, onEvent = () => {}, trackStatus = () => null, random = Math.random) {
    this.model = model;
    this.onEvent = onEvent;
    this.trackStatus = trackStatus;
    this.random = random;
    this.reset();
  }
  reset() {
    this.role = 1;
    this.idle = this.model.idle;
    this.records = new Map();
    this.counts = new Map();
    this.segments = new Map();
    this.pending = [];
    this.events = [];
    this.restoreObjects = new Set();
    this.cooldownUntil = this.blockedUntil = 0;
    this.switching = false;
    this.dragging = null;
    this.resetActive();
  }
  resetActive() {
    this.active = new Map(this.model.actions.map(a => [a.index,
      a.sName !== 'in' && !!a.areas?.length && (a.role || 1) === this.role && a.content?.isHide === undefined]));
  }
  emit(event) {
    this.events.push(event);
    if (this.events.length > 100) this.events.shift();
    this.onEvent(event);
    return event;
  }
  ignore(index, reason) { return this.emit({ kind: 'ignored', index, reason }); }
  action(index) { return this.model.actions.find(a => a.index === Number(index)); }
  hit(x, y) {
    return [...this.model.actions].reverse().find(a => this.active.get(a.index) && a.areas?.[0] && pointInArea(x, y, a.areas[0])) || null;
  }
  isIdle() { return !this.trackStatus(1)?.exists; }
  schedule(at, run, key) {
    if (key) this.pending = this.pending.filter(row => row.key !== key);
    this.pending.push({ at, run, key });
  }
  tick(now) {
    this.time = now;
    const due = this.pending.filter(row => row.at <= now);
    this.pending = this.pending.filter(row => row.at > now);
    for (const row of due) row.run();
    for (const [track, segment] of this.segments) {
      if (!segment.moving && segment.expires !== undefined && now >= segment.expires) {
        segment.moving = true;
        segment.final = true;
        segment.progress = 0;
        delete segment.expires;
        this.emit({ kind: 'segment', index: segment.index, track, name: segment.name, phase: segment.phase, progress: 0, direction: -1, final: true, audioIds: [] });
      }
    }
  }
  audioIds(action, phase) {
    const ids = action.audioId || [];
    if (!ids.length) return [];
    const content = action.content || {};
    if (ids.length > 1 && (content.actions || content.clicks || content.randomActions || content.orderActions)) {
      const id = ids[(phase || this.records.get(realIndex(action)) || 1) - 1];
      return id ? [id] : [];
    }
    const id = ids[Math.min(ids.length - 1, Math.floor(this.random() * ids.length))];
    return id ? [id] : [];
  }
  activation(action, reverse = false) {
    for (const [key, value] of Object.entries(action.content?.activation || {})) {
      this.active.set(Number(key), reverse ? value !== 1 : value === 1);
    }
  }
  clear(indices) {
    const tracks = new Set();
    for (const index of indices) {
      const action = this.action(index);
      if (!action) continue;
      const track = trackFor(action);
      tracks.add(track);
      this.records.delete(realIndex(action));
      this.segments.delete(track);
    }
    if (tracks.size) this.emit({ kind: 'clear', tracks: [...tracks] });
  }
  trigger(index, now, force = false) {
    this.tick(now);
    const action = this.action(index);
    if (!action || (!force && !this.active.get(action.index))) return this.ignore(index, 'inactive');
    if (!force && (this.switching || this.dragging || now < this.blockedUntil)) return this.ignore(index, 'transition');
    if (!force && now < this.cooldownUntil) return this.ignore(index, 'cooldown');
    this.cooldownUntil = now + 0.5;
    const content = action.content || {}, track = trackFor(action);
    if (!force && content.conditions) {
      const [target, min, max] = content.conditions;
      const status = this.trackStatus(trackFor(this.action(target) || { sType: 6, index: target }));
      const percent = status?.percent || 0;
      const satisfied = content.conditions.length === 2
        ? (min === 0 ? !status?.exists : status?.exists && percent >= min)
        : percent >= min && percent <= (max ?? 1);
      if (!satisfied) return this.ignore(index, 'condition');
    }
    if (!force) {
      if (track === 1 && !content.actions && !this.isIdle()) return this.ignore(index, 'busy');
      if ((content.needIdle || content.guochange) && !this.isIdle()) return this.ignore(index, 'busy');
      if (content.guochange && this.trackStatus(track)?.moving) return this.ignore(index, 'busy');
      if (content.noClick?.some(i => {
        const a = this.action(i); return a && (this.trackStatus(trackFor(a))?.percent || 0) > 0.0001;
      })) return this.ignore(index, 'condition');
      if (content.needClicks?.some(i => !this.counts.get(i))) return this.ignore(index, 'condition');
    }
    if (content.asmr) return this.emit({ kind: 'asmr', index, id: content.asmr.id });
    if (action.nextId && !action.sName) return this.emit({ kind: 'plot', index, nextId: action.nextId });
    if (this.restoreObjects.delete(action.index)) this.emit({ kind: 'restore-object', index, content });
    if (content.reset7) this.clear(content.reset7);
    let name = action.sName, phase;
    if (content.randomActions?.length) {
      const target = this.random();
      let total = 0;
      phase = content.randomActions.findIndex(row => (total += row[1]) >= target) + 1;
      if (!phase) phase = content.randomActions.length;
      name = content.randomActions[phase - 1][0];
      this.records.set(realIndex(action), phase);
    }
    if (content.orderActions?.length) {
      phase = (this.records.get(realIndex(action)) || 0) % content.orderActions.length + 1;
      name = content.orderActions[phase - 1];
      this.records.set(realIndex(action), phase);
    }
    if (content.clicks?.length && track !== 1) {
      if (this.segments.get(track)?.moving) return this.ignore(index, 'segment-moving');
      phase = (this.records.get(realIndex(action)) || 0) % content.clicks.length + 1;
      const progress = content.clicks[phase - 1];
      this.records.set(realIndex(action), phase);
      this.activation(action, phase % 2 === 0);
      const segment = { index, name, phase, progress, moving: true, final: phase === content.clicks.length };
      this.segments.set(track, segment);
      this.counts.set(index, (this.counts.get(index) || 0) + 1);
      return this.emit({ kind: 'segment', ...segment, track, direction: progress === 0 ? -1 : 1, audioIds: this.audioIds(action, phase), hideTxt: action.hideTxt });
    }
    this.activation(action);
    if (content.actions && this.trackStatus(track)?.exists) {
      if (this.trackStatus(track).name !== name) return this.ignore(index, 'busy');
      return this.emit({ kind: 'repeat', index, track, name, content });
    }
    if (content.changeIdle) {
      this.schedule(now + content.changeIdle[1] / 1000, () => {
        const ignores = new Set([track, ...content.changeIdle.slice(2).map(i => trackFor(this.action(i) || { sType: 6, index: i }))]);
        const clear = this.model.actions.filter(a => !ignores.has(trackFor(a))).map(a => a.index);
        this.clear(clear);
        this.idle = content.changeIdle[0];
        this.emit({ kind: 'idle', name: this.idle });
      }, 'idle');
    }
    if (content.changerole?.[1]) {
      this.blockedUntil = now + (content.changerole[2] || 1) / 1000;
      this.emit({ kind: 'interlude', prefab: content.changerole[1].toLowerCase(), duration: (content.changerole[2] || 1) / 1000 });
    }
    this.counts.set(index, (this.counts.get(index) || 0) + 1);
    const result = this.emit({ kind: 'action', index, track, name, content,
      fadeIn: track === 1 && !content.noFade,
      fadeOut: track === 1 || !!content.guochange,
      audioIds: this.audioIds(action, phase), hideTxt: action.hideTxt });
    if (!name) {
      const delay = content.changerole ? Math.floor((content.changerole[2] || 0) / 2) / 1000 : 0;
      if (delay) this.schedule(now + delay, () => this.complete(index, this.time));
      else this.complete(index, now);
    }
    return result;
  }
  segmentReached(track, now) {
    const segment = this.segments.get(track);
    if (!segment) return;
    segment.moving = false;
    const action = this.action(segment.index);
    if (segment.final) {
      this.records.delete(realIndex(action));
      this.segments.delete(track);
      this.activation(action, true);
    } else if (action.content?.clickTime !== undefined) segment.expires = now + action.content.clickTime;
  }
  complete(index, now) {
    const action = this.action(index), content = action?.content || {};
    if (content.changerole) {
      const change = content.changerole;
      if (!change[4]) { this.records.clear(); this.segments.clear(); }
      else {
        const pairs = String(change[4]).split('_').map(Number);
        for (let i = 0; i < pairs.length; i += 2) {
          const from = this.action(pairs[i]), to = this.action(pairs[i + 1]);
          if (from && to && this.records.has(realIndex(from))) this.records.set(realIndex(to), this.records.get(realIndex(from)));
        }
      }
      this.role = change[5] || 3 - (action.role || 1);
      this.switching = true;
      this.resetActive();
      this.emit({ kind: 'role', index, role: this.role, prefab: change[0].toLowerCase(), next: change[3] || null });
    } else if (content.nextClick) {
      this.schedule(now + 0.501, () => {
        this.emit({ kind: 'clear', tracks: [trackFor(action)] });
        this.trigger(content.nextClick, this.time, true);
      });
    }
  }
  roleLoaded(now, idle, next) {
    this.switching = false;
    this.idle = idle;
    for (const action of this.model.actions) {
      const phase = this.records.get(realIndex(action));
      if ((action.role || 1) !== this.role || !phase || !action.content?.clicks) continue;
      const progress = action.content.clicks[phase - 1];
      this.segments.set(trackFor(action), { index: action.index, name: action.sName, phase, progress, moving: false, final: false });
      this.emit({ kind: 'segment', index: action.index, name: action.sName, track: trackFor(action), phase, progress, direction: 0, restore: true, final: false, audioIds: [] });
      this.activation(action, phase % 2 === 0);
    }
    if (next) this.trigger(Number(next), now, true);
  }
  beginDrag(index, now) {
    const action = this.action(index);
    if (!action || !this.active.get(index) || this.restoreObjects.has(index)) return false;
    if (this.switching || this.dragging || now < this.blockedUntil || !this.isIdle()) return false;
    this.dragging = { index, x: 0, y: 0 };
    this.counts.set(index, (this.counts.get(index) || 0) + 1);
    this.emit({ kind: 'drag-start', index, track: trackFor(action), name: action.sName, gesture: action.gesture, content: action.content || {}, audioIds: this.audioIds(action), hideTxt: action.hideTxt });
    return true;
  }
  moveDrag(dx, dy) {
    if (!this.dragging) return;
    this.dragging.x += dx; this.dragging.y += dy;
    const action = this.action(this.dragging.index);
    this.emit({ kind: 'drag-move', index: action.index, name: action.sName, track: trackFor(action), gesture: action.gesture, dx, dy, x: this.dragging.x, y: this.dragging.y, content: action.content || {} });
  }
  endDrag() {
    if (!this.dragging) return;
    const action = this.action(this.dragging.index), content = action.content || {};
    this.emit({ kind: 'drag-end', index: action.index, name: action.sName, track: trackFor(action), content });
    this.dragging = null;
  }
  snapshot() {
    return { role: this.role, idle: this.idle, active: [...this.active].filter(([, active]) => active).map(([index]) => index), records: Object.fromEntries(this.records), segments: [...this.segments].map(([track, segment]) => ({ track, ...segment })), dragging: this.dragging, events: this.events };
  }
}
