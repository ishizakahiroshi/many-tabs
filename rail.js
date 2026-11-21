'use strict';
// ページ右端に最小表示のタブレールを描画する content script。
// - ページの DOM は読み取らず・変更もしない。追加するのは自前の overlay 要素だけ
// - closed Shadow DOM でページの CSS・JS から隔離する
// - タブ情報と操作はすべて background.js 経由
//   （content script からは chrome.tabs API を直接使えない）

(() => {
  const HOST_ID = 'right-tabs-local-rail';
  if (document.getElementById(HOST_ID)) return;

  const COLORS = {
    grey: '#9198a6', blue: '#63a5f7', red: '#f07474', yellow: '#e6bd60',
    green: '#65c998', pink: '#e48fca', purple: '#ac91e7', cyan: '#6ccfd9', orange: '#eda56c'
  };

  const CSS = `
    .rail{position:absolute;top:0;right:0;height:100%;width:44px;box-sizing:border-box;
      display:flex;flex-direction:column;background:rgba(14,18,27,.96);
      border-left:1px solid #313b4d;color:#e8edf6;
      font:13px system-ui,-apple-system,"Segoe UI",sans-serif;
      transition:width .15s ease;pointer-events:auto}
    .rail:hover{width:236px}
    .list{flex:1;min-height:0;overflow-y:auto;padding:4px 0 8px;scrollbar-width:thin}
    .row{display:flex;align-items:center;height:30px;position:relative}
    .row:hover{background:#242e3e}
    .row.is-active{background:#233553}
    .row.is-active::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#548cf8}
    .main{display:flex;align-items:center;gap:6px;min-width:0;flex:1;height:100%;
      padding:0 2px 0 8px;border:0;background:none;color:inherit;cursor:pointer;text-align:left}
    .fav{width:16px;height:16px;flex:0 0 auto;object-fit:contain}
    .fav-fb{width:16px;height:16px;flex:0 0 auto;display:grid;place-items:center;color:#8995a9;font-size:14px}
    .gdot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
    .title{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
      font-size:12px;line-height:1.2}
    .is-active .title{font-weight:650;color:#fff}
    .ind{flex:0 0 auto;color:#8995a9;font-size:11px;padding:0 2px}
    .close{flex:0 0 auto;width:20px;height:24px;display:grid;place-items:center;border:0;
      background:none;color:#8995a9;font-size:14px;cursor:pointer;opacity:0;border-radius:5px}
    .rail:hover .close{opacity:1}
    .close:hover{background:rgba(255,255,255,.12);color:#fff}
    .new-tab{flex:0 0 auto;height:30px;border:0;border-top:1px solid #313b4d;
      background:#171d29;color:#e8edf6;font-size:16px;cursor:pointer}
    .new-tab:hover{background:#242e3e}
    .sep{height:1px;background:#313b4d;margin:5px 8px}
    @media (prefers-color-scheme: light){
      .rail{background:rgba(246,248,252,.97);border-left-color:#d1d9e5;color:#202939}
      .row:hover{background:#e2eaf5}
      .row.is-active{background:#dbe9ff}
      .is-active .title{color:#12325f}
      .fav-fb,.ind,.close{color:#6b778b}
      .close:hover{background:rgba(0,0,0,.08);color:#202939}
      .new-tab{background:#fff;border-top-color:#d1d9e5;color:#202939}
      .new-tab:hover{background:#e2eaf5}
      .sep{background:#d1d9e5}
    }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0;background:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  const rail = document.createElement('div');
  rail.className = 'rail';
  const list = document.createElement('div');
  list.className = 'list';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'new-tab';
  add.title = '新しいタブ';
  add.textContent = '＋';
  add.addEventListener('click', () => send({ type: 'rail-new' }));
  rail.append(list, add);
  shadow.appendChild(rail);
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
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function row(tab, groups) {
    const r = el('div', 'row' + (tab.active ? ' is-active' : ''));
    r.title = tab.title || '名称なし';
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
    const g = groups.get(tab.groupId);
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
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.title = 'タブを閉じる';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      send({ type: 'rail-close', tabId: tab.id });
    });
    r.appendChild(close);
    return r;
  }
  function render(data) {
    const groups = new Map((data.groups || []).map(g => [g.id, g]));
    const frag = document.createDocumentFragment();
    const pinned = data.tabs.filter(t => t.pinned);
    const normal = data.tabs.filter(t => !t.pinned);
    for (const t of pinned) frag.appendChild(row(t, groups));
    if (pinned.length && normal.length) frag.appendChild(el('div', 'sep'));
    for (const t of normal) frag.appendChild(row(t, groups));
    list.replaceChildren(frag);
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'rail-tabs' && Array.isArray(msg.tabs)) render(msg);
  });
  chrome.runtime.sendMessage({ type: 'rail-init' }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;
    render(resp);
  });
})();
