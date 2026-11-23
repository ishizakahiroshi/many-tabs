<!-- このファイルはプロジェクト固有ルールのみを書く。個人/グローバル AI ルール
（言語・確認スタイル・出力フォーマット等）は各 AI ツールのグローバル設定へ。
fresh public clone でも有効な内容に保つこと。 -->

# Many Tabs 開発ガイド

> **このファイルは索引であって本文ではない。** 全 AI セッションで全文がロードされるので、
> ルールの本文はここへ書かず、破る人が必ず開く場所（コード・検査スクリプト・skill・guide・台帳）へ置き、
> ここには索引の 1 行だけを残す。新しいルールを足す前に既存の CLAUDE.md・skill・guide・台帳を検索し、
> 正本が既にあれば参照だけにする。詳細は下記「設計原則の索引」。

## プロジェクト概要

Chrome 拡張機能（Manifest V3）。画面の辺に外部通信を一切行わないローカル専用のタブ一覧を表示する。表示は 2 系統: Chrome 標準のサイドパネル（機能フル）と、各ページの辺に重ねる最小表示のレール（rail.js・content script）。サイドパネルからタブの切替・閉じる・新規・検索・固定・グループ操作・D&D 並べ替えを行える。個人用の試作。公開可否は実機検証のあとに判断する（README「将来の一般公開について」参照）。

## やらないこと（スコープ外）

- 外部通信・解析・テレメトリ・外部 SDK/CDN の導入（設計の前提を壊す）
- ページ本文の読み取り・改変・ページ由来データの保存（rail.js は自前の overlay を描くだけで、ページ DOM には触れない）
- `host_permissions` の追加・content_scripts の rail.js 以外への拡大・all_frames の有効化
- 閲覧情報の永続化（storage・localStorage・サーバー送信）
- Chrome 標準の横タブ・垂直タブを非表示にする機能（Chrome API 上不可能）
- Chrome ウェブストア公開（未定・公開前にはストア規約とプライバシー説明の整備が別途必要）

## 技術スタック

| 層 | 技術 |
|---|---|
| 本体 | バニラ JS / HTML / CSS（依存パッケージなし・ビルド工程なし） |
| 基盤 | Chrome Extension Manifest V3（sidePanel / tabs / tabGroups / favicon / content_scripts / service worker） |
| 検査 | `tests/security-check.py`（禁止 API・宣言の静的チェック）、doxguard（pre-commit） |

## ディレクトリ構成

```
manifest.json        MV3 マニフェスト（permissions: sidePanel / tabs / tabGroups / favicon + content_scripts 宣言）
background.js        service worker（アイコン押下でサイドパネル・レールへの配信と操作中継）
rail.js              画面の辺のレール（content script・closed Shadow DOM overlay）
rail-config.js       レール畳み表示の既定モード（background.js が importScripts で読む）
sidepanel.html / sidepanel.js / styles.css   サイドパネルの画面・タブ操作
icons/               拡張機能アイコン（16/32/48/128）
tests/               security-check.py（静的チェック）
scripts/             secrets-scan.mjs / check-claude-md.mjs / install-hooks.*
.githooks/           pre-commit（layer 2・doxguard opt-in）
.github/workflows/   secrets-scan.yml（layer 3・CI バックストップ）/ security-check.yml（tests/security-check.py を CI で実行）
docs/local/          ローカル作業ノート（gitignore・Drive 同期領域への junction）
docs/obsidian/       Obsidian 連携入口（gitignore・junction）
```

## 主要コマンド

- 静的チェック: `python tests/security-check.py .`
- JS 構文確認: `node --check sidepanel.js` / `node --check background.js`
- secrets-scan 手動実行: `node scripts/secrets-scan.mjs --staged --block`

## 設計原則の索引（本文は正本にある）

| ルール | 正本（本文はここ） | 機械検査 |
|---|---|---|
| 外部通信・外部コードの禁止 | `manifest.json` の CSP と `README.md`「セキュリティ/プライバシー」 | `tests/security-check.py` |
| manifest 権限は最小維持 | `manifest.json` | `tests/security-check.py` |

**新しいルールを足す前に、まずこの表に 1 行足せる形にできないかを考える。** できないもの
（機械検査も、決まったファイルも無いもの）だけが本文を持ってよい。

## AI 作業共通ルール

ビルド・コミット禁止、secrets-scan 責務、plan/bugfix/pending md の作成ルール等の AI 作業共通ルールは、各利用者のグローバル AI 設定に従う（作者環境の例: `~/.claude/CLAUDE.md` および `~/.claude/guides/`）。

このリポジトリ固有のルール:

- 公開対象ファイル（`README*`・`CLAUDE.md`・`AGENTS.md`・`src`・`dist`・push される全ファイル）に、実在の人名・組織名・私有パスを書かない
- `chrome.storage` / `localStorage` / IndexedDB を使うコードを足さない（設計上、閲覧情報を保存しない）

## Obsidian artifacts

If `docs/obsidian/README.md` exists, use it as an index for related knowledge artifacts.
Use the repository-relative `docs/obsidian` entry. Do not write to a central absolute
path and do not silently fall back to `docs/local` when the entry is missing.

## secrets-scan（このリポジトリの配線）

書く瞬間の責務（固有名詞の一般化・fixture は合成データ等）は上記「AI 作業共通ルール」の参照先に従う。このリポジトリ固有の配線は以下:

- scanner: `scripts/secrets-scan.mjs`（手動実行: `node scripts/secrets-scan.mjs --staged --block`）
- layer 2: `.githooks/pre-commit` 内の doxguard opt-in block（作者環境のみ有効・`git config core.hooksPath .githooks` で有効化済み。fresh clone では `scripts/install-hooks.{sh,ps1}` を実行）
- layer 3: `.github/workflows/secrets-scan.yml`（CI では構造パターンのみ + `check-claude-md.mjs`）
- layer 4: release ゲート
- env (full coverage に必要・未設定なら構造 regex のみで継続): `KB_ROOT` / `FAMILY_ROOT`。設定詳細は `scripts/secrets-scan.mjs` の冒頭コメント

## 関連ドキュメント

| 項目 | パス |
|---|---|
| ユーザー向け README | `README.md` |
| Codex/他 AI 用入口 | `AGENTS.md` |
| ローカル作業ノート（非公開） | `docs/local/`（存在する場合） |
| Obsidian knowledge artifacts | `docs/obsidian/`（存在する場合。作業キューではない） |
