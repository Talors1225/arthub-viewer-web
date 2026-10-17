/* Shared playback controls and animation list for ArtHub interactive viewers. */
(() => {
  'use strict';
  window.createInteractionViewerUI = function createInteractionViewerUI(driver) {
    const K = window.SpineKit, byId = id => document.getElementById(id);
    const controls = Object.fromEntries(['pbPlay', 'pbStepB', 'pbRange', 'pbStepF', 'pbTime', 'pbLoop', 'pbSpeed', 'pbSpeedVal', 'animFilter', 'animList', 'playbarToggle', 'playbar', 'railThumb'].map(id => [id, byId(id)]));
    let animations = [], renderedName = null, thumbnailKey = null, lastUpdate = -Infinity, scrubbing = false;
    const rows = new Map();
    const invoke = action => { try { Promise.resolve(action()).catch(driver.onError || console.error); } catch (error) { (driver.onError || console.error)(error); } };
    const icon = (button, name) => { if (button.dataset.icon !== name) { button.innerHTML = K.uiIcon(name, 15); button.dataset.icon = name; } };
    function showTab(name) {
      byId('floatPanel').dataset.tab = name;
      document.querySelectorAll('[data-panel-tab]').forEach(button => {
        const active = button.dataset.panelTab === name;
        button.classList.toggle('on', active); button.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-panel-page]').forEach(page => page.classList.toggle('on', page.dataset.panelPage === name));
    }
    document.querySelectorAll('[data-panel-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.panelTab)));
    function renderAnimations() {
      const filter = controls.animFilter.value.trim().toLocaleLowerCase();
      const fragment = document.createDocumentFragment(); rows.clear();
      for (const animation of animations.filter(item => item.name.toLocaleLowerCase().includes(filter))) {
        const button = document.createElement('button'), name = document.createElement('span'), duration = document.createElement('span');
        button.type = 'button'; button.className = 'anim-row'; button.dataset.animation = animation.name;
        name.className = 'an'; name.textContent = animation.name;
        duration.className = 'ad'; duration.textContent = animation.duration > 0 ? animation.duration.toFixed(2) + 's' : '—';
        button.title = animation.name; button.append(name, duration);
        button.addEventListener('click', () => invoke(() => driver.selectAnimation(animation.name)));
        rows.set(animation.name, button); fragment.append(button);
      }
      if (!fragment.childNodes.length) {
        const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = animations.length ? '没有匹配的动画' : '选择立绘后显示动画'; fragment.append(empty);
      }
      controls.animList.replaceChildren(fragment); renderedName = null; update(true);
    }
    function refreshAnimations() { animations = (driver.animations() || []).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); renderAnimations(); }
    function setCollapsed(collapsed) {
      controls.playbar.classList.toggle('collapsed', collapsed);
      controls.playbarToggle.setAttribute('aria-expanded', String(!collapsed));
      controls.playbarToggle.title = collapsed ? '展开播放控制' : '收起播放控制';
      controls.playbarToggle.setAttribute('aria-label', controls.playbarToggle.title);
      icon(controls.playbarToggle, collapsed ? 'controls' : 'chevronDown');
    }
    function captureThumbnail(state) {
      if (!state.ready || !state.key || state.key === thumbnailKey) return;
      const source = driver.canvas(); if (!source?.width || !source?.height) return;
      try {
        const thumbnail = document.createElement('canvas'); thumbnail.width = thumbnail.height = 96;
        const context = thumbnail.getContext('2d'), scale = Math.min(96 / source.width, 96 / source.height);
        context.drawImage(source, (96 - source.width * scale) / 2, (96 - source.height * scale) / 2, source.width * scale, source.height * scale);
        const image = document.createElement('img'); image.alt = ''; image.src = thumbnail.toDataURL('image/png');
        controls.railThumb.replaceChildren(image); thumbnailKey = state.key;
      } catch (_) { /* A resource without canvas capture still retains its fit button. */ }
    }
    function update(force = false) {
      const now = performance.now(); if (!force && now - lastUpdate < 80) return; lastUpdate = now;
      const state = driver.playback(), duration = Math.max(0, Number(state.duration) || 0), time = Math.max(0, Number(state.time) || 0);
      icon(controls.pbPlay, state.playing ? 'pause' : 'play'); controls.pbPlay.classList.toggle('active', !!state.playing);
      controls.pbPlay.setAttribute('aria-label', state.playing ? '暂停' : '播放'); controls.pbPlay.title = state.playing ? '暂停' : '播放';
      icon(controls.pbLoop, 'loop'); controls.pbLoop.classList.toggle('active', !!state.loop); controls.pbLoop.setAttribute('aria-pressed', String(!!state.loop));
      for (const id of ['pbPlay', 'pbStepB', 'pbRange', 'pbStepF', 'pbLoop', 'pbSpeed']) controls[id].disabled = !state.ready;
      controls.pbRange.disabled = !state.ready || !duration || state.canSeek === false;
      controls.pbStepB.disabled = controls.pbStepF.disabled = controls.pbRange.disabled;
      if (!scrubbing) controls.pbRange.value = duration ? String(Math.min(1000, time / duration * 1000)) : '0';
      controls.pbTime.textContent = `${time.toFixed(2)} / ${duration.toFixed(2)}s`;
      controls.pbSpeed.value = String(state.speed || 1); controls.pbSpeedVal.textContent = Number(state.speed || 1).toFixed(2).replace(/\.?0+$/, '') + 'x';
      if (renderedName !== state.name) { rows.forEach((button, name) => { button.classList.toggle('on', name === state.name); button.setAttribute('aria-pressed', String(name === state.name)); }); renderedName = state.name; }
      const row = rows.get(state.name); if (row && duration) row.querySelector('.ad').textContent = duration.toFixed(2) + 's';
      captureThumbnail(state);
    }
    controls.pbPlay.addEventListener('click', () => invoke(() => { driver.setPlaying(!driver.playback().playing); update(true); }));
    controls.pbLoop.addEventListener('click', () => invoke(() => { driver.setLoop(!driver.playback().loop); update(true); }));
    controls.pbSpeed.addEventListener('input', () => invoke(() => { driver.setSpeed(Number(controls.pbSpeed.value)); update(true); }));
    controls.pbRange.addEventListener('pointerdown', () => { scrubbing = true; });
    controls.pbRange.addEventListener('input', () => invoke(() => { const state = driver.playback(); driver.setPlaying(false); driver.seek(Number(controls.pbRange.value) / 1000 * state.duration); update(true); }));
    controls.pbRange.addEventListener('change', () => { scrubbing = false; update(true); });
    controls.pbRange.addEventListener('pointercancel', () => { scrubbing = false; });
    for (const [id, direction] of [['pbStepB', -1], ['pbStepF', 1]]) controls[id].addEventListener('click', () => invoke(() => { const state = driver.playback(); driver.setPlaying(false); driver.seek(Math.max(0, Math.min(state.duration, state.time + direction / 30))); update(true); }));
    controls.animFilter.addEventListener('input', renderAnimations);
    controls.playbarToggle.addEventListener('click', () => setCollapsed(!controls.playbar.classList.contains('collapsed')));
    setCollapsed(controls.playbar.classList.contains('collapsed')); update(true);
    const ui = { update, refreshAnimations, showTab, driver };
    if (driver.tools) ui.tools = window.createInteractionViewerTools(driver, ui);
    return ui;
  };
})();
