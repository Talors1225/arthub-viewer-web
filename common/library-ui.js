/* Resource-library presentation. Original page nodes and their handlers stay in place. */
(() => {
  'use strict';
  const K = window.SpineKit;
  if (!K) return;
  let ui = null;
  let stageReady = false;
  const route = location.pathname.split('/').find(part => ['bd2', 'bd2mod', 'nikki', 'nikke', 'majsoul', 'azurlane-interaction', 'crosscore-interaction', 'crosscore'].includes(part)) || 'viewer';
  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const setAttribute = (node, name, value) => { if (node && node.getAttribute(name) !== value) node.setAttribute(name, value); };
  const make = (tag, className) => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };

  function setReturnState() {
    if (!ui) return;
    const button = ui.head.querySelector('#gridClose, .library-return-action');
    if (button) {
      button.hidden = !stageReady;
      button.disabled = !stageReady;
      button.setAttribute('aria-label', '返回当前角色查看器');
    }
  }

  function setSortOpen(open) {
    if (!ui) return;
    ui.grid.classList.toggle('library-sort-open', !!open);
    ui.head.querySelector('.library-sort-trigger')?.setAttribute('aria-expanded', String(!!open));
  }

  function patchHeader() {
    const { head } = ui;
    let top = head.querySelector('.library-top-row');
    if (!top) {
      top = make('div', 'library-top-row');
      head.insertBefore(top, head.firstChild);
    }
    const home = head.querySelector('.kit-home-action');
    const title = head.querySelector('.grid-title');
    const summary = head.querySelector('.grid-sub');
    let titleBlock = head.querySelector('.library-title-block');
    if (!titleBlock) {
      titleBlock = make('div', 'library-title-block');
      if (title) titleBlock.appendChild(title);
      titleBlock.appendChild(make('span', 'library-mobile-total'));
    }
    const total = summary?.textContent.match(/[\d,]+/);
    setText(titleBlock.querySelector('.library-mobile-total'), total ? total[0] + ' 项' : '');
    const search = head.querySelector('.kit-grid-search') || head.querySelector('#gridSearch');
    const theme = head.querySelector('#btnTheme');
    let back = head.querySelector('#gridClose, .library-return-action');
    // MaJsoul keeps the same toggle handler on its resource-library button.
    if (!back && document.getElementById('railGrid')) {
      back = make('button', 'ctl library-return-action');
      back.type = 'button';
      back.addEventListener('click', () => {
        if (stageReady && ui.grid.classList.contains('open')) document.getElementById('railGrid').click();
      });
    }
    const sponsor = head.querySelector('.grid-sponsor');
    if (home) {
      K.setUiIcon(home, 'home', '网站首页');
      setAttribute(home, 'title', '返回 ArtHub 网站首页');
      setAttribute(home, 'aria-label', '返回 ArtHub 网站首页');
    }
    if (back) {
      K.setUiIcon(back, 'back', '返回角色');
      setAttribute(back, 'title', '关闭资源库，继续查看当前角色');
    }
    if (sponsor) {
      K.setUiIcon(sponsor, 'heart', '爱发电');
      setAttribute(sponsor, 'title', '爱发电 · 支持 ArtHub 维护');
      setAttribute(sponsor, 'aria-label', '爱发电 · 支持 ArtHub 维护（新窗口打开）');
    }
    K.setUiIcon(theme, 'palette');
    // The home/search nodes may arrive after DOMContentLoaded. Insert each known
    // action before the current cursor so repeated patches preserve one order.
    let cursor = top.firstElementChild;
    for (const node of [home, titleBlock, summary, search, theme, back, sponsor].filter(Boolean)) {
      if (node !== cursor) top.insertBefore(node, cursor);
      else cursor = cursor.nextElementSibling;
    }
    setReturnState();
    patchFilters();
  }

  function selectedCategory() {
    const selected = ui.head.querySelector('.filter-chip.on:not([data-crosscore-mode])');
    if (!selected) return false;
    if (selected.classList.contains('library-favorites')) return false;
    const label = selected.firstChild && selected.firstChild.textContent || selected.textContent;
    return !/^\s*(全部|[★☆])/.test(label);
  }

  function patchFilters() {
    const filters = ui.head.querySelector('#filterChips');
    if (!filters) return;
    let tabs = filters.querySelector('.library-category-tabs');
    let tools = filters.querySelector('.library-sort-tools');
    const chips = [...filters.querySelectorAll('.filter-chip')];
    if (chips.length && !tabs) {
      tabs = make('div', 'library-category-tabs');
      filters.insertBefore(tabs, filters.firstChild);
    }
    if (!tools) {
      tools = make('div', 'library-sort-tools');
      tools.id = 'librarySortTools';
      tools.setAttribute('role', 'group');
      tools.setAttribute('aria-label', '资源排序');
      filters.appendChild(tools);
    }
    let trigger = filters.querySelector('.library-sort-trigger');
    if (!trigger) {
      trigger = make('button', 'library-sort-trigger');
      trigger.type = 'button';
      trigger.title = '排序';
      trigger.setAttribute('aria-label', '排序');
      trigger.setAttribute('aria-expanded', String(ui.grid.classList.contains('library-sort-open')));
      trigger.setAttribute('aria-controls', tools.id);
      K.setUiIcon(trigger, 'sort');
      trigger.addEventListener('click', () => setSortOpen(!ui.grid.classList.contains('library-sort-open')));
      filters.insertBefore(trigger, tools);
    }
    for (const chip of chips) {
      if (chip.parentElement !== tabs) tabs.appendChild(chip);
      const label = chip.firstChild && chip.firstChild.textContent || chip.textContent;
      const favorite = chip.classList.contains('library-favorites') || /^\s*[★☆]/.test(label);
      if (chip.classList.contains('library-favorites') !== favorite) chip.classList.toggle('library-favorites', favorite);
      if (favorite) {
        const count = chip.querySelector('.n');
        const total = Number(count && count.textContent || 0);
        if (count) count.hidden = total === 0;
        setAttribute(chip, 'title', '收藏资源' + (total ? '（' + total + '）' : '（暂无收藏）'));
        setAttribute(chip, 'aria-label', '收藏资源，' + total + ' 项');
        if (!chip.querySelector('svg.arthub-icon')) {
          if (chip.firstChild?.nodeType === Node.TEXT_NODE) chip.firstChild.remove();
          chip.insertAdjacentHTML('afterbegin', K.uiIcon('star'));
        }
      }
      setAttribute(chip, 'aria-pressed', String(chip.classList.contains('on')));
    }
    for (const node of [...filters.querySelectorAll('.sort-sel, .sort-dir-toggle')]) {
      if (node.parentElement !== tools) tools.appendChild(node);
    }
    for (const facet of filters.querySelectorAll('.kit-facet-select')) {
      let group = filters.querySelector('.library-group-filter');
      if (!group) {
        group = make('div', 'library-group-filter');
        filters.insertBefore(group, trigger);
      }
      if (facet.parentElement !== group) group.appendChild(facet);
    }
    const single = selectedCategory();
    ui.grid.classList.toggle('library-single-category', single);
    const group = filters.querySelector('#majsoulGroupFilter');
    const select = tools.querySelector('.sort-sel');
    const oneKind = single || !!(group && group.value);
    if (select) {
      setAttribute(select, 'aria-label', '资源排序方式');
      for (const option of select.options) {
        const text = ({ default: '默认顺序', name: '名称', type: '类别 / 编号', group: '分组 / 名称' })[option.value];
        if (text) setText(option, text);
        if (option.value === 'type' || option.value === 'group') option.disabled = oneKind;
      }
      // Keep the user's mixed-result preference and restore it on leaving a category.
      // Only the existing change handler performs sorting; cards are never reordered here.
      const kindMode = select.value === 'type' || select.value === 'group';
      if (oneKind && kindMode) {
        ui.previousKindSort = select.value;
        ui.internalSort = true;
        select.value = 'name';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        ui.internalSort = false;
      } else if (!oneKind && ui.previousKindSort) {
        const previous = ui.previousKindSort;
        ui.previousKindSort = null;
        if ([...select.options].some(option => option.value === previous)) {
          ui.internalSort = true;
          select.value = previous;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          ui.internalSort = false;
        }
      }
    }
    const direction = tools.querySelector('.sort-dir-toggle');
    if (direction) {
      const descending = /^\s*(↓|降序)/.test(direction.textContent) || /当前倒序|当前降序/.test(direction.title);
      K.setUiIcon(direction, descending ? 'down' : 'up', descending ? '降序' : '升序');
      const nameMode = select && select.value === 'name';
      const hint = nameMode ? (descending ? '名称 Z → A' : '名称 A → Z') : (descending ? '从后往前' : '从前往后');
      setAttribute(direction, 'title', (descending ? '当前降序' : '当前升序') + '：' + hint + '；点击切换');
      setAttribute(direction, 'aria-label', direction.title);
    }
  }

  function patchCard(card) {
    const name = card.querySelector('.tn');
    if (!name) return;
    const fullName = name.textContent.trim();
    setAttribute(name, 'title', fullName);
    const variant = card.querySelector('.tv')?.textContent.trim();
    setAttribute(card, 'aria-label', fullName + (variant ? ' · ' + variant : ''));
    const star = card.querySelector('.tstar');
    if (star && !star.querySelector('svg.arthub-icon')) star.innerHTML = K.uiIcon('star', 18, star.classList.contains('on'));
  }

  function patchPageNames() {
    for (const nav of ui.grid.querySelectorAll('#gridPaginationTop, #gridPagination')) {
      for (const button of nav.querySelectorAll('.grid-page-btn')) {
        const label = button.textContent.trim();
        if (label === '‹' || label === '›') {
          setAttribute(button, 'aria-label', label === '‹' ? '上一页' : '下一页');
          K.setUiIcon(button, label === '‹' ? 'chevL' : 'chevR');
        } else if (label) setAttribute(button, 'aria-label', '第 ' + label + ' 页');
      }
    }
  }

  function queueHeader() {
    if (!ui || ui.headerQueued) return;
    ui.headerQueued = true;
    requestAnimationFrame(() => {
      ui.headerQueued = false;
      patchHeader();
      patchPageNames();
    });
  }

  function queueCards(cards) {
    if (!ui) return;
    for (const card of cards) if (card && card.matches('.thumb-card')) ui.pendingCards.add(card);
    if (ui.cardQueued) return;
    ui.cardQueued = true;
    requestAnimationFrame(() => {
      ui.cardQueued = false;
      const pending = [...ui.pendingCards];
      ui.pendingCards.clear();
      for (const card of pending) if (card.isConnected) patchCard(card);
    });
  }

  K.setLibraryStageReady = ready => {
    stageReady = !!ready;
    setReturnState();
  };

  K.refreshLibraryUI = () => {
    if (!ui) return K.initLibraryUI();
    queueHeader();
    queueCards(ui.cards.children);
  };

  K.initLibraryUI = () => {
    if (ui) return;
    const grid = document.getElementById('gridView');
    const head = grid && grid.querySelector('.grid-head');
    const cards = grid && grid.querySelector('#thumbGrid');
    if (!grid || !head || !cards) return;
    ui = { grid, head, cards, pendingCards: new Set(), headerQueued: false, cardQueued: false, previousKindSort: null, internalSort: false, scroll: 0, wasOpen: grid.classList.contains('open') };
    grid.classList.add('library-ui');
    patchHeader();
    queueCards(cards.children);
    if (typeof K.paginationHosts === 'function') K.paginationHosts(grid);
    patchPageNames();

    const headObserver = new MutationObserver(records => {
      // Late clean-chrome initialization may add/wrap the search and home actions.
      if (records.some(record => record.type !== 'attributes' || ['class', 'title', 'value'].includes(record.attributeName))) queueHeader();
    });
    headObserver.observe(head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'title', 'value'] });
    const cardsObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.target === cards) {
          for (const node of record.addedNodes) if (node.nodeType === 1) queueCards([node]);
        } else {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          if (target && target.closest('.tn')) queueCards([target.closest('.thumb-card')]);
        }
      }
    });
    cardsObserver.observe(cards, { childList: true, subtree: true, characterData: true });
    const gridObserver = new MutationObserver(records => {
      const open = grid.classList.contains('open');
      if (open !== ui.wasOpen) {
        ui.wasOpen = open;
        if (open) requestAnimationFrame(() => { grid.scrollTop = ui.scroll; });
        else setSortOpen(false);
      }
      if (records.some(record => record.type === 'childList')) queueHeader();
    });
    gridObserver.observe(grid, { attributes: true, attributeFilter: ['class'], childList: true });
    for (const nav of grid.querySelectorAll('#gridPaginationTop, #gridPagination')) {
      const observer = new MutationObserver(patchPageNames);
      observer.observe(nav, { childList: true });
    }
    head.addEventListener('change', event => {
      if (event.target.matches('.sort-sel') && !ui.internalSort) ui.previousKindSort = null;
      ui.scroll = 0;
      queueHeader();
    });
    head.addEventListener('input', event => {
      if (event.target.id === 'gridSearch') ui.scroll = 0;
    });
    grid.addEventListener('scroll', () => { if (ui.wasOpen) ui.scroll = grid.scrollTop; }, { passive: true });
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.library-sort-tools, .library-sort-trigger')) setSortOpen(false);
    });
    head.addEventListener('keydown', event => {
      if (event.key === 'Escape' && ui.grid.classList.contains('library-sort-open')) {
        setSortOpen(false);
        head.querySelector('.library-sort-trigger')?.focus();
      }
    });
    grid.addEventListener('click', event => {
      if (event.target.closest('.filter-chip, .grid-page-btn')) ui.scroll = 0;
      else if (event.target.closest('.thumb-card') && !event.target.closest('.tstar')) ui.scroll = grid.scrollTop;
    }, true);
    window.addEventListener('pagehide', event => {
      // A bfcache page stays alive and can be restored without reinitialization.
      if (event.persisted) return;
      headObserver.disconnect();
      cardsObserver.disconnect();
      gridObserver.disconnect();
    });
    K.assetCatalogReady?.then(() => queueCards(cards.children));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', K.initLibraryUI, { once: true });
  else K.initLibraryUI();
})();
