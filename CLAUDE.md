# MyDash — CLAUDE.md

クロ助がMyDash作業時に参照するプロジェクトガイド。

---

## ファイル構成

```
~/Desktop/mydash/
├── mydash.html          # メインアプリ（約4900行）★主な編集対象
├── manual.html          # マニュアル（?ボタン）
├── widget.html          # ウィジェット（時計＋今日のタスク）
├── index.html           # GitHub Pages リダイレクト
├── slack-extension/     # Chrome拡張（Chromeで手動インストール）
├── mydash-server.js     # ローカルサーバー port:3737 ※gitignore
├── MyDash.app/          # 起動アプリ ※gitignore
└── backup Hatakeyama/  # バックアップ置き場 ※gitignore
```

- **GitHub:** https://github.com/hataken2000/mydash（個人 `hataken2000`、会社は `gouichi-hatakeyama`）
- **GitHub Pages:** https://hataken2000.github.io/mydash/（mainにpushで自動反映）

---

## データの分散先

| 保存場所 | キー | 内容 |
|----------|------|------|
| localStorage | `mydash_v1` | 全データ（アイテム・設定・アラーム等） |
| localStorage | `mydash_github_token` / `mydash_gist_id` | Gist認証情報（分離保存） |
| GitHub Gist | ユーザー設定 | JSON全体バックアップ・複数端末同期 |

データは端末のブラウザに閉じている（社外に漏れない）。

---

## アーキテクチャ

```
db（localStorage: 'mydash_v1'）→ load() → state → filteredItems() → render() → save()
```

- `db` = 永続データ、`state` = 表示状態（フィルター・ビュー・ソートなど）
- アイテム種別: `bookmark / tool / task / memo / other / set / slack`
- 重要定数: `STORAGE_KEY='mydash_v1'` / `SERVER_BASE`（ローカル時のみ非null） / `SHORTCUT_BASE`

### ローカルサーバーのエンドポイント（mydash-server.js）
`/ping` `/open` `/open-chrome` `/open-widget` `/restore-position` `/save-position` `/fetch-ical` `/dock-apps`
— `SERVER_BASE` が null（GitHub Pages等）の場合はサーバー依存機能を自動無効化。

---

## 重要な設計判断（Whyを残す）

**タイプカラー:** `typeColor(item)` でライト（鮮やか）/ ダーク（rgba 0.45ダルトーン）を切り替え。gridCard=`border-left:4px`、listCard=全分岐に同じ、iconCard=`border-top:3px`。

**iconWrapの構造:** `server-feature` / `item-hidden` は `.icon-wrap` に付ける（`.icon-card` ではない）。タイトルも連動して表示/非表示になるため。

**ドラッグの分離:** `initDragSort()` は全ソートで `draggable=true`（カテゴリD&D付与のため）。カード間並び替えは `manual` ソート時のみ。

**サイドバー vs ツールバー:** サイドバー=フィルター（絞り込み）、ツールバー=表示操作（ソート・表示形式）。タスク/セットのサブフィルターはサイドバー内インデント表示。

**カテゴリセクション間のスペース:** `.cat-section + .cat-section { margin-top: 24px }` で管理。`:first-child` は使わない（常に0になるバグがあったため）。

**renderMemo のリッチ対応:** `![alt](url)` または画像拡張子URL直貼り → サムネイル。Google Maps URL → 📍カード。`〒XXX-XXXX 住所` → iframeで地図埋め込み（自動認識）。処理順: 画像→リンク→bare URL（Maps/画像判定）→住所→Markdown記法→改行。

**クイック編集の内容欄:** プレビュー表示（`renderMemo`）＋クリックで編集切り替え。`_qeShowEdit()` / `_qeShowPreview()` で制御。WYSIWYGは見送り（ライブラリ必要・スマホ厳しい）。

---

## このファイル（CLAUDE.md）の運用ルール

- **「やることみて」と言われたら、Notionのやりたいことメモをfetchして確認する**
  - URL: https://www.notion.so/kidsstar/334f6127f54c804c955ec2694d1e899a
- **「まとめて」と言われたタイミングでNotionと合わせて更新する**
  - 更新対象: 未着手タスク / 設計判断の変化
  - 更新不要: コミット履歴・一時メモ・コードを読めば分かる詳細
- **200行を超えたらハタケに知らせ、詳細をNotionリファレンスに退避する**
  - Notion詳細リファレンス: https://www.notion.so/33ef6127f54c814eb9b9f29ec466ab71
  - 「Notionのリファレンス見て」と言えばfetchできる

---

## バージョン管理ルール

**現在のバージョン: v1.4.0**

形式: `vMAJOR.MINOR.PATCH`

| 区分 | 上げるタイミング |
|---|---|
| MAJOR | 大規模な設計変更・作り直し |
| MINOR | 機能追加（新しいタイプ・UI機能など） |
| PATCH | バグ修正・小さな改善・UI調整 |

- バージョン記載箇所は `mydash.html` サイドバーフッターの **1箇所のみ**
- `manual.html` には記載しない（アプリ内参照に統一）
- Notionまとめのタイトルにバージョンを記載する（例: `2026-04-11 [v1.4.0]: 〇〇の作業`）

---

## 作業時の注意点

1. 編集前は必ずファイルを読む（行数が多いので対象箇所を確認してから）
2. 新機能追加時は `manual.html` も連動して更新する
3. `mydash-server.js` / `MyDash.app` は gitignore対象（GitHub Pagesには上げない）

---

## 未着手・検討中タスク

- [ ] スマホUI改善（ヘッダーボタンの整理・スマホ向けレイアウト）
- [ ] 全アイテムにアラーム機能（現在はセットのみ）
- [ ] Windows対応（mydash-server.js のスクリプト部分）
- [ ] オンライン同期強化（Gistで一部対応済み）
- [ ] 位置情報トリガー（iOSバックグラウンド制限あり）
- [ ] Slackブラウザ版 自動入力の精度向上
