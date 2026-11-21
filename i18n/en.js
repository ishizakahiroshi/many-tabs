// _locales/en/messages.json の実行時ミラー（言語切替用・同期必須）
globalThis.MANY_TABS_MSGS = globalThis.MANY_TABS_MSGS || {};
MANY_TABS_MSGS.en = {
  "appName": {
    "message": "Many Tabs",
    "description": "Extension name"
  },
  "appDescription": {
    "message": "Shows vertical tabs along a screen edge. Local-only — no external communication.",
    "description": "Short description (132 chars max)"
  },
  "openTabList": {
    "message": "Open tab list"
  },
  "newTab": {
    "message": "New tab"
  },
  "searchTabs": {
    "message": "Search tabs"
  },
  "searchTabsSlash": {
    "message": "Search tabs  /"
  },
  "refreshTabs": {
    "message": "Refresh tab list"
  },
  "loading": {
    "message": "Loading…"
  },
  "thisWindow": {
    "message": "This window"
  },
  "tabListLabel": {
    "message": "Tab list"
  },
  "noExternalComm": {
    "message": "No external communication"
  },
  "operationFailed": {
    "message": "The operation failed."
  },
  "windowNotFound": {
    "message": "Could not identify the Chrome window."
  },
  "localFile": {
    "message": "Local file"
  },
  "pageFallback": {
    "message": "Page"
  },
  "untitledTab": {
    "message": "Untitled"
  },
  "tabWord": {
    "message": "Tab"
  },
  "unnamedGroup": {
    "message": "Unnamed group"
  },
  "unnamedShort": {
    "message": "Unnamed"
  },
  "groupToggleHint": {
    "message": "Click to expand or collapse"
  },
  "pinnedBadge": {
    "message": "Pinned"
  },
  "mutedBadge": {
    "message": "Muted"
  },
  "audibleBadge": {
    "message": "Playing audio"
  },
  "switchToTab": {
    "message": "Switch to tab: $TITLE$",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "tabMenuAria": {
    "message": "Actions menu for \"$TITLE$\"",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "closeTabAria": {
    "message": "Close \"$TITLE$\"",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "actionsMenu": {
    "message": "Actions menu"
  },
  "closeTab": {
    "message": "Close tab"
  },
  "tabCount": {
    "message": "$COUNT$ tabs",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "searchResultCount": {
    "message": "$MATCHES$ of $TOTAL$ tabs",
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
    "message": "No matching tabs."
  },
  "noMatchingTabsHint": {
    "message": "No matching tabs.\nTry a different search term."
  },
  "noTabsHint": {
    "message": "No tabs.\nOpen a new tab with +."
  },
  "noTabs": {
    "message": "No tabs."
  },
  "pinnedSection": {
    "message": "Pinned tabs"
  },
  "tabsSection": {
    "message": "Tabs"
  },
  "pinTab": {
    "message": "Pin tab"
  },
  "unpinTab": {
    "message": "Unpin tab"
  },
  "muteTab": {
    "message": "Mute tab"
  },
  "unmuteTab": {
    "message": "Unmute tab"
  },
  "duplicateTab": {
    "message": "Duplicate tab"
  },
  "removeFromGroup": {
    "message": "Remove from group"
  },
  "newGroup": {
    "message": "Create new group"
  },
  "newGroupTitle": {
    "message": "New group"
  },
  "moveToGroup": {
    "message": "Move to \"$TITLE$\"",
    "placeholders": {
      "title": {
        "content": "$1"
      }
    }
  },
  "railSettings": {
    "message": "Rail settings"
  },
  "railOpen": {
    "message": "Open rail"
  },
  "railClose": {
    "message": "Close rail"
  },
  "railToggle": {
    "message": "Toggle rail"
  },
  "gripMove": {
    "message": "Move"
  },
  "gripTitle": {
    "message": "Drag to move (drop on an edge to dock, pull toward the center to float)"
  },
  "oriTitle": {
    "message": "Toggle orientation (vertical ↔ horizontal)"
  },
  "capStart": {
    "message": "Drag to change the range start (double-click to reset)"
  },
  "capEnd": {
    "message": "Drag to change the range end (double-click to reset)"
  },
  "capMove": {
    "message": "Drag to move the range (double-click to reset)"
  },
  "capMoveFree": {
    "message": "Drag to move (drop on an edge zone to dock)"
  },
  "capLength": {
    "message": "Drag to change the band length (double-click for auto size)"
  },
  "modeTranslucent": {
    "message": "Translucent icon column (default)"
  },
  "modeSlim": {
    "message": "Slim band (20px)"
  },
  "modeHidden": {
    "message": "Hidden until nearby"
  },
  "positionLabel": {
    "message": "Position: $POS$",
    "placeholders": {
      "pos": {
        "content": "$1"
      }
    }
  },
  "posRight": {
    "message": "Right (default)"
  },
  "posLeft": {
    "message": "Left"
  },
  "posTop": {
    "message": "Top"
  },
  "posBottom": {
    "message": "Bottom"
  },
  "placeAnywhere": {
    "message": "Place anywhere"
  },
  "autoExpandOn": {
    "message": "Auto-expand (left/right)"
  },
  "autoExpandOff": {
    "message": "Don't auto-expand (default)"
  },
  "resetRange": {
    "message": "Reset range"
  },
  "railMenuNote": {
    "message": "Display mode is per tab. Position, range, floating placement, and auto-expand are shared across all tabs (all reset on restart). To float the band, drag its ⇕ knob or the grip while expanded. Defaults and per-site settings live in rail-config.js"
  },
  "languageLabel": {
    "message": "Language: $lang$",
    "placeholders": {
      "lang": {
        "content": "$1"
      }
    }
  },
  "langAuto": {
    "message": "Browser (default)"
  },
  "langJa": {
    "message": "日本語"
  },
  "langEn": {
    "message": "English"
  },
  "chooseLanguage": {
    "message": "Language"
  }
};
