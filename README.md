# MyDash

ブックマーク・タスク・メモをまとめて管理するパーソナルダッシュボード。

## インストール（macOS）

1. **[Node.js](https://nodejs.org) をインストール**（未インストールの場合のみ）
2. **`setup.command` をダブルクリック**
3. 画面の指示に従う（Chrome拡張のインストールも案内される）

完了後は `http://127.0.0.1:3737` でアクセスできる。ログイン時に自動起動する。

## セットアップ後にやること

### Chrome拡張のインストール（Slack連携・任意）

1. Chromeで `chrome://extensions` を開く
2. 右上の **デベロッパーモード** をON
3. **「パッケージ化されていない拡張機能を読み込む」** → `slack-extension/` フォルダを選択

### DockへのMyDash追加（任意）

1. Chromeで `http://127.0.0.1:3737` を開く
2. 右上「⋮」→「保存と共有」→「ショートカットを作成」
3. 「ウィンドウとして開く」にチェック → 「作成」
4. Dockのアイコンを右クリック → 「オプション」→「Dockに追加」

## ウェブ版

macOS・Node.js不要。ブックマーク・タスク・メモ管理はWindowsでも使用可能。

https://hataken2000.github.io/mydash/

## データの同期（複数端末）

MyDash内の設定 → GitHub Gist連携でデータを同期できる。  
トークンの発行: https://github.com/settings/tokens（`gist` スコープをON）
