/* ============================================================
   viewer-common/kit.js — 两个 Spine 查看器的共享库 (window.SpineKit)
   兼容 spine-webgl 4.1 与 4.2 运行时(特性检测)。
   依赖: 先于本文件或后于本文件加载 spine 运行时均可(调用时才取 window.spine)。
   ============================================================ */
(() => {
  'use strict';
  const K = {};

  // ---------- Store: localStorage 封装 ----------
  K.Store = (prefix) => {
    const key = n => prefix + ':' + n;
    return {
      get(n, def) {
        try {
          const v = localStorage.getItem(key(n));
          return v == null ? def : JSON.parse(v);
        } catch { return def; }
      },
      set(n, v) { try { localStorage.setItem(key(n), JSON.stringify(v)); } catch {} },
      del(n) { try { localStorage.removeItem(key(n)); } catch {} },
    };
  };

  // ---------- 本地设置迁移（收藏、别名、主题、布局等） ----------
  // 只导出查看器自己使用的 JSON 设置键，不触碰 data/ 下的资源文件。
  const SETTINGS_KEY_RE = /^(?:gav:|majsoul:|bd2:|bd2mod:|nikke:|nikki:)/;
  K.settings = {
    snapshot() {
      const storage = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !SETTINGS_KEY_RE.test(key)) continue;
          const value = localStorage.getItem(key);
          if (value == null) continue;
          try { JSON.parse(value); } catch { continue; }
          storage[key] = value;
        }
      } catch {}
      return { version: 1, exportedAt: new Date().toISOString(), storage };
    },
    download() {
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'game-asset-viewer-settings-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async importFile(file) {
      if (!file) return 0;
      const data = JSON.parse(await file.text());
      const storage = data && data.storage;
      if (!storage || typeof storage !== 'object' || Array.isArray(storage)) throw new Error('不是查看器设置文件');
      let count = 0;
      for (const [key, value] of Object.entries(storage)) {
        if (!SETTINGS_KEY_RE.test(key) || typeof value !== 'string') continue;
        try { JSON.parse(value); } catch { continue; }
        localStorage.setItem(key, value);
        count++;
      }
      return count;
    },
  };

  // ---------- NIKKE 目录资源的显示分类 ----------
  // 原始索引仍保持 type=catalog，分类只在浏览器内生效，避免覆盖用户导出的数据。
  const NIKKE_CATEGORY_LABEL = {
    cutscene: '过场', skill: '技能', battle: '战斗', lobby: '立绘',
    idle: '待机', store: '客户端提取', unknown: '其他',
  };
  // 保留原始文件，但不把非角色、解析失败或缩略图链路无法稳定渲染的条目放进查看器。
  const NIKKE_VIEWER_OMIT_PREFIX = /^(?:favoriteitem_|pirate_ui_deco_monkey_)/i;
  const NIKKE_VIEWER_OMIT_IDS = new Set([
    // Atlas references point to pages/sequence frames that are absent from the extracted atlas.
    'EventScene_Chap_22_06', 'EventScene_Main_01_02', 'c160_skillcut', 'c112_01',
    'c250_00', 'c282_00', 'c800_00', 'c800_01', 'c802_00', 'c803_00', 'c804_00',
    'c909_00', 'c919_00', 'c928_00', 'c937_00', 'c131_aim_01', 'c330_aim_00',
    'c392_cover_00', 'c550_aim_00', 'c801_aim_00', 'c802_aim_00', 'c802_cover_00',
    // Known incomplete catalog-only entries retained in the source index for auditability.
    'c102_00_skillcut', 'c210_00_skillcut',
  ]);
  K.shouldOmitNikkeViewerEntry = (entry) => {
    const id = String(entry && entry.id || '');
    return NIKKE_VIEWER_OMIT_PREFIX.test(id) || NIKKE_VIEWER_OMIT_IDS.has(id);
  };
  K.classifyNikkeCatalog = (entry) => {
    if (!entry || entry.type !== 'catalog') return null;
    const id = String(entry.id || entry.name || '').replace(/^catalog-/i, '');
    let type = 'unknown';
    if (/(eventscene|eventtitle|cutscene|story|minigame|mvg|foolsday|fortheking|dessert|soda)/i.test(id)) type = 'cutscene';
    else if (/(skillcut|slillcut|skill[_-])/i.test(id)) type = 'skill';
    else if (/(^c\d+_(aim|cover))|^(bm|bh)_|^(boss|monster|minion)_|(^|[_-])(weapon|enemy)([_-]|$)|dummy_(aim|cover)|monster|tower/i.test(id)) type = 'battle';
    else if (/(idle|rest|move|sit|victory|getitem|talent)/i.test(id)) type = 'idle';
    else if (/^c\d+_/i.test(id)) type = 'lobby';
    else if (/(favoriteitem|item|icon|ui)/i.test(id)) type = 'store';
    return { type, label: NIKKE_CATEGORY_LABEL[type] };
  };
  K.decorateNikkeIndex = (data) => {
    if (!data || !Array.isArray(data.characters)) return data;
    let changed = false;
    const characters = data.characters.reduce((out, entry) => {
      if (K.shouldOmitNikkeViewerEntry(entry)) {
        changed = true;
        return out;
      }
      const category = K.classifyNikkeCatalog(entry);
      if (!category) {
        out.push(entry);
        return out;
      }
      changed = true;
      const source = String(entry.source || 'NIKKE core catalog via ndb VFS')
        .replace(/\s+·\s+(过场|技能|战斗|立绘|待机|客户端提取|其他)$/, '');
      out.push({
        ...entry,
        type: category.type,
        category: category.label,
        source: source + ' · ' + category.label,
      });
      return out;
    }, []);
    return changed ? { ...data, characters } : data;
  };

  // cutscene.html 会从 ../nikki_chars.json 读取索引；在 fetch 层装饰后，
  // 现有页面的类型 chips、卡片标签和文本搜索都能直接复用，无需改动原页面。
  if (!window.__gavNikkeIndexDecorator) {
    window.__gavNikkeIndexDecorator = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let path = '';
      try { path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname; } catch {}
      const target = /\/nikki\/nikki_chars\.json$/i.test(path);
      return nativeFetch(input, init).then(async (response) => {
        if (!target || !response.ok) return response;
        try {
          const data = await response.clone().json();
          const decorated = K.decorateNikkeIndex(data);
          if (decorated === data) return response;
          const headers = new Headers(response.headers);
          headers.delete('content-encoding');
          headers.delete('content-length');
          headers.set('content-type', 'application/json; charset=utf-8');
          return new Response(JSON.stringify(decorated), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } catch { return response; }
      });
    };
  }

  // ---------- 资源名称目录与稳定排序 ----------
  // 名称目录由 scripts/build-asset-catalog.js 根据本地索引生成。它只改变显示层，
  // 不改动原始文件名、URL 或用户导出的资源；目录不存在时仍保留原页面行为。
  const ASSET_CATALOG_FALLBACK = {
    schemaVersion: 'asset-catalog/fallback',
    typeLabels: { cutscene: '剧情 / 过场', skill: '技能动画', battle: '战斗动作', lobby: '立绘 / 大厅', idle: '待机动作', store: '客户端提取', catalog: '目录素材', unknown: '其他资源' },
    typeOrder: { cutscene: 10, skill: 20, battle: 30, lobby: 40, idle: 50, store: 80, catalog: 90, unknown: 99 },
    spine: {},
    gallery: { tokenLabels: {}, majsoulCharacterLabels: {}, categoryGroupOrder: [] },
  };
  const catalogFetchBase = window.fetch.bind(window);
  let assetCatalog = ASSET_CATALOG_FALLBACK;
  const assetCatalogReady = catalogFetchBase('../../common/asset-catalog.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : ASSET_CATALOG_FALLBACK)
    .then(data => { if (data && typeof data === 'object') assetCatalog = data; return assetCatalog; })
    .catch(() => assetCatalog);
  K.assetCatalogReady = assetCatalogReady;
  K.assetCatalog = () => assetCatalog;

  const assetTypeLabels = () => ({ ...ASSET_CATALOG_FALLBACK.typeLabels, ...(assetCatalog.typeLabels || {}) });
  const assetTypeOrder = () => ({ ...ASSET_CATALOG_FALLBACK.typeOrder, ...(assetCatalog.typeOrder || {}) });
  const naturalAssetCompare = (a, b) => String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  const jsonResponse = (response, data) => {
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
  };

  K.spineMeta = (source, id) => {
    const map = assetCatalog.spine && assetCatalog.spine[source];
    return (map && map[String(id)]) || null;
  };

  K.decorateAssetIndex = (data, source) => {
    if (!data || !Array.isArray(data.characters)) return data;
    const labels = assetTypeLabels();
    const map = assetCatalog.spine && assetCatalog.spine[source] || {};
    const characters = data.characters.map(entry => {
      const id = String(entry && (entry.id || entry.name) || '');
      const meta = map[id];
      if (!meta) return entry;
      const originalName = String(meta.originalName || entry.originalName || entry.name || id);
      const displayName = String(meta.displayName || entry.displayName || originalName);
      const oldSource = String(entry.source || '').replace(/\s+·\s+原名：?[^\n]+$/u, '');
      const source = oldSource && originalName !== displayName
        ? oldSource + ' · 原名: ' + originalName
        : oldSource;
      return {
        ...entry,
        originalName,
        displayName,
        name: displayName,
        characterName: meta.characterName || '',
        characterNameEn: meta.characterNameEn || '',
        characterCode: meta.characterCode || '',
        resourceType: meta.resourceType || entry.type || 'unknown',
        typeLabel: meta.typeLabel || labels[meta.resourceType] || labels.unknown,
        sortName: meta.sortName || displayName,
        sortKey: meta.sortKey || displayName,
        nameConfidence: meta.confidence || 'original-name',
        source,
      };
    });
    return { ...data, characters };
  };

  function galleryFrameInfo(rel) {
    const base = String(rel || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    const m = base.match(/^(.+?)_(\d{1,4})$/);
    return m ? { base, stem: m[1], frame: Number(m[2]) } : { base, stem: base, frame: -1 };
  }

  function splitGalleryWords(text) {
    return String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  K.formatGalleryName = (rel, libId, categoryPath) => {
    const raw = String(rel || '');
    const info = galleryFrameInfo(raw);
    const labels = (assetCatalog.gallery && assetCatalog.gallery.tokenLabels) || {};
    const majsoulLabels = (assetCatalog.gallery && assetCatalog.gallery.majsoulCharacterLabels) || {};
    const bd2Spine = assetCatalog.spine && assetCatalog.spine.bd2 || {};
    let stem = info.stem.replace(/_[a-f0-9]{8}$/i, '');
    const parts = [];
    const char = stem.match(/^(Char|NPC)(?:Map)?0*(\d+)(?:_(.*))?$/i);
    if (char) {
      const kind = /^npc/i.test(char[1]) ? 'NPC' : '角色';
      const code = String(Number(char[2]));
      const code6 = char[2].padStart(6, '0');
      const bd2Meta = libId === 'bd2' && Object.values(bd2Spine).find(meta => meta.characterCode === code6 && meta.characterName);
      const mapped = (libId === 'majsoul' && (majsoulLabels[char[2]] || majsoulLabels[code]))
        || (bd2Meta && bd2Meta.characterName);
      parts.push(mapped || kind + ' ' + code.padStart(4, '0'));
      for (const word of splitGalleryWords(char[3] || '')) {
        const lower = word.toLowerCase();
        if (/^[bfrl]{1,2}$/i.test(word)) parts.push('方向 ' + word.toUpperCase());
        else if (labels[lower]) parts.push(labels[lower]);
        else if (/^\d+$/.test(word)) parts.push(word);
        else parts.push(word);
      }
    } else {
      for (const word of splitGalleryWords(stem)) {
        const lower = word.toLowerCase();
        if (/^[a-f0-9]{8,}$/i.test(word)) continue;
        parts.push(labels[lower] || word);
      }
    }
    let display = parts.filter(Boolean).join(' · ') || info.stem;
    if (info.frame >= 0) display += ' · 第' + info.frame + '帧';
    if (categoryPath && /(?:other|uncategorized)/i.test(categoryPath) && display === info.stem) display = '未分类 · ' + display;
    return {
      displayName: display,
      rawName: info.base,
      sortKey: String(categoryPath || '') + '|' + info.stem + '|' + String(info.frame < 0 ? 0 : info.frame).padStart(5, '0') + '|' + raw,
    };
  };

  K.decorateGalleryFiles = (data, libId) => {
    if (!data || !data.files || typeof data.files !== 'object') return data;
    const files = {};
    for (const [categoryPath, list] of Object.entries(data.files)) {
      files[categoryPath] = (Array.isArray(list) ? list : []).map(file => {
        const meta = K.formatGalleryName(file.rel, libId, categoryPath);
        return { ...file, displayName: meta.displayName, rawName: meta.rawName, sortKey: meta.sortKey };
      }).sort((a, b) => naturalAssetCompare(a.sortKey, b.sortKey));
    }
    return { ...data, files };
  };

  K.decorateGalleryMeta = (data) => {
    if (!data || !Array.isArray(data.libraries)) return data;
    const order = (assetCatalog.gallery && assetCatalog.gallery.categoryGroupOrder) || [];
    const rank = value => { const i = order.indexOf(String(value || '')); return i < 0 ? order.length + 10 : i; };
    const libraries = data.libraries.map(lib => ({
      ...lib,
      categories: Array.isArray(lib.categories) ? lib.categories.map((cat, index) => ({ ...cat, _catalogIndex: index }))
        .sort((a, b) => rank(a.group) - rank(b.group) || naturalAssetCompare(a.path, b.path))
        .map(({ _catalogIndex, ...cat }) => cat) : lib.categories,
    }));
    return { ...data, libraries };
  };

  K.initAssetNamingUI = () => {
    if (document.documentElement.dataset.gavAssetNamingReady) return;
    const spineGrid = document.getElementById('thumbGrid');
    const galleryGrid = document.getElementById('imgGrid');
    if (!spineGrid && !galleryGrid) return;
    document.documentElement.dataset.gavAssetNamingReady = '1';

    const route = location.pathname.split('/').filter(Boolean)[0] || '';
    const sourceMap = () => assetCatalog.spine && assetCatalog.spine[route] || {};
    const galleryContext = () => {
      const params = new URLSearchParams(location.hash.replace(/^#/, ''));
      return { lib: params.get('lib') || '', cat: params.get('cat') || '' };
    };

    let spineSortQueued = false;
    const sortSpineCards = () => {
      if (!spineGrid) return;
      const select = document.querySelector('#filterChips .sort-sel, .sort-sel');
      const savedMode = K.Store(route).get('sortMode', null);
      const mode = select ? select.value : (savedMode || 'default');
      // 名称排序交给原页面处理；默认/类别排序统一使用目录中的角色名和稳定键。
      if (mode === 'name') return;
      const map = sourceMap();
      const cards = [...spineGrid.querySelectorAll('.thumb-card')];
      if (cards.length < 2) return;
      const key = card => {
        const id = card.dataset.id || '';
        const meta = map[id];
        return (meta && meta.sortKey) || ('999|' + id);
      };
      const sorted = cards.slice().sort((a, b) => naturalAssetCompare(key(a), key(b)));
      if (sorted.every((card, index) => card === cards[index])) return;
      const frag = document.createDocumentFragment();
      for (const card of sorted) frag.appendChild(card);
      spineGrid.appendChild(frag);
      for (const card of sorted) {
        const meta = map[card.dataset.id || ''];
        const title = card.querySelector('.tn');
        if (title && meta) {
          title.title = '原始名称: ' + (meta.originalName || meta.displayName || '');
          card.dataset.displayName = meta.displayName || '';
        }
      }
    };
    const queueSpineSort = () => {
      if (spineSortQueued) return;
      spineSortQueued = true;
      requestAnimationFrame(() => { spineSortQueued = false; sortSpineCards(); });
    };

    let galleryNameQueued = false;
    const patchGalleryNames = () => {
      if (!galleryGrid) return;
      const { lib, cat } = galleryContext();
      for (const label of galleryGrid.querySelectorAll('.fname')) {
        const raw = label.dataset.gavRaw || (label.getAttribute('title') || label.textContent || '').split('\n')[0];
        if (!raw) continue;
        const meta = K.formatGalleryName(raw, lib, cat);
        if (label.dataset.gavRaw === raw && label.dataset.gavDisplay === meta.displayName) continue;
        label.dataset.gavRaw = raw;
        label.dataset.gavDisplay = meta.displayName;
        label.textContent = meta.displayName;
        label.title = meta.displayName + '\n原始名称: ' + raw;
      }
      const info = document.getElementById('lbInfo');
      if (info && info.textContent && !info.dataset.gavPatched) {
        const raw = info.textContent.split(' · ')[0];
        const meta = K.formatGalleryName(raw, lib, cat);
        if (meta.displayName !== raw) {
          info.textContent = meta.displayName + ' · 原始名称: ' + info.textContent;
          info.dataset.gavPatched = '1';
        }
      }
      const playerTitle = document.getElementById('plTitle');
      if (playerTitle && playerTitle.textContent && playerTitle.dataset.gavRaw !== playerTitle.textContent) {
        const raw = playerTitle.textContent;
        const meta = K.formatGalleryName(raw, lib, cat);
        playerTitle.dataset.gavRaw = raw;
        playerTitle.textContent = meta.displayName;
        playerTitle.title = '原始名称: ' + raw;
      }
    };
    const queueGalleryNames = () => {
      if (galleryNameQueued) return;
      galleryNameQueued = true;
      requestAnimationFrame(() => { galleryNameQueued = false; patchGalleryNames(); });
    };

    if (spineGrid) {
      const observer = new MutationObserver(queueSpineSort);
      observer.observe(spineGrid, { childList: true });
      document.addEventListener('change', event => {
        if (event.target && event.target.matches && event.target.matches('.sort-sel')) queueSpineSort();
      });
    }
    if (galleryGrid) {
      const observer = new MutationObserver(queueGalleryNames);
      observer.observe(galleryGrid, { childList: true, subtree: true, characterData: true });
      const infoObserver = new MutationObserver(queueGalleryNames);
      const info = document.getElementById('lbInfo');
      const title = document.getElementById('plTitle');
      if (info) infoObserver.observe(info, { childList: true, characterData: true });
      if (title) infoObserver.observe(title, { childList: true, characterData: true });
    }
    assetCatalogReady.then(() => { queueSpineSort(); queueGalleryNames(); });
    setTimeout(() => { queueSpineSort(); queueGalleryNames(); }, 300);
  };

  if (!window.__gavAssetCatalogDecorator) {
    window.__gavAssetCatalogDecorator = true;
    const previousFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let path = '';
      try { path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname; } catch {}
      const spineMatch = path.match(/\/(bd2|bd2mod|nikke|nikki)\/(?:bd2|bd2mod|nikke|nikki)_chars\.json$/i);
      const galleryFilesMatch = path.match(/\/gallery\/index\/gallery_files_([^/]+)\.json$/i);
      const galleryMetaMatch = /\/gallery\/index\/gallery_meta\.json$/i.test(path);
      return previousFetch(input, init).then(async response => {
        if (!response.ok || (!spineMatch && !galleryFilesMatch && !galleryMetaMatch)) return response;
        try {
          const data = await response.clone().json();
          await assetCatalogReady;
          let decorated = data;
          if (spineMatch) decorated = K.decorateAssetIndex(data, spineMatch[1].toLowerCase());
          else if (galleryFilesMatch) decorated = K.decorateGalleryFiles(data, galleryFilesMatch[1]);
          else if (galleryMetaMatch) decorated = K.decorateGalleryMeta(data);
          return jsonResponse(response, decorated);
        } catch { return response; }
      });
    };
  }

  let nikkeSearchPromise = null;
  K.searchNikkeCatalog = (query) => {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return Promise.resolve([]);
    if (!nikkeSearchPromise) {
      nikkeSearchPromise = fetch('../../nikki/nikki_chars.json')
        .then(r => r.ok ? r.json() : { characters: [] })
        .then(data => K.decorateNikkeIndex(data).characters || [])
        .catch(() => []);
    }
    return nikkeSearchPromise.then(characters => characters
      .filter(c => [c.id, c.name, c.source, c.category].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice(0, 20)
      .map(c => ({
        group: 'NIKKE · ' + (c.category || '其他'),
        title: c.name || c.id,
        sub: c.id,
        url: '../../nikki/viewer/cutscene.html?id=' + encodeURIComponent(c.id),
      })));
  };

  // ---------- 脚本 / 运行时加载 ----------
  K.loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('加载失败 ' + src));
    document.head.appendChild(s);
  });

  // 依次尝试多个源,任一成功且 window.spine 可用即返回
  K.loadRuntime = async (sources, okFlag) => {
    if (window.spine && window.spine.SkeletonBinary) return true;
    for (const src of sources) {
      try {
        await K.loadScript(src);
        if (window.spine && window.spine.SkeletonBinary) {
          if (window.spine.GLTexture) window.spine.GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;
          return true;
        }
      } catch {}
    }
    return false;
  };

  // ---------- 多版本运行时共存 ----------
  // 各版本 IIFE 都往全局写 `spine`, 这里逐版本加载后捕获命名空间:
  // K.spineNS['4.0'] / ['4.1'] / ['4.2'], 供不同版本骨骼使用各自的 SkeletonBinary/渲染器。
  K.spineNS = {};
  K.captureSpine = (v) => {
    if (window.spine && window.spine.SkeletonBinary) K.spineNS[v] = window.spine;
  };
  K.loadSpineVersion = async (v, urls) => {
    if (K.spineNS[v]) return true;
    const prev = window.spine;
    for (const url of urls) {
      try {
        // 注意: spine 是 var 声明的全局(不可配置), 严格模式 delete 会抛错; 置空检测即可
        window.spine = null;
        await K.loadScript(url);
        if (window.spine && window.spine.SkeletonBinary) {
          K.spineNS[v] = window.spine;
          window.spine = prev;
          return true;
        }
      } catch {}
    }
    window.spine = prev;
    return false;
  };
  // entry.spineVersion('4.0.64' 等) → 对应命名空间, 缺省回退 4.1
  K.getSpine = (v) => {
    if (v) {
      const m = String(v).match(/^(\d+)\.(\d+)/);
      if (m && K.spineNS[m[1] + '.' + m[2]]) return K.spineNS[m[1] + '.' + m[2]];
    }
    return K.spineNS['4.1'] || window.spine || K.spineNS[Object.keys(K.spineNS)[0]] || null;
  };

  // ---------- GL ----------
  K.createGL = (canvas, ns) => {
    try {
      const sp = ns || window.spine;
      if (!sp) return null;
      const raw = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
        || canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!raw) return null;
      if (sp.GLTexture) sp.GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;
      const mgl = new sp.ManagedWebGLRenderingContext(raw);
      const renderer = new sp.SceneRenderer(canvas, mgl);
      return { mgl, renderer };
    } catch (e) { console.error(e); return null; }
  };

  K.resizeCanvas = (canvas, renderer) => {
    const w = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
    const h = Math.max(1, Math.round(canvas.clientHeight * (window.devicePixelRatio || 1)));
    canvas.width = w; canvas.height = h;
    if (renderer) {
      try { renderer.resize(window.spine.ResizeMode ? window.spine.ResizeMode.Expand : undefined); } catch {}
    }
  };

  // canvas buffer 已被外部改为目标尺寸(如高清导出)后,同步 viewport 与相机。
  // 不能用 renderer.resize():它会按 clientWidth×dpr 把 buffer 重置回去。
  K.syncRendererSize = (canvas, mgl, renderer) => {
    const raw = (mgl && mgl.gl) || mgl;
    if (raw && raw.viewport) raw.viewport(0, 0, canvas.width, canvas.height);
    if (renderer && renderer.camera && renderer.camera.setViewport) {
      renderer.camera.setViewport(canvas.width, canvas.height);
      renderer.camera.update();
    }
  };

  K.parseColor = (hex, fallback) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return fallback || [0.09, 0.1, 0.13];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  // Solve constraints in authored coordinates, then apply the viewer transform.
  // Spine 4.1 single-bone IK (OnlyTranslation/NoScale + compress/stretch)
  // compares a world-space target distance with a local bone length. Feeding
  // viewport zoom into that solve changes the pose, especially chained legs.
  // Keep local/applied poses and skeleton data untouched; hit tests, debug
  // drawing, meshes and clipping all consume the same transformed bone matrices.
  // Only active bones are updated by Spine and drawn by the renderer — re-scale
  // inactive bones too and their stale world matrices get multiplied again.
  K.updateWorldTransform = (skeleton) => {
    const { x, y, scaleX, scaleY } = skeleton;
    try {
      skeleton.x = skeleton.y = 0;
      skeleton.scaleX = skeleton.scaleY = 1;
      skeleton.updateWorldTransform();
    } finally {
      skeleton.x = x; skeleton.y = y;
      skeleton.scaleX = scaleX; skeleton.scaleY = scaleY;
    }
    for (const bone of skeleton.bones) {
      if (!bone.active) continue;
      bone.a *= scaleX; bone.b *= scaleX;
      bone.c *= scaleY; bone.d *= scaleY;
      bone.worldX = bone.worldX * scaleX + x;
      bone.worldY = bone.worldY * scaleY + y;
    }
  };

  // ---------- 包围盒 / 命中测试 ----------
  const SCRATCH = new Float32Array(600000); // 复用顶点缓冲(约 2.4MB)

  // 遍历可见附件的世界顶点 → 包围盒
  // ns: 该骨架所属的 spine 命名空间(多版本运行时), 省略时用 window.spine。
  // 4.0/4.1/4.2 附件类互相 instanceof 都会失败, 必须用骨架自己的版本类判断。
  const measureBoundsRaw = (skeleton, ns) => {
    const sp = ns || window.spine;
    if (!sp) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const slot of skeleton.slots) {
      const a = slot.attachment;
      if (!a || !slot.bone.active || slot.color.a <= 0.001) continue;
      let n = 0;
      if (a instanceof sp.RegionAttachment) {
        n = 8;
        a.computeWorldVertices(slot, SCRATCH, 0, 2);
      } else if (a instanceof sp.MeshAttachment) {
        n = a.worldVerticesLength;
        if (n > 0 && n < SCRATCH.length) a.computeWorldVertices(slot, 0, n, SCRATCH, 0, 2);
      } else if (a instanceof sp.PathAttachment) {
        n = a.worldVerticesLength || (a.points ? a.points.length : 0);
        if (n > 0 && n < SCRATCH.length) a.computeWorldVertices(slot, 0, n, SCRATCH, 0, 2);
      } else continue;
      for (let i = 0; i < n; i += 2) {
        const x = SCRATCH[i], y = SCRATCH[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  };

  // 某些 NIKKE 演出骨架的 setup pose 没有可见附件，但动画第一帧有完整画面。
  // 缩略图引擎会先量 setup pose；这里用首个可用动画再尝试一次，避免“能打开但无预览”。
  K.measureBounds = (skeleton, ns) => {
    const first = measureBoundsRaw(skeleton, ns);
    const span = first && (first.maxX - first.minX) > 0 && (first.maxY - first.minY) > 0;
    if (span) return first;
    const sp = ns || window.spine;
    const animations = skeleton && skeleton.data && skeleton.data.animations;
    const animation = animations && (animations.find(a => /^(loop|idle|skill|default)/i.test(a.name)) || animations[0]);
    if (!sp || !animation || !sp.AnimationState || !sp.AnimationStateData) return first;
    try {
      if (typeof animation.apply === 'function') {
        animation.apply(skeleton, 0, 0.001, false, [], 1,
          sp.MixBlend ? sp.MixBlend.setup : 0,
          sp.MixDirection ? sp.MixDirection.mixIn : 0);
      } else {
        const stateData = new sp.AnimationStateData(skeleton.data);
        const state = new sp.AnimationState(stateData);
        state.setAnimation(0, animation.name, false);
        state.update(0.001);
        state.apply(skeleton);
      }
      K.updateWorldTransform(skeleton);
      return measureBoundsRaw(skeleton, ns) || first;
    } catch {
      return first;
    }
  };

  // 命中测试:返回包含世界坐标 (wx,wy) 的最上层 slot 名(自 drawOrder 顶向下)
  K.hitTestSlot = (skeleton, wx, wy, ns) => {
    const sp = ns || window.spine;
    const slots = (skeleton.drawOrder && skeleton.drawOrder.length) ? skeleton.drawOrder : skeleton.slots;
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i];
      const a = slot.attachment;
      if (!a || !slot.bone.active || slot.color.a <= 0.001) continue;
      let n = 0;
      if (a instanceof sp.RegionAttachment) {
        n = 8;
        a.computeWorldVertices(slot, SCRATCH, 0, 2);
      } else if (a instanceof sp.MeshAttachment) {
        n = a.worldVerticesLength;
        if (n > 0 && n < SCRATCH.length) a.computeWorldVertices(slot, 0, n, SCRATCH, 0, 2);
      } else if (a instanceof sp.PathAttachment) {
        n = a.worldVerticesLength || (a.points ? a.points.length : 0);
        if (n > 0 && n < SCRATCH.length) a.computeWorldVertices(slot, 0, n, SCRATCH, 0, 2);
      } else continue;
      if (!n) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let j = 0; j < n; j += 2) {
        const x = SCRATCH[j], y = SCRATCH[j + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) return slot.data.name;
    }
    return null;
  };

  // ---------- 部件(slot)显隐 ----------
  K.showSlot = (skeleton, name) => {
    const slot = skeleton.findSlot(name);
    if (!slot) return;
    const setupName = slot.data.attachmentName;
    slot.setAttachment(setupName ? skeleton.getAttachment(slot.data.index, setupName) : null);
  };
  K.hideSlot = (skeleton, name) => {
    const slot = skeleton.findSlot(name);
    if (slot) slot.setAttachment(null);
  };
  K.applyHiddenSlots = (skeleton, hiddenSet) => {
    if (!hiddenSet || !hiddenSet.size) return;
    for (const name of hiddenSet) K.hideSlot(skeleton, name);
  };

  // ---------- 通用部件面板 ----------
  // o: { listEl, filterEl, allEl, noneEl, invEl,
  //      getTargets: () => [{data, skeleton, hiddenSlots:Set}] | null,
  //      onHover: (slotName|null) => void,   可选,悬停高亮
  //      onChange: () => void }              可选,状态变化后回调
  // 返回 { refresh() };一次性绑定按钮,之后随时 refresh() 重建列表
  K.buildPartsPanel = (o) => {
    const refresh = () => {
      const listEl = o.listEl;
      listEl.innerHTML = '';
      const targets = o.getTargets();
      if (!targets || !targets.length) {
        listEl.innerHTML = '<div class="empty-tip">未加载骨架</div>';
        return;
      }
      const q = (o.filterEl ? o.filterEl.value : '').trim().toLowerCase();
      const names = [];
      for (const t of targets) {
        for (const sd of t.data.slots) {
          if (!names.includes(sd.name)) names.push(sd.name);
        }
      }
      let shown = 0;
      for (const name of names) {
        if (q && !name.toLowerCase().includes(q)) continue;
        const hiddenIn = targets.filter(t => t.hiddenSlots.has(name));
        const row = document.createElement('div');
        row.className = 'slot-row' + (hiddenIn.length ? ' off' : '');
        const eye = document.createElement('button');
        eye.className = 'eye';
        eye.textContent = hiddenIn.length ? '🚫' : '👁';
        eye.title = '显示/隐藏 ' + name;
        eye.onclick = () => {
          for (const t of targets) {
            if (!t.data.slots.some(sd => sd.name === name)) continue;
            if (t.hiddenSlots.has(name)) {
              t.hiddenSlots.delete(name);
              K.showSlot(t.skeleton, name);
            } else {
              t.hiddenSlots.add(name);
              K.hideSlot(t.skeleton, name);
            }
          }
          if (o.onChange) o.onChange();
          refresh();
        };
        const sn = document.createElement('span');
        sn.className = 'sn';
        sn.textContent = name + (targets.length > 1 && hiddenIn.length && hiddenIn.length < targets.length ? ` (${targets.length - hiddenIn.length}/${targets.length})` : '');
        sn.title = name;
        row.appendChild(eye);
        row.appendChild(sn);
        if (o.onHover) {
          row.addEventListener('pointerenter', () => o.onHover(name));
          row.addEventListener('pointerleave', () => o.onHover(null));
        }
        listEl.appendChild(row);
        shown++;
      }
      if (!shown) listEl.innerHTML = '<div class="empty-tip">无匹配部件</div>';
    };
    if (o.filterEl) o.filterEl.addEventListener('input', refresh);
    if (o.allEl) o.allEl.addEventListener('click', () => {
      const targets = o.getTargets();
      if (!targets) return;
      for (const t of targets) {
        t.hiddenSlots.clear();
        t.skeleton.setSlotsToSetupPose();
      }
      if (o.onChange) o.onChange();
      refresh();
    });
    if (o.noneEl) o.noneEl.addEventListener('click', () => {
      const targets = o.getTargets();
      if (!targets) return;
      for (const t of targets) for (const sd of t.data.slots) t.hiddenSlots.add(sd.name);
      for (const t of targets) K.applyHiddenSlots(t.skeleton, t.hiddenSlots);
      if (o.onChange) o.onChange();
      refresh();
    });
    if (o.invEl) o.invEl.addEventListener('click', () => {
      const targets = o.getTargets();
      if (!targets) return;
      for (const t of targets) {
        for (const sd of t.data.slots) {
          if (t.hiddenSlots.has(sd.name)) { t.hiddenSlots.delete(sd.name); K.showSlot(t.skeleton, sd.name); }
          else { t.hiddenSlots.add(sd.name); K.hideSlot(t.skeleton, sd.name); }
        }
      }
      if (o.onChange) o.onChange();
      refresh();
    });
    refresh();
    return { refresh };
  };

  // ---------- 跨源收藏 / 最近浏览（同源 localStorage 共享, 首页聚合展示） ----------
  // entry: { k: 唯一键, src: 源 id, t: 标题, s: 副标题, u: 深链 URL, ts }
  function readStoreArr(key, cap) {
    try {
      const a = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(a) ? a.slice(0, cap) : [];
    } catch { return []; }
  }
  K.favs = {
    list: () => readStoreArr('gav:favs', 500),
    has: (k) => readStoreArr('gav:favs', 500).some(x => x.k === k),
    toggle(entry) {
      const list = readStoreArr('gav:favs', 500);
      const i = list.findIndex(x => x.k === entry.k);
      if (i >= 0) { list.splice(i, 1); localStorage.setItem('gav:favs', JSON.stringify(list)); return false; }
      entry.ts = Date.now(); list.unshift(entry);
      localStorage.setItem('gav:favs', JSON.stringify(list));
      return true;
    },
  };
  K.history = {
    list: (n = 40) => readStoreArr('gav:hist', n),
    push(entry) {
      entry.ts = Date.now();
      const list = readStoreArr('gav:hist', 60).filter(x => x.k !== entry.k);
      list.unshift(entry);
      localStorage.setItem('gav:hist', JSON.stringify(list.slice(0, 60)));
    },
  };

  // ---------- Ctrl+K 全局搜索面板 (任何查看器页可用, 跨源跳转) ----------
  K.initSearchPalette = () => {
    if (document.getElementById('kPal')) return;
    const style = document.createElement('style');
    style.textContent = [
      '#kPal{position:fixed;inset:0;z-index:300;display:none;background:rgba(4,7,12,.68);backdrop-filter:blur(8px)}',
      '#kPal.open{display:block}',
      '#kPal{position:fixed;inset:0;z-index:300;display:none;background:rgba(4,7,12,.68);backdrop-filter:blur(8px)}',
      '#kPal.open{display:block}',
      '#kPal .kpal-panel{width:min(680px,92vw);margin:11vh auto 0;background:var(--glass,#12161f);border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.56)}',
      '#kPal input{width:100%;box-sizing:border-box;padding:16px 18px;background:transparent;border:none;outline:none;color:var(--text,#e2e8f2);font-size:15px;font-family:inherit;border-bottom:1px solid var(--border,rgba(255,255,255,.08))}',
      '#kPal input::placeholder{color:var(--text-faint,#697589)}',
      '#kPal .kpal-list{max-height:56vh;overflow-y:auto;padding:7px}',
      '#kPal .kpal-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;cursor:pointer;color:var(--text-dim,#c7cfdd);text-decoration:none;font-size:13px}',
      '#kPal .kpal-item.active,#kPal .kpal-item:hover{background:var(--accent-dim-bg,rgba(143,183,239,.12));color:var(--accent-hi,#c3d8fa)}',
      '#kPal .kpal-group{font-size:10.5px;color:var(--text-faint,#5d6678);border:1px solid var(--border2,rgba(255,255,255,.1));border-radius:999px;padding:2px 8px;flex:none}',
      '#kPal .kpal-sub{font-size:11px;color:var(--text-faint,#5d6678);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}',
      '#kPal .kpal-empty{padding:24px;text-align:center;color:var(--text-faint,#5d6678);font-size:12.5px}',
    ].join('\n');
    document.head.appendChild(style);
    const pal = document.createElement('div');
    pal.id = 'kPal';
    pal.innerHTML = '<div class="kpal-panel"><input id="kPalInput" placeholder="搜索全部资源: 模型名称 / 编号 / 图库文件名…" autocomplete="off">'
      + '<div class="kpal-list" id="kPalList"><div class="kpal-empty">输入关键词跨源搜索</div></div></div>';
    document.body.appendChild(pal);
    const input = pal.querySelector('#kPalInput');
    const list = pal.querySelector('#kPalList');
    let rows = [], active = -1, timer = null;
    function render(results) {
      rows = results; active = results.length ? 0 : -1;
      if (!results.length) {
        list.innerHTML = '<div class="kpal-empty">' + (input.value ? '没有匹配结果' : '输入关键词跨源搜索') + '</div>';
        return;
      }
      let h = '';
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        h += '<a class="kpal-item' + (i === active ? ' active' : '') + '" data-i="' + i + '" href="' + K.esc(r.url || '#') + '">'
          + '<span class="kpal-group">' + K.esc(r.group || '') + '</span><span>' + K.esc(r.title || '') + '</span><span class="kpal-sub">' + K.esc(r.sub || '') + '</span></a>';
      }
      list.innerHTML = h;
      list.querySelectorAll('.kpal-item').forEach((el) => {
        el.addEventListener('click', (event) => {
          const item = rows[Number(el.dataset.i)];
          if (!item) return;
          if (item.run) {
            event.preventDefault();
            event.stopPropagation();
            close();
            item.run();
          }
        });
      });
    }
    function move(d) {
      if (!rows.length) return;
      active = (active + d + rows.length) % rows.length;
      const els = list.querySelectorAll('.kpal-item');
      els.forEach((el, i) => el.classList.toggle('active', i === active));
      if (els[active]) els[active].scrollIntoView({ block: 'nearest' });
    }
    function currentCommands() {
      const commands = [];
      const add = (id, title, sub) => {
        const el = document.getElementById(id);
        if (!el || el.disabled) return;
        const run = id === 'gridSearch'
          ? () => {
            const opener = document.getElementById('railGrid');
            const gridView = document.getElementById('gridView');
            if (opener && gridView && !gridView.classList.contains('open')) opener.click();
            setTimeout(() => { el.focus(); el.select(); }, 40);
          }
          : () => el.click();
        commands.push({ group: '操作', title, sub: sub || '', run });
      };
      add('railGrid', '打开资源库', 'G');
      add('gridClose', '返回舞台', 'Esc');
      add('gridSearch', '聚焦资源搜索', '/');
      add('btnParts', '打开部件面板', '');
      add('btnAnimTab', '打开动画面板', '');
      add('pbPlay', '播放 / 暂停', 'Space');
      add('btnPng', '导出当前画面 PNG', '');
      add('btnGif', '导出当前动画 GIF', '');
      add('btnPresetImmersive', '切换沉浸模式', 'I');
      add('btnTheme', '切换主题', '');
      return commands;
    }
    function quickRows() {
      const out = [];
      const seen = new Set();
      const add = (arr, group, cap) => {
        for (const item of arr.slice(0, cap)) {
          if (!item || !item.u || seen.has(item.k)) continue;
          seen.add(item.k);
          out.push({ group, title: item.t || item.k, sub: item.s || '', url: item.u });
        }
      };
      out.push(...currentCommands().slice(0, 8));
      add(K.favs.list(), '收藏', 8);
      add(K.history.list(12), '最近', 12);
      return out.slice(0, 22);
    }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.trim();
        if (!q) { render(quickRows()); return; }
        const remote = fetch('/api/search?q=' + encodeURIComponent(q))
          .then(r => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] }));
        Promise.all([remote, K.searchNikkeCatalog(q).catch(() => [])]).then(([d, local]) => {
          if (input.value.trim() !== q) return;
          const seen = new Set();
          const commands = currentCommands().filter(item => {
            const hay = (item.title + ' ' + item.sub).toLowerCase();
            return hay.includes(q.toLowerCase());
          });
          const merged = [...commands, ...(d.results || []), ...local].filter(item => {
            if (!item) return false;
            if (item.run) return true;
            if (!item.url || seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
          });
          render(merged.slice(0, 30));
        });
      }, 180);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && rows[active]) {
        const item = rows[active];
        close();
        if (item.run) item.run();
        else if (item.url) location.href = item.url;
      }
    });
    function open() { pal.classList.add('open'); input.value = ''; render(quickRows()); setTimeout(() => input.focus(), 0); }
    function close() { pal.classList.remove('open'); }
    pal.addEventListener('click', (e) => { if (e.target === pal) close(); });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
      else if (e.key === 'Escape' && pal.classList.contains('open')) close();
    });
  };

  // ---------- 可搜索角色列表(含收藏置顶) ----------
  // o: { el, items:[{id,label,sub,badge,keywords?}], onPick(id),
  //      store?, placeholder?, countEl?, emptyText? }
  // 返回 { setActive(id), refresh(), nav(delta), items }
  K.SearchList = (o) => {
    const el = o.el;
    const store = o.store || null;
    let starred = store ? (store.get('stars', []) || []) : [];
    let activeId = null;

    el.innerHTML =
      '<div class="search-wrap"><input class="search-input" placeholder="' + (o.placeholder || '搜索名称 / 编号') + '" autocomplete="off"></div>'
      + '<div class="char-list"></div>';
    const input = el.querySelector('.search-input');
    const list = el.querySelector('.char-list');

    const isStarred = id => starred.includes(id);
    const toggleStar = (id) => {
      const i = starred.indexOf(id);
      if (i >= 0) starred.splice(i, 1); else starred.push(id);
      if (store) store.set('stars', starred);
      render();
    };

    const filtered = () => {
      const q = input.value.trim().toLowerCase();
      const arr = o.items.filter(c => {
        if (!q) return true;
        if ((c.label || '').toLowerCase().includes(q)) return true;
        if ((c.sub || c.id || '').toLowerCase().includes(q)) return true;
        if (c.keywords && c.keywords.some(k => k.toLowerCase().includes(q))) return true;
        return false;
      });
      return arr.sort((a, b) => (isStarred(b.id) ? 1 : 0) - (isStarred(a.id) ? 1 : 0));
      // sort 稳定,收藏内保持原相对顺序
    };

    const render = () => {
      const items = filtered();
      list.innerHTML = '';
      for (const c of items) {
        const b = document.createElement('button');
        b.className = 'char-item' + (activeId === c.id ? ' active' : '');
        const star = document.createElement('span');
        star.className = 'star' + (isStarred(c.id) ? ' on' : '');
        star.textContent = isStarred(c.id) ? '★' : '☆';
        star.title = '收藏/取消收藏';
        star.onclick = (e) => { e.stopPropagation(); toggleStar(c.id); };
        const names = document.createElement('span');
        names.className = 'names';
        const nm = document.createElement('span');
        nm.className = 'name';
        nm.textContent = c.label || c.id;
        if (c.sub) {
          const sub = document.createElement('span');
          sub.className = 'sub';
          sub.textContent = c.sub;
          names.appendChild(sub);
        }
        names.insertBefore(nm, names.firstChild);
        b.appendChild(star);
        b.appendChild(names);
        if (c.badge) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = c.badge;
          b.appendChild(badge);
        }
        b.onclick = () => o.onPick(c.id);
        list.appendChild(b);
      }
      if (!items.length) list.innerHTML = '<div class="empty-tip">' + (o.emptyText || '无匹配结果') + '</div>';
      if (o.countEl) o.countEl.textContent = o.items.length + ' 个条目';
    };

    // 列表内移动选择(delta = ±1),自动滚入视野
    const nav = (delta) => {
      const items = filtered();
      if (!items.length) return;
      let i = items.findIndex(c => c.id === activeId);
      i = i < 0 ? (delta > 0 ? 0 : items.length - 1) : (i + delta + items.length) % items.length;
      o.onPick(items[i].id);
      const node = list.children[i];
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('input', render);
    render();
    return {
      get items() { return o.items; },
      setActive(id) { activeId = id; render(); },
      isStarred(id) { return isStarred(id); },
      toggleStar,
      refresh: render,
      nav,
      focus() { input.focus(); },
    };
  };

  // ---------- 键盘快捷键 ----------
  // map: { 'ArrowLeft': fn, ' ': fn, ... };输入框聚焦时忽略;命中即 preventDefault
  K.bindKeys = (map) => {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(); }
    });
  };

  // ---------- 调试视图(骨骼/网格/包围盒) ----------
  // flags: { bones, regions, bounds, meshHull, meshTris, paths, clipping }
  K.debugActive = (flags) => !!(flags && (flags.bones || flags.regions || flags.bounds || flags.meshHull || flags.meshTris || flags.paths || flags.clipping));
  K.applyDebugFlags = (renderer, flags) => {
    const d = renderer && renderer.skeletonDebugRenderer;
    if (!d) return;
    d.drawBones = !!flags.bones;
    d.drawRegionAttachments = !!flags.regions;
    d.drawBoundingBoxes = !!flags.bounds;
    d.drawMeshHull = !!flags.meshHull;
    d.drawMeshTriangles = !!flags.meshTris;
    d.drawPaths = !!flags.paths;
    d.drawClipping = !!flags.clipping;
    d.premultipliedAlpha = false;
  };
  K.drawDebug = (renderer, skeletons) => {
    for (const sk of skeletons) {
      try { renderer.drawSkeletonDebug(sk, false); } catch {}
    }
  };

  // ---------- 悬停部件高亮 ----------
  K.drawSlotHighlight = (renderer, skeleton, slotName, fillAlpha) => {
    const slot = skeleton.findSlot(slotName);
    if (!slot || !slot.attachment) return;
    const a = slot.attachment;
    const fa = fillAlpha == null ? 0.3 : fillAlpha;
    const fill = { r: 1, g: 0.72, b: 0.18, a: fa };
    const line = { r: 1, g: 0.72, b: 0.18, a: 0.95 };
    try {
      if (a instanceof spine.RegionAttachment) {
        a.computeWorldVertices(slot, SCRATCH, 0, 2);
        const [x1, y1, x2, y2, x3, y3, x4, y4] = SCRATCH;
        renderer.quad(true, x1, y1, x2, y2, x3, y3, x4, y4, fill);
        renderer.line(x1, y1, x2, y2, line);
        renderer.line(x2, y2, x3, y3, line);
        renderer.line(x3, y3, x4, y4, line);
        renderer.line(x4, y4, x1, y1, line);
      } else if (a instanceof spine.MeshAttachment) {
        const n = a.worldVerticesLength;
        if (n > 0 && n < SCRATCH.length) {
          a.computeWorldVertices(slot, 0, n, SCRATCH, 0, 2);
          const tris = a.triangles;
          if (tris) {
            for (let i = 0; i + 2 < tris.length; i += 3) {
              const ia = tris[i] * 2, ib = tris[i + 1] * 2, ic = tris[i + 2] * 2;
              if (ic + 1 >= SCRATCH.length) break;
              renderer.triangle(true, SCRATCH[ia], SCRATCH[ia + 1], SCRATCH[ib], SCRATCH[ib + 1], SCRATCH[ic], SCRATCH[ic + 1], fill);
            }
          }
        }
      } else if (a instanceof spine.PathAttachment) {
        const n = a.worldVerticesLength || (a.points ? a.points.length : 0);
        if (n > 0 && n < SCRATCH.length) {
          a.computeWorldVertices(slot, 0, n, SCRATCH, 0, 2);
          for (let i = 2; i + 3 < n; i += 2) renderer.line(SCRATCH[i - 2], SCRATCH[i - 1], SCRATCH[i], SCRATCH[i + 1], line);
        }
      }
    } catch {}
  };

  // ---------- PNG 导出 ----------
  // o: { canvas, scale=1, transparent=false, bg=[r,g,b],
  //      filename, resize(k), draw(transparent), restore() }
  // resize(k): 画布已变为 k 倍尺寸后,调整渲染器/变换;draw: 同步重绘一帧;restore(): 恢复
  K.exportPNG = async (o) => {
    const canvas = o.canvas;
    const k = Math.max(1, o.scale || 1);
    const w0 = canvas.width, h0 = canvas.height;
    const maxDim = Math.max(w0, h0) * k;
    const kk = maxDim > 8192 ? 8192 / Math.max(w0, h0) : k;
    try {
      canvas.width = Math.round(w0 * kk);
      canvas.height = Math.round(h0 * kk);
      if (o.resize) o.resize(kk);
      o.draw(!!o.transparent);
      // 同步捕获(WebGL 绘制缓冲在合成后可能被清空,toDataURL 立即抓取)
      const url = canvas.toDataURL('image/png');
      if (!url || url.length < 64) throw new Error('画布捕获失败');
      const bin = atob(url.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
      // copy 模式: 写入剪贴板而非下载
      if (o.copy) {
        if (!navigator.clipboard || !window.ClipboardItem) {
          throw new Error('浏览器不支持剪贴板图片(需 https 或 localhost)');
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } catch (e) {
          // 后台标签页可能失焦导致失败,聚焦后重试一次
          window.focus();
          await new Promise(r => setTimeout(r, 120));
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
        return { w: canvas.width, h: canvas.height, size: blob.size, copied: true };
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = o.filename || ('spine-' + Date.now() + '.png');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      return { w: canvas.width, h: canvas.height, size: blob.size };
    } finally {
      canvas.width = w0;
      canvas.height = h0;
      if (o.restore) o.restore();
    }
  };

  // ---------- 杂项 ----------
  K.esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  // ---------- Toast 通知 ----------
  K.toast = (msg, type = 'info', ms = 2600) => {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(16px)';
      setTimeout(() => t.remove(), 260);
    }, ms);
  };

  // ---------- 右键菜单 ----------
  // items: [{label, fn, danger?, sep?}] —— 在 (x,y) 显示,点选或点外关闭
  K.showMenu = (items, x, y) => {
    K.hideMenu();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    for (const it of items) {
      if (it.sep) { const s = document.createElement('div'); s.className = 'sep'; menu.appendChild(s); continue; }
      const b = document.createElement('button');
      b.textContent = it.label;
      if (it.danger) b.className = 'danger';
      b.onclick = (event) => {
        event.stopPropagation();
        K.hideMenu();
        it.fn && it.fn();
      };
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    const close = (event) => {
      // 菜单内部点击先交给菜单项自身处理，不能被“点击外部关闭”抢先移除。
      if (event && menu.contains(event.target)) return;
      menu.remove();
      document.removeEventListener('click', close, true);
      window.removeEventListener('blur', close);
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
    window.addEventListener('blur', close);
  };
  K.hideMenu = () => { const m = document.querySelector('.ctx-menu'); if (m) m.remove(); };

  // ---------- 清爽界面层 ----------
  // 不改变具体查看器的业务逻辑，只把低频工具收进统一的“更多”菜单。
  // 这样资源页仍保留原有按钮和事件，旧快捷键也不会失效。
  K.initCleanChrome = () => {
    const root = document.documentElement;
    root.dataset.gavUi = 'clean';
    const panel = document.getElementById('floatPanel');
    const partsTrigger = document.getElementById('btnParts');
    const animTrigger = document.getElementById('btnAnimTab');
    // BD2/NIKKE 的浮动面板原页面漏了 tab click 监听；
    // 顶部按钮仍然有完整状态逻辑，复用它们可以避免复制业务状态。
    if (panel && partsTrigger && animTrigger && panel.dataset.kitTabFix !== '1') {
      panel.dataset.kitTabFix = '1';
      for (const tab of panel.querySelectorAll('.rp-tabs button[data-tab]')) {
        tab.addEventListener('click', () => {
          const target = tab.dataset.tab;
          if (target === panel.dataset.tab) return;
          if (target === 'parts') partsTrigger.click();
          else if (target === 'anim') animTrigger.click();
          else {
            // “姿势”主要由骨骼编辑入口打开；这里至少让标签页可见，
            // 不伪造骨骼编辑状态，也不覆盖原页面的保存/锁定逻辑。
            panel.dataset.tab = target;
            panel.classList.add('open');
            panel.querySelectorAll('.rp-tabs button').forEach(x => x.classList.toggle('on', x === tab));
            panel.querySelectorAll('.rp-page').forEach(page => page.classList.toggle('on', page.dataset.page === target));
          }
        });
      }
    }
    const toolStrip = document.querySelector('.tool-strip');
    if (!toolStrip || toolStrip.dataset.kitClean === '1') return;
    toolStrip.dataset.kitClean = '1';

    const primary = new Set(['btnParts', 'btnAnimTab', 'btnLayerPanel', 'btnAnimPanel', 'btnPng']);
    const secondary = [...toolStrip.querySelectorAll('button')]
      .filter(button => !primary.has(button.id));
    if (!secondary.length) return;

    const labelOf = (button) => {
      const raw = button.getAttribute('title') || button.getAttribute('aria-label') || button.textContent || '操作';
      return raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || '操作';
    };
    secondary.forEach(button => button.classList.add('kit-secondary-tool'));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'kit-more-tool';
    more.textContent = '⋯';
    more.title = '更多操作';
    more.setAttribute('aria-label', '更多操作');
    const invokeSecondary = (button) => {
      const originalStyle = button.getAttribute('style');
      const rect = more.getBoundingClientRect();
      // 部分原生弹窗用按钮 rect 定位；收纳后按钮是 display:none，
      // 临时给它一个不可见的“更多”位置，再恢复原样。
      button.classList.remove('kit-secondary-tool');
      button.style.position = 'fixed';
      button.style.left = rect.left + 'px';
      button.style.top = rect.top + 'px';
      button.style.width = '1px';
      button.style.height = '1px';
      button.style.opacity = '0';
      button.style.pointerEvents = 'none';
      try { button.click(); }
      finally {
        if (originalStyle == null) button.removeAttribute('style');
        else button.setAttribute('style', originalStyle);
        button.classList.add('kit-secondary-tool');
      }
    };
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const rect = more.getBoundingClientRect();
      K.showMenu(secondary.map(button => ({
        label: labelOf(button),
        fn: () => invokeSecondary(button),
      })), rect.left, rect.bottom + 6);
    });
    toolStrip.appendChild(more);
  };

  // ---------- 主题切换 ----------
  K.setTheme = (name, store) => {
    const root = document.documentElement;
    if (!name || name === 'deep') delete root.dataset.theme;
    else root.dataset.theme = name;
    if (store) store.set('theme', name || 'deep');
  };
  K.initTheme = (store) => {
    const t = store && store.get('theme', 'deep');
    if (t && t !== 'deep') K.setTheme(t);
    return t || 'deep';
  };

  // ---------- 快捷键速查浮层 ----------
  // rows: [按键, 说明][]
  K.showShortcuts = (title, rows) => {
    K.closeShortcuts();
    const ov = document.createElement('div');
    ov.className = 'kbd-overlay';
    ov.innerHTML = '<div class="panel"><h3>' + K.esc(title) + '</h3>'
      + rows.map(([k, d]) => `<div class="krow"><span>${K.esc(d)}</span><span class="badge">${K.esc(k)}</span></div>`).join('')
      + '</div>';
    ov.addEventListener('click', () => K.closeShortcuts());
    document.body.appendChild(ov);
  };
  K.closeShortcuts = () => { const o = document.querySelector('.kbd-overlay'); if (o) o.remove(); };

  // ---------- 面板宽度拖拽 ----------
  // handle: 分隔条元素; getTarget/setWidth(w); min/max 像素; key/store 持久化; onDone 调整后回调
  K.makeResizable = (handle, getTarget, setWidth, min, max, key, store, onDone) => {
    let startX = 0, startW = 0;
    const onMove = (e) => {
      const w = Math.max(min, Math.min(max, startW + (e.clientX - startX)));
      setWidth(w);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      handle.classList.remove('dragging');
      const target = getTarget();
      if (store && target) store.set(key, target.getBoundingClientRect().width);
      if (onDone) onDone();
    };
    handle.addEventListener('pointerdown', (e) => {
      const target = getTarget();
      if (!target) return;
      startX = e.clientX;
      startW = target.getBoundingClientRect().width;
      handle.classList.add('dragging');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
    handle.addEventListener('dblclick', () => {
      setWidth(0); // 0 = 恢复默认
      if (store) store.del(key);
      if (onDone) onDone();
    });
  };

  // ---------- 资源库便携层 ----------
  // 统一增强 Spine 网格和图库搜索，不依赖具体页面的内部变量。
  K.initLibraryUsability = () => {
    if (document.documentElement.dataset.gavLibraryReady) return;
    K.initCleanChrome();
    const gridSearch = document.getElementById('gridSearch');
    const gallerySearch = document.getElementById('searchBox');
    const search = gridSearch || gallerySearch;
    if (!search) return;
    document.documentElement.dataset.gavLibraryReady = '1';

    const isGallery = !!gallerySearch;
    const route = location.pathname.split('/').filter(Boolean)[0] || 'viewer';
    const store = K.Store('gav:library:' + route);
    const oldParent = search.parentElement;
    const wrap = document.createElement('div');
    wrap.className = isGallery ? 'kit-search-box kit-gallery-search' : 'kit-search-box kit-grid-search';
    oldParent.insertBefore(wrap, search);
    wrap.appendChild(search);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'kit-search-clear';
    clear.textContent = '×';
    clear.title = '清空搜索';
    clear.setAttribute('aria-label', '清空搜索');
    wrap.appendChild(clear);

    const readHash = () => new URLSearchParams(location.hash.replace(/^#/, '')).get('q') || '';
    const syncQuery = () => {
      const value = search.value.trim();
      store.set('query', value);
      clear.hidden = !value;
      if (isGallery && location.hash) {
        const params = new URLSearchParams(location.hash.replace(/^#/, ''));
        if (value) params.set('q', value); else params.delete('q');
        history.replaceState(null, '', '#' + params.toString());
      }
    };
    search.addEventListener('input', syncQuery);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) {
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        e.preventDefault();
      }
    });
    clear.addEventListener('click', () => {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.focus();
    });

    const url = new URL(location.href);
    const urlQuery = isGallery ? readHash() : (url.searchParams.get('q') || '');
    const savedQuery = store.get('query', '');
    const initialQuery = urlQuery || savedQuery;
    if (!search.value && initialQuery) {
      search.value = initialQuery;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      syncQuery();
    }
    search.setAttribute('title', '输入名称、编号或分类；按 / 或 Ctrl+Shift+F 聚焦');

    const copyText = async (value) => {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) throw new Error('clipboard unavailable');
    };
    const shareUrl = () => {
      const u = new URL(location.href);
      const value = search.value.trim();
      if (isGallery) {
        const params = new URLSearchParams(u.hash.replace(/^#/, ''));
        if (value) params.set('q', value); else params.delete('q');
        u.hash = params.toString();
      } else if (value) u.searchParams.set('q', value);
      else u.searchParams.delete('q');
      return u.href;
    };
    const announce = (text, kind) => {
      if (K.toast) K.toast(text, kind || 'ok');
    };

    const actionHost = isGallery
      ? document.querySelector('.tb-right')
      : document.querySelector('#gridView .grid-head');
    if (actionHost && !actionHost.querySelector('.kit-actions')) {
      const actions = document.createElement('div');
      actions.className = 'kit-actions';
      const home = document.createElement('a');
      home.className = 'kit-action';
      home.href = '/';
      home.textContent = '⌂ 首页';
      home.title = '返回统一资源首页';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'kit-action';
      copy.textContent = '复制链接';
      copy.title = '复制当前资源库/搜索条件的直达链接';
      copy.addEventListener('click', async () => {
        try {
          await copyText(shareUrl());
          announce('已复制直达链接', 'ok');
        } catch { announce('复制失败，请手动复制地址栏', 'err'); }
      });
      const exportSettings = document.createElement('button');
      exportSettings.type = 'button';
      exportSettings.className = 'kit-action';
      exportSettings.textContent = '导出设置';
      exportSettings.title = '导出收藏、别名、主题和布局设置，可在另一台电脑导入';
      exportSettings.addEventListener('click', () => {
        try { K.settings.download(); announce('设置已导出', 'ok'); }
        catch { announce('设置导出失败', 'err'); }
      });
      const importSettings = document.createElement('button');
      importSettings.type = 'button';
      importSettings.className = 'kit-action';
      importSettings.textContent = '导入设置';
      importSettings.title = '从 JSON 文件导入收藏、别名、主题和布局设置';
      const importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = 'application/json,.json';
      importInput.hidden = true;
      importInput.addEventListener('change', async () => {
        const file = importInput.files && importInput.files[0];
        importInput.value = '';
        if (!file) return;
        try {
          const count = await K.settings.importFile(file);
          if (!count) { announce('没有找到可导入的查看器设置', 'err'); return; }
          announce('已导入 ' + count + ' 项设置，正在刷新…', 'ok');
          setTimeout(() => location.reload(), 260);
        } catch (e) { announce('设置导入失败: ' + (e.message || '文件格式错误'), 'err'); }
      });
      importSettings.addEventListener('click', () => importInput.click());
      exportSettings.classList.add('kit-secondary-action');
      importSettings.classList.add('kit-secondary-action');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'kit-action kit-more-action';
      more.textContent = '更多';
      more.title = '导入/导出设置等低频操作';
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        const rect = more.getBoundingClientRect();
        K.showMenu([
          { label: '导出设置', fn: () => exportSettings.click() },
          { label: '导入设置', fn: () => importSettings.click() },
        ], rect.left, rect.bottom + 6);
      });
      actions.append(home, copy, more, exportSettings, importSettings, importInput);
      if (!isGallery) {
        const grid = document.getElementById('thumbGrid');
        if (grid) {
          const density = document.createElement('select');
          density.className = 'kit-density-select';
          density.title = '缩略图密度';
          density.setAttribute('aria-label', '缩略图密度');
          density.innerHTML = '<option value="compact">紧凑</option><option value="standard">标准</option><option value="large">大图</option>';
          const applyDensity = (value) => {
            const v = ['compact', 'standard', 'large'].includes(value) ? value : 'standard';
            grid.dataset.density = v;
            density.value = v;
          };
          applyDensity(store.get('density', 'standard'));
          density.addEventListener('change', () => {
            applyDensity(density.value);
            store.set('density', density.value);
          });
          actions.appendChild(density);
        }
      }
      if (isGallery) actionHost.insertBefore(actions, actionHost.firstChild);
      else {
        const before = document.getElementById('btnTheme') || document.getElementById('gridClose');
        actionHost.insertBefore(actions, before || null);
      }
    }

    // 雀魂原页面没有类型 chips，用索引中的 group 做一个轻量下拉筛选。
    if (!isGallery && route === 'majsoul' && !document.getElementById('filterChips')) {
      const facet = document.createElement('select');
      facet.className = 'kit-facet-select';
      facet.title = '按分组筛选';
      facet.innerHTML = '<option value="">全部分组</option>';
      facet.addEventListener('change', () => {
        search.value = facet.value;
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
      wrap.parentElement.insertBefore(facet, wrap);
      fetch('../characters.json').then(r => r.ok ? r.json() : null).then(data => {
        const groups = [...new Set((data && data.characters || []).map(x => String(x.group || '').trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const group of groups) {
          const option = document.createElement('option');
          option.value = group;
          option.textContent = group;
          facet.appendChild(option);
        }
        if (groups.includes(search.value.trim())) facet.value = search.value.trim();
      }).catch(() => { facet.disabled = true; });
    }

    // 第一次打开资源库时使用更适合浏览大量素材的类别排序；
    // 只在用户没有保存过排序偏好时应用，不覆盖已有选择。
    if (!isGallery) {
      const applyGridSortLabels = () => {
        const select = document.querySelector('#filterChips .sort-sel, .sort-sel');
        if (!select) return;
        if (!select.dataset.kitLabels) {
          for (const option of select.options) {
            if (option.value === 'default') option.textContent = '默认顺序';
            else if (option.value === 'name') option.textContent = '名称 A–Z';
            else if (option.value === 'type') option.textContent = '类别 → 名称';
          }
          select.dataset.kitLabels = '1';
        }
        if (select.dataset.kitDefaultApplied) return;
        select.dataset.kitDefaultApplied = '1';
        const sourceStore = K.Store(route);
        if (sourceStore.get('sortMode', null) !== null || select.value !== 'default') return;
        const typeOption = [...select.options].find(option => option.value === 'type');
        if (!typeOption) return;
        select.value = 'type';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setTimeout(applyGridSortLabels, 0);
      setTimeout(applyGridSortLabels, 260);
    }

    const isEditing = (target) => target && (
      target.tagName === 'INPUT' || target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' || target.isContentEditable
    );
    const focusSearch = () => {
      const opener = document.getElementById('railGrid');
      const gridView = document.getElementById('gridView');
      if (opener && gridView && !gridView.classList.contains('open')) opener.click();
      setTimeout(() => { search.focus(); search.select(); }, 40);
    };
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        focusSearch();
      } else if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !isEditing(e.target)) {
        e.preventDefault();
        focusSearch();
      }
    });
    try { K.initAssetNamingUI(); } catch {}
  };

  const initLibraryUsability = () => {
    try { K.initLibraryUsability(); } catch {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(initLibraryUsability, 0), { once: true });
  else setTimeout(initLibraryUsability, 0);

  window.SpineKit = K;
  // AI 复刻工作台按需加载：只在 Spine 查看器页面注入，图库页面不增加额外 UI。
  if (document.getElementById('toolStrip') && document.getElementById('gridView')) {
    setTimeout(() => K.loadScript('../../common/rekin.js').catch(() => {}), 0);
  }
})();
