'use strict';

// 右側か左側かはユーザーのChrome設定に従う。
// データ送信、アクセスログ、外部サービスとの通信は一切実装していない。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('サイドパネルの初期化に失敗:', error));
