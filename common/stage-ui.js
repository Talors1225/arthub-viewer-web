/* Shared stage geometry and compact controls. Original skeletons remain untouched. */
(() => {
  'use strict';
  const K = window.SpineKit;
  // Stage movement is separate from game gestures. A short tap still reaches the model.
  K.createStagePan = ({ stage, button, modeSelect, accepts, ready, move, tap }) => {
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
      button.setAttribute('aria-pressed', String(mode === 'pan'));
      button.title = mode === 'pan' ? '拖动画面：拖动移动，轻点互动；点击切换为模型互动' : '模型互动：拖动触发原有互动；点击切换为拖动画面';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('data-action-label', mode === 'pan' ? '拖动' : '互动');
      K.setUiIcon(button, 'move');
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
  // Keep existing controls and interaction modes. This pass only labels them.
  K.initStageUI = ({ canvas, refit } = {}) => {
    const root = document.documentElement;
    if (root.dataset.stageUiReady === '1') return;
    root.dataset.stageUiReady = '1';
    const panel = document.getElementById('floatPanel');
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
        if (toggle) {
          const collapsed = playbar?.classList.contains('collapsed');
          K.setUiIcon(toggle, collapsed ? 'play' : 'chevronDown');
          toggle.dataset.actionLabel = collapsed ? '播放控制' : '';
          toggle.title = collapsed ? '展开播放控制' : '收起播放控制';
          toggle.setAttribute('aria-label', toggle.title);
        }
        const star = document.getElementById('railStar');
        if (star && !star.querySelector('svg.arthub-icon')) star.innerHTML = K.uiIcon('star', 18, star.textContent.trim() === '★');
        if (star?.title) star.setAttribute('aria-label', star.title);
        if (star) star.dataset.actionLabel = star.classList.contains('on') || star.classList.contains('active') ? '已收藏' : '收藏';
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
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    if (panel && typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(panel);
    panel?.addEventListener('transitionend', refresh);
    K.refreshStageUI = refresh;
    refresh();
  };
})();
