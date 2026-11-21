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
      display:flex;flex-direction:column;background:rgba(14,18,27,.45);
      border-left:1px solid rgba(49,59,77,.55);color:#e8edf6;
      font:13px system-ui,-apple-system,"Segoe UI",sans-serif;
      transition:width .15s ease,height .15s ease,background-color .15s ease,border-color .15s ease;
      pointer-events:none}
    .rail.is-open{width:236px;pointer-events:auto;
      background:rgba(14,18,27,.96);border-left-color:#313b4d}
    .rail.is-hidden:not(.is-open){visibility:hidden}
    .rail.is-slim:not(.is-open){width:20px}
    .rail.is-slim:not(.is-open) .main{padding:0 2px}
    .rail.is-slim:not(.is-open) .ind,.rail.is-slim:not(.is-open) .gdot{display:none}
    .rail.is-slim:not(.is-open) .sep{margin:5px 4px}
    .rail.pos-left{right:auto;left:0;border-left:0;border-right:1px solid rgba(49,59,77,.55)}
    .rail.pos-left.is-open{border-right-color:#313b4d}
    /* 上下位置: 畳み時は 28px のアイコン横帯、展開時は 64px の横チップ帯。
       縦リストにはならないので画面を塞がない */
    .rail.pos-top,.rail.pos-bottom{top:auto;left:0;right:0;width:100%;height:28px;
      flex-direction:row;border-left:0}
    .rail.pos-top{top:0;border-bottom:1px solid rgba(49,59,77,.55)}
    .rail.pos-bottom{bottom:0;border-top:1px solid rgba(49,59,77,.55)}
    .rail.pos-top.is-open,.rail.pos-bottom.is-open{width:100%;height:64px}
    .rail.pos-top.is-open{border-bottom-color:#313b4d}
    .rail.pos-bottom.is-open{border-top-color:#313b4d}
    .rail.pos-top.is-slim:not(.is-open),.rail.pos-bottom.is-slim:not(.is-open){height:16px;width:100%}
    .rail.pos-top .grip,.rail.pos-bottom .grip{width:14px;height:auto}
    .rail.pos-top .list,.rail.pos-bottom .list{
      display:flex;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:0 4px}
    .rail.pos-top .row,.rail.pos-bottom .row{height:auto}
    .rail.pos-top .row.is-active::before,.rail.pos-bottom .row.is-active::before{
      left:0;right:0;width:auto;height:3px}
    .rail.pos-top .row.is-active::before{top:auto;bottom:0}
    .rail.pos-bottom .row.is-active::before{top:0;bottom:auto}
    .rail.pos-top .main,.rail.pos-bottom .main{padding:0 4px;height:100%}
    .rail.pos-top.is-open .main,.rail.pos-bottom.is-open .main{max-width:200px}
    .rail.pos-top:not(.is-open) .title,.rail.pos-bottom:not(.is-open) .title{display:none}
    .rail.pos-top.is-open .title,.rail.pos-bottom.is-open .title{max-width:110px}
    .rail.pos-top .gdot,.rail.pos-bottom .gdot{position:absolute;bottom:4px;right:4px}
    .rail.pos-top .sep,.rail.pos-bottom .sep{width:1px;height:auto;margin:4px 5px}
    .rail.pos-top .row.drop-before::after,.rail.pos-bottom .row.drop-before::after{
      left:-1px;right:auto;top:4px;bottom:4px;width:2px;height:auto}
    .rail.pos-top .row.drop-after::after,.rail.pos-bottom .row.drop-after::after{
      right:-1px;left:auto;top:4px;bottom:4px;width:2px;height:auto}
    .rail.pos-top .new-tab,.rail.pos-bottom .new-tab{
      width:36px;height:auto;border-top:0;border-left:1px solid rgba(49,59,77,.55)}
    .rail.pos-top.is-open .search-wrap,.rail.pos-bottom.is-open .search-wrap{
      display:flex;align-items:center;width:170px;flex:none;padding:0 6px;
      border-bottom:0;border-left:1px solid #313b4d}
    /* 上下の畳み帯はクリックスルーのまま、中央のツマミだけを押せる開閉ボタンにする。
       帯の下にあるページ側のボタンを狙うホバーではレールが出ない */
    .notch{position:absolute;display:none;width:56px;height:11px;left:50%;transform:translateX(-50%);
      border:0;padding:0;cursor:pointer;pointer-events:auto;
      background-image:radial-gradient(circle,rgba(232,237,246,.8) 1.2px,transparent 1.4px);
      background-size:9px 5px;background-position:center;background-repeat:repeat}
    .rail.pos-top .notch{display:block;bottom:-3px;border-radius:0 0 8px 8px;background-color:rgba(23,29,41,.75)}
    .rail.pos-bottom .notch{display:block;top:-3px;border-radius:8px 8px 0 0;background-color:rgba(23,29,41,.75)}
    .notch:hover{background-color:rgba(35,45,62,.9)}
    .grip{display:none;height:14px;cursor:grab;flex:none;
      background-image:radial-gradient(circle,rgba(137,149,169,.9) 1.2px,transparent 1.4px);
      background-size:9px 6px;background-position:center;background-repeat:repeat}
    .rail.is-open .grip{display:block}
    .rail.is-dock-dragging .grip{cursor:grabbing}
    .zone{position:fixed;background:rgba(70,130,240,.18);pointer-events:none}
    .zone.z-on{background:rgba(70,130,240,.5)}
    .zone.z-right{top:0;right:0;bottom:0;width:14px}
    .zone.z-left{top:0;left:0;bottom:0;width:14px}
    .zone.z-top{top:0;left:0;right:0;height:14px}
    .zone.z-bottom{bottom:0;left:0;right:0;height:14px}
    .search-wrap{display:none;padding:5px 6px;border-top:1px solid #313b4d}
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
    .new-tab{flex:0 0 auto;height:30px;border:0;border-top:1px solid rgba(49,59,77,.55);
      background:rgba(23,29,41,.5);color:#e8edf6;font-size:16px;cursor:pointer}
    .rail.is-open .new-tab{background:#171d29;border-top-color:#313b4d}
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
    .menu-note{padding:6px 10px;color:#8995a9;font-size:11px;line-height:1.5}
    @media (prefers-color-scheme: light){
      .rail{background:rgba(246,248,252,.55);border-left-color:rgba(209,217,229,.6);color:#202939}
      .rail.is-open{background:rgba(246,248,252,.97);border-left-color:#d1d9e5}
      .rail.pos-left{border-right-color:rgba(209,217,229,.6)}
      .rail.pos-left.is-open{border-right-color:#d1d9e5}
      .rail.pos-top{border-bottom-color:rgba(209,217,229,.6)}
      .rail.pos-bottom{border-top-color:rgba(209,217,229,.6)}
      .rail.pos-top.is-open{border-bottom-color:#d1d9e5}
      .rail.pos-bottom.is-open{border-top-color:#d1d9e5}
      .rail.pos-top .new-tab,.rail.pos-bottom .new-tab{
        border-left-color:rgba(209,217,229,.6)}
      .rail.pos-top.is-open .search-wrap,.rail.pos-bottom.is-open .search-wrap{
        border-left-color:#d1d9e5}
      .rail.pos-top .notch,.rail.pos-bottom .notch{background-color:rgba(246,248,252,.8)}
      .notch:hover{background-color:rgba(226,232,242,.95)}
      .search-wrap{border-top-color:#d1d9e5}
      .search{background:#fff;border-color:#d1d9e5;color:#202939}
      .search:focus{border-color:#3068c8}
      .search::placeholder{color:#6b778b}
      .row:hover{background:#e2eaf5}
      .row.is-active{background:#dbe9ff}
      .is-active .title{color:#12325f}
      .fav-fb,.ind,.more,.close{color:#6b778b}
      .more:hover,.close:hover{background:rgba(0,0,0,.08);color:#202939}
      .new-tab{background:rgba(255,255,255,.55);border-top-color:rgba(209,217,229,.6);color:#202939}
      .rail.is-open .new-tab{background:#fff;border-top-color:#d1d9e5}
      .new-tab:hover{background:#e2eaf5}
      .sep{background:#d1d9e5}
      .empty{color:#6b778b}
      .menu{background:#fff;border-color:#d1d9e5;color:#202939;
        box-shadow:0 8px 26px rgba(25,46,82,.18)}
      .menu-item:hover,.menu-item:focus-visible{background:#e2eaf5}
      .menu-item.danger{color:#c43d3d}
      .menu-item.danger:hover,.menu-item.danger:focus-visible{background:rgba(196,61,61,.1)}
      .menu-sep{background:#d1d9e5}
      .menu-note{color:#6b778b}
    }
  `;

  const state = {
    tabs: [], groups: new Map(), filter: '', pointerNear: false,
    draggedTabId: null, renderDeferred: false, menuTabId: null,
    mode: 'translucent', defaultMode: 'translucent', modeTouched: false,
    position: 'right', defaultPosition: 'right', positionTouched: false
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
  const grip = el('div', 'grip');
  grip.title = 'ドラッグでレールの位置を変更';
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
  // 展開時に行がずれないよう、検索・グリップはリストの後ろに置く
  // （リストの上に挿入すると畳み時に狙ったアイコンの行が展開でずれて誤クリックになる）
  rail.append(list, searchWrap, grip, add);
  const notch = el('button', 'notch');
  notch.type = 'button';
  notch.title = 'レールの開閉';
  notch.setAttribute('aria-label', 'レールの開閉');
  rail.appendChild(notch);
  const menu = el('div', 'menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  const zones = ['left', 'right', 'top', 'bottom'].map(p => {
    const z = el('div', `zone z-${p}`);
    z.hidden = true;
    return z;
  });
  shadow.append(rail, menu, ...zones);
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
  const OPEN_PX = 236;
  const DWELL_MS = 400;
  const CLOSE_DELAY_MS = 250;
  let dwellTimer = 0;
  let closeTimer = 0;
  let armed = false;
  // 畳み表示モード。'translucent'（半透明・既定）/ 'slim'（20px の細い帯）/
  // 'hidden'（近接まで非表示）。既定は rail-config.js、レール上の右クリックで
  // セッション限定に切り替えられる（永続化しない設計のため storage は使わない）。
  function setMode(mode) {
    if (mode !== 'translucent' && mode !== 'slim' && mode !== 'hidden') return;
    state.mode = mode;
    rail.classList.toggle('is-slim', mode === 'slim');
    rail.classList.toggle('is-hidden', mode === 'hidden');
  }
  // 位置。'right'（既定）/ 'left' / 'top' / 'bottom'。
  // top・bottom は畳み時にファビコンを横並びにし、展開時は全幅の縦リストになる。
  function setPosition(pos) {
    if (pos !== 'right' && pos !== 'left' && pos !== 'top' && pos !== 'bottom') return;
    state.position = pos;
    rail.classList.toggle('pos-left', pos === 'left');
    rail.classList.toggle('pos-top', pos === 'top');
    rail.classList.toggle('pos-bottom', pos === 'bottom');
  }
  function horizontal() {
    return state.position === 'top' || state.position === 'bottom';
  }
  function edgeDist(event) {
    if (state.position === 'left') return event.clientX;
    if (state.position === 'top') return event.clientY;
    if (state.position === 'bottom') return window.innerHeight - event.clientY;
    return window.innerWidth - event.clientX;
  }
  function openExtent() {
    // 上下位置の展開は 64px の横帯なので閉域もそれに合わせる
    return horizontal() ? 64 : OPEN_PX;
  }
  function setNear(near) {
    if (state.pointerNear === near) return;
    state.pointerNear = near;
    syncOpen();
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { armed = false; setNear(false); }, CLOSE_DELAY_MS);
  }
  // 帯の厚さはモードと位置に追従する（上下は 28px・slim は細い帯ぶんだけ）。
  function bandPx() {
    if (state.mode === 'slim') return horizontal() ? 16 : 20;
    return horizontal() ? 28 : 44;
  }

  // グリップを掴んで画面の辺へドラッグすると、レールの位置をその辺へ切り替える。
  // 畳んだ帯はクリックスルーなので掴めず、展開中のグリップから始める。
  const DOCK_ZONE_PX = 80;
  let dockDragging = false;
  let dockTarget = null;
  function dockZoneAt(event) {
    const dist = {
      left: event.clientX,
      right: window.innerWidth - event.clientX,
      top: event.clientY,
      bottom: window.innerHeight - event.clientY
    };
    let best = null;
    let bestD = DOCK_ZONE_PX;
    for (const pos of ['left', 'right', 'top', 'bottom']) {
      if (dist[pos] < bestD) { bestD = dist[pos]; best = pos; }
    }
    return best;
  }
  // グリップ上のクリックでは位置を変えないよう、6px 以上動いたときだけ
  // ドックドラッグ（ゾーン表示・吸着判定）を開始する
  const DOCK_START_PX = 6;
  let dockStart = null;
  function dockMove(event) {
    if (dockStart) {
      const dx = event.clientX - dockStart.x;
      const dy = event.clientY - dockStart.y;
      if (dx * dx + dy * dy < DOCK_START_PX * DOCK_START_PX) return;
      dockStart = null;
      rail.classList.add('is-dock-dragging');
      for (const z of zones) z.hidden = false;
    }
    dockTarget = dockZoneAt(event);
    for (const z of zones) {
      z.classList.toggle('z-on', z.classList.contains(`z-${dockTarget}`));
    }
  }
  function dockEnd(event) {
    dockDragging = false;
    dockMove(event);
    dockStart = null;
    rail.classList.remove('is-dock-dragging');
    for (const z of zones) { z.hidden = true; z.classList.remove('z-on'); }
    document.removeEventListener('pointermove', dockMove, true);
    document.removeEventListener('pointerup', dockEnd, true);
    document.removeEventListener('pointercancel', dockEnd, true);
    if (dockTarget) {
      state.positionTouched = true;
      setPosition(dockTarget);
      dockTarget = null;
    }
  }
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dockDragging = true;
    dockTarget = null;
    dockStart = { x: event.clientX, y: event.clientY };
    document.addEventListener('pointermove', dockMove, true);
    document.addEventListener('pointerup', dockEnd, true);
    document.addEventListener('pointercancel', dockEnd, true);
  });

  document.addEventListener('mousemove', (event) => {
    if (dockDragging) { clearTimeout(closeTimer); return; }
    const dist = edgeDist(event);
    if (state.pointerNear) {
      if (dist > openExtent()) scheduleClose(); else clearTimeout(closeTimer);
      return;
    }
    // 上下位置は端タッチも滞留も開かない（帯の下のページ UI を狙う移動・フリックの
    // オーバーシュートと衝突するため）。開閉は中央ツマミのクリックのみ。
    if (!horizontal() && dist <= EDGE_ARM_PX) {
      armed = true;
      clearTimeout(dwellTimer);
      setNear(true);
      return;
    }
    if (!horizontal() && dist <= bandPx() && !armed) {
      clearTimeout(dwellTimer);
      dwellTimer = setTimeout(() => { armed = true; setNear(true); }, DWELL_MS);
      return;
    }
    clearTimeout(dwellTimer);
  }, { passive: true });
  notch.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.pointerNear) { armed = false; setNear(false); }
    else { armed = true; setNear(true); }
  });
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
    placeMenu(anchor);
    menu.querySelector('button')?.focus();
  }

  // メニューはレールがある辺の内側へ開く
  function placeMenu(anchor) {
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left;
    let top;
    if (state.position === 'left') { left = anchor.x + 4; top = anchor.y; }
    else if (state.position === 'top') { left = anchor.x - mw / 2; top = anchor.y + 4; }
    else if (state.position === 'bottom') { left = anchor.x - mw / 2; top = anchor.y - mh - 4; }
    else { left = anchor.x - mw - 4; top = anchor.y; }
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - mw - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - mh - 8))}px`;
  }

  // レールの行以外（余白・＋ボタン等）での右クリック用。表示モード・位置のセッション切替。
  function openModeMenu(anchor) {
    closeMenu();
    const item = (label, current, fn) => {
      const b = el('button', 'menu-item', (current ? '✓ ' : '　') + label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { fn(); closeMenu(); });
      menu.appendChild(b);
    };
    for (const [label, mode] of [
      ['半透明のアイコン列（既定）', 'translucent'],
      ['細い帯（20px）', 'slim'],
      ['近接まで隠す', 'hidden']
    ]) {
      item(label, mode === state.mode, () => {
        state.modeTouched = true;
        setMode(mode);
      });
    }
    menu.appendChild(el('div', 'menu-sep'));
    for (const [label, pos] of [['右（既定）', 'right'], ['左', 'left'], ['上', 'top'], ['下', 'bottom']]) {
      item(`位置: ${label}`, pos === state.position, () => {
        state.positionTouched = true;
        setPosition(pos);
      });
    }
    menu.appendChild(el('div', 'menu-sep'));
    menu.appendChild(el('div', 'menu-note', 'このページだけの切替です。既定・サイト別は rail-config.js'));
    menu.hidden = false;
    syncOpen();
    placeMenu(anchor);
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
      event.stopPropagation();
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
    // 横帯（top/bottom）は畳み・展開どちらも横並びなので左右の半分で判定する
    const afterMid = (event) => {
      const b = r.getBoundingClientRect();
      if (horizontal()) return event.clientX >= b.left + b.width / 2;
      return event.clientY >= b.top + b.height / 2;
    };
    r.addEventListener('dragover', (event) => {
      const srcTab = state.tabs.find(t => t.id === state.draggedTabId);
      if (!srcTab || srcTab.id === tab.id || srcTab.groupId !== tab.groupId || srcTab.pinned !== tab.pinned) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const after = afterMid(event);
      r.classList.toggle('drop-before', !after);
      r.classList.toggle('drop-after', after);
    });
    r.addEventListener('dragleave', () => r.classList.remove('drop-before', 'drop-after'));
    r.addEventListener('drop', (event) => {
      const srcTab = state.tabs.find(t => t.id === state.draggedTabId);
      r.classList.remove('drop-before', 'drop-after');
      if (!srcTab || srcTab.id === tab.id || srcTab.groupId !== tab.groupId || srcTab.pinned !== tab.pinned) return;
      event.preventDefault();
      const after = afterMid(event);
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
    if (!menu.hidden && Number.isInteger(state.menuTabId) && !state.tabs.some(t => t.id === state.menuTabId)) closeMenu();
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
  // ホスト名に一致する上書きを最長一致で返す（サブドメインは親ドメインの設定に従う）
  function hostOverride(overrides) {
    const host = location.hostname || '';
    let best = null;
    for (const key of Object.keys(overrides)) {
      if (host === key || host.endsWith('.' + key)) {
        if (!best || key.length > best.length) best = key;
      }
    }
    return best ? overrides[best] : null;
  }
  function accept(data) {
    state.tabs = data.tabs || [];
    state.groups = new Map((data.groups || []).map(g => [g.id, g]));
    if (typeof data.mode === 'string') state.defaultMode = data.mode;
    if (typeof data.position === 'string') state.defaultPosition = data.position;
    if (data.overrides && typeof data.overrides === 'object') {
      const ov = hostOverride(data.overrides);
      if (ov) {
        if (typeof ov.collapsedMode === 'string') state.defaultMode = ov.collapsedMode;
        if (typeof ov.position === 'string') state.defaultPosition = ov.position;
      }
    }
    if (!state.modeTouched) setMode(state.defaultMode);
    if (!state.positionTouched) setPosition(state.defaultPosition);
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
  rail.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openModeMenu({ x: event.clientX, y: event.clientY });
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'rail-tabs' && Array.isArray(msg.tabs)) accept(msg);
  });
  chrome.runtime.sendMessage({ type: 'rail-init' }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;
    accept(resp);
  });
})();
