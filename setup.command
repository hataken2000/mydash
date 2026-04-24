#!/bin/zsh
# MyDash Server セットアップ
# ダブルクリックで実行（macOS専用）
setopt NULL_GLOB

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SERVER_JS="$SCRIPT_DIR/mydash-server.js"
PLIST_PATH="$HOME/Library/LaunchAgents/com.hataken.mydash-server.plist"
LABEL="com.hataken.mydash-server"

# 確認ダイアログ
result=$(osascript -e 'display dialog "MyDash Serverをセットアップします。\n\nログイン時に自動起動するよう設定します。" buttons {"キャンセル", "OK"} default button "OK" with title "MyDash セットアップ"' 2>&1)
[[ "$result" != *"OK"* ]] && exit 0

# mydash-server.jsの確認
if [ ! -f "$SERVER_JS" ]; then
  osascript -e 'display dialog "mydash-server.js が見つかりません。\nsetup.command と同じフォルダに置いてください。" buttons {"OK"} default button "OK" with icon stop with title "MyDash セットアップ"'
  exit 1
fi

# nodeのパスを検出
NODE_PATH=""
for p in \
  "$(which node 2>/dev/null)" \
  /usr/local/bin/node \
  /opt/homebrew/bin/node \
  "$HOME/.nvm/versions/node/"*/bin/node; do
  if [ -f "$p" ]; then
    NODE_PATH="$p"
    break
  fi
done

if [ -z "$NODE_PATH" ]; then
  osascript -e 'display dialog "Node.js が見つかりません。\nhttps://nodejs.org からインストールしてください。" buttons {"OK"} default button "OK" with icon stop with title "MyDash セットアップ"'
  exit 1
fi

# 既存のlaunchdエントリを停止
launchctl unload "$PLIST_PATH" 2>/dev/null

# plist生成
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$SERVER_JS</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/mydash-server.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/mydash-server.log</string>
</dict>
</plist>
EOF

# launchdに登録・即時起動
launchctl load "$PLIST_PATH"

# MyDashをブラウザで開く
sleep 1
open "http://127.0.0.1:3737"

# 完了・次のステップ案内
osascript -e 'display dialog "✅ セットアップ完了！\n\nMyDashを開きました。\n\n─ 次のステップ（README参照）─\n・Chrome拡張のインストール（Slack連携）\n・DockへのMyDash追加" buttons {"OK"} default button "OK" with title "MyDash セットアップ"'
