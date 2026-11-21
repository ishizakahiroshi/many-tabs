'use strict';
// レールの畳み表示モードの既定値。background.js が importScripts で読み込む。
// 変更したら chrome://extensions で拡張を「更新」する。
//   'translucent' : 半透明の 44px アイコン列（既定）
//   'slim'        : 20px の細いアイコン列
//   'hidden'      : 右端へ近づけるまで完全に隠す
var RAIL_CONFIG = { collapsedMode: 'translucent' };
