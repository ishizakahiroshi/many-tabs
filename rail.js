'use strict';
// ページ右端に最小表示のタブレールを描画する content script。
// - ページの DOM は読み取らず・変更もしない。追加するのは自前の overlay 要素だけ
// - closed Shadow DOM でページの CSS・JS から隔離する
// - タブ情報と操作はすべて background.js 経由
//   （content script からは chrome.tabs API を直接使えない）

(() => {
  const HOST_ID = 'many-tabs-rail';
  if (document.getElementById(HOST_ID)) return;

  const NONE = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE（content script では定数を参照できない）
  // 文言は _locales/<code>/messages.json に集約（言語追加はファイル1本）。
  // chrome.i18n は content script でも使える。
  // ユーザーが拡張内で言語を切り替えたときは、background から届く実行時カタログ
  // （messages.json と同じ形）を先に引く。content script は自分でファイルを読めないため
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
    const s = catalogText(state.lang ? state.msgs : null, key, subs);
    if (s !== null) return s;
    return chrome.i18n.getMessage(key, subs.map(String)) || key;
  }
  const COLORS = {
    grey: '#9198a6', blue: '#63a5f7', red: '#f07474', yellow: '#e6bd60',
    green: '#65c998', pink: '#e48fca', purple: '#ac91e7', cyan: '#6ccfd9', orange: '#eda56c'
  };

  const CSS = `
    .rail{position:absolute;top:0;right:0;height:100%;width:44px;box-sizing:border-box;
      padding:11px 0; /* 両端は範囲ツマミの専用帯（＋・歯車と重ならないよう予約） */
      display:flex;flex-direction:column;background:rgba(14,18,27,.45);
      border-left:1px solid rgba(49,59,77,.55);color:#e8edf6;
      font:13px system-ui,-apple-system,"Segoe UI",sans-serif;
      transition:width .15s ease,height .15s ease,top .15s ease,left .15s ease,background-color .15s ease,border-color .15s ease;
      pointer-events:none}
    .rail.is-open{width:236px;pointer-events:auto;
      background:rgba(14,18,27,.96);border-left-color:#313b4d}
    .rail.is-hidden:not(.is-open):not(.is-peek):not(.is-free){visibility:hidden}
    .rail.is-slim:not(.is-open){width:20px}
    .rail.is-slim:not(.is-open) .main{padding:0 2px}
    .rail.is-slim:not(.is-open) .ind,.rail.is-slim:not(.is-open) .gdot,
    .rail.is-slim:not(.is-open) .more,.rail.is-slim:not(.is-open) .close{display:none}
    .rail.is-slim:not(.is-open) .sep{margin:5px 4px}
    .rail.pos-left{right:auto;left:0;border-left:0;border-right:1px solid rgba(49,59,77,.55)}
    .rail.pos-left.is-open{border-right-color:#313b4d}
    /* アイコンは画面の辺側に固定し、展開で伸びるのはタイトル側だけにする。
       右レールは行を反転してアイコン列を右端に合わせる（左は既定順で左端に合う） */
    .rail:not(.pos-left):not(.pos-top):not(.pos-bottom) .row{flex-direction:row-reverse}
    .rail:not(.pos-left):not(.pos-top):not(.pos-bottom) .main{flex-direction:row-reverse}
    /* 上下位置: 畳み時は 28px のアイコン横帯、展開時は 64px の横チップ帯。
       縦リストにはならないので画面を塞がない */
    .rail.pos-top,.rail.pos-bottom{top:auto;left:0;right:0;width:100%;height:28px;
      padding:0 11px;flex-direction:row;border-left:0}
    .rail.pos-top{top:0;border-bottom:1px solid rgba(49,59,77,.55)}
    .rail.pos-bottom{bottom:0;border-top:1px solid rgba(49,59,77,.55)}
    .rail.pos-top.is-open,.rail.pos-bottom.is-open{width:100%;height:40px}
    .rail.pos-top.is-open{border-bottom-color:#313b4d}
    .rail.pos-bottom.is-open{border-top-color:#313b4d}
    .rail.pos-top.is-slim:not(.is-open),.rail.pos-bottom.is-slim:not(.is-open){height:16px;width:100%}
    .rail.pos-top .grip,.rail.pos-bottom .grip,.rail.free-h .grip{width:auto;min-width:28px;height:auto;padding:0 2px}
    .rail.pos-top .list,.rail.pos-bottom .list,.rail.free-h .list{
      display:flex;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:0 4px}
    .rail.pos-top .row,.rail.pos-bottom .row,.rail.free-h .row{height:auto}
    /* 横帯のチップは畳み時と同じ辺側に揃え、展開の余白は内側へ伸ばす */
    .rail.pos-top.is-open .row{height:30px;align-self:flex-start}
    .rail.pos-bottom.is-open .row{height:30px;align-self:flex-end}
    .rail.pos-top .row.is-active::before,.rail.pos-bottom .row.is-active::before,
    .rail.free-h .row.is-active::before{
      left:0;right:0;width:auto;height:3px}
    .rail.pos-top .row.is-active::before,.rail.free-h .row.is-active::before{top:auto;bottom:0}
    .rail.pos-bottom .row.is-active::before{top:0;bottom:auto}
    .rail.pos-top .main,.rail.pos-bottom .main,.rail.free-h .main{padding:0 4px;height:100%}
    .rail.pos-top.is-open .main,.rail.pos-bottom.is-open .main,
    .rail.free-h.is-open .main{max-width:200px}
    .rail.pos-top:not(.is-open) .title,.rail.pos-bottom:not(.is-open) .title,
    .rail.free-h:not(.is-open) .title{display:none}
    .rail.pos-top.is-open .title,.rail.pos-bottom.is-open .title,
    .rail.free-h.is-open .title{max-width:110px}
    .rail.pos-top .gdot,.rail.pos-bottom .gdot,.rail.free-h .gdot{
      position:absolute;bottom:4px;right:4px}
    .rail.pos-top .sep,.rail.pos-bottom .sep,.rail.free-h .sep{
      width:1px;height:auto;margin:4px 5px}
    .rail.pos-top .row.drop-before::after,.rail.pos-bottom .row.drop-before::after,
    .rail.free-h .row.drop-before::after{
      left:-1px;right:auto;top:4px;bottom:4px;width:2px;height:auto}
    .rail.pos-top .row.drop-after::after,.rail.pos-bottom .row.drop-after::after,
    .rail.free-h .row.drop-after::after{
      right:-1px;left:auto;top:4px;bottom:4px;width:2px;height:auto}
    .rail.pos-top .new-tab,.rail.pos-bottom .new-tab,
    .rail.pos-top .gear,.rail.pos-bottom .gear,
    .rail.free-h .new-tab,.rail.free-h .gear{
      width:36px;height:auto;border-top:0;border-left:1px solid rgba(49,59,77,.55)}
    /* ▶ 浮き配置: 辺のどこにも吸着していない状態。中心基準で置き、
         展開パネルもその中心から広がる。pos-* クラスは外れて縦レールの既定姿に戻る。
         「近接まで隠す」は浮いている帯には効かない（見えなければ掴めないため）。
         端ツマミは浮いている帯の「長さ」の調整になる（横帯=幅・縦帯=高さ） */
    .rail.is-free{right:auto;bottom:auto;height:auto;max-height:90vh;
      transform:translate(-50%,-50%)}
    .rail.is-free.is-open{max-height:90vh}
    .rail.is-free.free-left .cap-m{left:100%;right:auto;border-radius:0 7px 7px 0}
    /* ▶ free-h: 浮いた横帯。上下ドック帯と同じチップ型だが、中心基準で任意の場所に置く。
         移動ツマミと開閉ツマミは帯の画面中央側に出す */
    .rail.is-free.free-h{width:auto;height:28px;max-height:none;max-width:90vw;
      flex-direction:row;padding:0 11px}
    .rail.is-free.free-h.is-open{height:40px;max-width:90vw}
    .rail.is-free.free-h .cap-m{left:32%;right:auto;top:100%;bottom:auto;
      transform:translateX(-50%);width:24px;height:14px;border-radius:0 0 7px 7px;cursor:grab}
    .rail.is-free.free-h.free-bottom .cap-m{top:auto;bottom:100%;border-radius:7px 7px 0 0}
    .rail.is-free.free-h .cap-m::after{content:'⇔'}
    .rail.is-free.free-h .notch{display:block;top:auto;bottom:-11px;
      border-radius:0 0 8px 8px;background-color:rgba(23,29,41,.75)}
    .rail.is-free.free-h.free-bottom .notch{top:-11px;bottom:auto;border-radius:8px 8px 0 0}
    .rail.is-free.free-h .notch::after{content:'▾'}
    .rail.is-free.free-h.is-open .notch::after{content:'▴'}
    .rail.is-free.free-h.free-bottom .notch::after{content:'▴'}
    .rail.is-free.free-h.free-bottom.is-open .notch::after{content:'▾'}
    .rail.free-h.is-open .row{height:30px;align-self:center}
    .rail.free-h .row.is-active::before{top:auto;bottom:0}
    .rail.free-h .new-tab{border-left:0;border-right:1px solid rgba(49,59,77,.55)}
    .rail.is-free .notch{display:block;top:-11px;bottom:auto;
      border-radius:8px 8px 0 0;background-color:rgba(23,29,41,.75)}
    .rail.is-free .notch::after{content:'▾'}
    .rail.is-free.is-open .notch::after{content:'▴'}
    .rail.pos-top.is-open .search-wrap,.rail.pos-bottom.is-open .search-wrap,
    .rail.free-h.is-open .search-wrap{
      display:flex;align-items:center;width:170px;flex:none;padding:0 6px;
      border-bottom:0;border-left:1px solid #313b4d}
    /* 上下の畳み帯ではアイコンのセルだけがクリックを受ける（=そのままタブ切替）。
       隙間・余白はページへ通るので、下のページ要素は隙間で反応する */
    .rail.pos-top:not(.is-open) .main,.rail.pos-bottom:not(.is-open) .main,
    .rail.free-h:not(.is-open) .main{pointer-events:auto}
    /* 自動展開 OFF（is-manual）の畳み帯も、上下と同じくアイコンセルのみクリック可。
       ホバーするとタイトルラベルが出る（表示のみ・隙間はページへ通る） */
    .rail.is-manual:not(.is-open) .main{pointer-events:auto}
    /* 中央のツマミは帯の開閉ボタン（帯を開くとアイコン行はそのままになる）。
       矢印は開閉方向を示し、開くと反転する */
    .notch{position:absolute;display:none;width:56px;height:11px;left:50%;transform:translateX(-50%);
      border:0;padding:0;cursor:pointer;pointer-events:auto}
    .notch::after{display:block;font-size:9px;line-height:11px;text-align:center;
      color:rgba(232,237,246,.9);content:''}
    .rail.pos-top .notch{display:block;bottom:-3px;border-radius:0 0 8px 8px;background-color:rgba(23,29,41,.75)}
    .rail.pos-bottom .notch{display:block;top:-3px;border-radius:8px 8px 0 0;background-color:rgba(23,29,41,.75)}
    .rail.pos-top .notch::after{content:'▾'}
    .rail.pos-bottom .notch::after{content:'▴'}
    .rail.pos-top.is-open .notch::after{content:'▴'}
    .rail.pos-bottom.is-open .notch::after{content:'▾'}
    .notch:hover{background-color:rgba(35,45,62,.9)}
    /* 移動ハンドルは「移動」の文字ラベルで出す（アイコンより意図が伝わる）。
       畳んだ帯でも常時出す（設定のすぐ上）。ここを掴んで別の辺・浮き配置へ動かせる。
       横帯でもセルを横文字が入る幅にして、全ポジションで横書き表示に統一する
       （縦セル内の縦積み・回転表示は欧文が読みにくいため廃止） */
    .grip{display:flex;align-items:center;justify-content:center;height:14px;
      cursor:grab;flex:none;position:relative;font-size:11px;line-height:1;
      color:rgba(210,220,236,.95);pointer-events:auto}
    .grip::before{content:attr(data-label)}
    .rail.is-dock-dragging .grip{cursor:grabbing}
    .zone{position:fixed;background:rgba(70,130,240,.18);pointer-events:none}
    .zone.z-on{background:rgba(70,130,240,.5)}
    .zone.z-right{top:0;right:0;bottom:0;width:14px}
    .zone.z-left{top:0;left:0;bottom:0;width:14px}
    .zone.z-top{top:0;left:0;right:0;height:14px}
    .zone.z-bottom{bottom:0;left:0;right:0;height:14px}
    /* 畳み帯でアイコンをホバーしたとき、帯の外（ページ側）へ出すタイトルラベル。
       表示専用で、クリックはページへ通す */
    .tip{position:fixed;max-width:280px;padding:4px 8px;background:#1b2331;
      border:1px solid #313b4d;border-radius:6px;color:#e8edf6;
      font:12px system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:none;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tip[hidden]{display:none}
    .search-wrap{display:none;padding:5px 6px;border-top:1px solid #313b4d}
    .rail.is-open .search-wrap{display:block}
    /* 検索欄は拡張のページ（search.html）の iframe。color-scheme を両方にして、
       iframe の中の prefers-color-scheme をページの指定ではなく利用者の設定に合わせる */
    .search-frame{display:block;width:100%;height:24px;border:0;padding:0;margin:0;
      color-scheme:light dark}
    .list{flex:1;min-height:0;overflow-y:auto;padding:4px 0 8px;scrollbar-width:thin}
    .row{display:flex;align-items:center;height:30px;position:relative}
    .row:hover{background:#242e3e}
    .row.is-active{background:#233553}
    .row.is-active::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#548cf8}
    .row.is-dragging{opacity:.45}
    .row.drop-before::after,.row.drop-after::after{content:'';position:absolute;left:4px;right:4px;
      height:2px;background:#548cf8}
    .row.drop-before::after{top:-1px}
    .row.drop-after::after{bottom:-1px}
    .main{display:flex;align-items:center;gap:6px;min-width:0;flex:1;height:100%;
      padding:0 2px 0 8px;border:0;background:none;color:inherit;cursor:pointer;text-align:left}
    .fav{width:16px;height:16px;flex:0 0 auto;object-fit:contain}
    .fav-fb{width:16px;height:16px;flex:0 0 auto;display:grid;place-items:center;color:#8995a9;font-size:14px}
    .gdot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
    .title{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
      font-size:12px;line-height:1.2}
    .is-active .title{font-weight:650;color:#fff}
    .ind{flex:0 0 auto;color:#8995a9;font-size:11px;padding:0 2px}
    .more,.close{flex:0 0 auto;width:20px;height:24px;display:grid;place-items:center;border:0;
      background:none;color:#8995a9;font-size:14px;cursor:pointer;opacity:0;border-radius:5px}
    .rail.is-open .more,.rail.is-open .close{opacity:1}
    .more:hover,.close:hover{background:rgba(255,255,255,.12);color:#fff}
    /* 畳んだ行では操作メニューの場所を畳み、ホバーした行だけアイコン隣に × を出す。
       右レールは行が反転しているので × はアイコンの内側（帯の端寄り）に来る */
    .rail:not(.is-open) .more{display:none}
    .rail:not(.is-open) .row:hover .close{opacity:1;pointer-events:auto}
    /* ＋は帯の先頭・歯車は末尾（畳んだ帯からも押せる。
       自動展開 OFF でも設定へ届く入口） */
    .new-tab{flex:0 0 auto;height:30px;border:0;border-bottom:1px solid rgba(49,59,77,.55);
      background:rgba(23,29,41,.5);color:#e8edf6;font-size:16px;cursor:pointer;
      pointer-events:auto}
    .rail.is-open .new-tab{background:#171d29;border-bottom-color:#313b4d}
    .new-tab:hover{background:#242e3e}
    .gear{flex:0 0 auto;height:26px;border:0;border-top:1px solid rgba(49,59,77,.55);
      background:rgba(23,29,41,.5);color:#8995a9;font-size:13px;cursor:pointer;
      pointer-events:auto}
    .rail.is-open .gear{background:#171d29;border-top-color:#313b4d}
    .gear:hover{background:#242e3e;color:#e8edf6}
    /* 浮き帯だけに出る向き切替ボタン（グリップの上に並ぶ） */
    .ori{display:none}
    .rail.is-free .ori{display:block;flex:none;height:18px;padding:0;border:0;
      border-top:1px solid rgba(49,59,77,.55);background:rgba(23,29,41,.5);
      color:#8995a9;font-size:11px;cursor:pointer;pointer-events:auto}
    .rail.is-free .ori:hover{background:#242e3e;color:#e8edf6}
    .rail.is-free.free-h .ori{width:22px;height:auto;border-top:0;
      border-left:1px solid rgba(49,59,77,.55)}
    .rail.pos-top .new-tab,.rail.pos-bottom .new-tab{border-left:0;border-bottom:0;
      border-right:1px solid rgba(49,59,77,.55)}
    .sep{height:1px;background:#313b4d;margin:5px 8px}
    .empty{padding:10px;color:#8995a9;font-size:12px;line-height:1.5}
    .menu{position:fixed;min-width:170px;max-width:250px;padding:4px;background:#1b2331;
      border:1px solid #313b4d;border-radius:8px;box-shadow:0 8px 26px rgba(0,0,0,.5);
      color:#e8edf6;font:13px system-ui,-apple-system,"Segoe UI",sans-serif;
      pointer-events:auto;max-height:75vh;overflow-y:auto}
    .menu[hidden]{display:none}
    .menu-item{display:block;width:100%;padding:6px 10px;border:0;border-radius:5px;
      background:none;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;
      overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .menu-item:hover,.menu-item:focus-visible{background:#2a3448;outline:none}
    .menu-item.danger{color:#f07474}
    .menu-item.danger:hover,.menu-item.danger:focus-visible{background:rgba(240,116,116,.14)}
    .menu-sep{height:1px;background:#313b4d;margin:4px 6px}
    .menu-note{padding:6px 10px;color:#8995a9;font-size:11px;line-height:1.5}
    /* ▶ span: 帯の両端・中央に出すツマミ。
         端のツマミは帯の外へはみ出す形で置き、画面端に来たときは帯の内側に収まる
         （max(0px,-11px) で画面外クリップを防ぐ） */
    .cap{position:absolute;pointer-events:auto;display:flex;align-items:center;justify-content:center;
      background:rgba(23,29,41,.8);color:rgba(232,237,246,.95);font-size:9px;
      border:1px solid rgba(232,237,246,.22);
      user-select:none;touch-action:none;z-index:2}
    .cap:hover{background:rgba(53,69,95,.95)}
    .cap::after{display:block;line-height:1}
    .cap-a{left:0;right:0;height:11px;top:max(0px,-11px);border-radius:0 0 7px 7px;cursor:ns-resize}
    .cap-a::after{content:'▴'}
    .cap-b{left:0;right:0;height:11px;bottom:max(0px,-11px);border-radius:7px 7px 0 0;cursor:ns-resize}
    .cap-b::after{content:'▾'}
    .cap-m{top:50%;transform:translateY(-50%);width:14px;height:24px;cursor:grab}
    .cap-m::after{content:'⇕'}
    .rail:not(.pos-left) .cap-m{right:100%;border-radius:7px 0 0 7px}
    .rail.pos-left .cap-m{left:100%;border-radius:0 7px 7px 0}
    .rail.pos-top .cap-a,.rail.pos-bottom .cap-a,.rail.free-h .cap-a{top:0;bottom:0;
      width:11px;height:auto;left:max(0px,-11px);right:auto;border-radius:0 7px 7px 0;
      cursor:ew-resize}
    .rail.pos-top .cap-a::after,.rail.pos-bottom .cap-a::after,
    .rail.free-h .cap-a::after{content:'◂'}
    .rail.pos-top .cap-b,.rail.pos-bottom .cap-b,.rail.free-h .cap-b{top:0;bottom:0;
      width:11px;height:auto;right:max(0px,-11px);left:auto;border-radius:7px 0 0 7px;
      cursor:ew-resize}
    .rail.pos-top .cap-b::after,.rail.pos-bottom .cap-b::after,
    .rail.free-h .cap-b::after{content:'▸'}
    .rail.pos-top .cap-m,.rail.pos-bottom .cap-m{left:32%;transform:translateX(-50%);top:auto;
      width:24px;height:14px;cursor:grab}
    .rail.pos-top .cap-m{top:100%;border-radius:0 0 7px 7px}
    .rail.pos-bottom .cap-m{bottom:100%;border-radius:7px 7px 0 0}
    .rail.pos-top .cap-m::after,.rail.pos-bottom .cap-m::after{content:'⇔'}
    /* ▶ span/ドックドラッグ中はアニメーションを切る（ついてくる感を優先） */
    .rail.is-dock-dragging,.rail.is-span-drag{transition:none}
    @media (prefers-color-scheme: light){
      .rail{background:rgba(246,248,252,.55);border-left-color:rgba(209,217,229,.6);color:#202939}
      .rail.is-open{background:rgba(246,248,252,.97);border-left-color:#d1d9e5}
      .rail.pos-left{border-right-color:rgba(209,217,229,.6)}
      .rail.pos-left.is-open{border-right-color:#d1d9e5}
      .rail.pos-top{border-bottom-color:rgba(209,217,229,.6)}
      .rail.pos-bottom{border-top-color:rgba(209,217,229,.6)}
      .rail.pos-top.is-open{border-bottom-color:#d1d9e5}
      .rail.pos-bottom.is-open{border-top-color:#d1d9e5}
      .rail.pos-top .new-tab,.rail.pos-bottom .new-tab{
        border-left-color:rgba(209,217,229,.6)}
      .rail.pos-top.is-open .search-wrap,.rail.pos-bottom.is-open .search-wrap{
        border-left-color:#d1d9e5}
      .rail.pos-top .notch,.rail.pos-bottom .notch{background-color:rgba(246,248,252,.8)}
      .notch::after{color:rgba(32,41,57,.85)}
      .notch:hover{background-color:rgba(226,232,242,.95)}
      .grip::before{color:rgba(52,64,82,.9)}
      .tip{background:#fff;border-color:#d1d9e5;color:#202939;box-shadow:0 4px 14px rgba(32,41,57,.18)}
      .search-wrap{border-top-color:#d1d9e5}
      .row:hover{background:#e2eaf5}
      .row.is-active{background:#dbe9ff}
      .is-active .title{color:#12325f}
      .fav-fb,.ind,.more,.close{color:#6b778b}
      .more:hover,.close:hover{background:rgba(0,0,0,.08);color:#202939}
      .new-tab{background:rgba(255,255,255,.55);border-bottom-color:rgba(209,217,229,.6);color:#202939}
      .rail.is-open .new-tab{background:#fff;border-bottom-color:#d1d9e5}
      .new-tab:hover{background:#e2eaf5}
      .gear{background:rgba(255,255,255,.55);border-top-color:rgba(209,217,229,.6);color:#6b778b}
      .rail.is-open .gear{background:#fff;border-top-color:#d1d9e5}
      .gear:hover{background:#e2eaf5;color:#202939}
      .sep{background:#d1d9e5}
      .empty{color:#6b778b}
      .menu{background:#fff;border-color:#d1d9e5;color:#202939;
        box-shadow:0 8px 26px rgba(25,46,82,.18)}
      .menu-item:hover,.menu-item:focus-visible{background:#e2eaf5}
      .menu-item.danger{color:#c43d3d}
      .menu-item.danger:hover,.menu-item.danger:focus-visible{background:rgba(196,61,61,.1)}
      .menu-sep{background:#d1d9e5}
      .menu-note{color:#6b778b}
      .cap{background:rgba(246,248,252,.88);color:rgba(52,64,82,.95)}
      .cap:hover{background:rgba(226,232,242,.98)}
    }
  `;

  const state = {
    tabs: [], groups: new Map(), filter: '', pointerNear: false,
    draggedTabId: null, renderDeferred: false, menuTabId: null, tipTabId: null,
    mode: 'translucent', defaultMode: 'translucent', modeTouched: false,
    position: 'right', defaultPosition: 'right', ovPosition: null,
    autoExpand: false, defaultAutoExpand: false, ovAutoExpand: null,
    faviconFail: new Set(),
    span: null,  // {a,b} = 辺に沿った範囲（0〜1 の割合）。null = 全幅（既定）
    free: null,  // {x,y,o,s?} = 浮き配置（帯の中心と向き、任意で長さも 0〜1 割合）。null = 辺に吸着
    lang: null,  // null = ブラウザの言語に従う。切替時はセッション全体で共有
    msgs: null,  // lang 用の実行時カタログ（background から rail-init / broadcast で届く）
    appliedLang: undefined // 固定ラベルへ最後に反映した言語（undefined = 未反映）
  };

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0;background:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  const rail = el('div', 'rail');
  // 既定は自動展開 OFF（snapshot 到着時に setAutoExpand が正式に確定する）
  rail.classList.add('is-manual');
  const grip = el('div', 'grip');
  grip.dataset.i18nLabel = 'gripMove';
  grip.dataset.i18nTitle = 'gripTitle';
  grip.dataset.label = _t('gripMove');
  grip.title = _t('gripTitle');
  // 検索欄はページの中に入力欄を置かず、拡張のページ（search.html）を iframe で入れる。
  // ページの中の入力欄だと、打った文字がページのスクリプトの capture リスナから見えるため。
  // iframe は初めて展開したときに作る（開かないページで拡張のページを作らない）
  const searchWrap = el('div', 'search-wrap');
  let searchFrame = null;
  let searchPort = null;
  let searchQuery = '';
  function ensureSearchFrame() {
    if (searchFrame) return searchFrame;
    searchFrame = el('iframe', 'search-frame');
    searchFrame.dataset.i18nTitle = 'searchTabs';
    searchFrame.title = _t('searchTabs');
    searchFrame.src = chrome.runtime.getURL('search.html');
    searchWrap.appendChild(searchFrame);
    return searchFrame;
  }
  function sendSearchLabels() {
    if (!searchPort) return;
    try {
      searchPort.postMessage({ type: 'labels', placeholder: _t('searchTabs'),
        lang: state.lang || chrome.i18n.getUILanguage(), q: searchQuery });
    } catch (_) { searchPort = null; }
  }
  function focusSearch() {
    ensureSearchFrame().focus();
    if (searchPort) {
      try { searchPort.postMessage({ type: 'focus' }); } catch (_) { searchPort = null; }
    }
  }
  const list = el('div', 'list');
  const add = el('button', 'new-tab', '＋');
  add.type = 'button';
  add.dataset.i18nTitle = 'newTab';
  add.title = _t('newTab');
  add.addEventListener('click', () => send({ type: 'rail-new' }));
  const gear = el('button', 'gear', '⚙︎');
  gear.type = 'button';
  gear.dataset.i18nTitle = 'railSettings';
  gear.title = _t('railSettings');
  gear.addEventListener('click', (event) => {
    event.stopPropagation();
    const b = gear.getBoundingClientRect();
    openModeMenu({ x: b.left, y: b.top });
  });
  // 浮き帯だけに出る向き切替。グリップ（移動ボタン）の上に置く
  const ori = el('button', 'ori', '↻');
  ori.type = 'button';
  ori.dataset.i18nTitle = 'oriTitle';
  ori.title = _t('oriTitle');
  ori.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!state.free) return;
    setFree({ x: state.free.x, y: state.free.y, o: state.free.o === 'h' ? 'v' : 'h' });
    sendPref();
  });
  // 展開時に行がずれないよう、検索・グリップはリストの後ろに置く
  // （リストの上に挿入すると畳み時に狙ったアイコンの行が展開でずれて誤クリックになる）
  // ＋は先頭・歯車は末尾（常用ボタンを上・設定を下に分ける）
  rail.append(add, list, searchWrap, ori, grip, gear);
  const notch = el('button', 'notch');
  notch.type = 'button';
  notch.dataset.i18nAriaLabel = 'railToggle';
  notch.title = _t('railOpen');
  notch.setAttribute('aria-label', _t('railToggle'));
  rail.appendChild(notch);
  // ▶ span: 両端のリサイズツマミと中央の移動ツマミ
  const capA = el('div', 'cap cap-a');
  capA.title = _t('capStart');
  const capB = el('div', 'cap cap-b');
  capB.title = _t('capEnd');
  const capM = el('div', 'cap cap-m');
  capM.title = _t('capMove');
  rail.append(capA, capB, capM);
  const menu = el('div', 'menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  const zones = ['left', 'right', 'top', 'bottom'].map(p => {
    const z = el('div', `zone z-${p}`);
    z.hidden = true;
    return z;
  });
  // ▶ tip: 畳み帯のアイコンホバーで帯の外へ出すタイトルラベル（表示専用）
  const tip = el('div', 'tip');
  tip.hidden = true;
  shadow.append(rail, menu, ...zones, tip);
  document.documentElement.appendChild(host);

  // data-i18n* 属性を持つ固定要素の文言を現在の言語で張り直す
  function applyI18n() {
    for (const n of shadow.querySelectorAll('[data-i18n]')) n.textContent = _t(n.dataset.i18n);
    for (const n of shadow.querySelectorAll('[data-i18n-title]')) n.title = _t(n.dataset.i18nTitle);
    for (const n of shadow.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = _t(n.dataset.i18nPlaceholder);
    for (const n of shadow.querySelectorAll('[data-i18n-aria-label]')) n.setAttribute('aria-label', _t(n.dataset.i18nAriaLabel));
    for (const n of shadow.querySelectorAll('[data-i18n-label]')) n.dataset.label = _t(n.dataset.i18nLabel);
  }
  // 言語切替: 開いているメニューを閉じ、固定ラベル・状態依存タイトル・一覧を新言語で作り直す
  function applyLang() {
    state.appliedLang = state.lang;
    if (!menu.hidden) closeMenu();
    applyI18n();
    notch.title = state.pointerNear ? _t('railClose') : _t('railOpen');
    capM.title = state.free ? _t('capMoveFree') : _t('capMove');
    capA.title = state.free ? _t('capLength') : _t('capStart');
    capB.title = state.free ? _t('capLength') : _t('capEnd');
    sendSearchLabels();
    render();
  }

  function send(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (_) { /* ignore */ }
  }
  // 表示モード・位置の切替を background のメモリへ送り、同じタブの遷移をまたいで保持する
  function sendPref() {
    send({ type: 'rail-pref', mode: state.mode, position: state.position,
      autoExpand: state.autoExpand, span: state.span, free: state.free });
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

  // メニュー表示中・検索語の入力中・ドラッグ中は、カーソルが外れても
  // レールを展開したままにする（操作中に 44px へ畳まれると行き先を失うため）。
  function syncOpen() {
    const open = state.pointerNear || state.filter !== '' || !menu.hidden || Number.isInteger(state.draggedTabId);
    // 展開中は行内の × を使うので、畳み帯専用のタイトルカードは畳む
    if (open) { hideTip(); ensureSearchFrame(); }
    rail.classList.toggle('is-open', open);
    notch.title = open ? _t('railClose') : _t('railOpen');
  }

  // 畳んだレールは pointer-events:none でページへクリックを通す
  // （右端にあるページ側のボタンやスクロールバーを塞がないため）。
  // 展開は JS で行う。:hover では検出できないので、document の mousemove で
  // 「画面右端へのタッチ」か「44px 帯での滞留」をトリガーにする。
  // 帯の内側（8〜44px）への直接の侵入では畳んだままにし、
  // ページの右端ボタンを狙ったホバーではレールが出ないようにする。
  const EDGE_ARM_PX = 8;
  const OPEN_PX = 236;
  const DWELL_MS = 400;
  const CLOSE_DELAY_MS = 250;
  let dwellTimer = 0;
  let closeTimer = 0;
  let armed = false;
  // 畳み表示モード。'translucent'（半透明・既定）/ 'slim'（20px の細い帯）/
  // 'hidden'（近接まで非表示）。既定は rail-config.js、レール上の右クリックで
  // セッション限定に切り替えられる（永続化しない設計のため storage は使わない）。
  function setMode(mode) {
    if (mode !== 'translucent' && mode !== 'slim' && mode !== 'hidden') return;
    state.mode = mode;
    rail.classList.toggle('is-slim', mode === 'slim');
    rail.classList.toggle('is-hidden', mode === 'hidden');
  }
  // 位置。'right'（既定）/ 'left' / 'top' / 'bottom'。
  // top・bottom は畳み時にファビコンを横並びにし、展開時は全幅の縦リストになる。
  function setPosition(pos) {
    if (pos !== 'right' && pos !== 'left' && pos !== 'top' && pos !== 'bottom') return;
    state.position = pos;
    rail.classList.toggle('pos-left', pos === 'left');
    rail.classList.toggle('pos-top', pos === 'top');
    rail.classList.toggle('pos-bottom', pos === 'bottom');
    applySpan(); // 位置をまたいでも範囲（割合）を維持
  }
  // 自動展開（左右のみ）。OFF は畳み帯が広がらず、アイコンを押して切替・
  // ホバーでタイトルラベル。開くには歯車メニューの「レールを開く」か '/' キー。
  function setAutoExpand(v) {
    state.autoExpand = v === true;
    rail.classList.toggle('is-manual', !state.autoExpand);
    armed = false;
    clearTimeout(dwellTimer);
    hideTip();
  }
  function horizontal() {
    return state.position === 'top' || state.position === 'bottom';
  }
  // ▶ span: カーソルの「辺に沿った」座標（縦レールは Y、横帯は X）
  function axisPos(event) {
    return horizontal() ? event.clientX : event.clientY;
  }
  function axisMax() {
    return horizontal() ? window.innerWidth : window.innerHeight;
  }
  // ▶ span: 帯の表示範囲を style に反映。null なら全幅（CSS 既定に戻す）。
  // 逆軸は空文字で CSS へ戻す（縦 span のまま横帯へ付け替えると
  // left/width が残って画面中央に帯が出る）
  function applySpan() {
    if (state.free) return; // 浮いている間は辺の範囲を反映しない
    const s = state.span;
    if (horizontal()) {
      rail.style.top = '';
      rail.style.height = '';
      rail.style.left = s ? `${s.a * 100}%` : '0px';
      rail.style.right = s ? 'auto' : '0px';
      rail.style.width = s ? `${(s.b - s.a) * 100}%` : '100%';
    } else {
      rail.style.left = '';
      rail.style.right = '';
      rail.style.width = '';
      rail.style.top = s ? `${s.a * 100}%` : '0px';
      rail.style.height = s ? `${(s.b - s.a) * 100}%` : '100%';
    }
  }
  // ▶ span: カーソルが帯の範囲内か（わずかなマージン付き）。範囲外の辺タッチでは開かない
  function withinSpan(event, marginPx) {
    const max = axisMax();
    const s = state.span || { a: 0, b: 1 };
    const pos = axisPos(event);
    const m = (marginPx || 0) / max;
    return pos >= (s.a - m) * max && pos <= (s.b + m) * max;
  }
  // ▶ span: 受け取った値の検証。{a,b} か null 以外（壊れた値）は undefined を返す
  function validSpan(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return undefined;
    const { a, b } = v;
    if (typeof a !== 'number' || typeof b !== 'number' || !(a >= 0 && a < b && b <= 1)) return undefined;
    return { a, b };
  }
  // ▶ free: 浮き配置 {x,y}（帯の中心、0〜1 割合）か null。壊れた値は undefined
  // s = 帯の長さ（0〜1 割合・端ツマミで指定。未指定なら内容量に自動追従）
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
  // ▶ free: 辺のどこにも吸着しない配置。pos-* を外して縦レールの既定姿に戻し、
  // 帯の中心を {x,y}（画面割合）に置く。null で直前の辺へ吸着し直す
  function setFree(f) {
    state.free = f;
    rail.classList.toggle('is-free', !!f);
    rail.classList.toggle('free-h', !!f && f.o === 'h');
    rail.classList.remove('free-left', 'free-bottom');
    capM.title = f ? _t('capMoveFree') : _t('capMove');
    capA.title = f ? _t('capLength') : _t('capStart');
    capB.title = f ? _t('capLength') : _t('capEnd');
    if (!f) { setPosition(state.position); return; }
    rail.classList.remove('pos-left', 'pos-top', 'pos-bottom');
    applyFree();
  }
  function applyFree() {
    const f = state.free;
    if (!f) return;
    // ▶ 端ツマミで指定した帯の長さ（横帯=幅、縦帯=高さ）。未指定なら内容量に自動追従
    rail.style.width = f.o === 'h' && typeof f.s === 'number' ? `${f.s * 100}%` : '';
    rail.style.height = f.o !== 'h' && typeof f.s === 'number' ? `${f.s * 100}%` : '';
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = rail.getBoundingClientRect();
    const hw = r.width / 2 / w;
    const hh = r.height / 2 / h;
    const x = Math.max(hw, Math.min(f.x, 1 - hw));
    const y = Math.max(hh, Math.min(f.y, 1 - hh));
    rail.classList.toggle('free-left', x < 0.5);
    rail.classList.toggle('free-bottom', y >= 0.5);
    rail.style.left = `${x * 100}%`;
    rail.style.top = `${y * 100}%`;
    rail.style.right = 'auto';
  }
  function edgeDist(event) {
    if (state.position === 'left') return event.clientX;
    if (state.position === 'top') return event.clientY;
    if (state.position === 'bottom') return window.innerHeight - event.clientY;
    return window.innerWidth - event.clientX;
  }
  function openExtent() {
    // 上下位置の展開は 40px の横帯なので閉域もそれに合わせる
    return horizontal() ? 40 : OPEN_PX;
  }
  function rowAt(event) {
    for (const r of list.children) {
      const b = r.getBoundingClientRect();
      if (horizontal()
        ? event.clientX >= b.left && event.clientX <= b.right
        : event.clientY >= b.top && event.clientY <= b.bottom) return r;
    }
    return null;
  }
  function hideTip() {
    tip.hidden = true;
    state.tipTabId = null;
  }
  function setTip(r) {
    const tabId = r && r.dataset ? Number(r.dataset.tabId) : NaN;
    if (!Number.isInteger(tabId)) { hideTip(); return; }
    state.tipTabId = tabId;
    tip.textContent = r.title;
    tip.hidden = false;
    const b = r.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const band = bandPx();
    if (state.free && state.free.o === 'h') {
      // 浮いた横帯では画面中央側（上か下か）にラベルを出す
      const rb = rail.getBoundingClientRect();
      tip.style.left = `${Math.max(4, Math.min(b.left + b.width / 2 - tw / 2, window.innerWidth - tw - 4))}px`;
      tip.style.top = rb.top + rb.height / 2 < window.innerHeight / 2
        ? `${rb.bottom + 4}px`
        : `${rb.top - th - 4}px`;
    } else if (state.free) {
      // 浮いた帯では画面中央側にラベルを出す
      const rb = rail.getBoundingClientRect();
      tip.style.left = rb.left + rb.width / 2 < window.innerWidth / 2
        ? `${Math.min(rb.right + 6, Math.max(4, window.innerWidth - tw - 4))}px`
        : `${Math.max(4, rb.left - tw - 6)}px`;
      tip.style.top = `${Math.max(4, Math.min(b.top + b.height / 2 - th / 2, window.innerHeight - th - 4))}px`;
    } else if (horizontal()) {
      tip.style.left = `${Math.max(4, Math.min(b.left + b.width / 2 - tw / 2, window.innerWidth - tw - 4))}px`;
      tip.style.top = state.position === 'top'
        ? `${band + 4}px`
        : `${window.innerHeight - band - th - 4}px`;
    } else {
      tip.style.left = state.position === 'left'
        ? `${Math.min(band + 4, Math.max(4, window.innerWidth - tw - 4))}px`
        : `${Math.max(4, window.innerWidth - band - tw - 4)}px`;
      tip.style.top = `${Math.max(4, Math.min(b.top + b.height / 2 - th / 2, window.innerHeight - th - 4))}px`;
    }
  }
  function setNear(near) {
    if (state.pointerNear === near) return;
    state.pointerNear = near;
    hideTip();
    syncOpen();
    if (state.free) applyFree(); // 開閉で幅が変わるので中心クランプを掛け直す
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { armed = false; setNear(false); }, CLOSE_DELAY_MS);
  }
  // 帯の厚さはモードと位置に追従する（上下は 28px・slim は細い帯ぶんだけ）。
  function bandPx() {
    if (state.mode === 'slim') return horizontal() ? 16 : 20;
    return horizontal() ? 28 : 44;
  }

  // グリップを掴んで画面の辺へドラッグすると、レールの位置をその辺へ切り替える。
  // グリップは畳んだ帯でも出ている（設定のすぐ上）。ゾーン外へ離すと浮き配置になる。
  const DOCK_ZONE_PX = 80;
  let dockDragging = false;
  let dockTarget = null;
  function dockZoneAt(event) {
    const dist = {
      left: event.clientX,
      right: window.innerWidth - event.clientX,
      top: event.clientY,
      bottom: window.innerHeight - event.clientY
    };
    let best = null;
    let bestD = DOCK_ZONE_PX;
    for (const pos of ['left', 'right', 'top', 'bottom']) {
      if (dist[pos] < bestD) { bestD = dist[pos]; best = pos; }
    }
    return best;
  }
  // グリップ上のクリックでは位置を変えないよう、6px 以上動いたときだけ
  // ドックドラッグ（ゾーン表示・吸着判定）を開始する
  const DOCK_START_PX = 6;
  let dockStart = null;
  let dockOff = null; // 掴んだ位置の帯左上からのオフセット（浮き追従用）
  // ▶ span: 範囲の中心を pos（0〜1 割合）へ動かす（長さは維持・両端でクランプ）
  const SPAN_MIN_PX = 90;
  const SPAN_SNAP = 0.02; // 端の 2% 以内は画面端へ吸着
  function spanMin() { return SPAN_MIN_PX / axisMax(); }
  function moveSpanTo(pos) {
    const cur = state.span || { a: 0, b: 1 };
    const len = cur.b - cur.a;
    const half = len / 2;
    const center = Math.max(half, Math.min(pos, 1 - half));
    setSpan(center - half, center + half);
  }
  function setSpan(a, b) {
    if (a < SPAN_SNAP) a = 0;
    if (b > 1 - SPAN_SNAP) b = 1;
    state.span = (a === 0 && b === 1) ? null : { a, b };
    applySpan();
  }
  function dockMove(event) {
    if (dockStart) {
      const dx = event.clientX - dockStart.x;
      const dy = event.clientY - dockStart.y;
      if (dx * dx + dy * dy < DOCK_START_PX * DOCK_START_PX) return;
      dockStart = null;
      rail.classList.add('is-dock-dragging');
      for (const z of zones) z.hidden = false;
    }
    dockTarget = dockZoneAt(event);
    // ▶ span: 今いる辺の中でのドラッグは「範囲の移動」として扱う
    // （ゾーンの強調は外し、帯をカーソルへ追従させる）
    if (!state.free && dockTarget === state.position) {
      for (const z of zones) z.classList.remove('z-on');
      moveSpanTo(axisPos(event) / axisMax());
      return;
    }
    for (const z of zones) {
      z.classList.toggle('z-on', z.classList.contains(`z-${dockTarget}`));
    }
    // ▶ free: どの辺のゾーンにも入っていない間は帯がカーソルに追従して浮く。
    // ドック済みの帯を引きずり出したときも、その場で浮き出す
    if (!dockTarget) followFree(event);
  }
  // ▶ free: 掴んだオフセットを保ったまま帯の中心をカーソルへ追従させる
  function followFree(event) {
    const r = rail.getBoundingClientRect();
    const x = (event.clientX - dockOff.x + r.width / 2) / window.innerWidth;
    const y = (event.clientY - dockOff.y + r.height / 2) / window.innerHeight;
    // 上下の辺から引きずり出したら横帯のまま浮かせる（既に浮いていれば向きを維持）
    const o = state.free ? state.free.o : (horizontal() ? 'h' : 'v');
    setFree({ x: Math.max(0, Math.min(x, 1)), y: Math.max(0, Math.min(y, 1)), o });
  }
  function dockEnd(event) {
    dockDragging = false;
    const engaged = !dockStart; // 6px の閾値を超えて実際にドラッグしたか
    dockMove(event);
    dockStart = null;
    rail.classList.remove('is-dock-dragging');
    for (const z of zones) { z.hidden = true; z.classList.remove('z-on'); }
    document.removeEventListener('pointermove', dockMove, true);
    document.removeEventListener('pointerup', dockEnd, true);
    document.removeEventListener('pointercancel', dockEnd, true);
    if (dockTarget && (dockTarget !== state.position || state.free)) {
      // 別の辺へ付け替え、または浮いた帯を辺へ吸着 → 範囲は全幅に戻す
      setFree(null);
      setPosition(dockTarget);
      setSpan(0, 1);
      sendPref();
      dockTarget = null;
    } else {
      // 同一辺内の範囲移動、またはゾーン外へのドロップ（浮き配置・followFree 済み）
      if (engaged) sendPref();
      dockTarget = null;
    }
  }
  function startDockDrag(event) {
    dockDragging = true;
    dockTarget = null;
    const r = rail.getBoundingClientRect();
    dockOff = { x: event.clientX - r.left, y: event.clientY - r.top };
    dockStart = { x: event.clientX, y: event.clientY };
    document.addEventListener('pointermove', dockMove, true);
    document.addEventListener('pointerup', dockEnd, true);
    document.addEventListener('pointercancel', dockEnd, true);
  }
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startDockDrag(event);
  });

  // ▶ span: ツマミのドラッグで範囲の両端・位置を変える
  let spanDrag = null;
  function capDown(kind) {
    return (event) => {
      if (event.button !== 0) return;
      // ▶ free: 浮いている帯の端ツマミは範囲ではなく「帯の長さ」の調整になる
      if (state.free) { freeCapDown(kind, event); return; }
      event.preventDefault();
      event.stopPropagation();
      const s = state.span || { a: 0, b: 1 };
      spanDrag = { kind, a0: s.a, b0: s.b };
      rail.classList.add('is-span-drag');
      document.addEventListener('pointermove', spanMove, true);
      document.addEventListener('pointerup', spanEnd, true);
      document.addEventListener('pointercancel', spanEnd, true);
    };
  }
  function spanMove(event) {
    if (!spanDrag) return;
    const pos = Math.max(0, Math.min(axisPos(event) / axisMax(), 1));
    const min = spanMin();
    if (spanDrag.kind === 'a') {
      setSpan(Math.min(pos, spanDrag.b0 - min), spanDrag.b0);
    } else if (spanDrag.kind === 'b') {
      setSpan(spanDrag.a0, Math.max(pos, spanDrag.a0 + min));
    } else {
      moveSpanTo(pos);
    }
  }
  function spanEnd() {
    if (!spanDrag) return;
    spanDrag = null;
    rail.classList.remove('is-span-drag');
    document.removeEventListener('pointermove', spanMove, true);
    document.removeEventListener('pointerup', spanEnd, true);
    document.removeEventListener('pointercancel', spanEnd, true);
    sendPref(); // 範囲はセッション共有（ドラッグ終了時にまとめて送る）
  }
  function resetSpan() { setSpan(0, 1); sendPref(); }
  // ▶ free: 浮いている帯では両端のツマミが「帯の長さ」の調整になる。
  // 反対側の端を固定し、カーソル位置まで帯を広げる（中心座標も連動して動く）
  const FREE_MIN_PX = 140;
  const FREE_MAX = 0.9;
  let freeDrag = null;
  function freeCapDown(kind, event) {
    event.preventDefault();
    event.stopPropagation();
    const h = state.free.o === 'h';
    const r = rail.getBoundingClientRect();
    freeDrag = {
      kind, h,
      // 反対側の端の画面座標（その端は動かさない）
      fixed: kind === 'a' ? (h ? r.right : r.bottom) : (h ? r.left : r.top)
    };
    rail.classList.add('is-span-drag');
    document.addEventListener('pointermove', freeResize, true);
    document.addEventListener('pointerup', freeResizeEnd, true);
    document.addEventListener('pointercancel', freeResizeEnd, true);
  }
  function freeResize(event) {
    if (!freeDrag || !state.free) return;
    const axis = freeDrag.h ? window.innerWidth : window.innerHeight;
    const pos = freeDrag.h ? event.clientX : event.clientY;
    const size = Math.max(FREE_MIN_PX, Math.min(Math.abs(pos - freeDrag.fixed), axis * FREE_MAX));
    const center = freeDrag.kind === 'a' ? freeDrag.fixed - size / 2 : freeDrag.fixed + size / 2;
    const f = { x: state.free.x, y: state.free.y, o: state.free.o, s: size / axis };
    if (freeDrag.h) f.x = center / axis; else f.y = center / axis;
    setFree(f);
  }
  function freeResizeEnd() {
    if (!freeDrag) return;
    freeDrag = null;
    rail.classList.remove('is-span-drag');
    document.removeEventListener('pointermove', freeResize, true);
    document.removeEventListener('pointerup', freeResizeEnd, true);
    document.removeEventListener('pointercancel', freeResizeEnd, true);
    sendPref(); // 長さはセッション共有（ドラッグ終了時にまとめて送る）
  }
  // 浮いている帯でツマミをダブルクリックすると、長さ指定を外して自動サイズへ戻す
  function resetFreeSize() {
    if (!state.free) return;
    setFree({ x: state.free.x, y: state.free.y, o: state.free.o });
    sendPref();
  }
  function capReset() { if (state.free) resetFreeSize(); else resetSpan(); }
  capA.addEventListener('pointerdown', capDown('a'));
  capB.addEventListener('pointerdown', capDown('b'));
  // ▶ free: 浮いている帯では中央ツマミが移動ハンドルになる（端のゾーンへ落とせば吸着）
  capM.addEventListener('pointerdown', (event) => {
    if (state.free) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      startDockDrag(event);
      return;
    }
    capDown('m')(event);
  });
  capA.addEventListener('dblclick', capReset);
  capB.addEventListener('dblclick', capReset);
  capM.addEventListener('dblclick', capReset);

  document.addEventListener('mousemove', (event) => {
    // ▶ spanDrag・freeDrag（浮き帯の長さ変更）中も開いたままにする
    if (dockDragging || spanDrag || freeDrag) { clearTimeout(closeTimer); hideTip(); return; }
    // ▶ free: 浮いている帯の近接判定は画面端ではなく帯の矩形で行う
    if (state.free) {
      const r = rail.getBoundingClientRect();
      const dx = Math.max(r.left - event.clientX, event.clientX - r.right, 0);
      const dy = Math.max(r.top - event.clientY, event.clientY - r.bottom, 0);
      const d = Math.max(dx, dy);
      if (state.pointerNear) {
        if (d > 48) scheduleClose(); else clearTimeout(closeTimer);
        return;
      }
      if (state.autoExpand && d <= 0) {
        armed = true;
        clearTimeout(dwellTimer);
        setNear(true);
        return;
      }
      setTip(d <= 0 ? rowAt(event) : null);
      return;
    }
    const dist = edgeDist(event);
    // 畳み表示が hidden のときは、帯の内側へ入った間だけ姿を見せる
    rail.classList.toggle('is-peek', dist <= bandPx());
    if (state.pointerNear) {
      if (dist > openExtent()) scheduleClose(); else clearTimeout(closeTimer);
      return;
    }
    // 上下の畳み帯はクリックスルーなので、行の当たり判定はカーソル座標から行う。
    // アイコンの上に止まるとタイトルのラベルを帯の外へ出す（表示のみ・クリックは通る）。
    // 閉じる × は行内に CSS の :hover で出る。左右は自動展開 OFF のときに同じことをする
    // （ON は帯自体が展開されるので不要）
    if (horizontal() || !state.autoExpand) setTip(dist <= bandPx() ? rowAt(event) : null);
    // 上下位置は端タッチも滞留も開かない（帯の下のページ UI を狙う移動・フリックの
    // オーバーシュートと衝突するため）。左右も自動展開 OFF なら開かず、
    // 開閉はツマミ・歯車メニュー・'/' キーの明示操作のみ。
    // ▶ 範囲（span）の外側（帯が無い高さ）での辺タッチ・滞留では開かない
    if (!horizontal() && state.autoExpand && dist <= EDGE_ARM_PX && withinSpan(event, 6)) {
      armed = true;
      clearTimeout(dwellTimer);
      setNear(true);
      return;
    }
    if (!horizontal() && state.autoExpand && dist <= bandPx() && withinSpan(event, 2) && !armed) {
      clearTimeout(dwellTimer);
      dwellTimer = setTimeout(() => { armed = true; setNear(true); }, DWELL_MS);
      return;
    }
    clearTimeout(dwellTimer);
  }, { passive: true });
  notch.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.pointerNear) { armed = false; setNear(false); }
    else { armed = true; setNear(true); }
    notch.title = state.pointerNear ? _t('railClose') : _t('railOpen');
  });
  document.documentElement.addEventListener('mouseleave', () => {
    clearTimeout(dwellTimer);
    scheduleClose();
  });

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    state.menuTabId = null;
    syncOpen();
  }
  function openMenu(tab, anchor) {
    closeMenu();
    state.menuTabId = tab.id;
    const item = (label, fn, danger) => {
      const b = el('button', 'menu-item' + (danger ? ' danger' : ''), label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { closeMenu(); fn(); });
      menu.appendChild(b);
    };
    item(tab.pinned ? _t('unpinTab') : _t('pinTab'),
      () => send({ type: 'rail-pin', tabId: tab.id, pinned: !tab.pinned }));
    item(tab.muted ? _t('unmuteTab') : _t('muteTab'),
      () => send({ type: 'rail-mute', tabId: tab.id, muted: !tab.muted }));
    item(_t('duplicateTab'), () => send({ type: 'rail-duplicate', tabId: tab.id }));
    if (!tab.pinned) {
      if (tab.groupId !== NONE) {
        item(_t('removeFromGroup'), () => send({ type: 'rail-ungroup', tabId: tab.id }));
      }
      item(_t('newGroup'), () => send({ type: 'rail-group-new', tabId: tab.id }));
      const others = Array.from(state.groups.values()).filter(g => g.id !== tab.groupId);
      if (others.length) {
        menu.appendChild(el('div', 'menu-sep'));
        for (const g of others) {
          item(_t('moveToGroup', g.title || _t('unnamedShort')),
            () => send({ type: 'rail-group', tabId: tab.id, groupId: g.id }));
        }
      }
    }
    menu.appendChild(el('div', 'menu-sep'));
    item(_t('closeTab'), () => send({ type: 'rail-close', tabId: tab.id }), true);
    menu.hidden = false;
    syncOpen();
    placeMenu(anchor);
    menu.querySelector('button')?.focus();
  }

  // メニューはレールがある辺の内側へ開く
  function placeMenu(anchor) {
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left;
    let top;
    if (state.free) {
      // 浮いた帯では画面中央側へメニューを出す
      const rb = rail.getBoundingClientRect();
      if (state.free.o === 'h') {
        left = anchor.x - mw / 2;
        top = rb.top + rb.height / 2 < window.innerHeight / 2 ? anchor.y + 4 : anchor.y - mh - 4;
      } else {
        left = rb.left + rb.width / 2 < window.innerWidth / 2 ? anchor.x + 4 : anchor.x - mw - 4;
        top = anchor.y;
      }
    }
    else if (state.position === 'left') { left = anchor.x + 4; top = anchor.y; }
    else if (state.position === 'top') { left = anchor.x - mw / 2; top = anchor.y + 4; }
    else if (state.position === 'bottom') { left = anchor.x - mw / 2; top = anchor.y - mh - 4; }
    else { left = anchor.x - mw - 4; top = anchor.y; }
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - mw - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - mh - 8))}px`;
  }

  // レールの行以外（余白・＋ボタン等）での右クリック用。表示モード・位置のセッション切替。
  function openModeMenu(anchor) {
    closeMenu();
    const item = (label, current, fn) => {
      const b = el('button', 'menu-item', (current ? '✓ ' : '　') + label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { fn(); closeMenu(); });
      menu.appendChild(b);
    };
    for (const [key, mode] of [
      ['modeTranslucent', 'translucent'],
      ['modeSlim', 'slim'],
      ['modeHidden', 'hidden']
    ]) {
      item(_t(key), mode === state.mode, () => {
        state.modeTouched = true;
        setMode(mode);
        sendPref();
      });
    }
    menu.appendChild(el('div', 'menu-sep'));
    for (const [key, pos] of [['posRight', 'right'], ['posLeft', 'left'], ['posTop', 'top'], ['posBottom', 'bottom']]) {
      item(_t('positionLabel', _t(key)), !state.free && pos === state.position, () => {
        setFree(null);
        setPosition(pos);
        sendPref();
      });
    }
    // ▶ free: 辺から外して「好きなところに配置」できる状態にする。
    // 今いる場所のまま浮き出すので、あとは帯の ⇕ ツマミか展開中のグリップをドラッグして置く
    item(_t('placeAnywhere'), !!state.free, () => {
      const r = rail.getBoundingClientRect();
      setFree({
        x: (r.left + r.width / 2) / window.innerWidth,
        y: (r.top + r.height / 2) / window.innerHeight,
        o: horizontal() ? 'h' : 'v'
      });
      sendPref();
    });
    menu.appendChild(el('div', 'menu-sep'));
    item(_t('autoExpandOn'), state.autoExpand, () => {
      setAutoExpand(true);
      sendPref();
    });
    item(_t('autoExpandOff'), !state.autoExpand, () => {
      setAutoExpand(false);
      sendPref();
    });
    menu.appendChild(el('div', 'menu-sep'));
    // ▶ lang: 拡張内だけの言語切替（既定はブラウザの言語。セッション全体で共有・再起動で戻る）
    for (const [key, code] of [['langAuto', null], ['langJa', 'ja'], ['langEn', 'en']]) {
      item(_t('languageLabel', _t(key)), state.lang === code, () => {
        send({ type: 'rail-pref', lang: code });
      });
    }
    menu.appendChild(el('div', 'menu-sep'));
    item(_t('railOpen'), false, () => { armed = true; setNear(true); });
    // ▶ span: 範囲を変えているときだけリセット項目を出す
    if (state.span) {
      item(_t('resetRange'), false, resetSpan);
    }
    menu.appendChild(el('div', 'menu-sep'));
    menu.appendChild(el('div', 'menu-note', _t('railMenuNote')));
    menu.hidden = false;
    syncOpen();
    placeMenu(anchor);
    menu.querySelector('button')?.focus();
  }

  function row(tab) {
    const r = el('div', 'row' + (tab.active ? ' is-active' : ''));
    r.title = tab.title || _t('untitledTab');
    r.dataset.tabId = String(tab.id);
    r.draggable = true;
    const main = el('button', 'main');
    main.type = 'button';
    const src = tab.hasFav ? faviconUrl(tab.url) : null;
    // _favicon はアイコンが無いページで Chrome が内部エラーを記録する。
    // favIconUrl の無いタブは要求せず、一度失敗した URL も再要求しない
    if (src && !state.faviconFail.has(src)) {
      const img = el('img', 'fav');
      img.alt = '';
      img.src = src;
      img.addEventListener('error', () => {
        state.faviconFail.add(src);
        img.replaceWith(el('span', 'fav-fb', '◇'));
      }, { once: true });
      main.appendChild(img);
    } else {
      main.appendChild(el('span', 'fav-fb', '◇'));
    }
    const g = state.groups.get(tab.groupId);
    if (g) {
      const dot = el('span', 'gdot');
      dot.style.background = COLORS[g.color] || COLORS.grey;
      main.appendChild(dot);
    }
    main.appendChild(el('span', 'title', tab.title || (tab.url ? _t('loading') : _t('newTab'))));
    main.addEventListener('click', () => send({ type: 'rail-activate', tabId: tab.id }));
    r.appendChild(main);
    if (tab.pinned) r.appendChild(el('span', 'ind', '●'));
    if (tab.audible || tab.muted) r.appendChild(el('span', 'ind', tab.muted ? '♪̸' : '♪'));
    const more = el('button', 'more', '⋯');
    more.type = 'button';
    more.title = _t('actionsMenu');
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const b = more.getBoundingClientRect();
      openMenu(tab, { x: b.left, y: b.top });
    });
    const close = el('button', 'close', '×');
    close.type = 'button';
    close.title = _t('closeTab');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      send({ type: 'rail-close', tabId: tab.id });
    });
    r.append(more, close);
    r.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(tab, { x: event.clientX, y: event.clientY });
    });
    r.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer) return;
      state.draggedTabId = tab.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(tab.id));
      r.classList.add('is-dragging');
      closeMenu();
      syncOpen();
    });
    r.addEventListener('dragend', () => {
      state.draggedTabId = null;
      syncOpen();
      list.querySelectorAll('.drop-before,.drop-after,.is-dragging').forEach(n => {
        n.classList.remove('drop-before', 'drop-after', 'is-dragging');
      });
      if (state.renderDeferred) render();
    });
    // 横帯（top/bottom）は畳み・展開どちらも横並びなので左右の半分で判定する
    const afterMid = (event) => {
      const b = r.getBoundingClientRect();
      if (horizontal()) return event.clientX >= b.left + b.width / 2;
      return event.clientY >= b.top + b.height / 2;
    };
    r.addEventListener('dragover', (event) => {
      const srcTab = state.tabs.find(t => t.id === state.draggedTabId);
      if (!srcTab || srcTab.id === tab.id || srcTab.groupId !== tab.groupId || srcTab.pinned !== tab.pinned) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const after = afterMid(event);
      r.classList.toggle('drop-before', !after);
      r.classList.toggle('drop-after', after);
    });
    r.addEventListener('dragleave', () => r.classList.remove('drop-before', 'drop-after'));
    r.addEventListener('drop', (event) => {
      const srcTab = state.tabs.find(t => t.id === state.draggedTabId);
      r.classList.remove('drop-before', 'drop-after');
      if (!srcTab || srcTab.id === tab.id || srcTab.groupId !== tab.groupId || srcTab.pinned !== tab.pinned) return;
      event.preventDefault();
      const after = afterMid(event);
      // chrome.tabs.moveのindexは移動後の位置を指定する。
      const index = tab.index - (srcTab.index < tab.index ? 1 : 0) + (after ? 1 : 0);
      send({ type: 'rail-move', tabId: srcTab.id, index });
    });
    return r;
  }

  function matches(tab) {
    return !state.filter ||
      `${tab.title || ''}\n${tab.url || ''}`.toLowerCase().includes(state.filter);
  }
  function render() {
    if (Number.isInteger(state.draggedTabId)) { state.renderDeferred = true; return; }
    state.renderDeferred = false;
    // メニューは、対象のタブが無くなったときだけ閉じる。
    if (!menu.hidden && Number.isInteger(state.menuTabId) && !state.tabs.some(t => t.id === state.menuTabId)) closeMenu();
    const frag = document.createDocumentFragment();
    const shown = state.tabs.filter(matches);
    if (!shown.length) {
      frag.appendChild(el('div', 'empty',
        state.filter ? _t('noMatchingTabs') : _t('noTabs')));
    } else {
      const pinned = shown.filter(t => t.pinned);
      const normal = shown.filter(t => !t.pinned);
      for (const t of pinned) frag.appendChild(row(t));
      if (pinned.length && normal.length) frag.appendChild(el('div', 'sep'));
      for (const t of normal) frag.appendChild(row(t));
    }
    list.replaceChildren(frag);
    // タイトルラベルは対象タブが残っている間は消さない（再描画で点滅させない）。
    // 対象が閉じられて無くなったときだけ畳む
    if (Number.isInteger(state.tipTabId)) {
      const t = state.tabs.find(t2 => t2.id === state.tipTabId);
      if (t) tip.textContent = t.title || _t('untitledTab');
      else hideTip();
    }
  }
  // ホスト名に一致する上書きを最長一致で返す（サブドメインは親ドメインの設定に従う）
  function hostOverride(overrides) {
    const host = location.hostname || '';
    let best = null;
    for (const key of Object.keys(overrides)) {
      if (host === key || host.endsWith('.' + key)) {
        if (!best || key.length > best.length) best = key;
      }
    }
    return best ? overrides[best] : null;
  }
  function accept(data) {
    state.tabs = data.tabs || [];
    state.groups = new Map((data.groups || []).map(g => [g.id, g]));
    if (typeof data.mode === 'string') state.defaultMode = data.mode;
    if (typeof data.position === 'string') state.defaultPosition = data.position;
    if (typeof data.autoExpand === 'boolean') state.defaultAutoExpand = data.autoExpand;
    state.ovPosition = null;
    state.ovAutoExpand = null;
    if (data.overrides && typeof data.overrides === 'object') {
      const ov = hostOverride(data.overrides);
      if (ov) {
        if (typeof ov.collapsedMode === 'string') state.defaultMode = ov.collapsedMode;
        if (typeof ov.position === 'string') {
          state.defaultPosition = ov.position;
          state.ovPosition = ov.position;
        }
        if (typeof ov.autoExpand === 'boolean') {
          state.defaultAutoExpand = ov.autoExpand;
          state.ovAutoExpand = ov.autoExpand;
        }
      }
    }
    // 範囲はセッション全体の既定として snapshot の span に載る
    const sp = validSpan(data.span);
    if (sp !== undefined) state.span = sp;
    // 浮き配置もセッション全体の既定として載る（サイト別の位置固定があるページでは無視）
    const fr = validFree(data.free);
    if (fr !== undefined && state.ovPosition === null) state.free = fr;
    // 言語もセッション全体の既定として載る（カタログなしのコードは無効値としてブラウザ言語へ戻す）
    if ('lang' in data) {
      state.lang = (data.lang && data.msgs && typeof data.msgs === 'object') ? data.lang : null;
      state.msgs = state.lang ? data.msgs : null;
    }
    // このタブで以前切り替えたモード（画面遷移をまたいで保持・background のメモリのみ。
    // 位置はタブ単位ではなくセッション全体の既定として snapshot の position に載る）
    if (data.tabPref && typeof data.tabPref === 'object') {
      if (typeof data.tabPref.mode === 'string') state.defaultMode = data.tabPref.mode;
    }
    if (!state.modeTouched) setMode(state.defaultMode);
    setPosition(state.defaultPosition);
    setAutoExpand(state.defaultAutoExpand);
    if (state.free) setFree(state.free); // 浮き配置なら pos-* を外して中心座標へ
    // 言語が変わったとき（と初回）だけ固定ラベルを張り直す。applyLang は開いているメニューを
    // 閉じるので、タブ更新のたびに届くスナップショットでは呼ばず、一覧の再描画だけにする
    if (state.appliedLang !== state.lang) applyLang();
    else render();
  }

  // 検索欄（search.html の iframe）からの接続。拡張の API なので、ページのスクリプトは
  // 接続することも、流れる語を読むこともできない。作り直されたら新しい接続に替える
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'many-tabs-search' || !searchFrame) return;
    if (searchPort) { try { searchPort.disconnect(); } catch (_) { /* 切断済み */ } }
    searchPort = port;
    port.onDisconnect.addListener(() => { if (searchPort === port) searchPort = null; });
    port.onMessage.addListener((message) => {
      if (!message || message.type !== 'input' || typeof message.q !== 'string') return;
      searchQuery = message.q;
      state.filter = message.q.trim().toLowerCase();
      syncOpen();
      render();
      // Esc: 検索を解き、フォーカスを iframe からページへ返す
      if (message.escape) searchFrame.blur();
    });
    sendSearchLabels();
    if (document.activeElement === host && shadow.activeElement === searchFrame) {
      try { port.postMessage({ type: 'focus' }); } catch (_) { /* 切断済み */ }
    }
  });
  shadow.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      state.pointerNear = true;
      syncOpen();
      focusSearch();
    }
    if (event.key === 'Escape' && !menu.hidden) closeMenu();
  });
  // メニューの外を押したら閉じる。closed Shadow DOM の中のイベントは
  // document から見ると target が host に書き換わるため、host 以外なら外側と判定する。
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && event.target !== host) closeMenu();
  });
  rail.addEventListener('pointerdown', () => {
    if (!menu.hidden) closeMenu();
  });
  rail.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openModeMenu({ x: event.clientX, y: event.clientY });
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'rail-tabs' && Array.isArray(msg.tabs)) accept(msg);
    // どこかのタブで位置が変えられたら追従する（位置はセッション全体の既定。
    // 例外はサイト別 overrides で位置を固定しているページのみ）
    if (msg && msg.type === 'rail-pref-position' && typeof msg.position === 'string') {
      if (!state.ovPosition) {
        state.defaultPosition = msg.position;
        if (state.free) setFree(null);
        setPosition(state.defaultPosition);
      }
    }
    // 自動展開の切替もセッション全体で共有する（位置と同じくサイト別 overrides が優先）
    if (msg && msg.type === 'rail-pref-auto' && typeof msg.autoExpand === 'boolean') {
      if (state.ovAutoExpand === null) {
        state.defaultAutoExpand = msg.autoExpand;
        setAutoExpand(state.defaultAutoExpand);
      }
    }
    // 範囲もセッション全体で共有する（位置がサイト固定のページにも span は共有してよい）
    if (msg && msg.type === 'rail-pref-span') {
      const sp = validSpan(msg.span);
      if (sp !== undefined) { state.span = sp; applySpan(); }
    }
    // 浮き配置も位置と同じくセッション全体で共有する（サイト別の位置固定を優先）
    if (msg && msg.type === 'rail-pref-free') {
      const fr = validFree(msg.free);
      if (fr !== undefined && state.ovPosition === null) setFree(fr);
    }
    // 言語切替もセッション全体で共有する（カタログはメッセージに同梱）
    if (msg && msg.type === 'rail-pref-lang') {
      state.lang = (msg.lang && msg.msgs && typeof msg.msgs === 'object') ? msg.lang : null;
      state.msgs = state.lang ? msg.msgs : null;
      applyLang();
    }
  });
  // 一覧は表示中のタブにだけ届く（background の pushToWindow）。裏にある間に変わった分は、
  // 表示されたときに取り直す。表示中かどうかも併せて伝え、background の送り先を決めさせる
  function requestSnapshot() {
    try {
      chrome.runtime.sendMessage({ type: 'rail-init', visible: document.visibilityState === 'visible' }, (resp) => {
        if (chrome.runtime.lastError || !resp) return;
        accept(resp);
      });
    } catch (_) { /* 拡張の更新で切り離された古いスクリプト */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSnapshot();
    else send({ type: 'rail-hidden' });
  });
  requestSnapshot();
})();
