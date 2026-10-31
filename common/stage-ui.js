/* Shared stage geometry and compact controls. Original skeletons remain untouched. */
(() => {
  'use strict';
  const K = window.SpineKit;
  K.stageColor = value => {
    const raw = String(value || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) return '#' + [...raw].map(c => c + c).join('').toLowerCase();
    return /^[0-9a-f]{6}$/i.test(raw) ? '#' + raw.toLowerCase() : null;
  };
  // The renderer and exporter continue to read the same per-viewer preference.
  K.createStageBackground = ({ stage, read, write, onChange } = {}) => {
    const presets = [['深空', '#0f1218'], ['纯黑', '#000000'], ['石墨', '#1f242e'], ['浅灰', '#b9bec7'], ['棋盘(透明)', 'checker']];
    let value = 'checker' === read?.() ? 'checker' : K.stageColor(read?.()) || '#000000';
    const paint = () => {
      stage.classList.toggle('checker', value === 'checker'); stage.dataset.stageBackground = value;
      stage.style.background = value === 'checker' ? 'repeating-conic-gradient(#272b33 0% 25%,#171b22 0% 50%) 0 0 / 20px 20px' : value;
      onChange?.(value);
    };
    const set = next => {
      const normalized = next === 'checker' ? next : K.stageColor(next);
      if (!normalized) return false;
      value = normalized; write?.(value); paint(); return true;
    };
    const mount = pop => {
      pop.innerHTML = '<div class="col stage-background-options"><div class="stage-background-presets" role="group" aria-label="背景预设"></div>'
        + '<label class="stage-background-label">自定义颜色</label><div class="stage-background-custom"><input type="color" aria-label="选择背景颜色">'
        + '<input type="text" class="text-input" aria-label="背景色号" placeholder="#RRGGBB" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off">'
        + '<button type="button" class="stage-background-apply">应用</button></div>'
        + '<p class="stage-background-message" role="status">支持 #RGB 或 #RRGGBB；导出时沿用此底色。</p><button type="button" class="stage-background-reset">恢复默认背景</button></div>';
      const picker = pop.querySelector('input[type=color]'), text = pop.querySelector('input[type=text]'), message = pop.querySelector('.stage-background-message');
      const row = pop.querySelector('.stage-background-presets'), buttons = [];
      const refresh = () => {
        picker.value = text.value = value === 'checker' ? '#000000' : value;
        text.removeAttribute('aria-invalid');
        for (const [button, color] of buttons) { button.classList.toggle('on', color === value); button.setAttribute('aria-pressed', String(color === value)); }
      };
      for (const [label, color] of presets) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.onclick = () => { set(color); refresh(); message.textContent = color === 'checker' ? 'PNG 可导出透明背景；视频保留棋盘底色。' : '背景已应用，导出时沿用此颜色。'; };
        buttons.push([button, color]); row.append(button);
      }
      picker.oninput = () => { set(picker.value); refresh(); message.textContent = '背景已应用，导出时沿用此颜色。'; };
      const apply = () => {
        if (!set(text.value)) { text.setAttribute('aria-invalid', 'true'); message.textContent = '请输入有效色号，例如 #3A6EA5。'; return; }
        refresh(); message.textContent = '背景已应用，导出时沿用此颜色。';
      };
      text.oninput = () => { text.removeAttribute('aria-invalid'); };
      text.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } };
      pop.querySelector('.stage-background-apply').onclick = apply;
      pop.querySelector('.stage-background-reset').onclick = () => { set('#000000'); refresh(); message.textContent = '已恢复默认背景。'; };
      refresh();
    };
    paint(); return { get: () => value, set, mount };
  };
  K.bindStageShortcuts = () => {
    const activate = id => { const node = document.getElementById(id); if (!node || node.disabled || node.hidden) return false; node.click(); return true; };
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
      if (event.target.closest?.('input,textarea,select,[contenteditable="true"],[role="tab"],.ctx-menu,.arthub-tool-popup,.theme-palette,[role="dialog"]')) return;
      if (document.querySelector('.export-progress') || document.body.dataset.viewerExporting === 'true') return;
      const key = event.key.toLowerCase(), panel = document.getElementById('floatPanel'), library = document.getElementById('gridView');
      let action;
      if (key === 'escape') {
        if (document.querySelector('.ctx-menu,.theme-palette,.stage-popup.arthub-tool-popup:not([style*="display: none"])')) return;
        if (panel?.classList.contains('open')) action = () => panel.querySelector('[data-panel-close],#panel-close')?.click();
        else if (library?.classList.contains('open')) action = () => activate('gridClose') || activate('railGrid');
        else if (document.body.classList.contains('immersive') || document.body.classList.contains('viewer-immersive')) action = () => activate('immersiveExit');
      } else if (key === 'g') action = () => activate(library?.classList.contains('open') && document.getElementById('gridClose') ? 'gridClose' : 'railGrid');
      else if (!library?.classList.contains('open')) {
        if (key === ' ' && !event.target.closest?.('button,a,[role="button"],[role="tab"]')) action = () => activate('pbPlay');
        else if (key === 'f') action = () => activate('btnFit') || activate('zFit') || activate('fit') || activate('railThumb');
        else if (key === 's') action = () => activate('railStar');
        else if (key === 'i') action = () => document.body.classList.contains('immersive') || document.body.classList.contains('viewer-immersive') ? activate('immersiveExit') : activate('btnPresetImmersive');
        else if (key === '+' || key === '=') action = () => activate('zIn');
        else if (key === '-') action = () => activate('zOut');
        else if (key === 'arrowleft') action = () => activate('btnPrev');
        else if (key === 'arrowright') action = () => activate('btnNext');
      }
      if (action) { event.preventDefault(); event.stopImmediatePropagation(); action(); }
    }, true);
  };
  // Stage movement is separate from game gestures. A short tap still reaches the model.
  K.createStagePan = ({ stage, button, modeSelect, accepts, ready, move, tap, interactiveButton = false, onModeChange }) => {
    let mode = 'pan', pointer = null;
    const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const cancel = () => {
      const down = pointer; pointer = null; delete stage.dataset.panDragging;
      if (down && stage.hasPointerCapture(down.id)) stage.releasePointerCapture(down.id);
    };
    const setMode = value => {
      cancel(); mode = value === 'interact' ? 'interact' : 'pan';
      stage.dataset.panMode = mode;
      if (modeSelect) modeSelect.value = mode;
      button.setAttribute('aria-pressed', String(interactiveButton ? mode === 'interact' : mode === 'pan'));
      button.title = interactiveButton ? (mode === 'pan' ? '开启立绘互动' : '关闭立绘互动，恢复拖动画面') : (mode === 'pan' ? '拖动画面：拖动移动，轻点互动；点击切换为模型互动' : '模型互动：拖动触发原有互动；点击切换为拖动画面');
      button.setAttribute('aria-label', button.title);
      button.setAttribute('data-action-label', interactiveButton ? (mode === 'pan' ? '互动' : '互动中') : (mode === 'pan' ? '拖动' : '互动'));
      K.setUiIcon(button, interactiveButton ? 'interact' : 'move');
      onModeChange?.(mode);
    };
    button.addEventListener('click', () => setMode(mode === 'pan' ? 'interact' : 'pan'));
    modeSelect?.addEventListener('change', () => setMode(modeSelect.value));
    stage.addEventListener('pointerdown', event => {
      if (!accepts(event.target) || mode !== 'pan' || event.button !== 0 || !ready() || ['part-editing', 'pose'].includes(stage.dataset.clickMode)) return;
      consume(event);
      if (pointer) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, at: performance.now(), moved: false };
      stage.setPointerCapture(event.pointerId);
    }, true);
    const update = event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6) return;
      pointer.moved = true; stage.dataset.panDragging = 'true';
      if (event.clientX !== pointer.x || event.clientY !== pointer.y) move(event.clientX - pointer.x, event.clientY - pointer.y);
      pointer.x = event.clientX; pointer.y = event.clientY;
    };
    stage.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      consume(event); if (ready()) update(event); else cancel();
    }, true);
    stage.addEventListener('pointerup', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      consume(event); if (ready()) update(event);
      const down = pointer; cancel();
      if (ready() && !down.moved && performance.now() - down.at < 500) tap(event);
    }, true);
    stage.addEventListener('pointercancel', event => {
      if (pointer?.id === event.pointerId) { consume(event); cancel(); }
    }, true);
    stage.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) cancel(); });
    window.addEventListener('blur', cancel);
    setMode('pan');
    return { cancel, setMode };
  };
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  };
  K.stageViewArea = canvas => {
    const rect = canvas.getBoundingClientRect();
    let left = rect.left + 12, right = rect.right - 12;
    let top = rect.top + 12, bottom = rect.bottom - 12;
    if (!document.body.classList.contains('immersive') && !document.documentElement.classList.contains('arthub-embedded')) {
      const phone = matchMedia('(max-width: 720px)').matches;
      for (const id of ['rail', 'toolStrip', 'playbar', 'status']) {
        const node = document.getElementById(id);
        if (!visible(node) || node.classList.contains('hide') || node.classList.contains('status-quiet')) continue;
        const r = node.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (phone) {
          if (id === 'toolStrip') right = Math.min(right, r.left - 10);
          else if (id !== 'status') bottom = Math.min(bottom, r.top - 10);
        } else if (id === 'playbar') bottom = Math.min(bottom, r.top - 12);
        else if (r.top < rect.top + rect.height * .3) top = Math.max(top, r.bottom + 10);
      }
      const panel = document.getElementById('floatPanel');
      if (panel?.classList.contains('open') && getComputedStyle(panel).display !== 'none') {
        const r = panel.getBoundingClientRect();
        if (phone) bottom = Math.min(bottom, r.top - 12);
        else right = Math.min(right, r.left - 16);
      }
    }
    const width = Math.max(80, right - left), height = Math.max(100, bottom - top);
    const sx = canvas.width / Math.max(1, rect.width), sy = canvas.height / Math.max(1, rect.height);
    return {
      left, top, width, height,
      pixelWidth: width * sx, pixelHeight: height * sy,
      offsetX: (left + width / 2 - rect.left - rect.width / 2) * sx,
      offsetY: (rect.top + rect.height / 2 - top - height / 2) * sy,
    };
  };
  // Keep each runtime as the state owner while sharing chrome and shortcuts.
  K.initStageUI = ({ canvas, refit } = {}) => {
    const root = document.documentElement;
    if (root.dataset.stageUiReady === '1') return;
    root.dataset.stageUiReady = '1';
    K.bindStageShortcuts();
    const panel = document.getElementById('floatPanel');
    panel?.setAttribute('aria-label', '编辑面板');
    const panelTrigger = document.getElementById('btnAnimTab') || document.getElementById('btnAnimPanel');
    panelTrigger?.addEventListener('click', event => {
      const close = panel?.querySelector('[data-panel-close],#panel-close');
      if (!panel?.classList.contains('open') || panelTrigger._kitSwitchTab || !close) return;
      event.preventDefault(); event.stopImmediatePropagation(); close.click();
    }, true);
    const playbar = document.getElementById('playbar');
    const toggle = document.getElementById('playbarToggle');
    const progress = document.getElementById('pbRange');
    const speed = document.getElementById('pbSpeed');
    playbar?.classList.toggle('playbar-speed-only', !progress);
    progress?.setAttribute('aria-label', '动画播放进度');
    speed?.setAttribute('aria-label', '播放倍速');
    speed?.setAttribute('title', '拖动调节播放倍速');
    let queued = false;
    const refresh = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const phone = matchMedia('(max-width: 720px)').matches;
        const bottomControls = [playbar, ...(phone ? [document.getElementById('rail')] : [])].filter(visible);
        if (bottomControls.length) {
          const bottom = Math.max(phone ? 72 : 12, ...bottomControls.map(node => document.documentElement.clientHeight - node.getBoundingClientRect().top + 12));
          root.style.setProperty('--stage-panel-bottom', bottom + 'px');
        } else root.style.removeProperty('--stage-panel-bottom');
        if (toggle) {
          const collapsed = playbar?.classList.contains('collapsed');
          K.setUiIcon(toggle, collapsed ? 'controls' : 'chevronDown');
          toggle.dataset.actionLabel = collapsed ? '播放控制' : '';
          toggle.title = collapsed ? '展开播放控制' : '收起播放控制';
          toggle.setAttribute('aria-label', toggle.title);
        }
        const star = document.getElementById('railStar');
        if (star && !star.querySelector('svg.arthub-icon')) star.innerHTML = K.uiIcon('star', 18, star.textContent.trim() === '★');
        if (star?.title) star.setAttribute('aria-label', star.title);
        if (star) star.dataset.actionLabel = star.classList.contains('on') || star.classList.contains('active') || star.getAttribute('aria-pressed') === 'true' ? '已收藏' : '收藏';
        const zoom = document.getElementById('zPct');
        if (zoom) { zoom.setAttribute('role', 'button'); zoom.setAttribute('tabindex', '0'); zoom.title = '适应窗口 (F)'; zoom.setAttribute('aria-label', '适应窗口，当前 ' + zoom.textContent.trim()); }
        for (const [id, icon, label] of [['pbStepB', 'chevL', '后退 1 帧'], ['pbStepF', 'chevR', '前进 1 帧']]) {
          const button = document.getElementById(id); K.setUiIcon(button, icon); if (button) { button.title = label; button.setAttribute('aria-label', label); }
        }
        const loop = document.getElementById('pbLoop');
        if (loop) loop.setAttribute('aria-pressed', String(loop.classList.contains('active') || loop.classList.contains('on')));
        const labels = { anim: '动画', parts: '部件', pose: '姿势', view: '视图', interaction: '互动', voice: '声音' };
        K.setUiIcon(panel?.querySelector('[data-panel-close],#panel-close'), 'close');
        for (const tab of panel?.querySelectorAll('[data-tab],[data-panel-tab]') || []) {
          const name = tab.dataset.panelTab || tab.dataset.tab;
          if (labels[name] && tab.textContent !== labels[name]) tab.textContent = labels[name];
          tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(tab.classList.contains('on'))); tab.tabIndex = tab.classList.contains('on') ? 0 : -1;
          tab.parentElement.setAttribute('role', 'tablist'); tab.parentElement.setAttribute('aria-label', '编辑面板分类');
          if (!tab.dataset.stageTabKeys) {
            tab.dataset.stageTabKeys = '1'; tab.addEventListener('keydown', event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation(); const items = [...tab.parentElement.querySelectorAll('[role="tab"]')].filter(item => !item.hidden);
              let index = items.indexOf(tab); index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
              items[index]?.click(); items[index]?.focus();
            });
          }
        }
        for (const [id, icon, label] of [['railGrid', 'grid', '资源库'], ['btnPrev', 'chevL', '上一个'], ['btnNext', 'chevR', '下一个'], ['zOut', 'minus'], ['zIn', 'plus'], ['btnAnimTab', 'edit', '编辑'], ['btnAnimPanel', 'edit', '编辑']]) {
          const button = document.getElementById(id);
          K.setUiIcon(button, icon);
          if (button && label) button.dataset.actionLabel = label;
          if (button?.title) button.setAttribute('aria-label', button.title);
        }
        const panelTrigger = document.getElementById('btnAnimTab') || document.getElementById('btnAnimPanel');
        if (panelTrigger) {
          const hasPose = !!panel?.querySelector('[data-tab="pose"], [data-panel-tab="pose"]');
          panelTrigger.title = '编辑面板：动画、部件' + (hasPose ? '与姿势' : '');
          panelTrigger.setAttribute('aria-label', panelTrigger.title);
          panelTrigger.setAttribute('aria-expanded', String(!!panel?.classList.contains('open')));
          panelTrigger.setAttribute('aria-controls', 'floatPanel');
        }
        K.setUiIcon(document.querySelector('.kit-more-tool'), 'more');
        if (canvas && refit) refit();
      });
    };
    const observer = new MutationObserver(refresh);
    for (const node of [panel, playbar, document.body, document.getElementById('stage')]) {
      if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.getElementById('railStar')) observer.observe(document.getElementById('railStar'), {attributes:true,attributeFilter:['class','title']});
    if (document.getElementById('pbLoop')) observer.observe(document.getElementById('pbLoop'), {attributes:true,attributeFilter:['class']});
    if (document.getElementById('zPct')) observer.observe(document.getElementById('zPct'), {childList:true,subtree:true,characterData:true});
    if (panel) observer.observe(panel, {subtree:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    if (panel && typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(panel);
    if (playbar && typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(playbar);
    panel?.addEventListener('transitionend', refresh);
    K.refreshStageUI = refresh;
    refresh();
  };
})();
