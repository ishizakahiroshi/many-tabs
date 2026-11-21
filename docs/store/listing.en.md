# Store Listing (English) — Many Tabs

## Name

Many Tabs

## Short description (max 132 chars)

Local-only tab manager: list and control open tabs from the side panel or a collapsible rail at the page edge.

## Detailed description

Many Tabs is a local-only tab manager that lets you see and control all your open tabs.

**Two views**

- **Side panel**: a full-featured tab list. Switch, close, open new, search (`/`), pin, mute, duplicate, group, move between groups, and reorder with drag & drop
- **Page-edge rail**: a collapsible tab rail overlaid on the edge of the page you're viewing. Three collapsed modes (translucent icon strip, slim bar, hidden-until-hover), four edges plus free placement, range limits, and hover auto-expand

**Privacy by design**

- No external communication whatsoever. No data collection, analytics, telemetry, or advertising IDs
- Nothing stored. Tab titles and URLs are used only to render and search the list — never written to storage (`chrome.storage`, `localStorage`, IndexedDB are all unused)
- Settings live in memory only and reset when Chrome restarts
- Page content is never read or modified. The rail only draws its own closed-Shadow-DOM overlay
- No remote code. Everything ships inside the extension package

**Languages**

Japanese and English. Follows your browser language by default; a language switcher is available in the rail settings menu and the side panel.

**About permissions**

The extension uses `tabs` (read tab info and perform tab operations), `tabGroups` (show and create groups), `favicon` (show tab icons), `sidePanel`, and a content script that draws the rail on pages you view. Chrome's permission warning looks strong, but everything is used locally — nothing is transmitted or stored. See the privacy policy for details.

## Category

Productivity

## Screenshot plan (1280x800 or 640x400 PNG)

1. Side panel listing and searching many tabs
2. Collapsed page-edge rail (translucent icon strip) and its expanded tab list on hover
3. Rail settings menu (mode, position, auto-expand, language)
4. Tab context menu (pin, group, etc.)
5. Japanese-locale side panel or rail

※ Capture using a dummy local page or neutral generic pages so no third-party product logos or trademarks appear
