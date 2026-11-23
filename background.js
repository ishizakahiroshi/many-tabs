'use strict';

// レールの畳み表示モード・位置の既定値（同梱の rail-config.js から読む。無ければ半透明・右）。
let COLLAPSED_MODE = 'translucent';
let POSITION = 'right';
let AUTO_EXPAND = false;
let OVERRIDES = {};
try {
  importScripts('rail-config.js');
  if (typeof RAIL_CONFIG === 'object' && RAIL_CONFIG) {
    if (typeof RAIL_CONFIG.collapsedMode === 'string') COLLAPSED_MODE = RAIL_CONFIG.collapsedMode;
    if (typeof RAIL_CONFIG.position === 'string') POSITION = RAIL_CONFIG.position;
    if (typeof RAIL_CONFIG.autoExpand === 'boolean') AUTO_EXPAND = RAIL_CONFIG.autoExpand;
    if (RAIL_CONFIG.overrides && typeof RAIL_CONFIG.overrides === 'object') {
      OVERRIDES = RAIL_CONFIG.overrides;
    }
  }
} catch (_) { /* rail-config.js が無い環境では既定値のまま */ }

// 言語切替用の実行時カタログ（i18n/<code>.js・_locales のミラー。言語追加は両方を対で足す）。
// 無くてもブラウザの言語（chrome.i18n）だけで動く
try {
  importScripts('i18n/ja.js', 'i18n/en.js');
} catch (_) { /* カタログが無い環境ではブラウザ言語のまま */ }

// 右側か左側かはユーザーのChrome設定に従う。
// データ送信、アクセスログ、外部サービスとの通信は一切実装していない。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    // "No SW" は SW 停止と競合して起きる Chrome 側の既知の問題（crbug 341232995）。
    // この設定は永続で次の SW 起動時に再実行されるため、握りつぶしても実害はない
    if (error && error.message === 'No SW') return;
    console.error('サイドパネルの初期化に失敗:', error);
  });

// 右端レール(content scriptの rail.js)へのタブ情報の配信と、操作の中継。
// content script からは chrome.tabs API を直接使えないため、
// 一覧はここで作って送り、操作は送り元と同じウィンドウのタブに限って受理する。

// タブごとのレール表示モード（メモリのみ・永続化しない）。
// ページ内で切り替えたモードを同じタブの画面遷移をまたいで保持する。
const railPrefs = new Map();
// 位置はタブをまたぐと戻って見えるため、セッション全体の既定として共有する
// （どこかで切り替えたら全タブへ即時反映・再起動で消える）
let SESSION_POSITION = null;
// 自動展開の ON/OFF も同じくセッション全体で共有する
let SESSION_AUTO_EXPAND = null;
// 範囲（帯が存在する辺上の区間 {a,b}・null=全幅）も同じくセッション全体で共有する
let SESSION_SPAN = null;
// 浮き配置（帯の中心 {x,y}・null=辺に吸着）も同じくセッション全体で共有する
let SESSION_FREE = null;
// 言語切替も同じくセッション全体で共有する（null = ブラウザの言語に従う・永続化しない）
let SESSION_LANG = null;

// messages.json と同じ形のカタログから文言を引く（$name$ プレースホルダも同じ規則で置換）
function catalogFor(lang) {
  return (typeof MANY_TABS_MSGS === 'object' && MANY_TABS_MSGS && lang)
    ? (MANY_TABS_MSGS[lang] || null) : null;
}
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
  const s = catalogText(catalogFor(SESSION_LANG), key, subs);
  if (s !== null) return s;
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

// レールから届く表示モード・位置の許可リスト（rail.js の setMode / setPosition と同じ値）
const RAIL_MODES = new Set(['translucent', 'slim', 'hidden']);
const RAIL_POSITIONS = new Set(['right', 'left', 'top', 'bottom']);

// {a,b}（0<=a<b<=1）か null 以外（壊れた値）は undefined を返す
function validSpan(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return undefined;
  const { a, b } = v;
  if (typeof a !== 'number' || typeof b !== 'number' || !(a >= 0 && a < b && b <= 1)) return undefined;
  return { a, b };
}
function sameSpan(a, b) {
  if (a === null || b === null) return a === b;
  return !!a && !!b && a.a === b.a && a.b === b.b;
}
// {x,y}（0<=x,y<=1・帯の中心）か null 以外（壊れた値）は undefined を返す。o は向き（v/h）、s は帯の長さ
function validFree(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return undefined;
  const { x, y, o, s } = v;
  if (typeof x !== 'number' || typeof y !== 'number' || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return undefined;
  if (o !== undefined && o !== 'v' && o !== 'h') return undefined;
  if (s !== undefined && (typeof s !== 'number' || !(s > 0 && s <= 1))) return undefined;
  const f = { x, y, o: o === 'h' ? 'h' : 'v' };
  if (typeof s === 'number') f.s = s;
  return f;
}
function sameFree(a, b) {
  if (a === null || b === null) return a === b;
  return !!a && !!b && a.x === b.x && a.y === b.y && a.o === b.o && a.s === b.s;
}

// 位置・自動展開の変更は、開いている全タブのレールへ即時反映する
function broadcast(message) {
  chrome.tabs.query({}).then(tabs => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, message).catch(() => {});
  }).catch(() => {});
}

const PUSH_DEBOUNCE_MS = 80;
const pushTimers = new Map();
function schedulePush(windowId) {
  if (!Number.isInteger(windowId)) return;
  clearTimeout(pushTimers.get(windowId));
  pushTimers.set(windowId, setTimeout(() => {
    pushTimers.delete(windowId);
    pushToWindow(windowId).catch(() => {});
  }, PUSH_DEBOUNCE_MS));
}

async function snapshot(windowId) {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }).catch(() => [])
  ]);
  return {
    type: 'rail-tabs',
    mode: COLLAPSED_MODE,
    position: SESSION_POSITION || POSITION,
    autoExpand: SESSION_AUTO_EXPAND ?? AUTO_EXPAND,
    span: SESSION_SPAN,
    free: SESSION_FREE,
    lang: SESSION_LANG,
    msgs: catalogFor(SESSION_LANG),
    overrides: OVERRIDES,
    tabs: tabs.sort((a, b) => a.index - b.index).map(t => ({
      id: t.id, index: t.index, title: t.title || '', url: t.url || '', active: !!t.active,
      pinned: !!t.pinned, groupId: t.groupId, audible: !!t.audible,
      hasFav: !!t.favIconUrl,
      muted: !!(t.mutedInfo && t.mutedInfo.muted)
    })),
    groups: groups.map(g => ({ id: g.id, title: g.title || '', color: g.color || 'grey' }))
  };
}

// レールが「表示中」と知らせてきたタブ（メモリのみ）。一覧の配信は表示中のタブと各ウィンドウの
// アクティブタブだけにする。裏のタブへ毎回全一覧を送って描き直すと、タブ数 N に対して
// 1 回の更新が N 通 × N 行になるため。裏のタブのレールは表示されたときに rail-init で取り直す。
// アクティブタブも送り先に含めるのは、service worker の再起動でこの集合が空になっても
// 見えている画面を更新し続けるため
const visibleTabs = new Set();

async function pushToWindow(windowId) {
  const base = await snapshot(windowId);
  const targets = base.tabs.filter(t => t.active || visibleTabs.has(t.id));
  await Promise.all(targets.map(t =>
    chrome.tabs.sendMessage(t.id, { ...base, tabPref: railPrefs.get(t.id) || null }).catch(() => {})
  ));
}

chrome.tabs.onCreated.addListener(tab => schedulePush(tab.windowId));
chrome.tabs.onRemoved.addListener((id, info) => {
  railPrefs.delete(id);
  visibleTabs.delete(id);
  schedulePush(info.windowId);
});
chrome.tabs.onUpdated.addListener((id, info, tab) => schedulePush(tab.windowId));
chrome.tabs.onMoved.addListener((id, info) => schedulePush(info.windowId));
chrome.tabs.onAttached.addListener((id, info) => schedulePush(info.newWindowId));
chrome.tabs.onDetached.addListener((id, info) => schedulePush(info.oldWindowId));
chrome.tabs.onActivated.addListener(info => schedulePush(info.windowId));
chrome.tabs.onReplaced.addListener(id => {
  chrome.tabs.get(id).then(tab => schedulePush(tab.windowId)).catch(() => {});
});
chrome.tabGroups.onCreated.addListener(g => schedulePush(g.windowId));
chrome.tabGroups.onUpdated.addListener(g => schedulePush(g.windowId));
chrome.tabGroups.onRemoved.addListener(g => schedulePush(g.windowId));
chrome.tabGroups.onMoved.addListener(g => schedulePush(g.windowId));

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  // 言語の切替・問合せはサイドパネル（sender.tab が無い）からも来るので、win 判定より先に扱う
  if (msg && msg.type === 'lang-get') {
    respond({ lang: SESSION_LANG, msgs: catalogFor(SESSION_LANG) });
    return true;
  }
  if (msg && msg.type === 'rail-pref' && 'lang' in msg) {
    const lang = (typeof msg.lang === 'string' && catalogFor(msg.lang)) ? msg.lang : null;
    if ((msg.lang === null || lang !== null) && lang !== SESSION_LANG) {
      SESSION_LANG = lang;
      broadcast({ type: 'rail-pref-lang', lang, msgs: catalogFor(lang) });
    }
  }
  const win = sender && sender.tab && sender.tab.windowId;
  if (!Number.isInteger(win) || !msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'rail-hidden') {
    visibleTabs.delete(sender.tab.id);
    return false;
  }
  if (msg.type === 'rail-init') {
    if (msg.visible === true) visibleTabs.add(sender.tab.id);
    else visibleTabs.delete(sender.tab.id);
    snapshot(win).then(data => {
      data.tabPref = railPrefs.get(sender.tab.id) || null;
      respond(data);
    }).catch(() => respond(null));
    return true;
  }
  if (msg.type === 'rail-pref') {
    // モードはタブ単位、位置はセッション全体で記憶する（メモリのみ・ストレージ不使用）
    // 値は rail.js の setMode / setPosition と同じ許可リストで受け、それ以外は保存も配信もしない
    const pref = railPrefs.get(sender.tab.id) || {};
    if (RAIL_MODES.has(msg.mode)) pref.mode = msg.mode;
    railPrefs.set(sender.tab.id, pref);
    if (RAIL_POSITIONS.has(msg.position) && msg.position !== SESSION_POSITION) {
      SESSION_POSITION = msg.position;
      broadcast({ type: 'rail-pref-position', position: SESSION_POSITION });
    }
    if (typeof msg.autoExpand === 'boolean' && msg.autoExpand !== SESSION_AUTO_EXPAND) {
      SESSION_AUTO_EXPAND = msg.autoExpand;
      broadcast({ type: 'rail-pref-auto', autoExpand: SESSION_AUTO_EXPAND });
    }
    if ('span' in msg) {
      const sp = validSpan(msg.span);
      if (sp !== undefined && !sameSpan(sp, SESSION_SPAN)) {
        SESSION_SPAN = sp;
        broadcast({ type: 'rail-pref-span', span: SESSION_SPAN });
      }
    }
    if ('free' in msg) {
      const fr = validFree(msg.free);
      if (fr !== undefined && !sameFree(fr, SESSION_FREE)) {
        SESSION_FREE = fr;
        broadcast({ type: 'rail-pref-free', free: SESSION_FREE });
      }
    }
    return false;
  }
  action(msg, win);
  return false;
});

async function action(msg, win) {
  try {
    if (msg.type === 'rail-new') {
      await chrome.tabs.create({ windowId: win, active: true });
      return;
    }
    if (!Number.isInteger(msg.tabId)) return;
    const target = await chrome.tabs.get(msg.tabId);
    if (target.windowId !== win) return;
    if (msg.type === 'rail-activate') await chrome.tabs.update(msg.tabId, { active: true });
    else if (msg.type === 'rail-close') await chrome.tabs.remove(msg.tabId);
    else if (msg.type === 'rail-pin') await chrome.tabs.update(msg.tabId, { pinned: !!msg.pinned });
    else if (msg.type === 'rail-mute') await chrome.tabs.update(msg.tabId, { muted: !!msg.muted });
    else if (msg.type === 'rail-duplicate') await chrome.tabs.duplicate(msg.tabId);
    else if (msg.type === 'rail-ungroup') await chrome.tabs.ungroup([msg.tabId]);
    else if (msg.type === 'rail-move' && Number.isInteger(msg.index)) {
      await chrome.tabs.move(msg.tabId, { index: msg.index });
    } else if (msg.type === 'rail-group' && Number.isInteger(msg.groupId)) {
      const group = await chrome.tabGroups.get(msg.groupId);
      if (group.windowId === win) await chrome.tabs.group({ tabIds: [msg.tabId], groupId: msg.groupId });
    } else if (msg.type === 'rail-group-new') {
      const groupId = await chrome.tabs.group({ tabIds: [msg.tabId], createProperties: { windowId: win } });
      const gt = _t('newGroupTitle');
      await chrome.tabGroups.update(groupId, { title: gt === 'newGroupTitle' ? 'New group' : gt, color: 'blue' });
    }
  } catch (error) {
    console.error('Many Tabs rail:', error);
  }
}
