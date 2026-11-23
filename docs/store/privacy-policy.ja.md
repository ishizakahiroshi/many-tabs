# プライバシーポリシー（日本語・申請用）— Many Tabs

最終更新: 2026-11-23

## データ収集に関する申告

Many Tabs はユーザーデータを**一切収集・送信・保存・共有しません**。

- 閲覧履歴・タブ情報・個人情報・認証情報・位置情報・通信内容の収集: なし
- アナリティクス・テレメトリ・クラッシュレポート: なし
- 外部サービス・広告ネットワーク・第三者への提供: なし
- リモートコードの読み込み・実行: なし（全コードは拡張パッケージ同梱）

## 技術的裏付け

- `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / 外部 SDK / CDN を実装していません
- コンテンツセキュリティポリシーは `connect-src 'none'` で、拡張ページからのあらゆる接続をブロックします
- `chrome.storage` / `localStorage` / IndexedDB / Cookie を使用しません。設定はメモリのみで、Chrome 再起動時に消去されます
- content script（`rail.js`）はページ本文を読み取らず・改変せず、自前の Shadow DOM overlay だけを描画します
- レールの検索欄は拡張側のページ（`search.html`）を iframe で入れており、打った文字は表示中のページのスクリプトから見えません
- 静的検査スクリプト（`tests/security-check.py`）で、禁止 API・権限セット・CSP・content_scripts 宣言が変更時に機械チェックされます

## 権限ごとの用途

- `sidePanel`: タブ一覧 UI をサイドパネルに表示
- `tabs`: タブのタイトル・URL・favicon・グループ状態を読み、表示・検索・タブ操作（切替・閉じる・ピン・ミュート・複製・並べ替え）に使用
- `tabGroups`: グループ名・色の表示と、グループの作成・更新
- `favicon`: Chrome 内蔵 `_favicon` エンドポイントでタブアイコンを描画
- content scripts（`http://*/*` `https://*/*` `file:///*` の `rail.js`）: ページの辺に畳めるタブレールを overlay として描画

## 連絡先

公開リポジトリの Issues からご連絡ください。セキュリティ上の問題（脆弱性）は、公開の Issues ではなく、リポジトリの `SECURITY.md` の手順で非公開にお知らせください。

※ 本文書は `PRIVACY.md`（リポジトリ公開版・日英両記）の日本語側と同一内容です。
