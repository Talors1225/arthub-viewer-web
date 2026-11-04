/* Shared presentation and capability-aware view controls; runtime handlers
   remain the owners of animation, editing, audio, and export state. */
(() => {
  'use strict';
  document.documentElement.dataset.siteUi = '1';
  function init() {
    const K = window.SpineKit;
    const panel = document.getElementById('floatPanel');
    if (K && !panel) K.initTheme(K.Store('site'));
    if (!K || !panel) return;
    const rail = document.getElementById('rail');
    // Keep the native fit shortcut handler, without a redundant portrait tile.
    const railThumb = document.getElementById('railThumb');
    if (railThumb) railThumb.hidden = true;
    if (rail && !document.getElementById('homeAction')) {
      const home = document.createElement('button'); home.id = 'homeAction'; home.type = 'button';
      home.title = '网站首页'; home.setAttribute('aria-label','网站首页'); home.dataset.actionLabel = '首页';
      K.setUiIcon(home,'home');
      home.addEventListener('click',() => { window.location.href = new URL('../../index.html',location.href).href; });
      rail.append(home);
    }
    const tabs = panel.querySelector('.rp-tabs');
    if (!tabs) return;
    const animFilter = document.getElementById('animFilter');
    if (animFilter) { animFilter.placeholder = '搜索动画'; animFilter.setAttribute('aria-label','搜索动画'); }
    const chips = document.getElementById('animChips');
    if (chips && !animFilter) {
      const search = document.createElement('input'); search.type = 'search'; search.className = 'site-animation-search';
      search.placeholder = '搜索动画'; search.setAttribute('aria-label','搜索动画');
      chips.parentElement.prepend(search);
      const filter = () => { const query = search.value.trim().toLowerCase(); for (const button of chips.querySelectorAll('button')) button.hidden = !((button.textContent+' '+button.title).toLowerCase().includes(query)); };
      search.addEventListener('input',filter);
      new MutationObserver(filter).observe(chips,{childList:true});
    }
    const key = node => node.dataset.panelTab || node.dataset.tab;
    const pageKey = node => node.dataset.panelPage || node.dataset.page;
    const labels = {anim:'动画',parts:'部件',pose:'姿势',view:'视图',voice:'声音',interaction:'互动'};
    const toolbar = document.getElementById('toolStrip');
    const trigger = document.getElementById('btnAnimTab') || document.getElementById('btnAnimPanel');
    const close = panel.querySelector('[data-panel-close],#panel-close');
    const library = document.getElementById('gridView');
    const playbar = document.getElementById('playbar');
    const playbackToggle = document.getElementById('playbarToggle');
    const closePanel = () => { if (panel.classList.contains('open')) close?.click(); };
    const collapsePlayback = () => {
      if (playbar && !playbar.classList.contains('collapsed')) playbackToggle?.click();
    };
    if (playbar && playbackToggle) {
      const head = document.createElement('div'); head.className = 'site-playback-head';
      const caption = document.createElement('span'); caption.textContent = '播放控制';
      const dismiss = document.createElement('button'); dismiss.id = 'sitePlaybackClose'; dismiss.type = 'button';
      dismiss.setAttribute('aria-label','关闭播放控制'); dismiss.title = '关闭播放控制'; K.setUiIcon(dismiss,'close');
      dismiss.addEventListener('click',collapsePlayback); head.append(caption,dismiss); playbar.prepend(head);
    }
    let nativeStar = document.getElementById('railStar');
    function isStarred() {
      if (!nativeStar) return false;
      const pressed = nativeStar.getAttribute('aria-pressed');
      if (pressed !== null) return pressed === 'true';
      return nativeStar.classList.contains('on') || nativeStar.classList.contains('active') ||
        nativeStar.textContent.trim() === '★' || nativeStar.querySelector('svg')?.getAttribute('fill') === 'currentColor';
    }
    const status = document.getElementById('status');
    function bindFavorite() {
      nativeStar ||= document.getElementById('railStar');
      if (!nativeStar || !status || document.getElementById('siteTitleFavorite')) return;
      const favorite = document.createElement('button'); favorite.id = 'siteTitleFavorite'; favorite.type = 'button';
      document.body.append(favorite); status.classList.add('site-has-favorite');
      function syncFavorite() {
        const starred = isStarred(), label = starred ? '已收藏，点击取消收藏' : '收藏当前资源';
        if (favorite.getAttribute('aria-pressed') !== String(starred)) {
          favorite.innerHTML = K.uiIcon('star',16,starred); favorite.setAttribute('aria-pressed',String(starred));
          favorite.classList.toggle('on',starred); favorite.setAttribute('aria-label',label); favorite.title = label;
        }
        favorite.disabled = nativeStar.disabled;
        if (status.getBoundingClientRect) {
          const rect = status.getBoundingClientRect(), style = window.getComputedStyle?.(status);
          favorite.hidden = !rect.width || !rect.height || status.hidden ||
            style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0';
          favorite.style.left = (rect.left + 2) + 'px'; favorite.style.top = (rect.top + (rect.height - 28) / 2) + 'px';
        }
      }
      favorite.addEventListener('click',() => { nativeStar.click(); syncFavorite(); });
      new MutationObserver(syncFavorite).observe(nativeStar,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-pressed','disabled','fill']});
      new MutationObserver(syncFavorite).observe(status,{childList:true,attributes:true,attributeFilter:['class','style','hidden']});
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncFavorite).observe(status);
      window.addEventListener?.('resize',syncFavorite); syncFavorite();
    }
    bindFavorite();
    if (!nativeStar && rail) {
      const pendingFavorite = new MutationObserver(() => {
        bindFavorite();
        if (nativeStar) pendingFavorite.disconnect();
      });
      pendingFavorite.observe(rail,{childList:true});
    }
    // Returning by button, shortcut, or runtime navigation must release edit
    // state as well as its surface. Native close handlers own that cleanup.
    let libraryOpen = false;
    function syncLibrary() {
      const opened = !!library?.classList.contains('open');
      if (opened === libraryOpen) return;
      libraryOpen = opened;
      if (!opened) return;
      // Some phone runtimes hide the panel before this observer runs. Dispatch
      // native close even then so parts picking and pose editing are released.
      close?.click(); collapsePlayback();
      K.hideMenu?.(); K.closeToolPopup?.(); K.closeThemePalette?.();
      K.refreshStageUI?.();
    }
    if (library) new MutationObserver(syncLibrary).observe(library,{attributes:true,attributeFilter:['class']});
    const mobileActions = [];
    for (const [id,label,icon,action] of [
      ['sitePlayback','播放控制','controls',() => { closePanel(); playbackToggle?.click(); }],
      ['siteFocus','专注观赏','focus',() => { closePanel(); collapsePlayback(); document.getElementById('btnPresetImmersive')?.click(); }],
    ]) {
      if (!rail || (id === 'sitePlayback' && !playbackToggle) || (id === 'siteFocus' && !document.getElementById('btnPresetImmersive'))) continue;
      const button = document.createElement('button'); button.id = id; button.type = 'button';
      button.className = 'site-mobile-action'; button.title = label; button.setAttribute('aria-label',label);
      if (id === 'sitePlayback') button.setAttribute('aria-expanded',String(!playbar.classList.contains('collapsed')));
      K.setUiIcon(button,icon); button.addEventListener('click',action); rail.append(button); mobileActions.push(button);
    }
    // Keep native tab nodes/listeners as adapters; only the two frequent actions
    // are visible in the toolbar. Closing first releases the runtime edit mode.
    tabs.hidden = true;
    tabs.style.setProperty('display','none','important');
    const title = document.createElement('strong'); title.className = 'site-panel-title';
    title.id = 'site-panel-title'; tabs.before(title);
    panel.setAttribute('aria-labelledby',title.id);
    function activePage() {
      return [...panel.querySelectorAll('.rp-page')].find(page => page.classList.contains('on'));
    }
    function activate(name) {
      const tab = [...tabs.querySelectorAll('button')].find(node => key(node) === name);
      if (!tab || tab.disabled) return;
      K.hideMenu?.(); K.closeToolPopup?.();
      if (window.matchMedia?.('(max-width: 720px)').matches) collapsePlayback();
      const same = panel.classList.contains('open') && pageKey(activePage() || {dataset:{}}) === name;
      close?.click();
      if (same) { refresh(); return; }
      trigger?.click();
      tab.click();
      panel.dataset.tab = name;
      panel.classList.add('open');
      K.refreshStageUI?.(); refresh();
    }
    const primary = [];
    for (const [name,id] of [['anim','siteAnim'],['parts','siteParts']]) {
      const button = document.createElement('button'); button.type = 'button';
      button.id = id; button.className = 'site-primary-action'; button.textContent = labels[name];
      button.setAttribute('aria-label',labels[name]); button.setAttribute('aria-controls','floatPanel');
      button.addEventListener('click',() => activate(name));
      toolbar?.insertBefore(button,toolbar.querySelector('.kit-more-tool'));
      primary.push({name,button});
    }
    const phoneLayout = window.matchMedia?.('(max-width: 720px)');
    const dock = document.createElement('nav'); dock.id = 'siteMobileDock';
    dock.setAttribute('aria-label','常用功能'); dock.hidden = true; document.body.append(dock);
    const quickPlay = document.createElement('button'); quickPlay.id = 'siteQuickPlay'; quickPlay.type = 'button';
    const nativePlay = document.getElementById('pbPlay');
    quickPlay.addEventListener('click',() => { nativePlay?.click(); syncQuickPlay(); });
    function syncQuickPlay() {
      // All playback adapters expose their actual playing state via .active.
      // Legacy titles say "播放/暂停" in both states and cannot identify the action.
      const playing = !!nativePlay?.classList.contains('active');
      const label = playing ? '暂停' : '播放';
      K.setUiIcon(quickPlay,playing ? 'pause' : 'play');
      quickPlay.title = label; quickPlay.setAttribute('aria-label',label); quickPlay.disabled = !nativePlay || nativePlay.disabled;
    }
    if (nativePlay) new MutationObserver(syncQuickPlay).observe(nativePlay,{attributes:true,attributeFilter:['class','aria-label','title','disabled'],childList:true});
    syncQuickPlay();
    // Move actual controls, retaining their native handlers and popup anchors.
    // Placeholders restore desktop order when rotating/resizing past the breakpoint.
    const dockHomes = new Map();
    function syncDock() {
      const mobile = !!phoneLayout?.matches;
      const more = document.querySelector('.kit-more-tool');
      if (more && !more.dataset.sitePlaybackBound) {
        more.dataset.sitePlaybackBound = '1'; more.addEventListener('click',collapsePlayback);
      }
      const nodes = [document.getElementById('railGrid'),document.getElementById('btnPrev'),quickPlay,document.getElementById('btnNext'),...primary.map(item=>item.button),document.querySelector('.kit-more-tool')].filter(Boolean);
      dock.hidden = !mobile;
      if (mobile) {
        let cursor = dock.firstElementChild;
        for (const node of nodes) {
          if (node !== quickPlay && !dockHomes.has(node)) {
            const anchor = document.createComment('desktop control'); node.before(anchor); dockHomes.set(node,anchor);
          }
          if (node !== cursor) dock.insertBefore(node,cursor); else cursor = cursor.nextElementSibling;
        }
      } else {
        for (const [node,anchor] of dockHomes) if (node.parentElement === dock) anchor.after(node);
      }
    }
    phoneLayout?.addEventListener?.('change',() => { K.hideMenu?.(); syncDock(); K.refreshStageUI?.(); });
    for (const id of ['btnParts','btnAnimTab','btnAnimPanel','btnLayerPanel','btnPanel','btnPartEdit','btnBoneEdit']) {
      const node = document.getElementById(id); if (node) node.hidden = true;
    }
    // MaJsoul's old view page mixed playback, view and resource controls.
    // Retain only useful controls at their functional homes; toolbar zoom and
    // More > background already own the view actions.
    const nativeView = panel.querySelector('[data-page="view"],[data-panel-page="view"]');
    if (nativeView) {
      nativeView.hidden = true;
      const anim = panel.querySelector('[data-page="anim"]');
      const parts = panel.querySelector('[data-page="parts"]');
      const idle = document.getElementById('autoIdle')?.closest('label');
      if (idle && anim) anim.append(idle);
      const link = document.getElementById('browseLink2')?.closest('.row');
      if (link && parts) parts.append(link);
      const layers = document.getElementById('layerPanel');
      if (layers && parts) {
        const details = document.createElement('details'); details.className = 'site-layer-details';
        const summary = document.createElement('summary'); summary.textContent = '图层';
        details.append(summary,layers); parts.prepend(details);
      }
    }
    K.getSiteMoreItems = () => {
      const items = [];
      if (phoneLayout?.matches) {
        for (const [id,label] of [['zOut','缩小'],['zPct','适应窗口'],['zIn','放大'],['railStar','收藏 / 取消收藏'],['sitePlayback','播放进度与速度']]) {
          const button = document.getElementById(id);
          if (button) items.push({group:id === 'sitePlayback' ? '播放' : id === 'railStar' ? '资源' : '画面',label:id === 'railStar' ? (isStarred() ? '取消收藏' : '收藏') : label,...(id === 'railStar' ? {checked:isStarred()} : {}),disabled:button.disabled,fn:() => button.click()});
        }
      }
      for (const name of ['pose','voice','interaction']) {
        if (name === 'interaction' && document.getElementById('btnStagePan')) continue;
        const tab = [...tabs.querySelectorAll('button')].find(node => key(node) === name);
        if (tab && !tab.hidden) items.push({group:name === 'pose' ? '工具' : labels[name],label:labels[name],replaces:name === 'voice' ? ['btnVoiceSettings','btnVoice'] : [],disabled:tab.disabled,fn:() => activate(name)});
      }
      const reset = document.getElementById('btnReset2');
      if (reset) items.push({group:'画面',label:'重置画面',disabled:reset.disabled,fn:() => reset.click()});
      return items;
    };
    const pose = panel.querySelector('[data-page="pose"],[data-panel-page="pose"]');
    if (pose) {
      // Advanced naming and snapshot actions should not crowd the editor.
      const save = pose.querySelector('#poseSave'), name = pose.querySelector('#poseName');
      if (save) save.textContent = '保存姿势';
      if (name) { name.placeholder = '姿势名称（可选）'; name.setAttribute('aria-label','姿势名称'); }
      const toggle = pose.querySelector('#poseEditToggle');
      if (toggle) toggle.classList.add('site-pose-toggle');
      if (name && save) {
        const row = document.createElement('div'); row.className = 'site-pose-save';
        row.append(name,save); (toggle || pose.firstElementChild)?.after(row);
      }
      const reset = pose.querySelector('#poseReset'), lock = pose.querySelector('#poseLock');
      if (reset && lock) {
        const row = document.createElement('div'); row.className = 'site-pose-actions';
        row.append(reset,lock); pose.querySelector('.site-pose-save')?.after(row);
      }
      const help = pose.querySelector('#poseHint,.lbl');
      if (help) {
        const details = document.createElement('details'); details.className = 'site-pose-help';
        const summary = document.createElement('summary'); summary.textContent = '编辑说明';
        help.before(details); details.append(summary,help);
      }
    }
    function refresh() {
      syncDock();
      const order = Object.keys(labels);
      const buttons = [...tabs.querySelectorAll('button')].filter(item => labels[key(item)]);
      buttons.sort((a,b) => order.indexOf(key(a)) - order.indexOf(key(b)));
      let cursor = tabs.firstElementChild;
      for (const button of buttons) {
        if (button !== cursor) tabs.insertBefore(button,cursor); else cursor = cursor.nextElementSibling;
        const name = key(button);
        if (button.textContent !== labels[name]) button.textContent = labels[name];
        button.setAttribute('role','tab');
        button.setAttribute('aria-selected',String(button.classList.contains('on')));
        button.id ||= 'site-tab-' + name;
        const page = [...panel.querySelectorAll('.rp-page')].find(item => pageKey(item) === name);
        if (page) {
          page.id ||= 'site-page-' + name; page.setAttribute('role','tabpanel');
          page.setAttribute('aria-labelledby',button.id); button.setAttribute('aria-controls',page.id);
        }
      }
      tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','编辑面板分类');
      const poseLock = document.getElementById('poseLock');
      if (poseLock) {
        const locked = poseLock.classList.contains('on') || poseLock.getAttribute('aria-pressed') === 'true';
        const label = locked ? '解除锁定' : '锁定姿势';
        if (poseLock.textContent !== label) poseLock.textContent = label;
      }
      const current = pageKey(activePage() || {dataset:{}});
      const opened = panel.classList.contains('open');
      const label = labels[current] || '工具';
      if (title.textContent !== label) title.textContent = label;
      for (const {name,button} of primary) {
        const tab = [...tabs.querySelectorAll('button')].find(node => key(node) === name);
        const unavailable = !tab || tab.disabled;
        button.hidden = !tab || tab.hidden;
        if (button.disabled !== unavailable) button.disabled = unavailable;
        const selected = opened && current === name;
        button.classList.toggle('on',selected);
        button.setAttribute('aria-expanded',String(selected));
      }
    }
    let queued = false;
    const queue = () => {
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; refresh(); });
    };
    new MutationObserver(queue).observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    if (toolbar) new MutationObserver(queue).observe(toolbar,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    new MutationObserver(queue).observe(panel,{subtree:true,attributes:true,attributeFilter:['class']});
    panel.addEventListener('click',queue);
    if (playbar) new MutationObserver(() => {
      const expanded = !playbar.classList.contains('collapsed');
      const button = mobileActions.find(node => node.id === 'sitePlayback');
      button?.setAttribute('aria-expanded',String(expanded));
      button?.classList.toggle('on',expanded);
      K.refreshStageUI?.();
    }).observe(playbar,{attributes:true,attributeFilter:['class']});
    syncLibrary();
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
