const SP = window.spine;
SP.GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;
const assets = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const resolve = value => value.startsWith('/') ? value : `${assets}/${value}`;

export class SpineScene {
  static async load(definition, context, onEvent = () => {}) {
    const scene = new SpineScene(definition, context, onEvent);
    try {
      for (const layer of definition.layers) scene.layers.push(await scene.loadLayer(layer));
      for (const def of definition.spriteLayers || []) {
        const texture = await new Promise((accept, reject) => scene.manager.loadTexture(resolve(def.image), (_, value) => accept(value), (_, error) => reject(new Error(`${def.image}：${error}`))));
        scene.sprites.push({ def, texture });
      }
      scene.main = scene.layers[definition.mainLayer] || scene.layers[0];
      if (!scene.main) throw new Error('该资源没有可读取的骨架');
      scene.idle = scene.main.idle;
      scene.bounds = scene.measure();
      return scene;
    } catch (error) { scene.dispose(); throw error; }
  }
  constructor(definition, context, onEvent) {
    this.definition = definition;
    this.context = context;
    this.onEvent = onEvent;
    this.layers = [];
    this.sprites = [];
    this.controls = new Map();
    this.fades = new Map();
    this.nodeVisibility = new Map();
    this.hiddenSlots = new Set();
    this.slotAlphas = new Map();
    this.completed = [];
    this.manager = new SP.AssetManager(context, '');
  }
  async loadLayer(def) {
    if (!def.atlas || !def.skeleton) throw new Error(`资源不完整：${def.name}`);
    const atlas = await new Promise((accept, reject) => this.manager.loadTextureAtlas(resolve(def.atlas), (_, value) => accept(value), (_, error) => reject(new Error(`${def.atlas}：${error}`))));
    let skeleton;
    try {
      const response = await fetch(resolve(def.skeleton));
      if (!response.ok) throw new Error(`${response.status} ${def.skeleton}`);
      const loader = new SP.AtlasAttachmentLoader(atlas);
      const data = def.format === 'binary'
        ? new SP.SkeletonBinary(loader).readSkeletonData(new Uint8Array(await response.arrayBuffer()))
        : new SP.SkeletonJson(loader).readSkeletonData(await response.json());
      skeleton = new SP.Skeleton(data);
      const transform = def.render;
      skeleton.x = transform.x; skeleton.y = transform.y;
      skeleton.scaleX = transform.scaleX; skeleton.scaleY = transform.scaleY;
      if (transform.rotation) skeleton.bones[0].rotation += transform.rotation;
      const state = new SP.AnimationState(new SP.AnimationStateData(data));
      state.data.defaultMix = 0.2;
      state.addListener({ event: (entry, event) => this.onEvent({ kind: 'spine-event', name: event.data.name, stringValue: event.stringValue, track: entry.trackIndex }) });
      const idle = data.findAnimation(def.idle) ? def.idle
        : data.animations.find(a => /^idle/i.test(a.name))?.name || data.animations[0]?.name;
      if (idle) state.setAnimation(0, idle, def.loop !== false);
      state.apply(skeleton);
      skeleton.updateWorldTransform(SP.Physics.update);
      return { def, atlas, skeleton, state, idle };
    } catch (error) { atlas.dispose(); throw error; }
  }
  visible(layer) {
    let active = layer === this.main || layer.def.active;
    for (const [path, visible] of this.nodeVisibility) if (layer.def.path === path || layer.def.path.startsWith(path + '/')) active = visible;
    return active;
  }
  measure() {
    const min = new SP.Vector2(Infinity, Infinity), max = new SP.Vector2(-Infinity, -Infinity);
    for (const layer of this.layers) {
      if (!this.visible(layer)) continue;
      for (const slot of layer.skeleton.drawOrder) {
        const attachment = slot.attachment;
        if (!attachment || !slot.bone.active || slot.color.a * (attachment.color?.a ?? 1) < 0.001) continue;
        const count = attachment instanceof SP.RegionAttachment ? 8 : attachment instanceof SP.MeshAttachment ? attachment.worldVerticesLength : 0;
        if (!count) continue;
        const vertices = new Float32Array(count);
        if (attachment instanceof SP.RegionAttachment) attachment.computeWorldVertices(slot, vertices, 0, 2);
        else attachment.computeWorldVertices(slot, 0, count, vertices, 0, 2);
        for (let i = 0; i < count; i += 2) {
          min.x = Math.min(min.x, vertices[i]); min.y = Math.min(min.y, vertices[i + 1]);
          max.x = Math.max(max.x, vertices[i]); max.y = Math.max(max.y, vertices[i + 1]);
        }
      }
    }
    if (!Number.isFinite(min.x) || max.x <= min.x || max.y <= min.y) return { x: -1000, y: -600, width: 2000, height: 1200 };
    return { x: min.x, y: min.y, width: max.x - min.x, height: max.y - min.y };
  }
  trackStatus(track) {
    const entry = this.main?.state.getCurrent(track);
    if (!entry) return null;
    return { exists: true, moving: !!entry.timeScale, name: entry.animation?.name, percent: entry.animation?.duration ? Math.max(0, Math.min(1, entry.trackTime / entry.animation.duration)) : 0 };
  }
  hasAnimation(name) { return !!this.main.skeleton.data.findAnimation(name); }
  clear(tracks) {
    for (const track of tracks) { this.main.state.clearTrack(track); this.controls.delete(track); this.fades.delete(track); }
  }
  play(result, now) {
    if (!result.name) return false;
    if (!this.hasAnimation(result.name)) {
      this.onEvent({ kind: 'missing-animation', name: result.name, index: result.index });
      return false;
    }
    const state = this.main.state;
    if (result.kind === 'repeat') {
      const control = this.controls.get(result.track), entry = state.getCurrent(result.track), config = result.content.actions;
      if (control && entry && entry.trackTime >= config.stopPerc * entry.animation.duration && entry.trackTime <= config.stopLimit * entry.animation.duration && control.remaining > 0) {
        control.remaining--;
        entry.trackTime = config.stopPerc * entry.animation.duration; entry.timeScale = 1;
      }
      return false;
    }
    let entry = state.getCurrent(result.track);
    if (result.kind === 'segment') {
      if (!entry || entry.animation?.name !== result.name || !this.controls.has(result.track)) entry = state.setAnimation(result.track, result.name, false);
      entry.mixDuration = 0;
      entry.alpha = 1;
      entry.timeScale = result.restore ? 0 : result.direction;
      if (result.restore) entry.trackTime = result.progress * entry.animation.duration;
      this.controls.set(result.track, { kind: 'segment', entry, index: result.index, target: result.progress * entry.animation.duration, direction: result.direction, final: result.final, restore: result.restore });
      return true;
    }
    entry = state.setAnimation(result.track, result.name, false);
    entry.mixDuration = result.fadeIn ? 0.2 : 0;
    entry.alpha = result.fadeIn ? 0 : 1;
    entry.timeScale = 1;
    if (result.fadeIn) this.fades.set(result.track, entry);
    if (result.fadeOut) state.addEmptyAnimation(result.track, 0.5, 0);
    this.controls.delete(result.track);
    if (result.content?.actions?.stopTime !== undefined) {
      const config = result.content.actions;
      this.controls.set(result.track, { kind: 'repeat', entry, stop: config.stopPerc * entry.animation.duration, stay: config.stopTime, remaining: config.stopCount ?? 3 });
    }
    if (result.track === 1) entry.listener = { complete: () => this.completed.push({ kind: 'complete', index: result.index }) };
    return true;
  }
  changeIdle(name) {
    if (!this.hasAnimation(name)) return false;
    this.main.state.setAnimation(0, name, true); this.idle = name; return true;
  }
  gesture(result, now) {
    const config = result.content.gestureDatas;
    if (!config || !this.hasAnimation(result.name)) return;
    let control = this.controls.get(result.track);
    if (control?.kind === 'recover') return;
    if (!control || control.kind !== 'gesture' || control.entry.animation?.name !== result.name) {
      const entry = this.main.state.setAnimation(result.track, result.name, false);
      entry.timeScale = 0; entry.mixDuration = 0.2; entry.alpha = 1;
      this.controls.set(result.track, control = { kind: 'gesture', entry });
    }
    const delta = result.gesture <= 2 ? (result.gesture === 1 ? -result.dx : result.dx) : (result.gesture === 3 ? result.dy : -result.dy);
    const entry = control.entry;
    const percent = Math.max(0, Math.min(config.limitPerc ?? 1, entry.trackTime / entry.animation.duration + delta * (config.speed ?? 2) * 0.001));
    entry.trackTime = percent * entry.animation.duration;
  }
  recover(result, now) {
    const control = this.controls.get(result.track), config = result.content.gestureDatas;
    if (!control || !config || config.stopTime === undefined || config.stopTime < 0) return;
    const percent = control.entry.trackTime / control.entry.animation.duration;
    const forward = (config.splitPerc ?? 1) !== 1 && config.splitPerc - percent < 0.01;
    this.controls.set(result.track, { kind: 'recover', entry: control.entry, start: now + config.stopTime, forward });
  }
  beginObjectDrag(result, action) {
    const drag = result.content.drag;
    if (!drag) return;
    const path = `pos/${drag.targetObjName}`;
    const node = this.definition.nodes.find(n => n.path === path) || { x: 0, y: 0 };
    const sprites = this.sprites.filter(sprite => sprite.def.path === path || sprite.def.path.startsWith(path + '/'));
    const lensNode = this.definition.nodes.find(n => n.path === path + '/Phone') || node;
    this.objectDrag = { drag, path, node, lensNode, sprites, dx: 0, dy: 0, area: action.areas?.[0] };
    if (drag.hideSpine) this.nodeVisibility.set(path, true);
    else {
      for (const slot of drag.slots || []) this.hiddenSlots.add(slot);
      if (!sprites.length) this.objectDrag.overlay = new SP.Skeleton(this.main.skeleton.data);
    }
  }
  moveObjectDrag(result) {
    if (this.objectDrag) { this.objectDrag.dx = result.x; this.objectDrag.dy = result.y; }
  }
  restoreObject(content) { for (const name of content.drag?.slots || []) this.hiddenSlots.delete(name); }
  endObjectDrag() {
    const moving = this.objectDrag;
    if (!moving) return null;
    let animation = null;
    for (const value of moving.drag.targetPosObjNames || []) {
      const split = value.indexOf('_'), nodeName = value.slice(0, split), name = value.slice(split + 1);
      const node = this.definition.nodes.find(n => n.path === `pos/${nodeName}`);
      if (node && Math.hypot(node.x - moving.node.x - moving.dx, node.y - moving.node.y - moving.dy) < 10) animation = name;
    }
    this.nodeVisibility.set(moving.path, false);
    if (animation) for (const name of moving.drag.slots || []) this.hiddenSlots.delete(name);
    this.objectDrag = null;
    return animation;
  }
  update(delta, now) {
    // Restore last frame's alpha before animations write the next pose.
    for (const [slot, alpha] of this.slotAlphas) slot.color.a = alpha;
    this.slotAlphas.clear();
    for (const layer of this.layers) layer.state.update(delta);
    for (const [track, entry] of this.fades) {
      entry.alpha = Math.min(1, entry.alpha + delta / 0.2);
      if (entry.alpha === 1) this.fades.delete(track);
    }
    for (const [track, control] of this.controls) {
      const entry = control.entry;
      if (this.main.state.getCurrent(track) !== entry) { this.controls.delete(track); continue; }
      if (control.kind === 'segment' && !control.restore && entry.timeScale && (control.direction < 0 ? entry.trackTime <= control.target : entry.trackTime >= control.target)) {
        entry.trackTime = control.target; entry.timeScale = 0;
        if (control.final) { this.main.state.clearTrack(track); this.controls.delete(track); }
        this.completed.push({ kind: 'segment-reached', track });
      } else if (control.kind === 'recover' && now >= control.start) {
        entry.timeScale = control.forward ? 1 : -1;
        if (entry.trackTime <= 0 || entry.trackTime >= entry.animation.duration) {
          entry.trackTime = 0; entry.timeScale = 0;
          if (track === 1) this.main.state.clearTrack(track);
          this.controls.delete(track);
        }
      } else if (control.kind === 'repeat') {
        if (control.stop !== undefined && entry.trackTime >= control.stop && entry.timeScale) {
          entry.timeScale = 0; control.resume = now + control.stay; delete control.stop;
        }
        if (!entry.timeScale && now >= control.resume) entry.timeScale = 1;
      }
    }
    for (const layer of this.layers) {
      layer.state.apply(layer.skeleton);
      layer.skeleton.update(delta);
      layer.skeleton.updateWorldTransform(SP.Physics.update);
    }
    for (const name of this.hiddenSlots) {
      const slot = this.main.skeleton.findSlot(name);
      if (slot) { this.slotAlphas.set(slot, slot.color.a); slot.color.a = 0; }
    }
    const completed = this.completed.splice(0);
    for (const event of completed) this.onEvent(event);
  }
  draw(renderer, viewport) {
    for (const layer of this.layers) {
      if (!this.visible(layer)) continue;
      const drag = this.objectDrag;
      const lens = drag?.drag.hideSpine && layer.def.path.startsWith(drag.path + '/');
      if (lens) {
        const gl = this.context.gl;
        const width = Math.abs(drag.lensNode.width || drag.area?.[2] || 300), height = Math.abs(drag.lensNode.height || drag.area?.[3] || 300);
        const x = (drag.lensNode.centerX ?? drag.lensNode.x) + drag.dx, y = (drag.lensNode.centerY ?? drag.lensNode.y) + drag.dy;
        const a = viewport(x - width / 2, y - height / 2), b = viewport(x + width / 2, y + height / 2);
        gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y));
      }
      renderer.begin(); renderer.drawSkeleton(layer.skeleton, !!layer.atlas.pages[0].pma); renderer.end();
      if (lens) this.context.gl.disable(this.context.gl.SCISSOR_TEST);
    }
    if (this.objectDrag?.overlay) {
      const source = this.main.skeleton, target = this.objectDrag.overlay, selected = new Set(this.objectDrag.drag.slots || []);
      for (let i = 0; i < source.bones.length; i++) {
        const from = source.bones[i], to = target.bones[i];
        for (const key of ['a', 'b', 'c', 'd', 'active']) to[key] = from[key];
        to.worldX = from.worldX + this.objectDrag.dx; to.worldY = from.worldY + this.objectDrag.dy;
      }
      for (let i = 0; i < source.slots.length; i++) {
        const from = source.slots[i], to = target.slots[i];
        to.setAttachment(selected.has(from.data.name) ? from.attachment : null);
        to.color.setFromColor(from.color); to.color.a = this.slotAlphas.get(from) ?? from.color.a;
        to.deform = from.deform.slice(); to.sequenceIndex = from.sequenceIndex;
      }
      target.drawOrder = source.drawOrder.map(slot => target.slots[slot.data.index]);
      renderer.begin(); renderer.drawSkeleton(target, !!this.main.atlas.pages[0].pma); renderer.end();
    }
    if (this.objectDrag?.sprites.length) {
      renderer.begin();
      renderer.batcher.setBlendMode(SP.BlendMode.Normal, false);
      for (const { def, texture } of this.objectDrag.sprites) {
        const x = def.centerX + this.objectDrag.dx, y = def.centerY + this.objectDrag.dy;
        renderer.drawTextureRotated(texture, x - def.width / 2, y - def.height / 2, def.width, def.height, def.width / 2, def.height / 2, def.rotation, new SP.Color(def.color.r, def.color.g, def.color.b, def.color.a));
      }
      renderer.end();
    }
  }
  dispose() {
    for (const atlas of new Set(this.layers.map(layer => layer.atlas))) atlas.dispose();
    for (const texture of new Set(this.sprites.map(sprite => sprite.texture))) texture.dispose();
    this.layers = [];
    this.sprites = [];
  }
}
