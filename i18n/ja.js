// _locales/ja/messages.json の実行時ミラー（言語切替用・同期必須）
globalThis.MANY_TABS_MSGS = globalThis.MANY_TABS_MSGS || {};
MANY_TABS_MSGS.ja = {
  "appName": {
    "message": "Many Tabs",
    "description": "Extension name"
  },
  "appDescription": {
    "message": "画面の辺に垂直タブを表示する、外部送信なしのローカル専用拡張機能。",
    "description": "Short description (132 chars max)"
  },
  "openTabList": {
    "message": "タブ一覧を開く"
  },
  "newTab": {
    "message": "新しいタブ"
  },
  "searchTabs": {
    "message": "タブを検索"
  },
  "searchTabsSlash": {
    "message": "タブを検索  /"
  },
  "refreshTabs": {
    "message": "タブ一覧を更新"
  },
  "loading": {
    "message": "読み込み中…"
  },
  "thisWindow": {
    "message": "このウィンドウ"
  },
  "tabListLabel": {
    "message": "タブ一覧"
  },
  "noExternalComm": {
    "message": "外部通信なし"
  },
  "operationFailed": {
    "message": "操作に失敗しました。"
  },
  "windowNotFound": {
    "message": "Chromeウィンドウを確認できません。"
  },
  "localFile": {
    "message": "ローカルファイル"
  },
  "pageFallback": {
    "message": "ページ"
  },
  "untitledTab": {
    "message": "名称なし"
  },
  "tabWord": {
    "message": "タブ"
  },
  "unnamedGroup": {
    "message": "名前のないグループ"
  },
  "unnamedShort": {
    "message": "名前なし"
  },
  "groupToggleHint": {
    "message": "クリックでグループを開閉"
  },
  "pinnedBadge": {
    "message": "固定済み"
  },
  "mutedBadge": {
    "message": "ミュート中"
  },
  "audibleBadge": {
    "message": "音声再生中"
  },
  "switchToTab": {
    "message": "タブに切り替え: $TITLE$",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "tabMenuAria": {
    "message": "「$TITLE$」の操作メニュー",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "closeTabAria": {
    "message": "「$TITLE$」を閉じる",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "actionsMenu": {
    "message": "操作メニュー"
  },
  "closeTab": {
    "message": "タブを閉じる"
  },
  "tabCount": {
    "message": "$COUNT$ 個のタブ",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "searchResultCount": {
    "message": "検索結果 $MATCHES$ 件 / 全 $TOTAL$ 件",
    "placeholders": {
      "matches": {
        "content": "$1"
      },
      "total": {
        "content": "$2"
      }
    }
  },
  "noMatchingTabs": {
    "message": "一致するタブがありません。"
  },
  "noMatchingTabsHint": {
    "message": "一致するタブがありません。\n検索語を変えてみてください。"
  },
  "noTabsHint": {
    "message": "タブがありません。\n＋から新しいタブを開けます。"
  },
  "noTabs": {
    "message": "タブがありません。"
  },
  "pinnedSection": {
    "message": "固定したタブ"
  },
  "tabsSection": {
    "message": "タブ"
  },
  "pinTab": {
    "message": "タブを固定"
  },
  "unpinTab": {
    "message": "固定を解除"
  },
  "muteTab": {
    "message": "タブをミュート"
  },
  "unmuteTab": {
    "message": "ミュート解除"
  },
  "duplicateTab": {
    "message": "タブを複製"
  },
  "removeFromGroup": {
    "message": "グループから外す"
  },
  "newGroup": {
    "message": "新しいグループを作る"
  },
  "newGroupTitle": {
    "message": "新しいグループ"
  },
  "moveToGroup": {
    "message": "「$TITLE$」に移動",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "railSettings": {
    "message": "レールの設定"
  },
  "railOpen": {
    "message": "レールを開く"
  },
  "railClose": {
    "message": "レールを閉じる"
  },
  "railToggle": {
    "message": "レールの開閉"
  },
  "gripMove": {
    "message": "移動"
  },
  "gripTitle": {
    "message": "ドラッグで移動（辺へ吸着・中央へ引き出すと浮く）"
  },
  "oriTitle": {
    "message": "向きを切替（縦↔横）"
  },
  "capStart": {
    "message": "ドラッグで範囲のはじめを変更（ダブルクリックでリセット）"
  },
  "capEnd": {
    "message": "ドラッグで範囲のおわりを変更（ダブルクリックでリセット）"
  },
  "capMove": {
    "message": "ドラッグで範囲を移動（ダブルクリックでリセット）"
  },
  "capMoveFree": {
    "message": "ドラッグで移動（端のゾーンへ落とすと吸着）"
  },
  "capLength": {
    "message": "ドラッグで帯の長さを変更（ダブルクリックで自動に戻す）"
  },
  "modeTranslucent": {
    "message": "半透明のアイコン列（既定）"
  },
  "modeSlim": {
    "message": "細い帯（20px）"
  },
  "modeHidden": {
    "message": "近接まで隠す"
  },
  "positionLabel": {
    "message": "位置: $POS$",
    "placeholders": {
      "pos": {
        "content": "$1"
      }
    }
  },
  "posRight": {
    "message": "右（既定）"
  },
  "posLeft": {
    "message": "左"
  },
  "posTop": {
    "message": "上"
  },
  "posBottom": {
    "message": "下"
  },
  "placeAnywhere": {
    "message": "好きなところに配置"
  },
  "autoExpandOn": {
    "message": "自動で展開する（左右）"
  },
  "autoExpandOff": {
    "message": "自動で展開しない（既定）"
  },
  "resetRange": {
    "message": "範囲をリセット"
  },
  "railMenuNote": {
    "message": "表示モードはこのタブだけ。位置・範囲・浮き配置・自動展開は全タブに共有（いずれも再起動で消える）。浮き配置は帯の ⇕ ツマミか展開中のグリップをドラッグして好きな所へ動かせる。既定・サイト別は rail-config.js"
  },
  "languageLabel": {
    "message": "言語: $lang$",
    "placeholders": {
      "lang": {
        "content": "$1"
      }
    }
  },
  "langAuto": {
    "message": "ブラウザ（既定）"
  },
  "langJa": {
    "message": "日本語"
  },
  "langEn": {
    "message": "English"
  },
  "chooseLanguage": {
    "message": "言語"
  }
};
