'use strict';

// セキュリティ設計:
// - fetch / XMLHttpRequest / WebSocket / sendBeacon / 解析SDK / CDN を使用しない。
// - ウェブページにスクリプトを注入しない。
// - タブタイトルとURLはChrome APIから取得し、表示・検索にのみ使用する。
// - ユーザーが開いたサイトのfaviconはChrome内蔵favicon APIのローカルURLだけで描画。
// - タブタイトル・URLをinnerHTMLに書き込まず、常にtextContentを使う。

const list = document.getElementById('tabList');
const search = document.getElementById('tabSearch');
const count = document.getElementById('tabCount');
const menu = document.getElementById('menu');
const toast = document.getElementById('toast');
document.getElementById('appVersion').textContent = `v${chrome.runtime.getManifest().version}`;
const NONE = chrome.tabGroups.TAB_GROUP_ID_NONE;
const COLORS = {
  grey: '#9198a6', blue: '#63a5f7', red: '#f07474', yellow: '#e6bd60',
  green: '#65c998', pink: '#e48fca', purple: '#ac91e7', cyan: '#6ccfd9', orange: '#eda56c'
};
const state = {
  windowId: null, tabs: [], groups: new Map(), renderPending: false, draggedTabId: null, toastTimer: null,
  pointerHeldAt: 0, renderDeferred: false, menuTabId: null, lastActiveId: null
};

function node(tag, cls, content) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (content !== undefined) el.textContent = String(content);
  return el;
}
function onError(error) {
  console.error('Many Tabs:', error);
  toast.textContent = error?.message || '操作に失敗しました。';
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function action(task) {
  Promise.resolve().then(task).catch(onError);
}
// 押している最中やドラッグ中に一覧を作り直すと、クリックやドロップが行き先を失う。
// 操作が終わるまで作り直しを待たせる。押しっぱなしの判定は10秒で切る
// （離した合図を取りこぼしても、一覧が止まったままにならないようにするため）。
function interacting() {
  const held = state.pointerHeldAt > 0 && Date.now() - state.pointerHeldAt < 10000;
  return held || Number.isInteger(state.draggedTabId);
}
function flushDeferredRender() {
  if (state.renderDeferred && !interacting()) render();
}
function releasePointer() {
  if (state.pointerHeldAt === 0) return;
  state.pointerHeldAt = 0;
  // clickはpointerupのすぐ後に届く。届いてから作り直す。
  setTimeout(flushDeferredRender, 0);
}
function domainFromUrl(url) {
  if (!url) return '新しいタブ';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname;
    if (u.protocol === 'file:') return 'ローカルファイル';
    return u.protocol.replace(':', '');
  } catch { return 'ページ'; }
}
function faviconUrl(url) {
  if (!url) return null;
  try {
    const page = new URL(url);
    if (page.protocol !== 'http:' && page.protocol !== 'https:') return null;
    const icon = new URL(chrome.runtime.getURL('/_favicon/'));
    icon.searchParams.set('pageUrl', page.href);
    icon.searchParams.set('size', '32');
    return icon.href;
  } catch { return null; }
}
function scheduleRender() {
  if (state.renderPending) return;
  state.renderPending = true;
  setTimeout(() => {
    state.renderPending = false;
    action(loadTabs);
  }, 80);
}
async function loadTabs() {
  if (state.windowId === null) {
    const w = await chrome.windows.getCurrent();
    if (!Number.isInteger(w.id)) throw new Error('Chromeウィンドウを確認できません。');
    state.windowId = w.id;
  }
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId: state.windowId }),
    chrome.tabGroups.query({ windowId: state.windowId })
  ]);
  state.tabs = tabs.sort((a, b) => a.index - b.index);
  state.groups = new Map(groups.map(g => [g.id, g]));
  render();
}
function sectionLabel(text, number) {
  const label = node('div', 'section-label');
  label.append(node('span', null, text), node('span', 'section-count', number));
  return label;
}
function groupHeader(group, matchingCount, totalCount) {
  const head = node('button', 'group-header' + (group.collapsed ? ' is-collapsed' : ''));
  head.type = 'button';
  head.setAttribute('aria-expanded', String(!group.collapsed));
  head.title = 'クリックでグループを開閉';
  head.append(node('span', 'chevron', '▾'));
  const color = node('span', 'group-color');
  color.style.setProperty('--group-color', COLORS[group.color] || COLORS.grey);
  head.append(color, node('span', 'group-title', group.title || '名前のないグループ'));
  head.append(node('span', 'group-count', matchingCount === totalCount ? totalCount : `${matchingCount}/${totalCount}`));
  head.addEventListener('click', () => action(async () => {
    await chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
    scheduleRender();
  }));
  head.addEventListener('dragover', (e) => {
    if (!Number.isInteger(state.draggedTabId)) return;
    const src = state.tabs.find(t => t.id === state.draggedTabId);
    if (!src || src.pinned || src.groupId === group.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  head.addEventListener('drop', (e) => {
    const id = state.draggedTabId;
    if (!Number.isInteger(id)) return;
    const src = state.tabs.find(t => t.id === id);
    if (!src || src.pinned || src.groupId === group.id) return;
    e.preventDefault();
    action(async () => {
      await chrome.tabs.group({ tabIds: [id], groupId: group.id });
      scheduleRender();
    });
  });
  return head;
}
function tabRow(tab) {
  const row = node('div', 'tab-row' + (tab.active ? ' is-active' : ''));
  row.dataset.tabId = String(tab.id);
  row.draggable = true;
  row.title = tab.title || '名称なし';
  const main = node('button', 'tab-main');
  main.type = 'button';
  main.title = tab.title || '名称なし';
  main.setAttribute('aria-label', `タブに切り替え: ${tab.title || '名称なし'}`);
  const iconUrl = faviconUrl(tab.url);
  if (iconUrl) {
    const img = node('img', 'tab-favicon');
    img.alt = '';
    img.loading = 'lazy';
    img.src = iconUrl;
    img.addEventListener('error', () => img.replaceWith(node('span', 'tab-fallback', '◇')),
      { once: true });
    main.append(img);
  } else {
    main.append(node('span', 'tab-fallback', '◇'));
  }
  const textWrap = node('span', 'tab-text');
  textWrap.append(node('span', 'tab-title', tab.title || (tab.url ? '読み込み中…' : '新しいタブ')));
  textWrap.append(node('span', 'tab-domain', domainFromUrl(tab.url)));
  main.append(textWrap);
  main.addEventListener('click', () => action(() => chrome.tabs.update(tab.id, { active: true })));
  row.append(main);

  const extra = node('div', 'tab-extra');
  if (tab.pinned) {
    const pin = node('span', 'tab-indicator', '●');
    pin.title = '固定済み';
    extra.append(pin);
  }
  if (tab.audible || tab.mutedInfo?.muted) {
    const audible = node('span', 'tab-indicator muted', tab.mutedInfo?.muted ? '♪̸' : '♪');
    audible.title = tab.mutedInfo?.muted ? 'ミュート中' : '音声再生中';
    extra.append(audible);
  }
  const more = node('button', 'tab-mini', '⋯');
  more.type = 'button';
  more.setAttribute('aria-label', `「${tab.title || 'タブ'}」の操作メニュー`);
  more.title = '操作メニュー';
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(tab, more.getBoundingClientRect());
  });
  const close = node('button', 'tab-mini', '×');
  close.type = 'button';
  close.setAttribute('aria-label', `「${tab.title || 'タブ'}」を閉じる`);
  close.title = 'タブを閉じる';
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    action(() => chrome.tabs.remove(tab.id));
  });
  extra.append(more, close);
  row.append(extra);
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openMenu(tab, { left: event.clientX, bottom: event.clientY, top: event.clientY });
  });

  row.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return;
    state.draggedTabId = tab.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(tab.id));
    row.classList.add('is-dragging');
    closeMenu();
  });
  row.addEventListener('dragend', () => {
    state.draggedTabId = null;
    document.querySelectorAll('.drop-before,.drop-after,.is-dragging').forEach(el => {
      el.classList.remove('drop-before', 'drop-after', 'is-dragging');
    });
    setTimeout(flushDeferredRender, 0);
  });
  row.addEventListener('dragover', (event) => {
    const src = state.tabs.find(t => t.id === state.draggedTabId);
    if (!src || src.id === tab.id || src.groupId !== tab.groupId || src.pinned !== tab.pinned) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const after = event.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2;
    row.classList.toggle('drop-before', !after);
    row.classList.toggle('drop-after', after);
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
  row.addEventListener('drop', (event) => {
    const src = state.tabs.find(t => t.id === state.draggedTabId);
    row.classList.remove('drop-before', 'drop-after');
    if (!src || src.id === tab.id || src.groupId !== tab.groupId || src.pinned !== tab.pinned) return;
    event.preventDefault();
    const after = event.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2;
    // chrome.tabs.moveのindexは移動後の位置を指定する。
    const index = tab.index - (src.index < tab.index ? 1 : 0) + (after ? 1 : 0);
    action(async () => {
      await chrome.tabs.move(src.id, { index });
      scheduleRender();
    });
  });
  return row;
}
function appendTabRows(container, tabs) {
  const filter = search.value.trim().toLocaleLowerCase();
  for (const tab of tabs) {
    if (!filter || `${tab.title || ''}\n${tab.url || ''}`.toLocaleLowerCase().includes(filter)) {
      container.append(tabRow(tab));
    }
  }
}
function render() {
  if (interacting()) { state.renderDeferred = true; return; }
  state.renderDeferred = false;
  // メニューは、対象のタブが無くなったときだけ閉じる（ほかのタブの表示が変わっただけでは閉じない）。
  if (!menu.hidden && !state.tabs.some(t => t.id === state.menuTabId)) closeMenu();
  const filter = search.value.trim().toLocaleLowerCase();
  const matching = tab => !filter || `${tab.title || ''}\n${tab.url || ''}`.toLocaleLowerCase().includes(filter);
  const matches = state.tabs.filter(matching);
  count.textContent = filter ? `検索結果 ${matches.length} 件 / 全 ${state.tabs.length} 件` : `${state.tabs.length} 個のタブ`;
  const out = document.createDocumentFragment();
  if (matches.length === 0) {
    out.append(node('div', 'empty-state', filter ? '一致するタブがありません。\n検索語を変えてみてください。' : 'タブがありません。\n＋から新しいタブを開けます。'));
    list.replaceChildren(out);
    return;
  }
  const pinned = state.tabs.filter(t => t.pinned && matching(t));
  if (pinned.length) {
    out.append(sectionLabel('固定したタブ', pinned.length));
    appendTabRows(out, pinned);
  }
  const normal = state.tabs.filter(t => !t.pinned);
  const hasNormalMatches = normal.some(matching);
  if (hasNormalMatches) out.append(sectionLabel('タブ', normal.filter(matching).length));
  const seen = new Set();
  for (const tab of normal) {
    if (tab.groupId === NONE) {
      if (matching(tab)) out.append(tabRow(tab));
      continue;
    }
    if (seen.has(tab.groupId)) continue;
    seen.add(tab.groupId);
    const groupTabs = normal.filter(t => t.groupId === tab.groupId);
    const filtered = groupTabs.filter(matching);
    if (filtered.length === 0) continue;
    const group = state.groups.get(tab.groupId);
    if (!group) {
      appendTabRows(out, filtered);
      continue;
    }
    out.append(groupHeader(group, filtered.length, groupTabs.length));
    if (!group.collapsed || filter) appendTabRows(out, filtered);
  }
  list.replaceChildren(out);
  // 表示中のタブが替わったときだけ、その行が見える位置まで一覧を動かす。
  const activeId = state.tabs.find(t => t.active)?.id ?? null;
  if (activeId !== state.lastActiveId) {
    state.lastActiveId = activeId;
    list.querySelector('.tab-row.is-active')?.scrollIntoView({ block: 'nearest' });
  }
}
function closeMenu() {
  menu.hidden = true;
  menu.replaceChildren();
  state.menuTabId = null;
}
function openMenu(tab, anchor) {
  closeMenu();
  state.menuTabId = tab.id;
  function addMenuItem(label, callback, danger = false) {
    const b = node('button', danger ? 'danger' : '', label);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => {
      closeMenu();
      action(async () => { await callback(); scheduleRender(); });
    });
    menu.append(b);
  }
  addMenuItem(tab.pinned ? '固定を解除' : 'タブを固定', () => chrome.tabs.update(tab.id, { pinned: !tab.pinned }));
  addMenuItem(tab.mutedInfo?.muted ? 'ミュート解除' : 'タブをミュート', () => chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted }));
  addMenuItem('タブを複製', () => chrome.tabs.duplicate(tab.id));
  if (!tab.pinned) {
    if (tab.groupId !== NONE) {
      addMenuItem('グループから外す', () => chrome.tabs.ungroup([tab.id]));
    }
    addMenuItem('新しいグループを作る', async () => {
      const id = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: state.windowId } });
      await chrome.tabGroups.update(id, { title: '新しいグループ', color: 'blue' });
    });
    const otherGroups = Array.from(state.groups.values()).filter(g => g.id !== tab.groupId);
    if (otherGroups.length) {
      menu.append(node('div', 'menu-separator'));
      for (const g of otherGroups) {
        addMenuItem(`「${g.title || '名前なし'}」に移動`, () => chrome.tabs.group({ tabIds: [tab.id], groupId: g.id }));
      }
    }
  }
  menu.append(node('div', 'menu-separator'));
  addMenuItem('タブを閉じる', () => chrome.tabs.remove(tab.id), true);
  menu.hidden = false;
  const width = menu.getBoundingClientRect().width;
  const height = menu.getBoundingClientRect().height;
  menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  const preferred = anchor.bottom + 4;
  menu.style.top = `${Math.max(8, Math.min(preferred, window.innerHeight - height - 8))}px`;
  menu.querySelector('button')?.focus();
}

search.addEventListener('input', render);
document.getElementById('newTabButton').addEventListener('click', () => {
  action(() => chrome.tabs.create({ windowId: state.windowId, active: true }));
});
document.getElementById('refreshButton').addEventListener('click', () => action(loadTabs));
document.addEventListener('keydown', (event) => {
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); search.focus();
  }
  if (event.key === 'Escape') {
    if (!menu.hidden) { closeMenu(); }
    else if (document.activeElement === search) { search.value = ''; render(); search.blur(); }
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!menu.hidden && !menu.contains(event.target)) closeMenu();
});
document.addEventListener('pointerdown', () => { state.pointerHeldAt = Date.now(); }, true);
document.addEventListener('pointerup', releasePointer, true);
document.addEventListener('pointercancel', releasePointer, true);
window.addEventListener('blur', releasePointer);
chrome.tabs.onCreated.addListener(scheduleRender);
chrome.tabs.onRemoved.addListener((id, info) => { if (info.windowId === state.windowId) scheduleRender(); });
chrome.tabs.onUpdated.addListener((id, changes, tab) => { if (tab.windowId === state.windowId) scheduleRender(); });
chrome.tabs.onMoved.addListener((id, info) => { if (info.windowId === state.windowId) scheduleRender(); });
chrome.tabs.onAttached.addListener((id, info) => { if (info.newWindowId === state.windowId) scheduleRender(); });
chrome.tabs.onDetached.addListener((id, info) => { if (info.oldWindowId === state.windowId) scheduleRender(); });
chrome.tabs.onActivated.addListener((info) => { if (info.windowId === state.windowId) scheduleRender(); });
chrome.tabs.onReplaced.addListener(scheduleRender);
chrome.tabGroups.onCreated.addListener(scheduleRender);
chrome.tabGroups.onUpdated.addListener(scheduleRender);
chrome.tabGroups.onRemoved.addListener(scheduleRender);
chrome.tabGroups.onMoved.addListener(scheduleRender);
action(loadTabs);
