'use strict';
// ページ右端に最小表示のタブレールを描画する content script。
// - ページの DOM は読み取らず・変更もしない。追加するのは自前の overlay 要素だけ
// - closed Shadow DOM でページの CSS・JS から隔離する
// - タブ情報と操作はすべて background.js 経由
//   （content script からは chrome.tabs API を直接使えない）

(() => {
  const HOST_ID = 'right-tabs-local-rail';
  if (document.getElementById(HOST_ID)) return;

  const NONE = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE（content script では定数を参照できない）
  const COLORS = {
    grey: '#9198a6', blue: '#63a5f7', red: '#f07474', yellow: '#e6bd60',
    green: '#65c998', pink: '#e48fca', purple: '#ac91e7', cyan: '#6ccfd9', orange: '#eda56c'
  };

  const CSS = `
    .rail{position:absolute;top:0;right:0;height:100%;width:44px;box-sizing:border-box;
      display:flex;flex-direction:column;background:rgba(14,18,27,.96);
      border-left:1px solid #313b4d;color:#e8edf6;
      font:13px system-ui,-apple-system,"Segoe UI",sans-serif;
      transition:width .15s ease;pointer-events:none}
    .rail.is-open{width:236px;pointer-events:auto}
    .search-wrap{display:none;padding:5px 6px;border-bottom:1px solid #313b4d}
    .rail.is-open .search-wrap{display:block}
    .search{width:100%;box-sizing:border-box;height:24px;padding:0 8px;
      border:1px solid #313b4d;border-radius:6px;background:#0f1420;color:inherit;
      font:inherit;font-size:12px;outline:none}
    .search:focus{border-color:#548cf8}
    .search::placeholder{color:#8995a9}
    .search::-webkit-search-cancel-button{cursor:pointer}
    .list{flex:1;min-height:0;overflow-y:auto;padding:4px 0 8px;scrollbar-width:thin}
    .row{display:flex;align-items:center;height:30px;position:relative}
    .row:hover{background:#242e3e}
    .row.is-active{background:#233553}
    .row.is-active::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#548cf8}
    .row.is-dragging{opacity:.45}
    .row.drop-before::after,.row.drop-after::after{content:'';position:absolute;left:4px;right:4px;
      height:2px;background:#548cf8}
    .row.drop-before::after{top:-1px}
    .row.drop-after::after{bottom:-1px}
    .main{display:flex;align-items:center;gap:6px;min-width:0;flex:1;height:100%;
      padding:0 2px 0 8px;border:0;background:none;color:inherit;cursor:pointer;text-align:left}
    .fav{width:16px;height:16px;flex:0 0 auto;object-fit:contain}
    .fav-fb{width:16px;height:16px;flex:0 0 auto;display:grid;place-items:center;color:#8995a9;font-size:14px}
    .gdot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
    .title{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
      font-size:12px;line-height:1.2}
    .is-active .title{font-weight:650;color:#fff}
    .ind{flex:0 0 auto;color:#8995a9;font-size:11px;padding:0 2px}
    .more,.close{flex:0 0 auto;width:20px;height:24px;display:grid;place-items:center;border:0;
      background:none;color:#8995a9;font-size:14px;cursor:pointer;opacity:0;border-radius:5px}
    .rail.is-open .more,.rail.is-open .close{opacity:1}
    .more:hover,.close:hover{background:rgba(255,255,255,.12);color:#fff}
    .new-tab{flex:0 0 auto;height:30px;border:0;border-top:1px solid #313b4d;
      background:#171d29;color:#e8edf6;font-size:16px;cursor:pointer}
    .new-tab:hover{background:#242e3e}
    .sep{height:1px;background:#313b4d;margin:5px 8px}
    .empty{padding:10px;color:#8995a9;font-size:12px;line-height:1.5}
    .menu{position:fixed;min-width:170px;max-width:250px;padding:4px;background:#1b2331;
      border:1px solid #313b4d;border-radius:8px;box-shadow:0 8px 26px rgba(0,0,0,.5);
      color:#e8edf6;font:13px system-ui,-apple-system,"Segoe UI",sans-serif;
      pointer-events:auto;max-height:75vh;overflow-y:auto}
    .menu[hidden]{display:none}
    .menu-item{display:block;width:100%;padding:6px 10px;border:0;border-radius:5px;
      background:none;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;
      overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .menu-item:hover,.menu-item:focus-visible{background:#2a3448;outline:none}
    .menu-item.danger{color:#f07474}
    .menu-item.danger:hover,.menu-item.danger:focus-visible{background:rgba(240,116,116,.14)}
    .menu-sep{height:1px;background:#313b4d;margin:4px 6px}
    @media (prefers-color-scheme: light){
      .rail{background:rgba(246,248,252,.97);border-left-color:#d1d9e5;color:#202939}
      .search-wrap{border-bottom-color:#d1d9e5}
      .search{background:#fff;border-color:#d1d9e5;color:#202939}
      .search:focus{border-color:#3068c8}
      .search::placeholder{color:#6b778b}
      .row:hover{background:#e2eaf5}
      .row.is-active{background:#dbe9ff}
      .is-active .title{color:#12325f}
      .fav-fb,.ind,.more,.close{color:#6b778b}
      .more:hover,.close:hover{background:rgba(0,0,0,.08);color:#202939}
      .new-tab{background:#fff;border-top-color:#d1d9e5;color:#202939}
      .new-tab:hover{background:#e2eaf5}
      .sep{background:#d1d9e5}
      .empty{color:#6b778b}
      .menu{background:#fff;border-color:#d1d9e5;color:#202939;
        box-shadow:0 8px 26px rgba(25,46,82,.18)}
      .menu-item:hover,.menu-item:focus-visible{background:#e2eaf5}
      .menu-item.danger{color:#c43d3d}
      .menu-item.danger:hover,.menu-item.danger:focus-visible{background:rgba(196,61,61,.1)}
      .menu-sep{background:#d1d9e5}
    }
  `;

  const state = {
    tabs: [], groups: new Map(), filter: '', pointerNear: false,
    draggedTabId: null, renderDeferred: false, menuTabId: null
  };

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0;background:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  const rail = el('div', 'rail');
  const searchWrap = el('div', 'search-wrap');
  const searchInput = el('input', 'search');
  searchInput.type = 'search';
  searchInput.placeholder = 'タブを検索';
  searchInput.setAttribute('aria-label', 'タブを検索');
  searchWrap.appendChild(searchInput);
  const list = el('div', 'list');
  const add = el('button', 'new-tab', '＋');
  add.type = 'button';
  add.title = '新しいタブ';
  add.addEventListener('click', () => send({ type: 'rail-new' }));
  rail.append(searchWrap, list, add);
  const menu = el('div', 'menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  shadow.append(rail, menu);
  document.documentElement.appendChild(host);

  function send(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (_) { /* ignore */ }
  }
  function faviconUrl(url) {
    if (!url) return null;
    try {
      const page = new URL(url);
      if (page.protocol !== 'http:' && page.protocol !== 'https:') return null;
      const icon = new URL(chrome.runtime.getURL('/_favicon/'));
      icon.searchParams.set('pageUrl', page.href);
      icon.searchParams.set('size', '16');
      return icon.href;
    } catch { return null; }
  }

  // メニュー表示中・検索語の入力中・ドラッグ中は、カーソルが外れても
  // レールを展開したままにする（操作中に 44px へ畳まれると行き先を失うため）。
  function syncOpen() {
    rail.classList.toggle('is-open',
      state.pointerNear || state.filter !== '' || !menu.hidden || Number.isInteger(state.draggedTabId));
  }

  // 畳んだレールは pointer-events:none でページへクリックを通す
  // （右端にあるページ側のボタンやスクロールバーを塞がないため）。
  // 展開は JS で行う。:hover では検出できないので、document の mousemove で
  // 「画面右端へのタッチ」か「44px 帯での滞留」をトリガーにする。
  // 帯の内側（8〜44px）への直接の侵入では畳んだままにし、
  // ページの右端ボタンを狙ったホバーではレールが出ないようにする。
  const EDGE_ARM_PX = 8;
  const BAND_PX = 44;
  const OPEN_PX = 236;
  const DWELL_MS = 400;
  const CLOSE_DELAY_MS = 250;
  let dwellTimer = 0;
  let closeTimer = 0;
  let armed = false;
  function setNear(near) {
    if (state.pointerNear === near) return;
    state.pointerNear = near;
    syncOpen();
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { armed = false; setNear(false); }, CLOSE_DELAY_MS);
  }
  document.addEventListener('mousemove', (event) => {
    const dRight = window.innerWidth - event.clientX;
    if (state.pointerNear) {
      if (dRight > OPEN_PX) scheduleClose(); else clearTimeout(closeTimer);
      return;
    }
    if (dRight <= EDGE_ARM_PX) {
      armed = true;
      clearTimeout(dwellTimer);
      setNear(true);
      return;
    }
    if (dRight <= BAND_PX && !armed) {
      clearTimeout(dwellTimer);
      dwellTimer = setTimeout(() => { armed = true; setNear(true); }, DWELL_MS);
      return;
    }
    clearTimeout(dwellTimer);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    clearTimeout(dwellTimer);
    scheduleClose();
  });

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    state.menuTabId = null;
    syncOpen();
  }
  function openMenu(tab, anchor) {
    closeMenu();
    state.menuTabId = tab.id;
    const item = (label, fn, danger) => {
      const b = el('button', 'menu-item' + (danger ? ' danger' : ''), label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { closeMenu(); fn(); });
      menu.appendChild(b);
    };
    item(tab.pinned ? '固定を解除' : 'タブを固定',
      () => send({ type: 'rail-pin', tabId: tab.id, pinned: !tab.pinned }));
    item(tab.muted ? 'ミュート解除' : 'タブをミュート',
      () => send({ type: 'rail-mute', tabId: tab.id, muted: !tab.muted }));
    item('タブを複製', () => send({ type: 'rail-duplicate', tabId: tab.id }));
    if (!tab.pinned) {
      if (tab.groupId !== NONE) {
        item('グループから外す', () => send({ type: 'rail-ungroup', tabId: tab.id }));
      }
      item('新しいグループを作る', () => send({ type: 'rail-group-new', tabId: tab.id }));
      const others = Array.from(state.groups.values()).filter(g => g.id !== tab.groupId);
      if (others.length) {
        menu.appendChild(el('div', 'menu-sep'));
        for (const g of others) {
          item(`「${g.title || '名前なし'}」に移動`,
            () => send({ type: 'rail-group', tabId: tab.id, groupId: g.id }));
        }
      }
    }
    menu.appendChild(el('div', 'menu-sep'));
    item('タブを閉じる', () => send({ type: 'rail-close', tabId: tab.id }), true);
    menu.hidden = false;
    syncOpen();
    // レールは右端にあるので、メニューはカーソルの左側へ開く
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(anchor.x - mw - 4, window.innerWidth - mw - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - mh - 8))}px`;
    menu.querySelector('button')?.focus();
  }

  function row(tab) {
    const r = el('div', 'row' + (tab.active ? ' is-active' : ''));
    r.title = tab.title || '名称なし';
    r.draggable = true;
    const main = el('button', 'main');
    main.type = 'button';
    const src = faviconUrl(tab.url);
    if (src) {
      const img = el('img', 'fav');
      img.alt = '';
      img.src = src;
      img.addEventListener('error', () => img.replaceWith(el('span', 'fav-fb', '◇')), { once: true });
      main.appendChild(img);
    } else {
      main.appendChild(el('span', 'fav-fb', '◇'));
    }
    const g = state.groups.get(tab.groupId);
    if (g) {
      const dot = el('span', 'gdot');
      dot.style.background = COLORS[g.color] || COLORS.grey;
      main.appendChild(dot);
    }
    main.appendChild(el('span', 'title', tab.title || (tab.url ? '読み込み中…' : '新しいタブ')));
    main.addEventListener('click', () => send({ type: 'rail-activate', tabId: tab.id }));
    r.appendChild(main);
    if (tab.pinned) r.appendChild(el('span', 'ind', '●'));
    if (tab.audible || tab.muted) r.appendChild(el('span', 'ind', tab.muted ? '♪̸' : '♪'));
    const more = el('button', 'more', '⋯');
    more.type = 'button';
    more.title = '操作メニュー';
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const b = more.getBoundingClientRect();
      openMenu(tab, { x: b.left, y: b.top });
    });
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.title = 'タブを閉じる';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      send({ type: 'rail-close', tabId: tab.id });
    });
    r.append(more, close);
    r.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openMenu(tab, { x: event.clientX, y: event.clientY });
    });
    r.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer) return;
      state.draggedTabId = tab.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(tab.id));
      r.classList.add('is-dragging');
      closeMenu();
      syncOpen();
    });
    r.addEventListener('dragend', () => {
      state.draggedTabId = null;
      syncOpen();
      list.querySelectorAll('.drop-before,.drop-after,.is-dragging').forEach(n => {
        n.classList.remove('drop-before', 'drop-after', 'is-dragging');
      });
      if (state.renderDeferred) render();
    });
    r.addEventListener('dragover', (event) => {
      const srcTab = state.tabs.find(t => t.id === state.draggedTabId);
      if (!srcTab || srcTab.id === tab.id || srcTab.groupId !== tab.groupId || srcTab.pinned !== tab.pinned) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const after = event.clientY >= r.getBoundingClientRect().top + r.offsetHeight / 2;
      r.classList.toggle('drop-before', !after);
      r.classList.toggle('drop-after', after);
    });
    r.addEventListener('dragleave', () => r.classList.remove('drop-before', 'drop-after'));
    r.addEventListener('drop', (event) => {
      const srcTab = state.tabs.find(t => t.id === state.draggedTabId);
      r.classList.remove('drop-before', 'drop-after');
      if (!srcTab || srcTab.id === tab.id || srcTab.groupId !== tab.groupId || srcTab.pinned !== tab.pinned) return;
      event.preventDefault();
      const after = event.clientY >= r.getBoundingClientRect().top + r.offsetHeight / 2;
      // chrome.tabs.moveのindexは移動後の位置を指定する。
      const index = tab.index - (srcTab.index < tab.index ? 1 : 0) + (after ? 1 : 0);
      send({ type: 'rail-move', tabId: srcTab.id, index });
    });
    return r;
  }

  function matches(tab) {
    return !state.filter ||
      `${tab.title || ''}\n${tab.url || ''}`.toLowerCase().includes(state.filter);
  }
  function render() {
    if (Number.isInteger(state.draggedTabId)) { state.renderDeferred = true; return; }
    state.renderDeferred = false;
    // メニューは、対象のタブが無くなったときだけ閉じる。
    if (!menu.hidden && !state.tabs.some(t => t.id === state.menuTabId)) closeMenu();
    const frag = document.createDocumentFragment();
    const shown = state.tabs.filter(matches);
    if (!shown.length) {
      frag.appendChild(el('div', 'empty',
        state.filter ? '一致するタブがありません。' : 'タブがありません。'));
    } else {
      const pinned = shown.filter(t => t.pinned);
      const normal = shown.filter(t => !t.pinned);
      for (const t of pinned) frag.appendChild(row(t));
      if (pinned.length && normal.length) frag.appendChild(el('div', 'sep'));
      for (const t of normal) frag.appendChild(row(t));
    }
    list.replaceChildren(frag);
  }
  function accept(data) {
    state.tabs = data.tabs || [];
    state.groups = new Map((data.groups || []).map(g => [g.id, g]));
    render();
  }

  searchInput.addEventListener('input', () => {
    state.filter = searchInput.value.trim().toLowerCase();
    syncOpen();
    render();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchInput.value = '';
      state.filter = '';
      syncOpen();
      render();
      searchInput.blur();
    }
    // ページ側のキーボードショートカットに検索入力を取られないようにする
    event.stopPropagation();
  });
  shadow.addEventListener('keydown', (event) => {
    if (event.key === '/' && event.target !== searchInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      state.pointerNear = true;
      syncOpen();
      searchInput.focus();
    }
    if (event.key === 'Escape' && !menu.hidden) closeMenu();
  });
  // メニューの外を押したら閉じる。closed Shadow DOM の中のイベントは
  // document から見ると target が host に書き換わるため、host 以外なら外側と判定する。
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && event.target !== host) closeMenu();
  });
  rail.addEventListener('pointerdown', () => {
    if (!menu.hidden) closeMenu();
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'rail-tabs' && Array.isArray(msg.tabs)) accept(msg);
  });
  chrome.runtime.sendMessage({ type: 'rail-init' }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;
    accept(resp);
  });
})();
