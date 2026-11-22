'use strict';

// セキュリティ設計:
// - fetch / XMLHttpRequest / WebSocket / sendBeacon / 解析SDK / CDN を使用しない。
// - ウェブページにスクリプトを注入しない。
// - タブタイトルとURLはChrome APIから取得し、表示・検索にのみ使用する。
// - ユーザーが開いたサイトのfaviconはChrome内蔵favicon APIのローカルURLだけで描画。
// - タブタイトル・URLをinnerHTMLに書き込まず、常にtextContentを使う。

// 文言は _locales/<code>/messages.json に集約（言語追加はファイル1本）。
// i18n/<code>.js は言語切替用の実行時カタログ（script タグで読む MANY_TABS_MSGS）。
// 切替はセッション全体で共有・永続化しない（再起動でブラウザの言語へ戻る）
let sessionLang = null;
function catalogText(cat, key, subs) {
  const e = cat && cat[key];
  if (!e || typeof e.message !== 'string') return null;
  // chrome.i18n と同じ規則: $name$ は大文字小文字を区別せず、$$ は $ 1 個
  const ph = {};
  if (e.placeholders) for (const name of Object.keys(e.placeholders)) ph[name.toLowerCase()] = e.placeholders[name];
  return e.message.replace(/\$\$|\$([A-Za-z0-9_@]+)\$/g, (m, name) => {
    if (name === undefined) return '$';
    const p = ph[name.toLowerCase()];
    if (!p) return m;
    const c = /^\$(\d+)$/.exec(String(p.content || ''));
    return c ? String(subs[Number(c[1]) - 1] ?? '') : String(p.content ?? '');
  });
}
function _t(key, ...subs) {
  const s = catalogText(
    sessionLang ? ((globalThis.MANY_TABS_MSGS || {})[sessionLang] || null) : null,
    key, subs);
  if (s !== null) return s;
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}
function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const m = _t(el.dataset.i18n); if (m) el.textContent = m;
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const m = _t(el.dataset.i18nPlaceholder); if (m) el.placeholder = m;
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const m = _t(el.dataset.i18nTitle); if (m) el.title = m;
  }
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
    const m = _t(el.dataset.i18nAriaLabel); if (m) el.setAttribute('aria-label', m);
  }
  document.documentElement.lang = (sessionLang || chrome.i18n.getUILanguage() || 'ja').split('-')[0];
  document.title = _t('appName');
}
function applyLang() {
  applyI18n();
  render();
}
function setLang(code, propagate = true) {
  sessionLang = code;
  applyLang();
  if (propagate) chrome.runtime.sendMessage({ type: 'rail-pref', lang: code });
}
applyI18n();
// 別の画面（レール等）で切り替え済みの言語設定を引き継ぐ
chrome.runtime.sendMessage({ type: 'lang-get' }, (resp) => {
  if (chrome.runtime.lastError || !resp) return;
  if (typeof resp.lang === 'string' || resp.lang === null) {
    sessionLang = resp.lang;
    applyLang();
  }
});

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
  toast.textContent = error?.message || _t('operationFailed');
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
  if (!url) return _t('newTab');
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname;
    if (u.protocol === 'file:') return _t('localFile');
    return u.protocol.replace(':', '');
  } catch { return _t('pageFallback'); }
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
    if (!Number.isInteger(w.id)) throw new Error(_t('windowNotFound'));
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
  head.title = _t('groupToggleHint');
  head.append(node('span', 'chevron', '▾'));
  const color = node('span', 'group-color');
  color.style.setProperty('--group-color', COLORS[group.color] || COLORS.grey);
  head.append(color, node('span', 'group-title', group.title || _t('unnamedGroup')));
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
  row.title = tab.title || _t('untitledTab');
  const main = node('button', 'tab-main');
  main.type = 'button';
  main.title = tab.title || _t('untitledTab');
  main.setAttribute('aria-label', _t('switchToTab', tab.title || _t('untitledTab')));
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
  textWrap.append(node('span', 'tab-title', tab.title || (tab.url ? _t('loading') : _t('newTab'))));
  textWrap.append(node('span', 'tab-domain', domainFromUrl(tab.url)));
  main.append(textWrap);
  main.addEventListener('click', () => action(() => chrome.tabs.update(tab.id, { active: true })));
  row.append(main);

  const extra = node('div', 'tab-extra');
  if (tab.pinned) {
    const pin = node('span', 'tab-indicator', '●');
    pin.title = _t('pinnedBadge');
    extra.append(pin);
  }
  if (tab.audible || tab.mutedInfo?.muted) {
    const audible = node('span', 'tab-indicator muted', tab.mutedInfo?.muted ? '♪̸' : '♪');
    audible.title = tab.mutedInfo?.muted ? _t('mutedBadge') : _t('audibleBadge');
    extra.append(audible);
  }
  const more = node('button', 'tab-mini', '⋯');
  more.type = 'button';
  more.setAttribute('aria-label', _t('tabMenuAria', tab.title || _t('tabWord')));
  more.title = _t('actionsMenu');
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(tab, more.getBoundingClientRect());
  });
  const close = node('button', 'tab-mini', '×');
  close.type = 'button';
  close.setAttribute('aria-label', _t('closeTabAria', tab.title || _t('tabWord')));
  close.title = _t('closeTab');
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
  if (!menu.hidden && typeof state.menuTabId === 'number' && !state.tabs.some(t => t.id === state.menuTabId)) closeMenu();
  const filter = search.value.trim().toLocaleLowerCase();
  const matching = tab => !filter || `${tab.title || ''}\n${tab.url || ''}`.toLocaleLowerCase().includes(filter);
  const matches = state.tabs.filter(matching);
  count.textContent = filter ? _t('searchResultCount', matches.length, state.tabs.length) : _t('tabCount', state.tabs.length);
  const out = document.createDocumentFragment();
  if (matches.length === 0) {
    out.append(node('div', 'empty-state', filter ? _t('noMatchingTabsHint') : _t('noTabsHint')));
    list.replaceChildren(out);
    return;
  }
  const pinned = state.tabs.filter(t => t.pinned && matching(t));
  if (pinned.length) {
    out.append(sectionLabel(_t('pinnedSection'), pinned.length));
    appendTabRows(out, pinned);
  }
  const normal = state.tabs.filter(t => !t.pinned);
  const hasNormalMatches = normal.some(matching);
  if (hasNormalMatches) out.append(sectionLabel(_t('tabsSection'), normal.filter(matching).length));
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
  addMenuItem(tab.pinned ? _t('unpinTab') : _t('pinTab'), () => chrome.tabs.update(tab.id, { pinned: !tab.pinned }));
  addMenuItem(tab.mutedInfo?.muted ? _t('unmuteTab') : _t('muteTab'), () => chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted }));
  addMenuItem(_t('duplicateTab'), () => chrome.tabs.duplicate(tab.id));
  if (!tab.pinned) {
    if (tab.groupId !== NONE) {
      addMenuItem(_t('removeFromGroup'), () => chrome.tabs.ungroup([tab.id]));
    }
    addMenuItem(_t('newGroup'), async () => {
      const id = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: state.windowId } });
      await chrome.tabGroups.update(id, { title: _t('newGroupTitle'), color: 'blue' });
    });
    const otherGroups = Array.from(state.groups.values()).filter(g => g.id !== tab.groupId);
    if (otherGroups.length) {
      menu.append(node('div', 'menu-separator'));
      for (const g of otherGroups) {
        addMenuItem(_t('moveToGroup', g.title || _t('unnamedShort')), () => chrome.tabs.group({ tabIds: [tab.id], groupId: g.id }));
      }
    }
  }
  menu.append(node('div', 'menu-separator'));
  addMenuItem(_t('closeTab'), () => chrome.tabs.remove(tab.id), true);
  menu.hidden = false;
  const width = menu.getBoundingClientRect().width;
  const height = menu.getBoundingClientRect().height;
  menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  const preferred = anchor.bottom + 4;
  menu.style.top = `${Math.max(8, Math.min(preferred, window.innerHeight - height - 8))}px`;
  menu.querySelector('button')?.focus();
}
// 言語切替メニュー（🌐ボタン）。menuTabId='lang' でタブメニューと区別する
function openLangMenu(rect) {
  closeMenu();
  state.menuTabId = 'lang';
  for (const [key, code] of [['langAuto', null], ['langJa', 'ja'], ['langEn', 'en']]) {
    const b = node('button', '', (sessionLang === code ? '✓ ' : '　') + _t('languageLabel', _t(key)));
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => {
      closeMenu();
      setLang(code);
    });
    menu.append(b);
  }
  menu.hidden = false;
  const width = menu.getBoundingClientRect().width;
  const height = menu.getBoundingClientRect().height;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`;
  menu.querySelector('button')?.focus();
}

search.addEventListener('input', render);
document.getElementById('langButton').addEventListener('click', (event) => {
  event.stopPropagation();
  const b = document.getElementById('langButton').getBoundingClientRect();
  openLangMenu({ left: b.right, bottom: b.bottom });
});
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
// レール側で切り替えられた言語へ追従する（'rail-pref' の lang 項目がそのまま届く）
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'rail-pref' && 'lang' in msg) {
    const code = (typeof msg.lang === 'string' && globalThis.MANY_TABS_MSGS && globalThis.MANY_TABS_MSGS[msg.lang])
      ? msg.lang : null;
    if ((msg.lang === null || code !== null) && code !== sessionLang) setLang(code, false);
  }
});
action(loadTabs);
