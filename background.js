'use strict';

// レールの畳み表示モードの既定値（同梱の rail-config.js から読む。無ければ半透明）。
let COLLAPSED_MODE = 'translucent';
try {
  importScripts('rail-config.js');
  if (typeof RAIL_CONFIG === 'object' && RAIL_CONFIG && typeof RAIL_CONFIG.collapsedMode === 'string') {
    COLLAPSED_MODE = RAIL_CONFIG.collapsedMode;
  }
} catch (_) { /* rail-config.js が無い環境では既定値のまま */ }

// 右側か左側かはユーザーのChrome設定に従う。
// データ送信、アクセスログ、外部サービスとの通信は一切実装していない。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('サイドパネルの初期化に失敗:', error));

// 右端レール(content scriptの rail.js)へのタブ情報の配信と、操作の中継。
// content script からは chrome.tabs API を直接使えないため、
// 一覧はここで作って送り、操作は送り元と同じウィンドウのタブに限って受理する。

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
    tabs: tabs.sort((a, b) => a.index - b.index).map(t => ({
      id: t.id, index: t.index, title: t.title || '', url: t.url || '', active: !!t.active,
      pinned: !!t.pinned, groupId: t.groupId, audible: !!t.audible,
      muted: !!(t.mutedInfo && t.mutedInfo.muted)
    })),
    groups: groups.map(g => ({ id: g.id, title: g.title || '', color: g.color || 'grey' }))
  };
}

async function pushToWindow(windowId) {
  const data = await snapshot(windowId);
  await Promise.all(data.tabs.map(t =>
    chrome.tabs.sendMessage(t.id, data).catch(() => {})
  ));
}

chrome.tabs.onCreated.addListener(tab => schedulePush(tab.windowId));
chrome.tabs.onRemoved.addListener((id, info) => schedulePush(info.windowId));
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
  const win = sender && sender.tab && sender.tab.windowId;
  if (!Number.isInteger(win) || !msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'rail-init') {
    snapshot(win).then(respond).catch(() => respond(null));
    return true;
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
      await chrome.tabGroups.update(groupId, { title: '新しいグループ', color: 'blue' });
    }
  } catch (error) {
    console.error('Right Tabs rail:', error);
  }
}
