// RectTransforms under SkeletonUtilityBone bindings use the authored Spine units.
// A directly bound rect already gets its origin from the bone.
function zoneToLocal(zone, bone, position) {
  let { x, y } = bone.worldToLocal({ ...position });
  for (const part of [...zone.chain].reverse()) {
    const dx = x - part.offset[0], dy = y - part.offset[1];
    const c = Math.cos(part.angle), s = Math.sin(part.angle);
    x = (c * dx + s * dy) / part.scale[0];
    y = (-s * dx + c * dy) / part.scale[1];
  }
  return { x, y };
}

function centerOf(zone) {
  return zone.offset || zone.size.map((size, axis) => size * (0.5 - zone.pivot[axis]));
}

function zoneToWorld(zone, bone, x, y) {
  for (const part of zone.chain) {
    const dx = x * part.scale[0], dy = y * part.scale[1];
    const c = Math.cos(part.angle), s = Math.sin(part.angle);
    x = part.offset[0] + c * dx - s * dy;
    y = part.offset[1] + s * dx + c * dy;
  }
  return bone.localToWorld({ x, y });
}

function zonePosition(zone, bone, horizontal = 0, vertical = 0) {
  const [cx, cy] = centerOf(zone);
  return zoneToWorld(zone, bone, cx + zone.size[0] * horizontal, cy + zone.size[1] * vertical);
}

function hitZone(zone, bone, position) {
  if (!bone?.active || Math.abs(bone.a * bone.d - bone.b * bone.c) < 1e-10) return false;
  const { x, y } = zoneToLocal(zone, bone, position);
  const [cx, cy] = centerOf(zone);
  return Math.abs(x - cx) <= zone.size[0] / 2 && Math.abs(y - cy) <= zone.size[1] / 2;
}

function zoneArea(zone, bone) {
  const scale = zone.chain.reduce((area, part) => area * part.scale[0] * part.scale[1], 1);
  return Math.abs(zone.size[0] * zone.size[1] * scale * (bone.a * bone.d - bone.b * bone.c));
}

const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

function boxCorners(zone, bone, origin) {
  if (!bone?.active || zoneArea(zone, bone) < 1e-8) return null;
  const current = origin ? zoneToWorld(zone, bone, 0, 0) : null;
  return CORNERS.map(([x, y]) => {
    const vertex = zonePosition(zone, bone, x, y);
    if (origin) {
      vertex.x += origin.x - current.x;
      vertex.y += origin.y - current.y;
    }
    return vertex;
  });
}

function boxesOverlap(left, right) {
  // The moving and destination boxes can both rotate with the Spine bones.
  for (const box of [left, right]) {
    for (let i = 0; i < 2; i++) {
      const dx = box[i + 1].x - box[i].x, dy = box[i + 1].y - box[i].y;
      const project = point => dx * point.y - dy * point.x;
      const a = left.map(project), b = right.map(project);
      if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
    }
  }
  return true;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const MOVE_THRESHOLD = 7;
const DEFAULT_TOOL = { id: 0, skin: 'default' };
const SPOT_SAMPLES = [
  [0, 0], [0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28],
  [0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28],
];

function collectAnimationGroups(profile, rules, animations) {
  const groups = profile.groups.map((group, index) => ({ key: String(group.id), label: `第 ${index + 1} 段`, clips: [] }));
  const groupIndices = new Map(profile.groups.map((group, index) => [group.id, index]));
  const authored = new Map();
  const add = (name, groupIndex, label, track, details = {}) => {
    if (animations.has(name) && !authored.has(name)) authored.set(name, { name, groupIndex, label, track, ...details });
  };
  const pointClips = (point, names, label, cue, track = 1, offset = 0) => {
    const groupIndex = groupIndices.get(point.group);
    if (groupIndex === undefined) return;
    names.forEach((name, index) => add(name, groupIndex, label, track, { point, cue, cueIndex: index + offset }));
  };
  const gestureLabel = point => {
    const action = rules.points?.[point.sourceId]?.gyro === 1 ? 1 : point.action;
    if (action === 0) return '点按';
    return action === 1 || action === 2 ? '拖动' : '互动';
  };
  profile.groups.forEach((group, index) => {
    add(group.idle, index, '待机', 0, { idle: true });
    add(group.switch, index, '转场', 0);
  });
  // A full motion can also appear in a hold-success list. Use its authored base track.
  for (const point of profile.points) pointClips(point, point.motions, point.advance ? '转场' : gestureLabel(point), 'motion', 0);
  profile.groups.forEach((group, index) => {
    for (const effect of rules.groups?.[group.id]?.effects || []) add(effect.animation, index, '计量', 1, { effect });
  });
  for (const point of profile.points) {
    pointClips(point, point.reactions, gestureLabel(point), 'mix');
    pointClips(point, point.hold.loop, '长按', 'hold-enter');
    pointClips(point, point.hold.success, '长按', 'hold-success');
    pointClips(point, point.hold.fail, '松开', 'hold-fail');
    pointClips(point, [point.stop], '复位', 'mix', 1, point.reactions.length);
  }
  const other = { key: 'other', label: '其他动画', clips: [] };
  for (const name of animations) {
    const mixGroup = /^mix(\d+)_/.exec(name);
    const groupIndex = mixGroup ? groupIndices.get(Number(mixGroup[1])) : undefined;
    const clip = authored.get(name) || { name, groupIndex, label: '其他', track: mixGroup ? 1 : 0 };
    (groups[clip.groupIndex] || other).clips.push(clip);
  }
  const order = new Intl.Collator('en', { numeric: true });
  const availableGroups = [...groups, other].filter(group => group.clips.length);
  for (const group of availableGroups) {
    group.clips.sort((a, b) => Number(Boolean(b.idle)) - Number(Boolean(a.idle)) || order.compare(a.name, b.name));
  }
  return availableGroups;
}

function positionKeys(timeline, bone, limit, duration) {
  let longest = 0, start = null, parked = false;
  const { frames } = timeline;
  for (let i = 0; i < frames.length; i += 3) {
    const distance = Math.max(Math.abs(bone.x + frames[i + 1]), Math.abs(bone.y + frames[i + 2]));
    if (distance < limit) {
      start ??= frames[i];
      // Spine 4.1 stores stepped curves as 1. The current position holds to the next key.
      const end = timeline.curves[i / 3] === 1 ? (frames[i + 3] ?? duration) : frames[i];
      longest = Math.max(longest, end - start);
    } else {
      parked = true;
      start = null;
    }
  }
  if (start !== null) longest = Math.max(longest, duration - start);
  // Reset keys at the very end of an animation do not give a player time to react.
  return { seconds: longest, parked };
}

export class FatedGestures {
  constructor(profile, skeleton, state, data, TranslateTimeline, frame, rules = {}, audio = null) {
    this.profile = profile;
    this.skeleton = skeleton;
    this.state = state;
    this.animations = new Set(data.animations.map(animation => animation.name));
    this.skins = new Set(data.skins.map(skin => skin.name));
    this.bones = new Map(skeleton.bones.map(bone => [bone.data.name, bone]));
    this.rules = rules;
    this.audio = audio;
    this.animationGroups = collectAnimationGroups(profile, rules, this.animations);
    this.hiddenOwners = new Map();
    this.points = profile.points.map(point => {
      const rule = rules.points?.[point.sourceId];
      const hit = point.dragBone || point.zone;
      const action = rule?.gyro === 1 ? 1 : point.action;
      return { ...point, action, hit, rule };
    }).filter(point => point.hit && this.bones.has(point.hit.bone) &&
      (!/_(gyro|mic)(?:[_\s]|$)/i.test(point.name) || point.rule?.gyro) &&
      (point.advance || this.hasAnimation([
        ...point.reactions, ...point.motions, ...point.hold.loop, ...point.hold.success, ...point.hold.fail, point.stop,
      ])));
    for (const point of this.points) {
      for (const target of point.rule?.hidden?.targets || []) this.hiddenOwners.set(target, point);
    }
    this.reveals = this.revealLinks(data, TranslateTimeline, frame);
    this.routes = this.routeDistances();
    this.clicks = new Map();
    this.stayed = new Map();
    this.groupIndex = 0;
    this.gesture = null;
    this.reaction = null;
    this.switching = null;
    this.last = null;
    this.serial = 0;
    this.restart();
  }

  hasAnimation(names) {
    return names.some(name => this.animations.has(name));
  }

  revealLinks(data, TranslateTimeline, frame) {
    const links = new Map();
    if (!TranslateTimeline) return links;
    const limit = frame ? 2 * Math.max(frame.maxX - frame.minX, frame.maxY - frame.minY) : 8000;
    const pointsByBone = new Map();
    const parkedInIdle = new Set();
    for (const group of this.profile.groups) {
      const idleAnimation = data.findAnimation(group.idle);
      const positions = new Map(idleAnimation?.timelines
        .filter(timeline => timeline instanceof TranslateTimeline).map(timeline => [timeline.boneIndex, timeline]));
      for (const point of this.points.filter(point => point.group === group.id)) {
        const bone = this.bones.get(point.hit.bone).data;
        const points = pointsByBone.get(bone.index) || [];
        points.push(point);
        pointsByBone.set(bone.index, points);
        const idle = positions.get(bone.index);
        if (idle && positionKeys(idle, bone, limit, idleAnimation.duration).parked) parkedInIdle.add(point);
      }
    }
    for (const point of this.points) {
      const targets = new Set(), byAnimation = new Map();
      const names = new Set([...point.reactions, ...point.motions, ...point.hold.success]);
      for (const name of names) {
        if (!this.animations.has(name)) continue;
        const revealed = [];
        const animation = data.findAnimation(name);
        for (const timeline of animation.timelines) {
          if (!(timeline instanceof TranslateTimeline)) continue;
          const related = pointsByBone.get(timeline.boneIndex);
          if (!related) continue;
          const keys = positionKeys(timeline, this.bones.get(related[0].hit.bone).data, limit, animation.duration);
          if (keys.seconds < 0.15) continue;
          for (const target of related) {
            if (target === point || target.group !== point.group || target.tool !== point.tool) continue;
            // An ordinary animated position is only a reveal if the point is also parked offscreen.
            if (!keys.parked && !parkedInIdle.has(target)) continue;
            revealed.push({ point: target, seconds: keys.seconds });
            targets.add(target);
          }
        }
        if (revealed.length) byAnimation.set(name, revealed);
      }
      if (targets.size) links.set(point, { targets, byAnimation });
    }
    // Some bones are parked outside the portrait through the parent pose, even
    // though their own translate keys never reach the usual offscreen sentinel.
    const bySource = new Map(this.points.map(point => [point.sourceId, point]));
    for (const { source, animation, target, seconds } of this.rules.reveals || []) {
      const point = bySource.get(source), step = bySource.get(target);
      if (!point || !step || !this.animations.has(animation)) continue;
      const link = links.get(point) || { targets: new Set(), byAnimation: new Map() };
      const entries = link.byAnimation.get(animation) || [];
      if (!entries.some(entry => entry.point === step)) entries.push({ point: step, seconds });
      link.byAnimation.set(animation, entries);
      link.targets.add(step);
      links.set(point, link);
    }
    return links;
  }

  routeDistances() {
    const distance = new Map(), previous = new Map();
    for (const [point, link] of this.reveals) {
      for (const target of link.targets) {
        const sources = previous.get(target) || [];
        sources.push(point);
        previous.set(target, sources);
      }
    }
    const queue = this.points.filter(point => point.advance);
    for (const point of queue) distance.set(point, 0);
    for (const target of queue) {
      for (const source of previous.get(target) || []) {
        if (distance.has(source)) continue;
        distance.set(source, distance.get(target) + 1);
        queue.push(source);
      }
    }
    return distance;
  }

  routeSteps(point, animation) {
    const current = this.routes.get(point) ?? Infinity;
    return (this.reveals.get(point)?.byAnimation.get(animation) || [])
      .filter(step => (this.routes.get(step.point) ?? Infinity) < current)
      .sort((left, right) => this.routes.get(left.point) - this.routes.get(right.point));
  }

  clickExpired(point, previous, now) {
    const gauge = point.rule?.gauge;
    const timesOut = point.clicks > 1 && !point.random && (point.stop || gauge) &&
      (previous.count < point.clicks || gauge);
    return timesOut && now - previous.time >= point.clickReset * 1000;
  }

  clickCount(point, now) {
    const previous = this.clicks.get(point.sourceId);
    return previous && !this.clickExpired(point, previous, now) ? previous.count : 0;
  }

  clicksLeft(point, now) {
    if (point.action !== 0 || point.hold.action || point.random) return 0;
    const count = this.clickCount(point, now);
    const revealIndex = point.reactions.findIndex(name => this.routeSteps(point, name).length);
    const total = point.advance ? point.clicks : revealIndex + 1;
    return total > 1 && count < total ? total - count : 0;
  }

  get group() { return this.profile.groups[this.groupIndex]; }
  get tools() { return this.group.tools.length ? this.group.tools : [DEFAULT_TOOL]; }
  get gauge() { return this.rules.groups?.[this.group.id]; }
  get inputLocked() {
    const reaction = this.reaction;
    return Boolean(this.switching || reaction?.advance || reaction?.track === 0 || reaction?.kind === 'preview');
  }
  get toolLocked() {
    return Boolean(this.switching || this.gesture || (this.reaction &&
      (!this.profile.allowDuringAnimation || this.reaction.kind === 'preview')));
  }
  get activePoints() {
    return this.points.filter(point => point.group === this.group.id && point.tool === this.tool.id &&
      this.pointAvailable(point));
  }

  pointAvailable(point) {
    const owner = this.hiddenOwners.get(point.sourceId);
    if (owner && this.hidden?.owner !== owner) return false;
    if (!owner && this.hidden?.owner.rule.hidden.exclusive) return false;
    const range = point.rule?.gauge?.range;
    const score = Math.round(this.score);
    return !range || !this.gauge || (range[0] <= score && score <= range[1]);
  }

  record(point, kind, animation) {
    this.serial++;
    this.last = { kind, animation, point: point?.id ?? null, group: this.group.id };
  }

  nextIndex(point) {
    return this.profile.groups.findIndex(group => group.id === (point.rule?.next || this.group.id + 1));
  }

  addScore(delta, point, automatic = false) {
    const gauge = this.gauge;
    if (!gauge || !delta) return;
    const before = Math.round(this.score);
    this.score = clamp(this.score + delta, automatic ? Math.max(gauge.range[0], gauge.decayRange[0]) : gauge.range[0], gauge.range[1]);
    const after = Math.round(this.score);
    const effect = delta > 0
      ? [...gauge.effects].reverse().find(item => item.increase && before < item.score && item.score <= after)
      : gauge.effects.find(item => item.decrease && after <= item.score && item.score < before);
    if (effect) {
      this.play(point, [effect.animation], 0, false, 'score');
      this.audio?.score(this.group.id, effect);
    }
  }

  applySkin() {
    const skin = this.skins.has(this.tool.skin) ? this.tool.skin : 'default';
    if (this.skins.has(skin)) this.skeleton.setSkinByName(skin);
    this.skeleton.setSlotsToSetupPose();
  }

  enterGroup(index, transition) {
    const priorTool = this.tool;
    this.groupIndex = index;
    this.gesture = this.reaction = this.switching = null;
    this.hidden = null;
    this.score = this.gauge ? clamp(this.gauge.start, ...this.gauge.range) : 0;
    this.scored = false;
    this.previousPoint = null;
    this.stayed.clear();
    this.clicks.clear();
    this.tool = (transition && this.group.keepTool && this.tools.find(tool => tool.id === priorTool?.id)) || this.tools[0];
    this.state.clearTracks();
    this.skeleton.setToSetupPose();
    this.applySkin();
    const groupSwitch = transition && this.animations.has(this.group.switch) ? this.group.switch : '';
    const entry = this.state.setAnimation(0, groupSwitch || this.group.idle, !groupSwitch);
    if (groupSwitch) this.switching = entry;
  }

  restart() {
    this.audio?.stopReaction();
    this.last = null;
    this.enterGroup(0, false);
  }

  previewAnimation(clip) {
    this.cancel();
    this.audio?.stopReaction();
    this.enterGroup(clip.groupIndex ?? this.groupIndex, false);
    if (clip.point) {
      this.chooseTool(clip.point.tool);
      this.audio?.point(clip.point, clip.cue, clip.cueIndex);
    } else if (clip.effect) {
      this.audio?.score(this.group.id, clip.effect);
    }
    if (clip.idle) {
      this.record(null, 'preview', clip.name);
      return;
    }
    const overlay = clip.track === 1;
    this.play(clip.point, overlay ? [clip.name] : [], 0, false, 'preview', overlay ? [] : [clip.name]);
    const { entry } = this.reaction;
    // Zero-duration clips store a pose. Give that pose time to appear before returning to idle.
    if (entry.animation.duration === 0) entry.animationEnd = 1;
    this.reaction.previewHold = clip.cue === 'hold-enter';
  }

  chooseTool(id) {
    if (this.toolLocked) return;
    const tool = this.tools.find(option => option.id === id);
    if (!tool || tool === this.tool) return;
    this.tool = tool;
    this.hidden = null;
    this.previousPoint = null;
    this.stayed.clear();
    this.clicks.clear();
    this.applySkin();
  }

  match(position) {
    const continuation = this.reaction?.continuation || [];
    const next = point => Number(continuation.some(step => step.point === point));
    return this.activePoints
      .filter(point => hitZone(point.hit, this.bones.get(point.hit.bone), position))
      .sort((left, right) => next(right) - next(left) ||
        zoneArea(left.hit, this.bones.get(left.hit.bone)) - zoneArea(right.hit, this.bones.get(right.hit.bone)));
  }

  setGuideSpeed(speed = 1) {
    if (this.reaction) this.reaction.entry.timeScale = speed;
  }

  start(id, screen, position, now) {
    if (this.gesture || this.inputLocked) return false;
    const points = this.match(position);
    if (!points.length) return false;
    this.gesture = {
      id, screen, position, started: now, dragging: false, track: null,
      tap: points.find(point => point.action === 0),
      drag: points.find(point => point.action === 1 || point.action === 2),
    };
    const tap = this.gesture.tap;
    if (tap?.hold.action && !this.gesture.drag) this.beginHold(this.gesture, tap, 0);
    return true;
  }

  gestureMix(gesture, point, names, index, loop) {
    const name = names[Math.min(index, names.length - 1)];
    if (this.animations.has(name)) {
      this.setGuideSpeed();
      this.reaction = null;
      gesture.track = this.state.setAnimation(1, name, loop);
      if (!loop) this.record(point, 'drag-start', name);
    }
  }

  beginHold(gesture, point, index) {
    this.gestureMix(gesture, point, point.hold.loop, index, true);
    this.audio?.point(point, 'hold-enter', index);
    gesture.soundHold = { point, index, iteration: 0 };
  }

  endHold(gesture) {
    if (!gesture.soundHold) return;
    gesture.soundHold = null;
    this.audio?.stopHold();
  }

  move(id, screen, position, now) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return;
    gesture.position = position;
    gesture.moved = gesture.moved || Math.hypot(screen.x - gesture.screen.x, screen.y - gesture.screen.y) > MOVE_THRESHOLD;
    if (!gesture.drag || !gesture.moved || gesture.dragging) return;
    gesture.dragging = true;
    gesture.dragStarted = now;
    gesture.destination = -1;
    gesture.overlapping = [];
    gesture.destinationSince = now;
    const point = gesture.drag;
    const bone = this.bones.get(point.dragBone?.bone);
    if (point.dragBone?.override && bone?.active) gesture.bone = bone;
    this.gestureMix(gesture, point, point.reactions, 0, false);
    this.audio?.point(point, 'mix', 0);
    if (point.hold.action && !point.destinationCount) this.beginHold(gesture, point, 0);
  }

  target(gesture) {
    const point = gesture.drag;
    const zone = point.zone, bone = this.bones.get(zone?.bone);
    if (!point.rule?.box || !bone?.active) return gesture.position;
    const p = zoneToLocal(zone, bone, gesture.position);
    const [cx, cy] = centerOf(zone);
    return zoneToWorld(zone, bone, clamp(p.x, cx - zone.size[0] / 2, cx + zone.size[0] / 2),
      clamp(p.y, cy - zone.size[1] / 2, cy + zone.size[1] / 2));
  }

  localTarget(gesture) {
    const world = this.target(gesture);
    // Spine converts in place. Keep the recorded pointer in world coordinates
    // so holding a drag still does not move the collider on every frame.
    return gesture.bone.parent?.worldToLocal({ ...world }) || world;
  }

  applyOverrides(updateWorld) {
    const gesture = this.gesture;
    if (!gesture?.bone && !this.stayed.size) return;
    const overrides = new Map(this.stayed);
    if (gesture?.bone) overrides.set(gesture.bone, this.localTarget(gesture));
    if (!overrides.size) return;
    const restore = [];
    for (const [bone, position] of overrides) {
      if (!bone.active || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
      restore.push([bone, bone.x, bone.y]);
      bone.x = position.x;
      bone.y = position.y;
    }
    updateWorld();
    for (const [bone, x, y] of restore) { bone.x = x; bone.y = y; }
  }

  movingBox(point, position) {
    const collider = point.rule?.collider;
    return collider && boxCorners({ ...point.hit, ...collider }, this.bones.get(point.hit.bone), position);
  }

  touches(zone, position, moving) {
    const bone = this.bones.get(zone.bone);
    if (!moving) return hitZone(zone, bone, position);
    const target = boxCorners(zone, bone);
    return target && boxesOverlap(moving, target);
  }

  updateOverlap(gesture) {
    const point = gesture.drag;
    const position = this.target(gesture);
    const moving = this.movingBox(point, position);
    const current = new Set();
    for (const [index, zone] of point.destinations.entries()) {
      if (this.touches(zone, position, moving)) current.add(index);
    }
    const overlaps = gesture.overlapping.filter(index => current.has(index));
    for (const index of current) if (!overlaps.includes(index)) overlaps.push(index);
    gesture.overlapping = overlaps;
    return overlaps.at(-1) ?? -1;
  }

  updateDragDestination(now) {
    const gesture = this.gesture;
    if (!gesture?.dragging) return;
    const point = gesture.drag;
    const destination = this.updateOverlap(gesture);
    if (destination !== gesture.destination) {
      gesture.destination = destination;
      gesture.destinationSince = now;
      if (point.hold.action && destination >= 0) {
        this.endHold(gesture);
        this.beginHold(gesture, point, destination);
      } else if (point.hold.action && gesture.track?.loop) {
        this.endHold(gesture);
        this.state.setEmptyAnimation(1, 0.12);
        gesture.track = null;
      } else if (point.hold.action && point.destinationCount) {
        this.endHold(gesture);
      }
    }
    if (!point.hold.action && destination >= 0 &&
        (point.advance || this.animations.has(point.motions[destination]))) {
      this.finishDrag(gesture, now, 'contact');
    } else if (point.hold.action === 1 && (!point.destinationCount || destination >= 0) &&
        now - (point.destinationCount ? gesture.destinationSince : gesture.dragStarted) >= point.hold.threshold * 1000) {
      this.finishDrag(gesture, now, 'hold');
    }
  }

  finishDrag(gesture, now, event) {
    const point = gesture.drag, destination = gesture.destination;
    const hit = destination >= 0;
    const since = point.destinationCount ? gesture.destinationSince : gesture.dragStarted;
    const held = point.hold.action > 0 && (!point.destinationCount || hit) &&
      now - since >= point.hold.threshold * 1000;
    const zone = point.destinations[destination];
    const centerInside = zone && hitZone(zone, this.bones.get(zone.bone), this.target(gesture));
    const serial = this.serial;
    this.cancel(gesture.id);
    if (point.action === 2 && gesture.bone && !point.advance) this.stayed.set(gesture.bone, this.localTarget(gesture));
    if ((event === 'contact' || held) && (point.advance || (hit && this.animations.has(point.motions[destination])))) {
      this.audio?.point(point, 'motion', Math.max(0, destination));
      this.play(point, [], Math.max(0, destination), point.advance, held ? 'hold' : 'drag', point.motions);
    } else if (held || (point.hold.action && (!point.destinationCount || hit))) {
      this.audio?.point(point, held ? 'hold-success' : 'hold-fail', Math.max(0, destination));
      this.play(point, held ? point.hold.success : point.hold.fail, Math.max(0, destination), false, held ? 'hold' : 'drag-reset');
    } else if (event !== 'contact') {
      if (this.animations.has(point.reactions[1])) this.audio?.point(point, 'mix', 1);
      this.play(point, [point.reactions[1]], 0, false, 'drag-reset');
    }
    if (hit && this.serial !== serial) {
      this.last.contact = { index: destination, centerInside, event };
    }
  }

  finish(id, position, now) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return;
    gesture.position = position;
    if (gesture.dragging) {
      this.updateDragDestination(now);
      if (this.gesture === gesture) this.finishDrag(gesture, now, 'release');
    } else {
      this.cancel(id);
      if (gesture.tap && !gesture.moved && !gesture.finished) this.react(gesture.tap, now - gesture.started, now);
    }
  }

  cancel(id) {
    const gesture = this.gesture;
    if (!gesture || (id != null && gesture.id !== id)) return;
    this.gesture = null;
    this.endHold(gesture);
    if (gesture.track && this.state.getCurrent(1) === gesture.track) this.state.setEmptyAnimation(1, 0.12);
  }

  react(point, elapsed, now) {
    this.scored = true;
    if (this.previousPoint !== point) this.clicks.clear();
    this.previousPoint = point;
    const prior = this.clickCount(point, now);
    if (point.clicks > 1 && prior >= point.clicks && !point.rule?.gauge && !point.random && point.stop) return;
    const count = prior + 1;
    const max = Math.max(1, point.clicks);
    this.clicks.set(point.sourceId, { count, time: now });
    const hasHold = point.hold.threshold > 0 && point.hold.action > 0;
    const held = hasHold && elapsed >= point.hold.threshold * 1000;
    const holdNames = held ? point.hold.success : point.hold.fail;
    const names = hasHold && holdNames.length ? holdNames : point.reactions;
    const index = point.random ? Math.floor(Math.random() * names.length) : count - 1;
    const advance = point.advance && count >= max && (!hasHold || held);
    if (hasHold) {
      this.audio?.point(point, held ? (advance ? 'motion' : 'hold-success') : 'hold-fail', 0);
    } else if (advance && this.animations.has(point.motions[0])) {
      this.audio?.point(point, 'motion', 0);
    } else {
      this.audio?.point(point, 'mix', advance ? 0 : Math.max(0, Math.min(index, point.reactions.length - 1)));
    }
    if (advance) {
      this.play(point, [], 0, true, held ? 'hold' : 'tap', point.motions);
    } else {
      this.play(point, names, index, false, held ? 'hold' : 'tap', point.motions);
      const gauge = point.rule?.gauge;
      if (gauge) {
        this.addScore(gauge.scores[Math.min(count - 1, gauge.scores.length - 1)], point);
        if (hasHold) this.addScore(held ? gauge.success : gauge.fail, point);
      }
    }
    const hidden = point.rule?.hidden, owner = this.hiddenOwners.get(point.sourceId);
    if (!advance && (hidden || owner)) {
      const root = hidden ? point : owner;
      const duration = this.reaction?.entry.animation.duration ?? 0;
      this.hidden = { owner: root, until: now + (root.rule.hidden.seconds + duration) * 1000 };
    }
  }

  play(point, names, index, advance, kind, motions = []) {
    const mix = names[Math.min(index, names.length - 1)];
    const motion = motions[Math.min(index, motions.length - 1)];
    const track = this.animations.has(mix) ? 1 : 0;
    const name = track === 1 ? mix : motion;
    if (!this.animations.has(name)) {
      if (advance) {
        this.record(point, kind, null);
        const index = this.nextIndex(point);
        if (index >= 0) this.enterGroup(index, true);
      }
      return;
    }
    this.setGuideSpeed();
    if (this.reaction?.track === 0) this.state.setAnimation(0, this.group.idle, true);
    if (track === 0 && this.state.getCurrent(1)) this.state.setEmptyAnimation(1, 0.12);
    const entry = this.state.setAnimation(track, name, false);
    const continuation = this.reveals.get(point)?.byAnimation.get(name);
    this.reaction = { entry, track, point, continuation, advance, kind };
    this.record(point, kind, name);
  }

  tick(now, dt) {
    if (this.hidden && now >= this.hidden.until) this.hidden = null;
    const priorPoint = this.previousPoint;
    const priorClick = priorPoint && this.clicks.get(priorPoint.sourceId);
    if (priorClick && this.clickExpired(priorPoint, priorClick, now)) {
      this.clicks.delete(priorPoint.sourceId);
      if (!this.inputLocked && priorPoint.reactions.length) {
        this.play(priorPoint, [priorPoint.stop], 0, false, 'tap-reset');
        this.audio?.point(priorPoint, 'mix', priorPoint.reactions.length);
      }
    }
    const gauge = this.gauge;
    if (gauge?.decay < 0 && this.scored && gauge.decayRange[0] < this.score && this.score < gauge.decayRange[1]) {
      this.addScore(gauge.decay * dt, null, true);
    }
    const gesture = this.gesture;
    const soundHold = gesture?.soundHold;
    if (soundHold && gesture.track?.loop && this.state.getCurrent(1) === gesture.track) {
      const duration = gesture.track.animation.duration;
      const iteration = duration > 0 ? Math.floor(gesture.track.trackTime / duration) : 0;
      if (iteration > soundHold.iteration) {
        soundHold.iteration = iteration;
        this.audio?.point(soundHold.point, 'hold-repeat', soundHold.index);
      }
    }
    if (gesture && !gesture.moved && gesture.tap && !gesture.finished) {
      const hold = gesture.tap.hold;
      if (hold.action === 1 && hold.threshold > 0 && now - gesture.started >= hold.threshold * 1000) {
        gesture.finished = true;
        this.endHold(gesture);
        if (gesture.track) this.state.setEmptyAnimation(1, 0.12);
        this.react(gesture.tap, now - gesture.started, now);
      }
    }
    if (gesture?.track && !gesture.track.loop && gesture.track.isComplete()) {
      this.state.setEmptyAnimation(1, 0.12);
      gesture.track = null;
    }
    if (this.switching?.isComplete()) {
      this.switching = null;
      this.state.setAnimation(0, this.group.idle, true);
    }
    const reaction = this.reaction;
    if (!reaction?.entry.isComplete()) return;
    this.reaction = null;
    if (reaction.previewHold) this.audio?.stopHold();
    const next = reaction.advance ? this.nextIndex(reaction.point) : -1;
    if (next >= 0) {
      this.enterGroup(next, true);
    } else if (reaction.track === 1) {
      this.state.setEmptyAnimation(1, 0.12);
    } else {
      this.state.setAnimation(0, this.group.idle, true);
    }
  }

  spot(point, project, usable) {
    const bone = this.bones.get(point.hit.bone);
    if (!bone.active) return null;
    for (const [x, y] of SPOT_SAMPLES) {
      const world = zonePosition(point.hit, bone, x, y);
      const client = project(world);
      if (!usable(client)) continue;
      const matched = this.match(world).find(candidate => (candidate.action === 0) === (point.action === 0));
      if (matched === point) return client;
    }
    return null;
  }

  dropSpot(gesture, zone, project, usable) {
    const bone = this.bones.get(zone.bone);
    if (!bone?.active) return null;
    // In portrait view a destination's center can be outside the screen.
    // Show a visible point within its real collision area.
    for (const [x, y] of SPOT_SAMPLES) {
      const position = zonePosition(zone, bone, x, y);
      const client = project(position);
      if (!usable(client)) continue;
      const target = this.target({ ...gesture, position });
      if (this.touches(zone, target, this.movingBox(gesture.drag, target))) return client;
    }
    return null;
  }

  guide(project, usable, now) {
    const gesture = this.gesture;
    if (gesture?.dragging) {
      const point = gesture.drag;
      const match = gesture.destination;
      const markers = point.destinations.flatMap((zone, index) => {
        const client = this.dropSpot(gesture, zone, project, usable);
        const name = point.hold.action ? point.hold.success[index] : point.motions[index];
        const [step] = this.routeSteps(point, name);
        return client ? [{
          ...client, key: 'drop-' + index, point: point.id, kind: 'drop', ready: index === match,
          waiting: index === match && now - gesture.destinationSince < point.hold.threshold * 1000,
          priority: step ? 'reveal' : '', route: step ? this.routes.get(step.point) : Infinity,
        }] : [];
      });
      const holding = point.hold.action > 0 && point.hold.threshold > 0;
      const heldFor = now - (point.destinationCount ? gesture.destinationSince : gesture.dragStarted);
      const waiting = holding && heldFor < point.hold.threshold * 1000;
      const message = point.destinationCount && match < 0
        ? (holding ? '拖到落点后按住' : '碰到落点就会触发')
        : waiting ? '在这里继续按住' : point.hold.action === 1 ? '保持到动作触发' : '松开触发';
      if (markers.length > 1) {
        const cursor = project(gesture.position);
        const distance = marker => Math.hypot(marker.x - cursor.x, marker.y - cursor.y);
        markers.sort((left, right) => left.route - right.route ||
          Number(right.ready) - Number(left.ready) || distance(left) - distance(right));
      }
      return { markers: markers.slice(0, 3), message };
    }
    if (this.inputLocked) return { markers: [], message: '动作播放中' };
    if (gesture?.tap?.hold.action && gesture.tap.hold.threshold > 0 && !gesture.moved && !gesture.finished) {
      const message = now - gesture.started < gesture.tap.hold.threshold * 1000 ? '继续按住' : '松开触发';
      return { markers: [], message };
    }
    const reaction = this.reaction;
    const continuation = reaction ? this.routeSteps(reaction.point, reaction.entry.animation.name) : [];
    const points = this.activePoints;
    const kind = point => point.action !== 0 ? 'drag'
      : point.hold.action && point.hold.threshold > 0 && this.hasAnimation(point.hold.success) ? 'hold' : 'tap';
    const candidates = (pool, priority) => {
      for (const point of pool) {
        const position = this.spot(point, project, usable);
        if (position) return { ...position, key: point.sourceId, point: point.id, kind: kind(point), priority,
          clicksLeft: this.clicksLeft(point, now),
          next: priority === 'advance' ? this.profile.groups[this.nextIndex(point)]?.id : undefined };
      }
      return null;
    };
    const advancing = points.filter(point => point.advance);
    const advance = candidates(advancing, 'advance');
    // Do not send the player back to the start while an authored reveal is
    // already playing. Repeated taps on the current point can be part of it.
    const route = points.filter(point => !point.advance && this.routes.has(point));
    const reveal = !advance && (continuation.length
      ? candidates(continuation.map(step => step.point).filter(point => points.includes(point)), 'reveal')
      : candidates(route.sort((left, right) =>
        Number(right === this.previousPoint && this.clicksLeft(right, now) > 0) -
        Number(left === this.previousPoint && this.clicksLeft(left, now) > 0) ||
        this.routes.get(left) - this.routes.get(right)), 'reveal'));
    const gauge = this.gauge;
    let score = null;
    if (!advance && !reveal && gauge) {
      const peak = points.filter(point => point.rule?.gauge?.range[0] === gauge.range[1]);
      score = candidates(peak, 'score');
      if (!score && this.score < gauge.range[1]) {
        const gain = point => {
          const config = point.rule?.gauge;
          if (!config) return 0;
          const index = this.clickCount(point, now);
          return (config.scores[Math.min(index, config.scores.length - 1)] || 0) +
            (point.hold.action ? Math.max(config.success, config.fail) : 0);
        };
        score = candidates(points.filter(point => gain(point) > 0)
          .sort((left, right) => gain(right) - gain(left)), 'score');
      }
    }
    const primary = advance || reveal || score;
    const markers = primary ? [primary] : [];
    if (advance) {
      const alternate = candidates(advancing.filter(point =>
        this.profile.groups[this.nextIndex(point)]?.id !== advance.next), 'advance');
      if (alternate && Math.hypot(alternate.x - advance.x, alternate.y - advance.y) > 24) markers.push(alternate);
    }
    for (const action of ['tap', 'hold', 'drag']) {
      if (primary?.kind === action) continue;
      const marker = candidates(points.filter(point => kind(point) === action), '');
      if (marker && markers.every(other => Math.hypot(marker.x - other.x, marker.y - other.y) > 40)) markers.push(marker);
    }
    const nextTool = !primary && !continuation.length && this.points.find(point =>
      point.group === this.group.id && point.advance && point.tool !== this.tool.id &&
      this.tools.some(tool => tool.id === point.tool));
    const currentWindow = continuation.find(step => step.point.sourceId === primary?.key);
    const shortWindow = currentWindow && currentWindow.seconds < 0.6;
    let message = '按圆点上的方式操作立绘';
    if (reveal) message = reveal.clicksLeft > 1 ? '连续点按，还需 ' + reveal.clicksLeft + ' 次'
      : '触发高亮位置，留意随后出现的触点';
    else if (advance) {
      const point = points.find(entry => entry.sourceId === advance.key);
      if (point.clicks > 1 && point.action === 0) {
        const count = this.clickCount(point, now);
        message = '连续点按 ' + point.clicks + ' 次（' + count + '/' + point.clicks + '）';
      } else {
        message = advance.kind === 'drag' ? '按住提示点拖到落点'
          : advance.kind === 'hold' ? '按住提示点直到触发' : '点按高亮位置继续';
      }
    } else if (score) {
      message = this.score < gauge.range[1] ? '操作提示点，提升计量' : '计量已满，操作高亮位置';
    } else if (nextTool) {
      message = this.toolLocked ? '动作结束后可切换道具'
        : '切换到「' + (nextTool.tool === 0 ? '手势' : '道具 ' + nextTool.tool) + '」继续探索';
    } else if (continuation.length) message = '等下一处触点出现';
    else if (!markers.length) message = '当前画面没有可用的触点，可尝试恢复视角';
    if (shortWindow) message = '限时触点已放慢，点按继续';
    return { markers, message, speed: shortWindow ? currentWindow.seconds / 1.2 : 1 };
  }

  snapshot(toClient) {
    const overlay = this.state.getCurrent(1);
    return {
      id: this.profile.id, group: this.group.id, tool: this.tool.id, last: this.last,
      serial: this.serial, score: this.score, gaugeMax: this.gauge?.range[1], locked: this.inputLocked,
      dragging: Boolean(this.gesture?.dragging),
      track: overlay && overlay.animation.name !== '<empty>' ? overlay.animation.name : this.state.getCurrent(0)?.animation.name,
      speed: this.reaction?.entry.timeScale ?? 1,
      points: this.activePoints.flatMap(point => {
        const bone = this.bones.get(point.hit.bone);
        if (!bone.active) return [];
        return [{
          id: point.id, source: point.sourceId, action: point.action, name: point.name, hold: point.hold.threshold,
          advance: point.advance, next: point.advance ? this.profile.groups[this.nextIndex(point)]?.id : undefined,
          center: toClient(zonePosition(point.hit, bone)),
          destinations: point.destinations.map(zone => toClient(zonePosition(zone, this.bones.get(zone.bone)))),
          destinationBoxes: point.destinations.map(zone =>
            boxCorners(zone, this.bones.get(zone.bone))?.map(vertex => toClient(vertex))),
        }];
      }),
    };
  }
}
