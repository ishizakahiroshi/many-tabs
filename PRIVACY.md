# Privacy Policy — Many Tabs

**English** | [日本語は後半](#日本語)

Last updated: 2026-11-21

## Summary

Many Tabs collects, transmits, stores, and shares **nothing**. It is a local-only
Chrome extension: all features run inside your browser, and the extension never
communicates with any external service.

- No data collection (no analytics, telemetry, or crash reporting)
- No network communication of any kind (`fetch`, `XMLHttpRequest`, `WebSocket`,
  `sendBeacon`, remote code, CDNs, and external SDKs are all absent; the
  extension's Content Security Policy declares `connect-src 'none'`)
- No persistent storage (no `chrome.storage`, `localStorage`, IndexedDB,
  cookies, or server-side storage — closing Chrome resets all preferences)
- No accounts, no advertising IDs, no third parties

## What the extension reads and why

The extension uses Chrome APIs to read your open tabs' titles, URLs, favicon
references, and group membership, **only to display them inside the side panel
and the on-page rail UI and to perform the tab operations you request**
(switch, close, pin, mute, duplicate, group, reorder, search). This information
is rendered locally and is never transmitted or persisted.

Settings such as rail position, display mode, and language choice are kept only
in memory and are discarded when Chrome restarts. Tab tags you type are also
kept only in memory, are removed when the tab is closed, and are discarded when
Chrome restarts; they are never written to storage.

## Permission disclosures

| Permission | Purpose |
|---|---|
| `sidePanel` | Show the tab list UI in Chrome's side panel |
| `tabs` | Read tab title/URL/favicon/group state and perform tab operations |
| `tabGroups` | Read group titles/colors and create or update tab groups |
| `favicon` | Render tab favicons via Chrome's internal `_favicon` endpoint |
| Content scripts (`rail.js` on `http`/`https`/`file` pages) | Draw the collapsible tab rail as a closed-Shadow-DOM overlay on pages you view |

The content script does **not** read or modify page content; it only draws its
own overlay. The `file:///*` match lets the rail appear on local HTML files and
can be left unused if you never open such files — it cannot read anything
beyond drawing its overlay either.

## Changes to this policy

Any changes are published in this file on the public repository. The extension
has no mechanism to notify users other than an update to the packaged code.

---

## 日本語

最終更新: 2026-11-21

## 概要

Many Tabs は**何も**収集・送信・保存・共有しません。ローカル専用の Chrome
拡張で、全機能はブラウザ内だけで動き、外部サービスとの通信は一切ありません。

- データ収集なし（アナリティクス・テレメトリ・クラッシュレポートなし）
- 外部通信なし（`fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` /
  リモートコード / CDN / 外部 SDK はすべて非搭載。CSP は `connect-src 'none'`）
- 永続化なし（`chrome.storage` / `localStorage` / IndexedDB / Cookie /
  サーバー保存なし。Chrome を閉じると設定はリセット）
- アカウント・広告 ID・第三者への提供なし

## 読み取る情報と目的

拡張は Chrome API を通じて、開いているタブのタイトル・URL・favicon 参照・
グループ情報を読み取りますが、**サイドパネルとページ上のレールに表示し、
ユーザーが指示したタブ操作（切替・閉じる・ピン・ミュート・複製・
グループ化・並べ替え・検索）を行うためだけ**に使います。これらの情報は
ローカルで描画されるだけで、送信・保存されません。

レールの位置・表示モード・言語などの設定はメモリ上だけに保持され、
Chrome の再起動で破棄されます。手入力したタブのタグもメモリ上だけに保持し、
そのタブを閉じると消え、Chrome の再起動で破棄されます。ストレージには書き込みません。

## 権限の説明

| 権限 | 目的 |
|---|---|
| `sidePanel` | Chrome のサイドパネルにタブ一覧 UI を表示 |
| `tabs` | タブのタイトル・URL・favicon・グループ状態の読み取りとタブ操作 |
| `tabGroups` | グループのタイトル・色の読み取り、グループの作成・更新 |
| `favicon` | Chrome 内蔵 `_favicon` エンドポイントによる favicon 描画 |
| content scripts（`http`/`https`/`file` ページへの `rail.js`） | 閲覧ページ上に畳めるタブレールを Shadow DOM overlay として描画 |

content script はページ本文を**読み取らず・改変もしません**。自前の
overlay を描くだけです。`file:///*` へのマッチはローカル HTML ファイルでも
レールを出すためのもので、使わなければ動作しません。どの場合も overlay
描画以外のことはできません。

## ポリシーの変更

変更は公開リポジトリ上のこのファイルで公開されます。拡張自体にユーザーへ
通知する仕組みはありません。
