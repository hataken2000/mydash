# MyDash — CLAUDE.md

このファイルはクロ助（Claude Code）がMyDash作業時に参照するプロジェクトガイド。

---

## ファイル構成

```
~/Desktop/mydash/
├── mydash.html          # メインアプリ（約4900行のシングルHTMLファイル）★編集対象
├── mydash-server.js     # ローカルサーバー（port 3737）※.gitignore対象
├── MyDash.app/          # ワンクリック起動アプリ    ※.gitignore対象
├── manual.html          # マニュアル（?ボタンからアクセス）
├── widget.html          # ウィジェット（時計＋今日のタスク）
├── index.html           # GitHub Pages リダイレクト用
├── slack-extension/     # Chrome拡張（Slack送信）※Chromeの拡張機能管理で手動インストール
│   ├── manifest.json
│   ├── background.js    # Slack操作・セット起動のメイン処理
│   └── content-mydash.js # MyDashページ↔Chrome拡張の橋渡し
├── backup Hatakeyama/   # 日時付きバックアップ置き場 ※.gitignore対象
├── CLAUDE.md            # このファイル（クロ助用ガイド）
└── .gitignore           # backup/, .DS_Store, mydash-server.js, *.app を除外
```

### .gitignore で除外されているもの（ローカル専用）
- `backup Hatakeyama/` — バックアップ
- `mydash-server.js` — macOS専用ローカルサーバー
- `*.app` — MyDash.app
- `.DS_Store` / `.window-state.json`

### GitHub / GitHub Pages
- **リポジトリ:** https://github.com/hataken2000/mydash（個人アカウント `hataken2000`）
- **GitHub Pages:** https://hataken2000.github.io/mydash/
- ブランチ: `main` のみ。GitHub Pages は `main` ルートから自動デプロイ
- コミット後は `git push origin main` でPages反映（数十秒〜1分で反映）
- ※ `gouichi-hatakeyama` は会社アカウント。MyDashは `hataken2000` 管理

---

## データの分散先（どこに何が保存されているか）

| 保存場所 | キー / 場所 | 内容 |
|----------|------------|------|
| **localStorage** | `mydash_v1` | アイテム・設定・アラーム・並び順・展開状態など全データ |
| **localStorage** | `mydash_github_token` | GitHub Gist用アクセストークン（分離保存） |
| **localStorage** | `mydash_gist_id` | GistのID（分離保存） |
| **GitHub Gist** | ユーザー設定のGist | JSON全体のバックアップ・複数端末同期用 |
| **GitHub Pages** | hataken2000/mydash | mydash.html / manual.html / widget.html の静的ホスティング |
| **Chrome拡張** | slack-extension/ | Slack送信機能（Chromeの拡張機能管理で別途インストール） |

- データは**端末のブラウザのlocalStorageに閉じている**（社外に漏れない）
- 複数端末で使う場合はGist同期で手動バックアップ/ダウンロード

---

## アーキテクチャ

```
db（localStorage: 'mydash_v1'）
  ↓ load()
state（表示状態: filter/view/sort/expandedCards など）
  ↓ filteredItems()
render() → gridCard() / listCard() / iconCard()
  ↓ save()
db（localStorage）
```

- `db` = 永続データ（items / settings / alarms / itemOrder / expandedCards など）
- `state` = 表示状態（フィルター・ビュー・ソート・選択モードなど）
- 全コードは `mydash.html` 1ファイルに集約

### 重要な定数
```javascript
const STORAGE_KEY = 'mydash_v1';               // localStorage キー
const SERVER_BASE = 'http://127.0.0.1:3737';   // ローカルサーバー（ローカル時のみ非null）
const SHORTCUT_BASE = 'https://hataken2000.github.io/mydash/mydash.html'; // iPhoneショートカットURL用
```

### ローカルサーバー（mydash-server.js）のエンドポイント
| エンドポイント | 用途 |
|----------------|------|
| `GET /ping` | サーバー生存確認 |
| `GET /open?app=NAME` | macOSアプリを起動 |
| `POST /open-chrome` | ChromeでURLを開く |
| `GET /open-widget` | ウィジェットウィンドウを開く |
| `GET /restore-position` | MyDashウィンドウ位置を復元 |
| `GET /save-position` | ウィンドウ位置を保存 |
| `GET /fetch-ical?url=...` | CORS回避でICSを取得 |
| `GET /dock-apps` | macOS Dockのアプリ一覧を取得 |

`SERVER_BASE` が `null` の場合（GitHub Pages等）はサーバー依存機能を無効化する設計。

---

## アイテム種類（7種類）

| type | 表示色 | 用途 |
|------|--------|------|
| bookmark | --bookmark (水色) | URLブックマーク |
| tool | --tool (緑) | アプリ/ツール起動 |
| task | --task (オレンジ) | タスク管理 |
| memo | --memo (ピンク) | メモ |
| other | --other (紫) | その他 |
| set | --set (ティール) | URLセット起動 |
| slack | --slack (黄緑) | Slack送信 |

---

## 実装済み主要機能

- **表示モード:** グリッド / リスト / アイコン（タイトル外出し・省略付き）
- **ソート:** 手動 / 新しい順 / 古い順 / A→Z / Z→A / 種類順 / 優先度順 / カテゴリ順
- **フィルター:** サイドバー（タイプ / カテゴリ / お気に入り / アラーム）
  - タスクサブフィルター: 今日締切 / 期限超過 / 進行中（サイドバー内インデント）
  - セットサブフィルター: アラームあり（サイドバー内インデント）
- **カード展開:** ▼ボタンで詳細展開（expandedCards: Set で状態管理）
- **ドラッグ&ドロップ:**
  - 全ソートでドラッグ有効（カテゴリへのD&Dでカテゴリ付与）
  - `manual` ソート時のみカード間並び替え可能
- **アラーム:** 繰り返し対応・セット自動起動・スヌーズ・集中モード
- **クイック編集:** タスク/メモのインライン編集（ダブルクリック）
- **カテゴリ:** カラードット表示・ドラッグでカテゴリ変更・リネーム
- **アイコン:** 絵文字/URL画像/クリップボード貼り付け
- **Slack連携:** Chrome拡張経由でブラウザSlackにメッセージ送信
- **iPhoneショートカット:** URLスキームでセット起動・メモ追加
- **データ同期:** GitHub Gist（手動バックアップ/複数端末）
- **インポート:** Googleカレンダー ICS / Dockアプリ一括インポート
- **テーマ:** ライト/ダーク + アクセントカラー変更
- **PC機能トグル:** appName持ちアイテムをサイドバーごと非表示
- **スマホ対応:** ピンチズーム防止（touchmove + gesturestart JS制御）

---

## 重要な設計判断

### タイプカラー表現
```javascript
function typeColor(item) {
  const isLight = document.body.classList.contains('light');
  return isLight
    ? ({ bookmark:'var(--bookmark)', ... }[item.type] || 'var(--border)')  // 鮮やか
    : ({ bookmark:'rgba(79,195,247,0.45)', ... }[item.type] || 'var(--border)');  // ダルトーン
}
```
- gridCard: `border-left: 4px solid`
- listCard: 全分岐に `border-left: 4px solid`
- iconCard: `border-top: 3px solid`

### iconCard の構造
```html
<div class="icon-wrap" [server-feature] [item-hidden]>
  <div class="icon-card" data-id="...">アイコン</div>
  <div class="icon-title">タイトル（省略付き）</div>
</div>
```
`server-feature` / `item-hidden` は `icon-wrap` に付ける（タイトルも連動する）

### サイドバー vs ツールバーの役割分担
- **サイドバー = フィルター（絞り込み）**
- **ツールバー = 表示操作（ソート・表示形式）**

### カテゴリ順ソートのセクションヘッダー
- `.cat-section + .cat-section { margin-top: 24px }` でセクション間スペース確保
- セクションヘッダーのmargin-top管理はここのみ（:first-child は使わない）

---

## 作業時の注意点

1. **編集前は必ずファイルを読む**（行数が多いので対象箇所を確認してから）
2. **バックアップを先に作る** → `backup Hatakeyama/` に日時付きでコピー
3. **コミット前の確認** → 変更箇所を一通り確認してからコミット
4. **manual.html も更新が必要な場合あり** → 新機能追加時は連動して更新する
5. **mydash-server.js / MyDash.app は .gitignore対象** → GitHub Pagesには上げない

---

## 未着手・検討中タスク

- [ ] スマホUI改善（ヘッダーボタンの整理・スマホ向けレイアウト）
- [ ] 全アイテムにアラーム機能（現在はセットのみ）
- [ ] Windows対応（mydash-server.js のスクリプト部分）
- [ ] オンライン同期強化（Gistで一部対応済み）
- [ ] 位置情報トリガー（iOSバックグラウンド制限あり）
- [ ] Slackブラウザ版 自動入力の精度向上

---

## よく使うパターン

```javascript
// 新しい state フラグを追加する場合
state.newFlag = false;  // state定義部に追加
// filteredItems() か render() で参照
// db.newFlag で永続化が必要なら save()/load() にも追加

// トースト通知
toast('メッセージ', '絵文字');

// モーダルを開く
openModal();  // 新規追加
editItem(id); // 編集
```
