'use strict';
// レールの畳み表示の既定値。background.js が importScripts で読み込む。
// 変更したら chrome://extensions で拡張を「更新」する。
//   collapsedMode: 'translucent' 半透明の帯（既定）/ 'slim' 細い帯 / 'hidden' 近接まで非表示
//   position:      'right'（既定）/ 'left' / 'top' / 'bottom'
//   autoExpand:    true で左右のレールが端タッチ・滞留で自動展開。
//                  false（既定）なら畳み帯のまま。アイコンを押して切替・ホバーでタイトル。
//   overrides:     ホスト名ごとの上書き。レールと干渉するサイトだけ 'hidden' 等にできる。
//                  collapsedMode・position・autoExpand を指定できる。
//                  サブドメインは親ドメインの設定に従う。storage 非依存の静的設定。
//                  例) overrides: { 'example.com': { collapsedMode: 'hidden' } }
var RAIL_CONFIG = { collapsedMode: 'translucent', position: 'right', autoExpand: false, overrides: {} };
