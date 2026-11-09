import { active, clamp, createEmitters, drawables, keyedCurve, localTime, rotate, transforms, unityCurve } from './burst-math.js';

const QUAD = [0, 1, 2, 2, 3, 0];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

function program(gl, fragment) {
  function compile(kind, source) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const vert = compile(gl.VERTEX_SHADER, `
    attribute vec2 a_vertex;
    varying vec2 v_uv;
    void main() { v_uv = a_vertex * .5 + .5; gl_Position = vec4(a_vertex, 0., 1.); }
  `);
  const frag = compile(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 v_uv; ' + fragment);
  const shader = gl.createProgram();
  gl.attachShader(shader, vert);
  gl.attachShader(shader, frag);
  gl.linkProgram(shader);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(shader));
  return shader;
}

function configureTexture(gl, texture, filter) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function makePostProcess(gl, post) {
  const half = gl.getExtension('OES_texture_half_float');
  const useHalf = half && gl.getExtension('EXT_color_buffer_half_float') && gl.getExtension('OES_texture_half_float_linear');
  const sceneFbo = gl.createFramebuffer();
  const bloomFbo = gl.createFramebuffer();
  const scene = gl.createTexture();
  const bloom = gl.createTexture();
  const grade = gl.createTexture();
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  configureTexture(gl, grade, gl.LINEAR);
  const bytes = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const color = keyedCurve(post.curves.master, i / 255);
    for (const [channel, name] of ['red', 'green', 'blue'].entries()) {
      bytes[i * 4 + channel] = Math.round(clamp(keyedCurve(post.curves[name], color)) * 255);
    }
    bytes[i * 4 + 3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  const blur = program(gl, `
    uniform sampler2D u_scene;
    uniform vec2 u_radius;
    uniform float u_threshold;
    vec3 light(vec2 uv) {
      vec3 rgb = texture2D(u_scene, uv).rgb;
      float energy = max(max(rgb.r, rgb.g), rgb.b);
      float knee = max(.001, u_threshold * .25);
      float transition = clamp(energy - u_threshold + knee, 0., 2. * knee);
      float contribution = max(energy - u_threshold, transition * transition / (4. * knee));
      return rgb * (contribution / max(energy, .001));
    }
    void main() {
      vec3 glow = vec3(0.);
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          vec2 offset = vec2(float(x), float(y));
          float weight = (3. - abs(offset.x)) * (3. - abs(offset.y));
          glow += light(v_uv + offset * u_radius) * weight;
        }
      }
      gl_FragColor = vec4(glow / 81., 1.);
    }
  `);
  const finish = program(gl, `
    uniform sampler2D u_scene;
    uniform sampler2D u_bloom;
    uniform sampler2D u_grade;
    uniform float u_glow;
    uniform float u_transparent;
    uniform vec2 u_center;
    uniform vec3 u_tint;
    uniform vec2 u_vignette;
    void main() {
      vec4 source = texture2D(u_scene, v_uv);
      float alpha = mix(1., clamp(source.a, 0., 1.), u_transparent);
      vec3 rgb = (source.rgb + texture2D(u_bloom, v_uv).rgb * u_glow) / max(alpha, .01);
      vec2 r = (v_uv - u_center) * u_vignette.x;
      float strength = pow(clamp(1. - dot(r,r), 0., 1.), u_vignette.y);
      vec3 adjusted = clamp(rgb * mix(u_tint, vec3(1.), strength), 0., 1.);
      vec2 curve = vec2(255./256., .5/256.);
      rgb.r = texture2D(u_grade, vec2(adjusted.r * curve.x + curve.y, .5)).r;
      rgb.g = texture2D(u_grade, vec2(adjusted.g * curve.x + curve.y, .5)).g;
      rgb.b = texture2D(u_grade, vec2(adjusted.b * curve.x + curve.y, .5)).b;
      gl_FragColor = vec4(rgb, alpha);
    }
  `);
  let width = 0, height = 0, lowWidth = 0, lowHeight = 0, hdr = false;
  function target(framebuffer, texture, w, h, type) {
    configureTexture(gl, texture, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }
  function start(w, h, transparent = false) {
    gl.activeTexture(gl.TEXTURE0);
    if (w !== width || h !== height) {
      width = w;
      height = h;
      lowWidth = Math.max(1, Math.round(width / 4));
      lowHeight = Math.max(1, Math.round(height / 4));
      hdr = !!useHalf && target(sceneFbo, scene, w, h, half.HALF_FLOAT_OES);
      if (!hdr && !target(sceneFbo, scene, w, h, gl.UNSIGNED_BYTE)) throw new Error('无法建立场景缓冲');
      if (!target(bloomFbo, bloom, lowWidth, lowHeight, gl.UNSIGNED_BYTE)) throw new Error('无法建立光效缓冲');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, transparent ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function draw(shader, framebuffer, w, h, inputs, uniforms) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, w, h);
    gl.useProgram(shader);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    const attribute = gl.getAttribLocation(shader, 'a_vertex');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    for (const [index, [name, texture]] of Object.entries(inputs).entries()) {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(shader, name), index);
    }
    for (const [name, value] of Object.entries(uniforms)) {
      const location = gl.getUniformLocation(shader, name);
      if (Array.isArray(value)) gl['uniform' + value.length + 'fv'](location, value);
      else gl.uniform1f(location, value);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(attribute);
  }
  function end(transparent = false) {
    gl.disable(gl.BLEND);
    const radius = 2 + 4 * post.bloom.scatter;
    draw(blur, bloomFbo, lowWidth, lowHeight, { u_scene: scene }, {
      u_radius: [radius / width, radius / height],
      u_threshold: hdr ? post.bloom.threshold : post.bloom.threshold * .86,
    });
    draw(finish, null, width, height, { u_scene: scene, u_bloom: bloom, u_grade: grade }, {
      u_glow: post.bloom.intensity * .24,
      u_transparent: transparent ? 1 : 0,
      u_center: post.vignette.center, u_tint: post.vignette.color,
      u_vignette: [post.vignette.intensity * 3, post.vignette.smoothness * 5],
    });
    gl.activeTexture(gl.TEXTURE0);
  }
  return { start, end };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取纹理 ' + url));
    image.src = url;
  });
}

export {makePostProcess, loadImage};
