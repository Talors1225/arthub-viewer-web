/* Shared stage geometry and compact controls. Original skeletons remain untouched. */
(() => {
  'use strict';
  const K = window.SpineKit;
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
          K.setUiIcon(toggle, collapsed ? 'controls' : 'chevronDown');
          toggle.title = collapsed ? '展开播放控制' : '收起播放控制';
          toggle.setAttribute('aria-label', toggle.title);
        }
        const star = document.getElementById('railStar');
        if (star && !star.querySelector('svg.arthub-icon')) star.innerHTML = K.uiIcon('star', 18, star.textContent.trim() === '★');
        if (star?.title) star.setAttribute('aria-label', star.title);
        for (const [id, icon] of [['railGrid', 'grid'], ['btnPrev', 'chevL'], ['btnNext', 'chevR'], ['zOut', 'minus'], ['zIn', 'plus'], ['btnAnimTab', 'anim'], ['btnAnimPanel', 'anim']]) {
          const button = document.getElementById(id);
          K.setUiIcon(button, icon);
          if (button?.title) button.setAttribute('aria-label', button.title);
        }
        K.setUiIcon(document.querySelector('.kit-more-tool'), 'more');
        if (canvas && refit) refit();
      });
    };
    const observer = new MutationObserver(refresh);
    for (const node of [panel, playbar, document.body, document.getElementById('stage')]) {
      if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    if (panel && typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(panel);
    panel?.addEventListener('transitionend', refresh);
    K.refreshStageUI = refresh;
    refresh();
  };
})();
