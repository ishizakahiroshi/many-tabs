# Submission Notes v0.7.1 (English, for reviewers)

## Single purpose

A tab manager that lists and operates on open tabs (switch, close, new, search, pin, mute, duplicate, group, reorder) via Chrome's side panel and a collapsible rail overlaid at the page edge. It does nothing else.

## Permission justifications

| Permission | Why it's needed |
|---|---|
| `sidePanel` | To show the tab list UI in Chrome's side panel (the extension's main surface) |
| `tabs` | To read tab titles, URLs, favicons, and group membership for rendering/searching the list, and to perform switch/close/pin/mute/duplicate/reorder operations |
| `tabGroups` | To display group titles/colors and create, add to, or remove tabs from groups |
| `favicon` | To render tab icons via Chrome's internal `_favicon` endpoint (no external image requests) |
| Content scripts (`rail.js` on `http://*/*` `https://*/*` `file:///*`) | To draw the collapsible tab rail as a Shadow DOM overlay on the page edge. Limited to three explicit schemes rather than `<all_urls>`. `file:///*` provides the same UX on local HTML files and is inert when users don't open such files |

## Remote code

None. All executed code ships inside the package (`background.js`, `rail.js`, `rail-config.js`, `sidepanel.js`, `i18n/*.js`). No external scripts, CDNs, or eval.

## Data collection

None. `fetch`, `XMLHttpRequest`, `WebSocket`, and `sendBeacon` are not implemented, and the CSP declares `connect-src 'none'`. `chrome.storage`, `localStorage`, and IndexedDB are unused; settings are memory-only and reset on restart. The privacy policy is published as `PRIVACY.md` in the public repository.

## How to verify

1. Load the extension and click its toolbar icon to open the side panel (`openPanelOnActionClick`)
2. Open any http/https page — a translucent tab rail appears on the right edge
3. Use the rail's gear menu to switch display mode, position, auto-expand, and language
4. Open a tab row's "…" menu or right-click the rail for tab operations
5. Tab information is read per the permission warning but never sent anywhere (`tests/security-check.py` performs a mechanical check)

## Known constraints

- Requires Chrome 116+ (`minimum_chrome_version`)
- The rail cannot appear on pages where content scripts cannot be injected (`chrome://` pages, the Web Store, etc.)
- `file:///*` display requires Chrome's "Allow access to file URLs" toggle to be enabled
