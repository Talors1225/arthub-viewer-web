/* Animation, parts and pose controls. The viewer remains the state owner. */
(function (global) {
  'use strict';
  const K = global.SpineKit;
  if (!K) return;

  const animationNames = [
    [/^battle[_ -]?idle(?:[_ -]|\d|$)/i, '战斗待机'],
    [/^(?:special[_ -]?attack|skill)(?:[_ -]|\d|$)/i, '技能'],
    [/^idle(?:[_ -]|\d|$)/i, '待机'],
    [/^attack(?:[_ -]|\d|$)/i, '攻击'],
    [/^(?:pain|damage|hit)(?:[_ -]|\d|$)/i, '受击'],
    [/^(?:death|die)(?:[_ -]|\d|$)/i, '倒下'],
    [/^walk(?:[_ -]|\d|$)/i, '行走'],
    [/^run(?:[_ -]|\d|$)/i, '奔跑'],
    [/^angry(?:[_ -]|\d|$)/i, '生气'],
    [/^(?:delight|happy)(?:[_ -]|\d|$)/i, '开心'],
    [/^sad(?:[_ -]|\d|$)/i, '难过'],
    [/^surprise(?:[_ -]|\d|$)/i, '惊讶'],
    [/^think(?:[_ -]|\d|$)/i, '思考'],
    [/^special(?:[_ -]|\d|$)/i, '特殊动作'],
    [/^expression(?:[_ -]|\d|$)/i, '表情'],
    [/^action(?:[_ -]|\d|$)/i, '动作'],
    [/^talk(?:[_ -]|\d|$)/i, '说话'],
  ];
  K.viewerAnimationLabel = function (name) {
    const text = String(name || '');
    const found = animationNames.find(entry => entry[0].test(text));
    return found ? found[1] : '';
  };

  function clonePose(pose) {
    if (!pose || typeof pose !== 'object' || Array.isArray(pose)) return null;
    const names = Object.keys(pose).sort();
    if (!names.length || names.length > 20000) return null;
    const result = Object.create(null);
    for (const name of names) {
      const source = pose[name];
      if (!source || typeof source !== 'object') return null;
      const bone = Object.create(null);
      for (const field of ['rotation', 'x', 'y', 'scaleX', 'scaleY']) {
        if (typeof source[field] !== 'number' || !Number.isFinite(source[field])) return null;
        bone[field] = source[field];
      }
      result[name] = bone;
    }
    return result;
  }

  K.initViewerPanelUI = function (adapter) {
    adapter = adapter || {};
    const doc = global.document;
    const panel = adapter.panel || doc.getElementById('floatPanel');
    if (!panel) return null;
    if (panel.__viewerPanelUI) return panel.__viewerPanelUI;
    const find = selector => panel.querySelector(selector);
    const make = (tag, className, text) => {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const cleanups = [];
    const listen = (el, type, fn, options) => {
      if (!el) return;
      el.addEventListener(type, fn, options);
      cleanups.push(() => el.removeEventListener(type, fn, options));
    };
    const state = () => adapter.getState ? adapter.getState() || {} : {};
    const notify = (text, type) => { if (K.toast) K.toast(text, type || 'info'); };
    const call = (name, value) => {
      if (typeof adapter[name] !== 'function') return;
      return adapter[name](value);
    };
    const button = (label, action, title) => {
      const el = make('button', 'vp-button', label);
      el.type = 'button';
      el.title = title || label;
      listen(el, 'click', action);
      return el;
    };
    const animationsEl = find('#animList');
    const animationFilter = find('#animFilter');
    const partsEl = find('#slotList');
    const partsPage = find('[data-page="parts"]');
    const posePage = find('[data-page="pose"]');
    const poseTab = find('[data-tab="pose"]');
    const partsTab = find('[data-tab="parts"]');
    const poseLock = find('#poseLock');
    let resourceKey = null;
    let selectedPart = null;
    let undoStack = [];
    let redoStack = [];
    let disposed = false;
    let animationSignature = '';

    panel.classList.add('viewer-panel-ui');
    if (animationFilter) {
      animationFilter.placeholder = '搜索动画 / 中文名称';
      animationFilter.setAttribute('aria-label', '搜索动画名称，支持中文或原名');
      listen(animationFilter, 'input', event => {
        event.stopImmediatePropagation();
        refreshAnimations(true);
      }, true);
    }

    const partControls = find('#partEditControls') || make('div', 'row');
    if (!partControls.parentNode && partsPage) partsPage.prepend(partControls);
    partControls.classList.add('vp-mode-row');
    // Hide the earlier explanation/exit control without touching viewer handlers.
    Array.from(partControls.children).forEach(el => { el.hidden = true; });
    const partToggle = button('部件编辑', () => {
      const s = state();
      if (!s.ready || s.supportsParts === false) return;
      call('setPartEditing', !s.partEditing);
      refresh();
    }, '开启后可在模型上点选部件；列表中的眼睛按钮切换显示');
    partToggle.classList.add('vp-toggle');
    const partState = make('span', 'vp-mode-state');
    partControls.append(partToggle, partState);
    const partSelection = make('div', 'vp-part-selection');
    partSelection.hidden = true;
    if (partsPage) partsPage.insertBefore(partSelection, partsEl);

    function selectPart(name) {
      selectedPart = selectedPart === name ? null : name;
      call('highlightPart', selectedPart);
      decorateParts();
    }
    function decorateParts() {
      if (!partsEl) return;
      let foundSelected = false;
      for (const row of partsEl.querySelectorAll('.slot-row')) {
        const nameEl = row.querySelector('.sn');
        const eye = row.querySelector('.eye');
        const name = nameEl && (nameEl.title || nameEl.textContent);
        if (!name) continue;
        row.dataset.partName = name;
        row.classList.toggle('vp-part-selected', name === selectedPart);
        if (name === selectedPart) foundSelected = true;
        nameEl.setAttribute('role', 'button');
        nameEl.setAttribute('tabindex', '0');
        nameEl.setAttribute('aria-label', '高亮部件 ' + name);
        nameEl.setAttribute('aria-pressed', String(name === selectedPart));
        if (eye) {
          eye.type = 'button';
          eye.setAttribute('aria-label', (row.classList.contains('off') ? '显示' : '隐藏') + '部件 ' + name);
          eye.setAttribute('aria-pressed', String(!row.classList.contains('off')));
        }
      }
      partSelection.textContent = selectedPart ? '选中：' + selectedPart : '';
      partSelection.title = selectedPart || '';
      partSelection.hidden = !selectedPart;
      // A filtered-out selection may remain highlighted on the model.
      partSelection.classList.toggle('vp-selection-filtered', !!selectedPart && !foundSelected);
    }
    listen(partsEl, 'click', event => {
      if (event.target.closest('.eye')) return;
      const row = event.target.closest('.slot-row');
      if (row && row.dataset.partName) selectPart(row.dataset.partName);
    });
    listen(partsEl, 'keydown', event => {
      if (event.target.closest('.eye') || (event.key !== 'Enter' && event.key !== ' ')) return;
      const row = event.target.closest('.slot-row');
      if (!row || !row.dataset.partName) return;
      event.preventDefault();
      selectPart(row.dataset.partName);
    });
    const partsObserver = partsEl && typeof global.MutationObserver === 'function' ? new global.MutationObserver(decorateParts) : null;
    if (partsObserver) partsObserver.observe(partsEl, { childList: true });

    let boneToggle, boneState, selectedBone, undoButton, redoButton, resetButton;
    if (posePage) {
      const legacyTip = posePage.querySelector('.lbl');
      if (legacyTip) legacyTip.hidden = true;
      const poseTools = make('div', 'vp-pose-controls');
      const modeRow = make('div', 'vp-mode-row');
      boneToggle = button('骨骼编辑', () => {
        const s = state();
        if (!s.ready || s.supportsPose === false) return;
        call('setBoneEditing', !s.boneEditing);
        refresh();
      }, '选中骨骼后，拖动本体移动，拖动末端旋转');
      boneToggle.classList.add('vp-toggle');
      boneState = make('span', 'vp-mode-state');
      modeRow.append(boneToggle, boneState);
      selectedBone = make('div', 'vp-selected-bone', '未选中骨骼');
      selectedBone.setAttribute('aria-live', 'polite');
      const historyRow = make('div', 'vp-history-tools');
      undoButton = button('↶ 撤销', undo, '撤销上一次姿势调整（Ctrl+Z）');
      redoButton = button('↷ 重做', redo, '重做上一次姿势调整（Ctrl+Shift+Z）');
      resetButton = button('重置姿势', reset, '恢复当前动画的姿势，可撤销；不会清除保存的快照');
      historyRow.append(undoButton, redoButton, resetButton);
      poseTools.append(modeRow, selectedBone, historyRow);
      posePage.prepend(poseTools);
      const save = find('#poseSave');
      const name = find('#poseName');
      if (save) { save.classList.add('vp-button'); save.textContent = '保存姿势'; }
      if (name) {
        name.placeholder = '姿势名称';
        name.setAttribute('aria-label', '保存的姿势名称');
      }
      for (const id of ['poseExport', 'poseImport', 'poseLock']) {
        const el = find('#' + id);
        if (el) { el.classList.add('vp-button'); el.type = 'button'; }
      }
      if (poseLock) {
        poseLock.title = '固定后保持当前姿势；解除后恢复动画对骨骼的控制';
        listen(poseLock, 'click', event => {
          if (typeof adapter.setPoseLocked === 'function') {
            event.stopImmediatePropagation();
            const s = state();
            if (s.ready && s.supportsPose !== false) call('setPoseLocked', !s.poseLocked);
            refresh();
          } else global.setTimeout(refresh, 0);
        }, true);
      }
    }

    function syncResource(s) {
      const key = s.resourceKey == null ? null : String(s.resourceKey);
      if (key === resourceKey) return;
      resourceKey = key;
      undoStack = [];
      redoStack = [];
      selectedPart = null;
      animationSignature = '';
      call('highlightPart', null);
    }
    function canPose(s) {
      return !!(s.ready && s.resourceKey != null && s.supportsPose !== false &&
        typeof adapter.capturePose === 'function' && typeof adapter.applyPose === 'function');
    }
    function recordEdit(before, after, expectedResourceKey) {
      const s = state();
      syncResource(s);
      if (!canPose(s)) return false;
      if (expectedResourceKey != null && String(expectedResourceKey) !== resourceKey) return false;
      const a = clonePose(before), b = clonePose(after);
      if (!a || !b || JSON.stringify(a) === JSON.stringify(b)) return false;
      undoStack.push({ before: a, after: b });
      if (undoStack.length > 30) undoStack.shift();
      redoStack = [];
      refresh();
      return true;
    }
    function applyHistory(direction) {
      const s = state();
      syncResource(s);
      const source = direction === 'undo' ? undoStack : redoStack;
      const destination = direction === 'undo' ? redoStack : undoStack;
      const field = direction === 'undo' ? 'before' : 'after';
      if (!canPose(s) || !source.length) return false;
      const edit = source[source.length - 1];
      try {
        if (!s.boneEditing) call('setBoneEditing', true);
        adapter.applyPose(clonePose(edit[field]));
        source.pop();
        destination.push(edit);
        refresh();
        return true;
      } catch (error) {
        notify('姿势调整失败：' + error.message, 'err');
        return false;
      }
    }
    function undo() { return applyHistory('undo'); }
    function redo() { return applyHistory('redo'); }
    function reset() {
      const s = state();
      syncResource(s);
      if (!canPose(s) || typeof adapter.resetPose !== 'function') return false;
      try {
        if (!s.boneEditing) call('setBoneEditing', true);
        const before = adapter.capturePose();
        adapter.resetPose();
        recordEdit(before, adapter.capturePose());
        refresh();
        return true;
      } catch (error) {
        notify('重置姿势失败：' + error.message, 'err');
        return false;
      }
    }
    listen(doc, 'keydown', event => {
      const s = state();
      if (!s.boneEditing || !panel.classList.contains('open') || panel.dataset.tab !== 'pose' ||
        event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey ||
        (event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      if (key === 'y' || event.shiftKey) redo(); else undo();
    });

    function refreshAnimations(force) {
      if (!animationsEl || disposed) return;
      const s = state();
      const query = animationFilter ? animationFilter.value.trim().toLocaleLowerCase() : '';
      const list = Array.isArray(s.animations) ? s.animations : [];
      const signature = JSON.stringify([s.ready, s.resourceKey, s.currentAnimation, query,
        list.map(a => [a.name, a.duration])]);
      if (!force && signature === animationSignature) return;
      animationSignature = signature;
      animationsEl.replaceChildren();
      if (!s.ready) {
        animationsEl.append(make('div', 'empty-tip', '加载完成后显示动画'));
        return;
      }
      let shown = 0;
      for (const animation of list) {
        const name = String(animation.name || '');
        const label = K.viewerAnimationLabel(name);
        if (query && !(name + ' ' + label).toLocaleLowerCase().includes(query)) continue;
        const row = make('button', 'anim-row vp-animation-row');
        row.type = 'button';
        row.classList.toggle('on', name === s.currentAnimation);
        row.setAttribute('aria-pressed', String(name === s.currentAnimation));
        row.title = label ? label + ' · ' + name : name;
        const text = make('span', 'an vp-animation-name');
        text.append(make('span', 'vp-animation-label', label || name));
        if (label) text.append(make('span', 'vp-animation-original', name));
        const duration = Number(animation.duration);
        row.append(text, make('span', 'ad', Number.isFinite(duration) ? duration.toFixed(2) + 's' : ''));
        row.addEventListener('click', () => {
          call('playAnimation', name);
          refreshAnimations(true);
          refreshModes();
        });
        animationsEl.append(row);
        shown++;
      }
      if (!shown) animationsEl.append(make('div', 'empty-tip', query ? '无匹配动画' : '此资源没有动画'));
    }
    function refreshModes() {
      if (disposed) return;
      const s = state();
      syncResource(s);
      const partsSupported = s.supportsParts !== false;
      const poseSupported = s.supportsPose !== false && typeof adapter.capturePose === 'function';
      if (partsTab) partsTab.hidden = !partsSupported;
      if (poseTab) poseTab.hidden = !poseSupported;
      partToggle.disabled = !s.ready || !partsSupported;
      partToggle.setAttribute('aria-pressed', String(!!s.partEditing));
      partToggle.classList.toggle('on', !!s.partEditing);
      partState.textContent = s.partEditing ? '已开启' : '已关闭';
      if (boneToggle) {
        boneToggle.disabled = !s.ready || !poseSupported;
        boneToggle.setAttribute('aria-pressed', String(!!s.boneEditing));
        boneToggle.classList.toggle('on', !!s.boneEditing);
        boneState.textContent = s.boneEditing ? '已开启' : '已关闭';
        const bone = typeof adapter.getSelectedBone === 'function' ? adapter.getSelectedBone() : null;
        const boneName = typeof bone === 'string' ? bone : bone && (bone.name || (bone.data && bone.data.name));
        selectedBone.textContent = boneName ? '选中骨骼：' + boneName : (s.boneEditing ? '未选中骨骼' : '开启编辑后可选中骨骼');
        selectedBone.title = boneName || '';
        undoButton.disabled = !canPose(s) || !undoStack.length;
        redoButton.disabled = !canPose(s) || !redoStack.length;
        resetButton.disabled = !canPose(s) || typeof adapter.resetPose !== 'function';
      }
      if (poseLock) {
        poseLock.textContent = s.poseLocked ? '✓ 已固定姿势' : '固定当前姿势';
        poseLock.setAttribute('aria-pressed', String(!!s.poseLocked));
        poseLock.disabled = !s.ready || !poseSupported;
        poseLock.classList.toggle('on', !!s.poseLocked);
      }
      for (const tab of panel.querySelectorAll('.rp-tabs button')) {
        tab.setAttribute('aria-pressed', String(tab.classList.contains('on')));
      }
      decorateParts();
    }
    function refresh() {
      refreshModes();
      refreshAnimations();
    }
    for (const tab of panel.querySelectorAll('.rp-tabs button')) {
      listen(tab, 'click', () => global.setTimeout(() => refreshAnimations(true), 0));
    }
    const panelObserver = typeof global.MutationObserver === 'function' ? new global.MutationObserver(() => {
      refreshModes();
      if (panel.classList.contains('open') && panel.dataset.tab === 'anim') refreshAnimations(true);
    }) : null;
    if (panelObserver) panelObserver.observe(panel, { attributes: true, attributeFilter: ['class', 'data-tab'] });

    const api = {
      refresh, refreshAnimations, recordEdit, undo, redo, reset,
      getHighlightedPart: () => selectedPart,
      historyState: () => ({ resourceKey, undo: undoStack.length, redo: redoStack.length }),
      clearHistory() { undoStack = []; redoStack = []; refreshModes(); },
      resourceChanged() {
        resourceKey = null;
        undoStack = []; redoStack = []; selectedPart = null; animationSignature = '';
        call('highlightPart', null);
        refresh();
      },
      dispose() {
        disposed = true;
        cleanups.forEach(cleanup => cleanup());
        if (partsObserver) partsObserver.disconnect();
        if (panelObserver) panelObserver.disconnect();
        call('highlightPart', null);
        delete panel.__viewerPanelUI;
      },
    };
    panel.__viewerPanelUI = api;
    refresh();
    return api;
  };
})(window);
