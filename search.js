'use strict';
// レールの検索欄（rail.js が iframe として埋め込む拡張のページ）。
// ページの中に入力欄を置くと、打った文字がページのスクリプトの keydown / input の
// capture リスナから見える（closed Shadow DOM でも防げない）。そこで検索欄だけを
// 拡張のページに分け、打った語は拡張の API の接続（chrome.tabs.connect）で、
// 同じタブのレール（トップフレームの content script）へだけ送る。

(() => {
  const input = document.querySelector('.search');
  let port = null;

  function post(message) {
    if (!port) return;
    try { port.postMessage(message); } catch (_) { port = null; }
  }

  chrome.tabs.getCurrent().then((tab) => {
    if (!tab || !Number.isInteger(tab.id)) return;
    port = chrome.tabs.connect(tab.id, { frameId: 0, name: 'many-tabs-search' });
    port.onDisconnect.addListener(() => { port = null; });
    // レールから届くもの: 文言（言語切替の結果を含む）・作り直す前に打っていた語・フォーカス
    port.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'labels') {
        if (typeof message.placeholder === 'string') {
          searchPlaceholder = message.placeholder;
          if (!tagMode) {
            input.placeholder = message.placeholder;
            input.setAttribute('aria-label', message.placeholder);
          }
        }
        if (typeof message.lang === 'string') document.documentElement.lang = message.lang;
        if (typeof message.q === 'string' && input.value === '' && !tagMode) input.value = message.q;
      }
      // タグの入力モード（レールの「タグを付ける…」）。検索語は退避しておき、終わったら戻す
      if (message.type === 'tag-edit' && typeof message.value === 'string') {
        if (!tagMode) savedQuery = input.value;
        tagMode = true;
        input.value = message.value;
        if (typeof message.placeholder === 'string') input.placeholder = message.placeholder;
        if (typeof message.label === 'string') input.setAttribute('aria-label', message.label);
        input.focus();
        input.select();
      }
      if (message.type === 'tag-end') leaveTagMode();
      if (message.type === 'focus') input.focus();
    });
  }).catch(() => { /* タブの外（拡張の更新直後など）では何もしない */ });

  let tagMode = false;
  let savedQuery = '';
  let searchPlaceholder = input.placeholder;
  function leaveTagMode() {
    if (!tagMode) return;
    tagMode = false;
    input.value = savedQuery;
    input.placeholder = searchPlaceholder;
    input.setAttribute('aria-label', searchPlaceholder);
  }

  input.addEventListener('input', () => { if (!tagMode) post({ type: 'input', q: input.value }); });
  input.addEventListener('keydown', (event) => {
    if (tagMode) {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        const value = input.value;
        leaveTagMode();
        post({ type: 'tag-commit', value });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        leaveTagMode();
        post({ type: 'tag-cancel' });
      }
      return;
    }
    if (event.key !== 'Escape') return;
    input.value = '';
    // 検索を解いて、フォーカスをページへ返す（返すのはレール側。iframe からは親を触れない）
    post({ type: 'input', q: '', escape: true });
  });
  // タグの入力中にほかを押した（フォーカスが外れた）ら取りやめる
  input.addEventListener('blur', () => {
    if (!tagMode) return;
    leaveTagMode();
    post({ type: 'tag-cancel' });
  });
  // レールが iframe にフォーカスを移したとき（'/' キー）は入力欄へ渡す
  window.addEventListener('focus', () => input.focus());
  if (document.hasFocus()) input.focus();
})();
