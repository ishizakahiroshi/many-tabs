# Privacy Policy (English, for submission) — Many Tabs

Last updated: 2026-11-23

## Data use declaration

Many Tabs does **not** collect, transmit, store, or share any user data.

- Browsing history, tab information, personal information, credentials, location, or communications: not collected
- Analytics, telemetry, crash reporting: none
- External services, ad networks, third-party sharing: none
- Remote code loading or execution: none (all code ships inside the package)

## Technical basis

- No `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, external SDKs, or CDNs are implemented
- The Content Security Policy declares `connect-src 'none'`, blocking all connections from extension pages
- `chrome.storage`, `localStorage`, IndexedDB, and cookies are not used. Settings live in memory only and are discarded when Chrome restarts
- The content script (`rail.js`) does not read or modify page content; it only draws its own closed-Shadow-DOM overlay
- A static inspection script (`tests/security-check.py`) mechanically checks forbidden APIs, the permission set, CSP, and the content_scripts declaration on every change

## Purpose of each permission

- `sidePanel`: display the tab list UI in the side panel
- `tabs`: read tab titles, URLs, favicons, and group state to render, search, and operate on tabs (switch, close, pin, mute, duplicate, reorder)
- `tabGroups`: display group titles/colors and create or update groups
- `favicon`: render tab icons via Chrome's internal `_favicon` endpoint
- Content scripts (`rail.js` on `http://*/*`, `https://*/*`, `file:///*`): draw the collapsible tab rail as an overlay along the page edge

## Contact

Please use Issues on the public repository. For security issues (vulnerabilities), please report privately as described in the repository's `SECURITY.md` instead of opening a public Issue.

※ Identical in content to the English section of `PRIVACY.md` in the repository.
