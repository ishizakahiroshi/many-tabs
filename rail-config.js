'use strict';
// レールの畳み表示の既定値。background.js が importScripts で読み込む。
// 変更したら chrome://extensions で拡張を「更新」する。
//   collapsedMode: 'translucent' 半透明の帯（既定）/ 'slim' 細い帯 / 'hidden' 近接まで非表示
//   position:      'right'（既定）/ 'left' / 'top' / 'bottom'
var RAIL_CONFIG = { collapsedMode: 'translucent', position: 'right' };
