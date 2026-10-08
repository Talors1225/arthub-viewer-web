/* Shared, cancellable resource loading and viewport handling for the viewers. */
(() => {
  'use strict';
  const K = window.SpineKit;
  if (!K) return;

  K.siteRoot = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    const at = parts.findIndex(p => ['bd2', 'bd2mod', 'nikki', 'nikke', 'majsoul', 'gallery'].includes(p));
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
  const abortError = () => new DOMException('加载已取消', 'AbortError');
  K.isAbort = error => error && error.name === 'AbortError';
  const scope = (parent, timeout) => {
    const controller = new AbortController();
    const cancel = () => controller.abort(parent.reason || abortError());
    if (parent) {
      if (parent.aborted) cancel();
      else parent.addEventListener('abort', cancel, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new Error('加载超时，请检查网络后重试')), timeout);
    return { controller, signal: controller.signal, close() {
      clearTimeout(timer);
      if (parent) parent.removeEventListener('abort', cancel);
    } };
  };
  const readResponse = async (url, signal, method) => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      const kind = response.status === 404 ? '资源不存在' : response.status === 403 ? '资源访问被拒绝' : '资源请求失败';
      throw new Error(kind + ' (HTTP ' + response.status + ')');
    }
    return response[method]();
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
        readResponse(options.atlasURL, signal, 'text'),
        readResponse(options.skeletonURL, signal, 'arrayBuffer'),
      ]);
      if (signal.aborted) throw signal.reason || abortError();
      atlas = new SP.TextureAtlas(text);
      let next = 0, done = 0;
      const workers = Array.from({ length: Math.min(3, atlas.pages.length) }, async () => {
        try {
          while (next < atlas.pages.length) {
            if (signal.aborted) throw signal.reason || abortError();
            const page = atlas.pages[next++];
            const url = new URL(page.name, new URL(options.atlasURL, location.href)).href;
            const blob = await readResponse(url, signal, 'blob');
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
    let previous = 0, pinching = false, lastTap = null;
    const distance = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    stage.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || options.isChrome(event.target)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        pinching = true; previous = distance(); lastTap = null;
        options.cancelDrag();
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    stage.addEventListener('pointermove', event => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinching || touches.size < 2) return;
      const points = [...touches.values()], next = distance();
      if (previous > 0 && next > 0) options.zoom(next / previous, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
      previous = next;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    const up = event => {
      if (!touches.has(event.pointerId)) return;
      touches.delete(event.pointerId);
      if (pinching) {
        options.cancelDrag();
        event.stopImmediatePropagation();
        if (!touches.size) pinching = false;
        return;
      }
      if (event.type !== 'pointerup' || !options.isTap()) { lastTap = null; return; }
      const now = Date.now();
      if (lastTap && now - lastTap.time < 320 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24) {
        lastTap = null; options.cancelDrag(); options.fit(); event.stopImmediatePropagation();
      } else lastTap = { time: now, x: event.clientX, y: event.clientY };
    };
    stage.addEventListener('pointerup', up, true);
    stage.addEventListener('pointercancel', up, true);
  };
})();
