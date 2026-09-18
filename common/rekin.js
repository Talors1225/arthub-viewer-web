/* AI 复刻工作台：
 * 只负责读取当前 Spine 索引、生成可验证的任务包和验收 AI 输出。
 * 不把 API Key 放进浏览器，也不直接改写原始资源。
 */
(() => {
  'use strict';

  const K = window.SpineKit;
  const toolStrip = document.getElementById('toolStrip');
  const gridView = document.getElementById('gridView');
  if (!K || !toolStrip || !gridView || document.documentElement.dataset.gavRekinReady) return;
  document.documentElement.dataset.gavRekinReady = '1';

  const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
  const route = location.pathname.split('/').filter(Boolean)[0] || 'viewer';
  const state = {
    token: 0,
    entry: null,
    variant: null,
    atlas: null,
    reference: null,
    referenceUrl: null,
    validation: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function toast(message, kind) {
    if (K.toast) K.toast(message, kind || 'ok');
  }

  function injectStyles() {
    if (document.getElementById('gavRekinStyles')) return;
    const style = document.createElement('style');
    style.id = 'gavRekinStyles';
    style.textContent = [
      '.kit-rekin-button{color:var(--accent-hi,#f5d58a)!important;border-color:var(--accent-bd,#77633a)!important}',
      '.kit-rekin-button.on{background:var(--accent-dim-bg,rgba(220,170,70,.14))!important}',
      '.rekin-overlay{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,7,11,.72);backdrop-filter:blur(5px)}',
      '.rekin-dialog{width:min(820px,96vw);max-height:min(900px,92vh);display:flex;flex-direction:column;background:var(--panel,#151a23);border:1px solid var(--border2,rgba(255,255,255,.14));border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.58);overflow:hidden;color:var(--text,#e7ebf3)}',
      '.rekin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px 14px;border-bottom:1px solid var(--border,rgba(255,255,255,.08))}',
      '.rekin-title{font-size:17px;font-weight:700}.rekin-sub{margin-top:5px;color:var(--text-faint,#8a95a8);font-size:12px;line-height:1.6}',
      '.rekin-close{width:30px;height:30px;padding:0;border-radius:9px;font-size:18px;line-height:1}',
      '.rekin-body{overflow:auto;padding:16px 20px 20px}.rekin-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
      '.rekin-card{min-width:0;padding:13px;border:1px solid var(--border,rgba(255,255,255,.09));border-radius:12px;background:var(--panel2,rgba(255,255,255,.035))}',
      '.rekin-card.full{grid-column:1/-1}.rekin-label{font-size:11px;color:var(--text-faint,#8a95a8);margin-bottom:7px}',
      '.rekin-value{font-size:13px;line-height:1.6;word-break:break-word}.rekin-mono{font-family:Consolas,monospace;font-size:11px;word-break:break-all;color:var(--text-faint,#9ba6b8)}',
      '.rekin-field{width:100%;box-sizing:border-box;border:1px solid var(--border2,rgba(255,255,255,.14));border-radius:9px;padding:9px 10px;background:var(--input-bg,rgba(0,0,0,.18));color:inherit;font:inherit;font-size:13px;outline:none}',
      '.rekin-field:focus{border-color:var(--accent,#d5a94f)}.rekin-textarea{min-height:92px;resize:vertical;line-height:1.55}',
      '.rekin-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.rekin-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}',
      '.rekin-actions button,.rekin-row button{font:inherit;border:1px solid var(--border2,rgba(255,255,255,.14));border-radius:9px;padding:8px 11px;background:var(--panel2,rgba(255,255,255,.04));color:inherit;cursor:pointer}',
      '.rekin-actions button:hover,.rekin-row button:hover{border-color:var(--accent,#d5a94f);background:var(--accent-dim-bg,rgba(220,170,70,.12))}',
      '.rekin-actions .primary{border-color:var(--accent-bd,#9c7b35);background:var(--accent-dim-bg,rgba(220,170,70,.14));color:var(--accent-hi,#f5d58a)}',
      '.rekin-actions button:disabled{opacity:.42;cursor:not-allowed}.rekin-file{font-size:12px;max-width:100%}',
      '.rekin-preview{display:flex;align-items:center;gap:10px;margin-top:9px;min-height:58px}.rekin-preview img{width:72px;height:72px;object-fit:contain;border:1px solid var(--border2,rgba(255,255,255,.12));border-radius:8px;background:repeating-conic-gradient(#202631 0 25%,#151a23 0 50%) 50%/14px 14px}',
      '.rekin-note{margin-top:8px;color:var(--text-faint,#8a95a8);font-size:11px;line-height:1.65}.rekin-status{margin-top:9px;padding:9px 10px;border-radius:9px;font-size:12px;line-height:1.6;background:rgba(255,255,255,.04);color:var(--text-faint,#8a95a8)}',
      '.rekin-status.ok{color:#9ee2bb;background:rgba(54,170,108,.12)}.rekin-status.warn{color:#f0c27d;background:rgba(210,145,38,.12)}.rekin-status.err{color:#ff9b9b;background:rgba(192,65,65,.13)}',
      '.rekin-chip{display:inline-block;padding:3px 7px;margin:2px 4px 2px 0;border-radius:999px;background:rgba(255,255,255,.07);color:var(--text-faint,#9ba6b8);font-size:11px}',
      '@media(max-width:680px){.rekin-overlay{padding:8px}.rekin-grid{grid-template-columns:1fr}.rekin-card.full{grid-column:auto}.rekin-body{padding:12px}}',
    ].join('');
    document.head.appendChild(style);
  }

  function addButton() {
    if (document.getElementById('btnRekin')) return document.getElementById('btnRekin');
    const button = document.createElement('button');
    button.id = 'btnRekin';
    button.type = 'button';
    button.className = 'kit-rekin-button';
    button.textContent = 'AI 复刻';
    button.title = '用当前骨骼和动画制作新的 AI 贴图任务包';
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', open);
    toolStrip.appendChild(button);
    return button;
  }

  function sourceIndexFile() {
    return route === 'majsoul' ? 'characters.json' : route + '_chars.json';
  }

  function indexUrl() {
    return new URL('../' + sourceIndexFile(), location.href).href;
  }

  function currentId() {
    const fromUrl = new URL(location.href).searchParams.get('id');
    if (fromUrl) return fromUrl;
    const idEl = document.getElementById('mId');
    return idEl && idEl.textContent.trim() ? idEl.textContent.trim() : '';
  }

  function variantsOf(entry) {
    const out = [];
    for (const value of [entry && entry.cutscenes, entry && entry.variants, entry && entry.spine]) {
      if (Array.isArray(value)) out.push(...value);
      else if (value && typeof value === 'object') out.push(value);
    }
    if (entry && (entry.skel || entry.skeleton || entry.atlas)) out.push(entry);
    return out.filter(value => value && (value.skel || value.skeleton || value.atlas));
  }

  function selectedVariant(entry) {
    const variants = variantsOf(entry);
    if (!variants.length) return null;
    const selected = document.getElementById('variantSel');
    const selectedValue = selected && selected.value;
    return variants.find(value => String(value.variant || '') === String(selectedValue || '')) || variants[0];
  }

  function pair(value) {
    const nums = String(value || '').match(/-?\d+(?:\.\d+)?/g);
    return nums && nums.length >= 2 ? [Number(nums[0]), Number(nums[1])] : null;
  }

  function parseAtlas(text) {
    const pages = [];
    const regions = [];
    let page = null;
    let pageMeta = false;
    let region = null;
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) {
        page = null;
        pageMeta = false;
        region = null;
        continue;
      }
      const colon = line.indexOf(':');
      if (colon >= 0) {
        const key = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (region) {
          region.meta[key] = value;
          if (key === 'bounds' || key === 'xy' || key === 'size') region.size = pair(value);
        } else if (page) {
          pageMeta = true;
          if (key === 'size') page.size = pair(value);
          page.meta[key] = value;
        }
        continue;
      }
      if (!page || !pageMeta) {
        page = { name: line, size: null, meta: {} };
        pages.push(page);
        pageMeta = false;
        region = null;
      } else {
        region = { name: line, page: page.name, size: null, meta: {} };
        regions.push(region);
      }
    }
    const names = new Set();
    const duplicates = [];
    for (const item of regions) {
      if (names.has(item.name)) duplicates.push(item.name);
      names.add(item.name);
    }
    return { pages, regions, duplicates };
  }

  function templateBase() {
    return new URL('../', location.href);
  }

  function variantUrl(variant, key) {
    const value = variant && (variant[key] || (key === 'skel' ? variant.skeleton : ''));
    if (!value) return '';
    return new URL(String(variant.dir || '') + value, templateBase()).href;
  }

  function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = String(value == null ? '' : value);
  }

  function setStatus(message, kind) {
    const el = $('#rekinStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'rekin-status' + (kind ? ' ' + kind : '');
  }

  function renderTemplate() {
    const entry = state.entry;
    const variant = state.variant;
    if (!entry || !variant) {
      setText('#rekinTemplate', '没有找到当前资源的 Spine 索引条目');
      setText('#rekinVariant', '请从资源库打开一个可加载的资源，或在 URL 中提供 ?id=' + currentId());
      setText('#rekinAtlasMeta', '等待资源索引');
      return;
    }
    setText('#rekinTemplate', (entry.name || entry.id || '未命名') + ' · ' + (entry.id || ''));
    setText('#rekinVariant', '变体：' + (variant.variant || '默认') + ' · 格式：' + (variant.format || 'binary'));
    setText('#rekinAtlasMeta', state.atlas
      ? state.atlas.pages.length + ' 个图集页 · ' + state.atlas.regions.length + ' 个区域 · ' + (state.atlas.duplicates.length ? '有重复区域名' : '区域名唯一')
      : '正在读取 Atlas');
    const chips = $('#rekinPages');
    if (chips) {
      chips.innerHTML = '';
      for (const page of (state.atlas ? state.atlas.pages : []).slice(0, 16)) {
        const chip = document.createElement('span');
        chip.className = 'rekin-chip';
        chip.textContent = page.name + (page.size ? ' · ' + page.size.join('×') : '');
        chips.appendChild(chip);
      }
    }
    const variantSelect = $('#rekinVariantSelect');
    if (variantSelect) {
      variantSelect.innerHTML = '';
      for (const value of variantsOf(entry)) {
        const option = document.createElement('option');
        option.value = value.variant || '';
        option.textContent = (value.variant || '默认') + ' · ' + (value.skel || value.skeleton || '未命名骨骼');
        variantSelect.appendChild(option);
      }
      variantSelect.value = variant.variant || '';
    }
  }

  async function loadTemplate() {
    const token = ++state.token;
    state.entry = null;
    state.variant = null;
    state.atlas = null;
    renderTemplate();
    setStatus('正在读取当前资源的索引和 Atlas…');
    try {
      const response = await fetch(indexUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error(sourceIndexFile() + ' ' + response.status);
      const data = await response.json();
      const list = Array.isArray(data.characters) ? data.characters : [];
      const id = currentId();
      const entry = list.find(item => String(item.id) === String(id))
        || list.find(item => String(item.name || '') === String(id))
        || list[0];
      if (token !== state.token) return;
      if (!entry) throw new Error('索引中没有可用角色');
      const variant = selectedVariant(entry);
      if (!variant) throw new Error('该资源没有 Spine 骨骼/Atlas 配对');
      state.entry = entry;
      state.variant = variant;
      renderTemplate();
      const atlasResponse = await fetch(variantUrl(variant, 'atlas'), { cache: 'no-store' });
      if (!atlasResponse.ok) throw new Error('Atlas ' + atlasResponse.status);
      state.atlas = parseAtlas(await atlasResponse.text());
      if (token !== state.token) return;
      renderTemplate();
      setStatus('模板已准备好：骨骼、插槽和动画将保持不变。', 'ok');
      updateActions();
    } catch (error) {
      if (token !== state.token) return;
      setStatus('读取模板失败：' + (error.message || error), 'err');
      updateActions();
    }
  }

  function referenceSummary(file) {
    if (!file) return '还没有选择参考图';
    return file.name + ' · ' + Math.round(file.size / 1024) + ' KB · ' + (file.type || '未知格式');
  }

  function setReference(file) {
    state.reference = null;
    if (state.referenceUrl) URL.revokeObjectURL(state.referenceUrl);
    state.referenceUrl = null;
    const preview = $('#rekinPreview');
    if (!file) {
      if (preview) preview.innerHTML = '<span class="rekin-note">参考图只作为 AI 输入，不会覆盖原始资源。</span>';
      setText('#rekinReferenceMeta', '还没有选择参考图');
      updateActions();
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      setStatus('参考图必须是 PNG、JPG、WEBP 等图片文件。', 'err');
      setText('#rekinReferenceMeta', '格式不支持');
      updateActions();
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      setStatus('参考图超过 20 MB，请先压缩后再试。', 'err');
      setText('#rekinReferenceMeta', '文件过大');
      updateActions();
      return;
    }
    state.reference = file;
    state.referenceUrl = URL.createObjectURL(file);
    if (preview) {
      preview.innerHTML = '';
      const image = document.createElement('img');
      image.src = state.referenceUrl;
      image.alt = '参考图预览';
      preview.appendChild(image);
      const note = document.createElement('span');
      note.className = 'rekin-note';
      note.textContent = '已载入参考图。建议使用完整、正面、背景干净的角色图。';
      preview.appendChild(note);
    }
    setText('#rekinReferenceMeta', referenceSummary(file));
    setStatus('参考图已载入，可以生成任务包。', 'ok');
    updateActions();
  }

  function strategy() {
    const select = $('#rekinStrategy');
    return select ? select.value : 'atlas-pages';
  }

  function customPrompt() {
    const field = $('#rekinPrompt');
    return field ? field.value.trim() : '';
  }

  function promptText() {
    const entry = state.entry || {};
    const variant = state.variant || {};
    const atlas = state.atlas || { pages: [], regions: [] };
    const pageText = atlas.pages.map(page => page.name + (page.size ? ' (' + page.size.join('x') + ')' : '')).join(', ');
    const regionText = atlas.regions.slice(0, 80).map(item => item.name).join(', ');
    const modeText = strategy() === 'atlas-pages'
      ? '输出与原 Atlas 页面同名、同尺寸的透明 PNG，保留原 Atlas 的区域坐标。'
      : '按区域名输出透明 PNG，文件名必须对应 Atlas 区域名；不要改变骨骼、插槽、动画和绘制顺序。';
    return [
      '你是 Spine 贴图复刻助手。请以参考图为新角色形象，以现有 Spine 资源为动作模板。',
      '目标：只替换贴图，不改变原骨骼、插槽、皮肤结构、动画、事件、约束或绘制顺序。',
      '模板资源：' + (entry.name || entry.id || '未命名') + '，ID=' + (entry.id || '') + '，变体=' + (variant.variant || '默认') + '。',
      'Spine 版本：' + (entry.spineVersion || '按原文件保持') + '；Atlas 页面：' + (pageText || '待读取') + '。',
      modeText,
      '透明区域必须保持透明；不要加入背景、文字、水印、额外角色或新的动作。',
      '参考图文件：' + (state.reference ? state.reference.name : '未选择') + '。',
      customPrompt() ? '用户补充要求：' + customPrompt() : '用户未补充额外风格要求。',
      '部分 Atlas 区域名示例：' + (regionText || '未读取到区域名') + '。',
      '生成后必须先通过任务包中的文件名、尺寸和完整性校验，再组装成新的 Spine 资源。',
    ].join('\n');
  }

  function jobObject() {
    const entry = state.entry || {};
    const variant = state.variant || {};
    const atlas = state.atlas || { pages: [], regions: [] };
    return {
      schemaVersion: 'spine-rekin-job/v1',
      jobId: 'browser-' + route + '-' + String(entry.id || 'unknown') + '-' + Date.now(),
      createdAt: new Date().toISOString(),
      source: {
        route,
        indexFile: sourceIndexFile(),
        indexUrl: indexUrl(),
        id: entry.id || '',
        name: entry.name || entry.id || '',
      },
      template: {
        variant: variant.variant || 'default',
        format: variant.format || 'binary',
        spineVersion: entry.spineVersion || '',
        directory: variant.dir || '',
        skeleton: variant.skel || variant.skeleton || '',
        atlas: variant.atlas || '',
        skeletonUrl: variantUrl(variant, 'skel'),
        atlasUrl: variantUrl(variant, 'atlas'),
        pages: atlas.pages,
        regions: atlas.regions,
        regionCount: atlas.regions.length,
      },
      reference: state.reference ? {
        name: state.reference.name,
        type: state.reference.type,
        sizeBytes: state.reference.size,
        lastModified: state.reference.lastModified || 0,
      } : null,
      generation: {
        strategy: strategy(),
        preserve: ['skeleton', 'bones', 'slots', 'skins', 'animations', 'events', 'constraints'],
        customPrompt: customPrompt(),
        promptFile: 'spine-rekin-prompt.txt',
        outputRules: strategy() === 'atlas-pages'
          ? { type: 'atlas-pages', requiredFiles: atlas.pages.map(page => page.name), exactPageSize: true }
          : { type: 'region-images', requiredFiles: atlas.regions.map(region => region.name + '.png'), exactRegionNames: true },
      },
      safety: {
        originalAssetsReadOnly: true,
        browserDoesNotSendApiKey: true,
        requiresValidationBeforeAssembly: true,
      },
    };
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function copy(value) {
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
    if (!ok) throw new Error('剪贴板不可用');
  }

  function requireTemplate() {
    if (!state.entry || !state.variant || !state.atlas) {
      toast('请先等待模板读取完成', 'err');
      return false;
    }
    if (!state.reference) {
      toast('请先选择一张参考图', 'err');
      return false;
    }
    return true;
  }

  function updateActions() {
    const ready = !!(state.entry && state.variant && state.atlas && state.reference);
    document.querySelectorAll('#rekinDownloadJob,#rekinDownloadPrompt,#rekinCopyPrompt').forEach(button => {
      button.disabled = !ready;
    });
  }

  function imageSize(file) {
    return new Promise((resolve, reject) => {
      if (window.createImageBitmap) {
        createImageBitmap(file).then(bitmap => {
          const result = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
          resolve(result);
        }).catch(reject);
        return;
      }
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片无法读取'));
      };
      image.src = url;
    });
  }

  async function validateResult(files) {
    if (!state.atlas) return;
    const list = Array.from(files || []);
    const byName = new Map();
    const duplicates = [];
    for (const file of list) {
      const name = (file.webkitRelativePath || file.name).split(/[\\/]/).pop().toLowerCase();
      if (byName.has(name)) duplicates.push(name);
      else byName.set(name, file);
    }
    const required = strategy() === 'atlas-pages'
      ? state.atlas.pages.map(page => page.name)
      : state.atlas.regions.map(region => region.name + '.png');
    const missing = required.filter(name => !byName.has(String(name).toLowerCase()));
    const present = required.filter(name => byName.has(String(name).toLowerCase()));
    const warnings = [];
    const errors = duplicates.length ? ['输出目录存在重名文件：' + duplicates.slice(0, 5).join(', ')] : [];
    if (!required.length) errors.push('模板 Atlas 没有读到可验证的页面或区域');
    if (missing.length) errors.push('缺少 ' + missing.length + ' 个必需输出文件');
    if (strategy() === 'atlas-pages') {
      for (const page of state.atlas.pages) {
        const file = byName.get(String(page.name).toLowerCase());
        if (!file || !page.size) continue;
        try {
          const actual = await imageSize(file);
          if (actual.width !== page.size[0] || actual.height !== page.size[1]) {
            errors.push(page.name + ' 尺寸应为 ' + page.size.join('×') + '，实际为 ' + actual.width + '×' + actual.height);
          }
        } catch (error) {
          errors.push(page.name + ' 无法读取：' + (error.message || error));
        }
      }
    }
    const result = {
      schemaVersion: 'spine-rekin-validation/v1',
      validatedAt: new Date().toISOString(),
      strategy: strategy(),
      requiredCount: required.length,
      presentCount: present.length,
      missing,
      duplicates,
      warnings,
      errors,
      ok: !errors.length && !missing.length,
    };
    state.validation = result;
    const message = result.ok
      ? '输出文件完整，且 Atlas 页面尺寸通过校验。可以交给本地组装脚本继续处理。'
      : '校验未通过：' + errors.slice(0, 3).join('；');
    setStatus(message, result.ok ? 'ok' : 'err');
    const output = $('#rekinValidation');
    if (output) output.textContent = JSON.stringify(result, null, 2);
    const downloadButton = $('#rekinDownloadValidation');
    if (downloadButton) downloadButton.disabled = false;
  }

  function open() {
    injectStyles();
    const existing = document.getElementById('rekinOverlay');
    if (existing) {
      existing.remove();
      return;
    }
    const button = addButton();
    button.classList.add('on');
    const overlay = document.createElement('div');
    overlay.id = 'rekinOverlay';
    overlay.className = 'rekin-overlay';
    overlay.innerHTML = [
      '<div class="rekin-dialog" role="dialog" aria-modal="true" aria-label="AI 复刻工作台">',
      '<div class="rekin-head"><div><div class="rekin-title">AI 复刻工作台</div><div class="rekin-sub">保留现有骨骼、插槽和动画，只为新形象生成贴图任务。浏览器不会上传 API Key，也不会改写原始资源。</div></div><button class="rekin-close" id="rekinClose" type="button">×</button></div>',
      '<div class="rekin-body">',
      '<div class="rekin-grid">',
      '<div class="rekin-card"><div class="rekin-label">动作模板</div><div id="rekinTemplate" class="rekin-value">正在读取…</div><div id="rekinVariant" class="rekin-note"></div><div id="rekinAtlasMeta" class="rekin-note"></div><div id="rekinPages"></div></div>',
      '<div class="rekin-card"><div class="rekin-label">复刻策略</div><select id="rekinStrategy" class="rekin-field"><option value="atlas-pages">整页替换（推荐先验证）</option><option value="region-images">按区域输出 PNG（更灵活，需后处理）</option></select><div class="rekin-note">两种策略都会保留原骨骼和动画。整页替换要求 AI 输出与原 Atlas 页面同名、同尺寸的 PNG。</div><div class="rekin-row" style="margin-top:8px"><select id="rekinVariantSelect" class="rekin-field"></select><button id="rekinRefresh" type="button">重新读取模板</button></div></div>',
      '<div class="rekin-card full"><div class="rekin-label">新形象参考图</div><input id="rekinReference" class="rekin-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div id="rekinPreview" class="rekin-preview"><span class="rekin-note">还没有选择参考图</span></div><div id="rekinReferenceMeta" class="rekin-note">单张图片最大 20 MB</div></div>',
      '<div class="rekin-card full"><div class="rekin-label">给 AI 的补充要求（可选）</div><textarea id="rekinPrompt" class="rekin-field rekin-textarea" placeholder="例如：保留原角色的服装层次，改成白发、红瞳、黑色礼服；不要改变武器和动作比例。"></textarea><div class="rekin-actions"><button id="rekinCopyPrompt" type="button">复制提示词</button><button id="rekinDownloadPrompt" type="button">下载提示词 TXT</button><button id="rekinDownloadJob" class="primary" type="button">下载 AI 任务 JSON</button></div></div>',
      '<div class="rekin-card full"><div class="rekin-label">AI 输出验收（可选）</div><input id="rekinResult" class="rekin-file" type="file" accept="image/png,image/jpeg,image/webp" multiple webkitdirectory directory><div class="rekin-note">选择 AI 输出文件夹后，会检查必需文件名；整页替换还会检查 PNG 尺寸。通过后再用本地组装脚本生成新资源。</div><pre id="rekinValidation" class="rekin-status" style="max-height:150px;overflow:auto;white-space:pre-wrap">尚未验收</pre><div class="rekin-actions"><button id="rekinDownloadValidation" type="button" disabled>下载验收结果 JSON</button></div></div>',
      '<div id="rekinStatus" class="rekin-status">正在准备模板…</div>',
      '</div></div></div>',
    ].join('');
    document.body.appendChild(overlay);

    const close = () => {
      if (state.referenceUrl) {
        URL.revokeObjectURL(state.referenceUrl);
        state.referenceUrl = null;
      }
      state.reference = null;
      state.validation = null;
      overlay.remove();
      button.classList.remove('on');
    };
    $('#rekinClose').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    $('#rekinReference').addEventListener('change', event => setReference(event.target.files && event.target.files[0]));
    $('#rekinStrategy').addEventListener('change', () => {
      state.validation = null;
      setText('#rekinValidation', '策略已改变，请重新选择 AI 输出文件夹验收');
      $('#rekinDownloadValidation').disabled = true;
      updateActions();
    });
    $('#rekinVariantSelect').addEventListener('change', async event => {
      const variant = variantsOf(state.entry || {}).find(value => String(value.variant || '') === String(event.target.value));
      if (!variant) return;
      state.variant = variant;
      state.atlas = null;
      renderTemplate();
      await loadTemplate();
    });
    $('#rekinRefresh').addEventListener('click', loadTemplate);
    $('#rekinCopyPrompt').addEventListener('click', async () => {
      if (!requireTemplate()) return;
      try {
        await copy(promptText());
        toast('AI 提示词已复制', 'ok');
      } catch (error) {
        toast('复制失败：' + (error.message || error), 'err');
      }
    });
    $('#rekinDownloadPrompt').addEventListener('click', () => {
      if (!requireTemplate()) return;
      download('spine-rekin-prompt.txt', promptText());
    });
    $('#rekinDownloadJob').addEventListener('click', () => {
      if (!requireTemplate()) return;
      download('spine-rekin-job.json', JSON.stringify(jobObject(), null, 2), 'application/json;charset=utf-8');
      toast('AI 任务 JSON 已下载', 'ok');
    });
    $('#rekinResult').addEventListener('change', event => validateResult(event.target.files));
    $('#rekinDownloadValidation').addEventListener('click', () => {
      if (!state.validation) return;
      download('spine-rekin-validation.json', JSON.stringify(state.validation, null, 2), 'application/json;charset=utf-8');
    });
    window.addEventListener('keydown', function onKey(event) {
      if (!document.getElementById('rekinOverlay')) {
        window.removeEventListener('keydown', onKey);
        return;
      }
      if (event.key === 'Escape') close();
    });
    updateActions();
    loadTemplate();
  }

  addButton();
})();
