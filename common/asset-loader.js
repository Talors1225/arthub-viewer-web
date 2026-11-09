/* Shared, cancellable resource loading and viewport handling for the viewers. */
(() => {
  'use strict';
  const K = window.SpineKit;
  if (!K) return;

  K.siteRoot = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    const at = parts.findIndex(p => ['bd2', 'bd2mod', 'nikki', 'nikke', 'majsoul', 'azurlane-interaction', 'crosscore-interaction', 'crosscore', 'gallery'].includes(p));
    return '/' + (at > 0 ? parts.slice(0, at).join('/') + '/' : '');
  };
  K.libraryPageSize = () => window.matchMedia('(max-width: 720px)').matches ? 36 : 120;
  K.paginationHosts = grid => {
    const bottom = grid.querySelector('#gridPagination');
    let top = grid.querySelector('#gridPaginationTop');
    if (!top) {
      top = document.createElement('nav');
      top.id = 'gridPaginationTop';
      top.className = 'grid-pagination grid-pagination-top';
      top.setAttribute('aria-label', '资源库上方分页');
      grid.insertBefore(top, grid.querySelector('#thumbGrid'));
    }
    return [top, bottom].filter(Boolean);
  };
  const statusTimers = new WeakMap();
  K.setStatus = (element, message) => {
    clearTimeout(statusTimers.get(element));
    element.textContent = message;
    element.classList.remove('status-quiet');
    const failed = /失败|错误|超时|不可用/.test(message);
    element.classList.toggle('load-error', failed);
    if (!/加载|读取|渲染/.test(message) && !failed) {
      statusTimers.set(element, setTimeout(() => element.classList.add('status-quiet'), 4000));
    }
    element.onclick = failed ? () => document.getElementById('btnRetry')?.click() : null;
  };
  // Dedicated transparent posters share a predictable URL with the offline
  // generator. A stage preview never waits for the library thumbnail manifest.
  K.stagePosterPath = (game, id, variant = '0') => {
    if (!['nikki', 'bd2', 'majsoul'].includes(game) || !id) return null;
    return K.siteRoot() + 'posters/' + game + '/' + encodeURIComponent(String(id) + '--' + String(variant)) + '.webp';
  };
  // A transparent poster stays visible until the current model submits
  // its first draw. Old loads and image callbacks cannot replace a newer one.
  K.createLoadingPreview = stage => {
    const root = document.createElement('div');
    root.className = 'stage-loading-preview';
    root.hidden = true;
    const picture = document.createElement('div');
    picture.className = 'stage-loading-picture';
    const notice = document.createElement('div');
    notice.className = 'stage-loading-notice';
    const title = document.createElement('div');
    title.className = 'stage-loading-title';
    const state = document.createElement('div');
    state.className = 'stage-loading-state';
    state.setAttribute('role', 'status');
    state.setAttribute('aria-live', 'polite');
    const spinner = document.createElement('span');
    spinner.className = 'stage-loading-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const message = document.createElement('span');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ctl stage-loading-retry';
    retry.textContent = '重试';
    retry.hidden = true;
    for (const name of ['pointerdown', 'pointerup']) retry.addEventListener(name, event => event.stopPropagation());
    retry.addEventListener('click', event => {
      event.stopPropagation();
      document.getElementById('btnRetry')?.click();
    });
    state.append(spinner, message);
    notice.append(title, state, retry);
    root.append(picture, notice);
    stage.appendChild(root);
    let current = null, image = null, imagePath = null;
    const owns = seq => current && current.seq === seq;
    const setImage = (seq, path) => {
      if (!owns(seq) || !path || imagePath === path) return;
      imagePath = path;
      const img = image = document.createElement('img');
      img.className = 'stage-loading-image';
      img.alt = current.label + ' · 静态预览';
      img.loading = 'eager';
      img.decoding = 'async';
      img.fetchPriority = 'high';
      root.classList.remove('has-preview');
      img.addEventListener('load', () => {
        if (!owns(seq) || image !== img) return;
        if (current.trimImage) {
          try {
            const source = document.createElement('canvas');
            source.width = img.naturalWidth; source.height = img.naturalHeight;
            const context = source.getContext('2d'); context.drawImage(img, 0, 0);
            const pixels = context.getImageData(0, 0, source.width, source.height).data;
            let left = source.width, top = source.height, right = -1, bottom = -1;
            for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
              if (pixels[(y * source.width + x) * 4 + 3] > 8) {
                left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
              }
            }
            if (right >= left && bottom >= top) {
              const cropped = document.createElement('canvas');
              cropped.width = right - left + 1; cropped.height = bottom - top + 1;
              cropped.getContext('2d').drawImage(source, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
              img.src = cropped.toDataURL('image/png');
            }
          } catch (_) { /* Keep the original preview when pixel access is unavailable. */ }
        }
        root.classList.add('has-preview');
      }, { once: true });
      img.addEventListener('error', () => {
        if (owns(seq) && image === img) { root.classList.remove('has-preview'); picture.replaceChildren(); image = null; imagePath = null; }
      }, { once: true });
      picture.replaceChildren(img);
      img.src = path;
    };
    return {
      begin(seq, options = {}) {
        current = { seq, label: String(options.label || '当前资源'), state: 'loading', trimImage: !!options.trimImage };
        root.dataset.state = 'loading';
        root.dataset.load = String(seq);
        root.dataset.fit = String(options.fit || .92);
        root.hidden = false;
        stage.classList.add('loading-preview-active');
        stage.setAttribute('aria-busy', 'true');
        title.textContent = current.label;
        message.textContent = '动态加载中';
        retry.hidden = true;
        picture.replaceChildren(); image = null; imagePath = null;
        root.classList.remove('has-preview');
        setImage(seq, options.path);
      },
      setImage,
      progress(seq, text) {
        if (!owns(seq) || current.state !== 'loading') return;
        message.textContent = String(text || '动态加载中');
      },
      ready(seq) {
        if (!owns(seq) || current.state !== 'loading') return;
        this.cancel();
      },
      fail(seq, reason) {
        if (!owns(seq) || current.state !== 'loading') return;
        current.state = 'error';
        root.dataset.state = 'error';
        message.textContent = '动态加载失败';
        message.title = String(reason || '请重试');
        retry.hidden = false;
        stage.setAttribute('aria-busy', 'false');
      },
      cancel() {
        current = null;
        root.hidden = true;
        stage.classList.remove('loading-preview-active');
        stage.setAttribute('aria-busy', 'false');
        picture.replaceChildren(); image = null; imagePath = null;
        root.classList.remove('has-preview');
      },
    };
  };

  const abortError = () => new DOMException('加载已取消', 'AbortError');
  K.isAbort = error => error && error.name === 'AbortError';
  const scope = (parent, timeout) => {
    const controller = new AbortController();
    const cancel = () => controller.abort(parent.reason || abortError());
    if (parent) {
      if (parent.aborted) cancel();
      else parent.addEventListener('abort', cancel, { once: true });
    }
    let timer;
    const touch = () => {
      clearTimeout(timer);
      if (!controller.signal.aborted) {
        timer = setTimeout(() => controller.abort(new Error('加载超时，请检查网络后重试')), timeout);
      }
    };
    touch();
    return { controller, signal: controller.signal, touch, close() {
      clearTimeout(timer);
      if (parent) parent.removeEventListener('abort', cancel);
    } };
  };
  const readResponse = async (url, signal, method, transfer) => {
    const response = await fetch(url, transfer ? { signal, cache: transfer.cache } : { signal });
    if (!response.ok) {
      const kind = response.status === 404 ? '资源不存在' : response.status === 403 ? '资源访问被拒绝' : '资源请求失败';
      throw new Error(kind + ' (HTTP ' + response.status + ')');
    }
    if (!transfer || !response.body) return response[method]();
    transfer.touch();
    const body = response.body.pipeThrough(new TransformStream({
      transform(chunk, stream) {
        transfer.touch();
        stream.enqueue(chunk);
      },
    }), { signal });
    return new Response(body, { headers: response.headers })[method]();
  };
  const readSpineResponse = async (url, signal, method, options) => {
    if (!options.retryIdleMs || typeof TransformStream !== 'function') {
      return readResponse(url, signal, method);
    }
    for (let retry = false; ; retry = true) {
      const transfer = scope(signal, options.retryIdleMs);
      try {
        return await readResponse(url, transfer.signal, method, {
          cache: retry ? 'reload' : 'default', touch: transfer.touch,
        });
      } catch (cause) {
        const error = transfer.signal.reason || cause;
        if (retry || signal.aborted || (!transfer.signal.aborted && !(error instanceof TypeError))) {
          throw error;
        }
        options.onProgress?.('资源传输中断，正在重试…');
      } finally {
        transfer.close();
      }
    }
  };
  K.fetchJSON = async (url, options = {}) => {
    const request = scope(options.signal, options.timeout || 15000);
    try { return await readResponse(url, request.signal, 'json'); }
    finally { request.close(); }
  };
  K.disposeAtlas = atlas => {
    if (!atlas) return;
    for (const page of atlas.pages || []) {
      if (page.texture) { try { page.texture.dispose(); } catch {} page.texture = null; }
    }
  };
  const decodeImage = (blob, signal) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      img.onload = img.onerror = null;
      URL.revokeObjectURL(url);
      if (error) { img.src = ''; reject(error); } else resolve(img);
    };
    const onAbort = () => finish(signal.reason || abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    img.onload = () => finish();
    img.onerror = () => finish(new Error('贴图无法解码'));
    if (signal.aborted) onAbort(); else img.src = url;
  });

  // Skeleton and atlas download together; texture concurrency is capped at three.
  // All workers settle before disposing an incomplete atlas, including on cancellation.
  K.loadSpineFiles = async (SP, gl, options) => {
    const request = scope(options.signal, options.timeout || 60000);
    const { signal, controller } = request;
    let atlas = null;
    try {
      options.onProgress?.('正在读取骨骼与图集');
      const [text, buffer] = await Promise.all([
        readSpineResponse(options.atlasURL, signal, 'text', options),
        readSpineResponse(options.skeletonURL, signal, 'arrayBuffer', options),
      ]);
      if (signal.aborted) throw signal.reason || abortError();
      atlas = new SP.TextureAtlas(text);
      let next = 0, done = 0;
      const workers = Array.from({ length: Math.min(3, atlas.pages.length) }, async () => {
        try {
          while (next < atlas.pages.length) {
            if (signal.aborted) throw signal.reason || abortError();
            const page = atlas.pages[next++];
            const url = options.atlasPageURL?.(page.name) || new URL(page.name, new URL(options.atlasURL, location.href)).href;
            const blob = await readSpineResponse(url, signal, 'blob', options);
            const img = await decodeImage(blob, signal);
            if (signal.aborted) throw signal.reason || abortError();
            const texture = new SP.GLTexture(gl, img);
            page.texture = texture;
            page.setTexture(texture);
            options.onProgress?.('正在读取贴图 ' + (++done) + '/' + atlas.pages.length);
          }
        } catch (error) { controller.abort(error); throw error; }
      });
      const settled = await Promise.allSettled(workers);
      const failed = settled.find(r => r.status === 'rejected');
      if (failed) throw failed.reason;
      if (signal.aborted) throw signal.reason || abortError();
      return { atlas, bytes: new Uint8Array(buffer) };
    } catch (error) {
      controller.abort(error);
      K.disposeAtlas(atlas);
      throw error;
    } finally { request.close(); }
  };

  let runtimeQueue = Promise.resolve();
  const runtimeRequests = new Map();
  K.ensureSpine = (version, vendor = 'vendor/') => {
    const key = String(version || '4.1').match(/^\d+\.\d+/)?.[0] || '4.1';
    if (K.spineNS[key]) return Promise.resolve(K.spineNS[key]);
    if (!['4.0', '4.1', '4.2'].includes(key)) return Promise.reject(new Error('暂不支持 Spine ' + key));
    if (!runtimeRequests.has(key)) {
      const load = runtimeQueue.then(async () => {
        const file = key === '4.1' ? 'spine-webgl.js' : 'spine-webgl-' + key + '.js';
        const release = window.ARTHUB_COS_CONFIG?.release;
        const url = vendor + file + (release ? '?v=' + encodeURIComponent(release) : '');
        if (!(await K.loadSpineVersion(key, [url]))) throw new Error('Spine ' + key + ' 运行库加载失败，请重试');
        return K.spineNS[key];
      });
      runtimeQueue = load.catch(() => {});
      runtimeRequests.set(key, load);
      load.catch(() => runtimeRequests.delete(key));
    }
    return runtimeRequests.get(key);
  };

  K.observeCanvas = (canvas, resize) => {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (w !== canvas.width || h !== canvas.height) resize();
      });
    };
    const observer = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
    return () => { observer?.disconnect(); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); };
  };

  K.setPreview = (host, path) => {
    if (!host) return;
    host.replaceChildren();
    if (!path) { host.textContent = '预览暂缺'; return; }
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      if (img.parentElement === host) { host.replaceChildren(); host.textContent = '预览加载失败'; }
    }, { once: true });
    img.src = path;
    host.appendChild(img);
  };

  // A second touch cancels single-pointer editing. Lifting either finger ends
  // the gesture without turning it into a part-selection click.
  K.bindPinch = (stage, options) => {
    const touches = new Map();
    let previous = 0, anchor = null, pinching = false, lastTap = null, suppressClick = false, notifying = false;
    const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const inStage = target => target === stage || stage.contains(target);
    const ready = () => options.ready?.() !== false && !stage.classList.contains('loading-preview-active');
    const distance = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const midpoint = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    const cancelOriginalPointers = points => {
      if (!window.PointerEvent) return;
      notifying = true;
      try {
        for (const [id, point] of points) point.target.dispatchEvent(new window.PointerEvent('pointercancel', {
          bubbles: true, pointerId: id, pointerType: 'touch', clientX: point.x, clientY: point.y,
        }));
      } finally { notifying = false; }
    };
    const cancel = () => {
      const points = [...touches];
      touches.clear(); previous = 0; anchor = null; pinching = false; lastTap = null;
      delete stage.dataset.pinching;
      options.cancelDrag?.(); cancelOriginalPointers(points);
    };
    const down = event => {
      if (event.pointerType !== 'touch') { if (!touches.size) suppressClick = false; return; }
      if (!inStage(event.target) || options.isChrome(event.target) || !ready()) return;
      if (!touches.size) suppressClick = false;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY, target: event.target });
      if (touches.size === 2 && !pinching) {
        pinching = true; previous = distance(); anchor = midpoint(); lastTap = null; suppressClick = true;
        stage.dataset.pinching = 'true';
        options.cancelDrag?.(); cancelOriginalPointers([...touches]);
      } else if (touches.size === 2) { previous = distance(); anchor = midpoint(); }
      if (pinching) consume(event);
    };
    const move = event => {
      if (!touches.has(event.pointerId)) return;
      Object.assign(touches.get(event.pointerId), { x: event.clientX, y: event.clientY });
      if (!pinching) return;
      // Keep the remaining finger from becoming a drag or a model interaction.
      consume(event);
      if (!ready()) { cancel(); return; }
      if (touches.size < 2) return;
      const next = distance();
      // A stable midpoint prevents alternating native pointermove events from
      // drifting the artwork while the fingers open or close symmetrically.
      if (previous > 0 && next > 0) options.zoom(next / previous, anchor.x, anchor.y);
      previous = next;
    };
    const up = event => {
      if (notifying || !touches.has(event.pointerId)) return;
      touches.delete(event.pointerId);
      if (pinching) {
        options.cancelDrag?.(); consume(event);
        if (touches.size >= 2) { previous = distance(); anchor = midpoint(); }
        if (!touches.size) { pinching = false; delete stage.dataset.pinching; }
        return;
      }
      if (event.type !== 'pointerup' || !options.isTap?.() || !options.fit) { lastTap = null; return; }
      const now = Date.now();
      if (lastTap && now - lastTap.time < 320 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24) {
        lastTap = null; options.cancelDrag?.(); options.fit(); consume(event);
      } else lastTap = { time: now, x: event.clientX, y: event.clientY };
    };
    const click = event => { if (suppressClick && inStage(event.target) && !options.isChrome(event.target)) consume(event); };
    // Window capture runs before single-pointer panning and part/bone editors,
    // including viewers whose stage handlers stop immediate propagation.
    const handlers = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, click };
    for (const [name, handler] of Object.entries(handlers)) window.addEventListener(name, handler, { capture: true, passive: false });
    window.addEventListener('blur', cancel); window.addEventListener('pagehide', cancel);
    return { cancel, dispose() {
      cancel(); for (const [name, handler] of Object.entries(handlers)) window.removeEventListener(name, handler, true);
      window.removeEventListener('blur', cancel); window.removeEventListener('pagehide', cancel);
    } };
  };
})();
