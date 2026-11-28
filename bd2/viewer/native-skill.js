/* Playback of BD2 skill scenes transcribed from Unity Timeline and prefab bindings. */
(() => {
  const PATH = /^native-skills\/scenes\/[0-9]{6}\.[0-9]+\.json$/;
  const BLEND = { additive: 'Additive', multiply: 'Multiply', screen: 'Screen' };
  const maskShaders = new WeakMap();
  const IDENTITY = [0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1];

  function frameAt(rows, seconds, result) {
    if (!rows.length) return IDENTITY;
    let low = 0;
    let high = rows.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >>> 1;
      if (rows[mid][0] <= seconds) low = mid;
      else high = mid;
    }
    const first = rows[low];
    const last = rows[high];
    if (seconds <= first[0]) return first;
    if (seconds >= last[0]) return last;
    const mix = (seconds - first[0]) / (last[0] - first[0]);
    for (let i = 1; i < first.length; i++) result[i] = first[i] + (last[i] - first[i]) * mix;
    return result;
  }

  function createLayer(SP, model, input) {
    const skeleton = new SP.Skeleton(model.data);
    if (input.skin && input.skin !== 'default') skeleton.setSkinByName(input.skin);
    skeleton.setToSetupPose();
    if (BLEND[input.blend]) {
      for (const slot of skeleton.slots) {
        const data = Object.create(slot.data);
        data.blendMode = SP.BlendMode[BLEND[input.blend]];
        slot.data = data;
      }
    }
    const layer = {
      ...model,
      SP,
      source: { ...model.source, renderOrder: input.order, originalBackground: input.background },
      skeleton,
      state: null,
      input,
      pose: IDENTITY,
      interpolated: new Float64Array(11),
      active: false,
      motions: input.clips?.map(clip => {
        const animation = model.data.findAnimation(clip.animation);
        if (!animation) throw new Error('技能演出缺少骨骼动作 · ' + clip.animation);
        return { ...clip, animation };
      }) || [],
      startup: input.starting && model.data.findAnimation(input.starting.animation),
    };
    const originalTransform = skeleton.updateWorldTransform;
    skeleton.updateWorldTransform = function (...params) {
      originalTransform.call(this, params[0] ?? SP.Physics?.pose);
      const [, a, b, c, d, x, y] = layer.pose;
      const scaleX = this.scaleX || 1;
      const scaleY = this.scaleY || 1;
      const crossX = c * scaleX / scaleY;
      const crossY = b * scaleY / scaleX;
      for (const bone of this.bones) {
        // The prefab matrix is outside the Spine rig, after its IK and transform constraints.
        const { a: ax, b: bx, c: ay, d: by, worldX, worldY } = bone;
        bone.a = a * ax + crossX * ay;
        bone.b = a * bx + crossX * by;
        bone.c = crossY * ax + d * ay;
        bone.d = crossY * bx + d * by;
        bone.worldX = this.x + x * scaleX + a * (worldX - this.x) + crossX * (worldY - this.y);
        bone.worldY = this.y + y * scaleY + crossY * (worldX - this.x) + d * (worldY - this.y);
      }
    };
    return layer;
  }

  function sampleMotion(SP, layer, time) {
    const skeleton = layer.skeleton;
    // Poses must be independent of playback order so dragging the playhead is reversible.
    if (!layer.motions.length && !layer.startup) return;
    skeleton.setToSetupPose();
    const blend = SP.MixBlend.setup;
    const direction = SP.MixDirection.mixIn;
    const clips = layer.motions;
    const playing = clips.filter(clip => clip.start <= time && time < clip.start + clip.length);
    if (playing.length) {
      for (let i = 0; i < playing.length; i++) {
        const clip = playing[i];
        const elapsed = time - clip.start;
        const at = clip.offset + elapsed * clip.rate;
        const alpha = i > 0 && clip.blendIn > 0 ? Math.min(1, elapsed / clip.blendIn) : 1;
        clip.animation.apply(skeleton, -1, at, clip.loop, null, alpha,
          i ? SP.MixBlend.replace : blend, direction);
      }
      return;
    }
    const held = clips.findLast(clip => clip.start <= time);
    if (held) {
      const extrapolated = held.post === 2 || held.post === 3 || held.post === 4;
      const clock = extrapolated ? time - held.start : held.length;
      let at = held.offset + clock * held.rate;
      const duration = held.animation.duration;
      if (duration > 0 && (held.post === 2 || held.post === 3)) {
        const repeated = at % (held.post === 3 ? 2 * duration : duration);
        at = held.post === 3 && repeated > duration ? 2 * duration - repeated : repeated;
      }
      held.animation.apply(skeleton, -1, at, held.loop, null, 1, blend, direction);
      return;
    }
    if (layer.startup) {
      const start = layer.input.starting;
      layer.startup.apply(skeleton, -1, time * start.rate, start.loop, null, 1, blend, direction);
    }
  }

  class Scene {
    constructor(SP, graph, models, disposeModels, K) {
      this.SP = SP;
      this.K = K;
      this.frame = graph.frame;
      this.duration = graph.duration;
      this.warning = graph.warning;
      this.dispose = disposeModels;
      this.layers = graph.layers.map(input => createLayer(SP, models[input.model], input));
      const parents = new Map(this.layers.map(layer => [layer.input.node, layer]));
      for (const layer of this.layers) {
        layer.mask = parents.get(layer.input.mask);
      }
      this.time = 0;
    }

    sample(seconds, view, hiddenSlots, hideBackground) {
      this.time = Math.min(Math.max(0, seconds), Math.max(0, this.duration - 0.000002));
      for (const layer of this.layers) {
        const { input, skeleton, interpolated } = layer;
        const pose = frameAt(input.pose, this.time, interpolated);
        layer.active = pose[10] > 0.001 && !(hideBackground && input.background);
        if (!layer.active) continue;
        layer.pose = pose;
        skeleton.scaleX = skeleton.scaleY = view.scale;
        skeleton.x = view.x;
        skeleton.y = view.y;
        sampleMotion(this.SP, layer, this.time);
        skeleton.color.set(pose[7], pose[8], pose[9], pose[10]);
        this.K.updateWorldTransform(skeleton, this.SP.Physics?.pose);
        if (!input.image) this.K.applyHiddenSlots(skeleton, hiddenSlots);
      }
    }
  }

  async function load({path, K, SP, signal, loadModel, disposeModels}) {
    if (!PATH.test(path)) throw new Error('技能演出路径无效');
    const graph = await K.fetchJSON('../' + path, { signal, timeout: 15000 });
    if (graph.schema !== 1 || !(graph.duration > 0) || !graph.layers.length || !graph.frame) {
      throw new Error('技能演出场景不完整');
    }

    const loaded = [];
    try {
      // Group loads so a complex scene does not start a request for every texture at once.
      for (let offset = 0; offset < graph.models.length; offset += 6) {
        const results = await Promise.allSettled(graph.models.slice(offset, offset + 6).map(loadModel));
        for (const result of results) if (result.status === 'fulfilled') loaded.push(result.value);
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        if (signal.aborted) throw signal.reason;
      }
      return new Scene(SP, graph, loaded, () => disposeModels(loaded), K);
    } catch (error) {
      disposeModels(loaded);
      throw error;
    }
  }

  function maskShader(renderer, SP) {
    const target = renderer.batcherShader;
    if (maskShaders.has(target)) return maskShaders.get(target);
    const S = SP.Shader;
    const vertex = `
      attribute vec4 ${S.POSITION}, ${S.COLOR}, ${S.COLOR2};
      attribute vec2 ${S.TEXCOORDS};
      uniform mat4 ${S.MVP_MATRIX};
      varying vec4 tint, dark;
      varying vec2 uv;
      void main() {
        tint=${S.COLOR};
        dark=${S.COLOR2};
        uv=${S.TEXCOORDS};
        gl_Position=${S.MVP_MATRIX}*${S.POSITION};
      }`;
    const fragment = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec4 tint, dark;
      varying vec2 uv;
      void main() {
        vec4 color=texture2D(u_texture, uv);
        float alpha=color.a*tint.a;
        if (alpha < 0.001) discard;
        gl_FragColor=vec4(color.rgb*tint.rgb+dark.rgb*(1.0-color.rgb),alpha);
      }`;
    const shader = new S(renderer.context, vertex, fragment);
    maskShaders.set(target, shader);
    return shader;
  }

  function drawLayer(renderer, layer, gl) {
    if (layer.active === false || layer.input?.maskOnly) return;
    const mask = layer.mask;
    if (!mask?.active || !gl.getContextAttributes()?.stencil) {
      renderer.drawSkeleton(layer.skeleton, layer.pma);
      return;
    }

    const shader = renderer.batcherShader;
    const stencil = maskShader(renderer, mask.SP);
    renderer.end();
    gl.enable(gl.STENCIL_TEST);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false);
    try {
      renderer.batcherShader = stencil;
      renderer.begin();
      renderer.drawSkeleton(mask.skeleton, mask.pma);
      renderer.end();
      renderer.batcherShader = shader;
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      renderer.begin();
      renderer.drawSkeleton(layer.skeleton, layer.pma);
      renderer.batcher.flush();
    } finally {
      renderer.batcherShader = shader;
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0xff);
      gl.disable(gl.STENCIL_TEST);
    }
  }

  window.ArtHubBd2SkillTimeline = { load, drawLayer };
})();
