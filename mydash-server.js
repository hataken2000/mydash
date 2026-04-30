/**
 * MyDash Local Server
 * macOSアプリをmydash.htmlから起動するための中継サーバー
 * http://127.0.0.1:3737
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

const STATIC_DIR = path.dirname(__filename);
const STATIC_FILES = { 'mydash.html': 'text/html', 'widget.html': 'text/html', 'manual.html': 'text/html' };

const PORT = 3737;
const HOST = '0.0.0.0';

// Slack後で読むアイテムのメモリキャッシュ（サーバー再起動でリセット）
let _slackSavedItems = [];

// アプリ名のバリデーション（Unicode文字・スペース・ドット・ハイフン・アンダースコアを許可）
const SAFE_APP_NAME = /^[\p{L}\p{N}\s.\-_]+$/u;

const server = http.createServer((req, res) => {
  // CORS（localhost / file:// からのアクセスのみ）
  const origin = req.headers.origin || '';
  const allowed = !origin
    || origin === 'null'
    || origin.startsWith('file://')
    || origin.startsWith('http://127.0.0.1')
    || origin.startsWith('http://localhost')
    || origin.startsWith('http://192.168.')
    || origin.startsWith('http://10.')
    || origin.startsWith('chrome-extension://');
  if (!allowed) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsed = new URL(req.url, `http://${HOST}:${PORT}`);

  // GET /restore-position → osascriptでMyDashウィンドウを正しい位置に移動
  if (parsed.pathname === '/restore-position' && req.method === 'GET') {
    const px = parseInt(parsed.searchParams.get('x')) || 0;
    const py = parseInt(parsed.searchParams.get('y')) || 0;
    const pw = parseInt(parsed.searchParams.get('w')) || 420;
    const ph = parseInt(parsed.searchParams.get('h')) || 900;
    const script = [
      'tell application "System Events"',
      '  repeat with proc in (every process whose name is "Google Chrome")',
      '    repeat with win in (windows of proc)',
      '      if (name of win contains "MyDash") then',
      `        set position of win to {${px}, ${py}}`,
      `        set size of win to {${pw}, ${ph}}`,
      '        return',
      '      end if',
      '    end repeat',
      '  end repeat',
      'end tell'
    ].join('\n');
    execFile('osascript', ['-e', script], () => {});
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /save-position → ウィンドウ位置・サイズをファイルに保存
  if (parsed.pathname === '/save-position' && req.method === 'GET') {
    const x = parseInt(parsed.searchParams.get('x')) || 0;
    const y = parseInt(parsed.searchParams.get('y')) || 0;
    const w = parseInt(parsed.searchParams.get('w')) || 420;
    const h = parseInt(parsed.searchParams.get('h')) || 900;
    const statePath = path.join(STATIC_DIR, '.window-state.json');
    fs.writeFile(statePath, JSON.stringify({ x, y, w, h }), () => {});
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    return;
  }

// GET /open-widget → widget.htmlをChromeアプリモードで起動
  if (parsed.pathname === '/open-widget' && req.method === 'GET') {
    const widgetPath = path.join(STATIC_DIR, 'widget.html');
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    execFile(chromePath, [`--app=http://127.0.0.1:3737/widget.html`, '--window-size=300,540'], (err) => {
      if (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return; }
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // POST /slack-saved → Chrome拡張からSlack後で読むを受信
  if (parsed.pathname === '/slack-saved' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed2 = JSON.parse(body);
        if (Array.isArray(parsed2.items)) {
          _slackSavedItems = parsed2.items;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, count: _slackSavedItems.length }));
      } catch (_) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid JSON' }));
      }
    });
    return;
  }

  // GET /slack-saved → mydash.htmlがポーリングして取得
  if (parsed.pathname === '/slack-saved' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, items: _slackSavedItems }));
    return;
  }

  // GET /ping → サーバー死活確認
  if (parsed.pathname === '/ping') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, version: '1.1' }));
    return;
  }

  // GET /open?app=AppName → アプリ起動
  if (parsed.pathname === '/open' && req.method === 'GET') {
    const appName = (parsed.searchParams.get('app') || '').trim();

    if (!appName) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'app parameter required' }));
      return;
    }

    if (!SAFE_APP_NAME.test(appName)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid app name' }));
      return;
    }

    const cmd = `open -a "${appName.replace(/"/g, '')}"`;
    exec(cmd, (err) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'failed to open', app: appName, detail: err.message }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, app: appName }));
    });
    return;
  }

  // GET /open-mydash → MyDash本体を前面に（なければ新規ウィンドウ）
  if (parsed.pathname === '/open-mydash' && req.method === 'GET') {
    const scriptContent = `tell application "Google Chrome"
  set foundWinIdx to 0
  set foundTabIdx to 0
  repeat with winIdx from 1 to count windows
    set w to window winIdx
    repeat with tabIdx from 1 to count tabs of w
      set t to tab tabIdx of w
      if URL of t contains "127.0.0.1:3737" and URL of t does not contain "widget" then
        set foundWinIdx to winIdx
        set foundTabIdx to tabIdx
        exit repeat
      end if
    end repeat
    if foundWinIdx > 0 then exit repeat
  end repeat
  if foundWinIdx > 0 then
    set active tab index of window foundWinIdx to foundTabIdx
    set index of window foundWinIdx to 1
    set visible of window 1 to true
    activate
    return "found"
  else
    open location "http://127.0.0.1:3737"
    activate
    return "opened"
  end if
end tell`;
    const tmpScript = '/tmp/mydash-open-mydash.scpt';
    fs.writeFileSync(tmpScript, scriptContent);
    execFile('osascript', [tmpScript], (err, stdout) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'failed', detail: err.message }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, result: stdout.trim() }));
    });
    return;
  }

  // POST /open-chrome → ChromeをAppleScriptで新しいウィンドウで開く
  // Body: { urls: ["https://...", ...] }
  if (parsed.pathname === '/open-chrome' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let urls;
      try {
        const parsed = JSON.parse(body);
        urls = parsed.urls;
      } catch (_) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid JSON body' }));
        return;
      }

      if (!Array.isArray(urls) || urls.length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'urls array required' }));
        return;
      }

      // URLバリデーション（httpスキームのみ許可、ダブルクォートを除去）
      const safeUrls = urls
        .filter(u => typeof u === 'string' && /^https?:\/\//.test(u))
        .map(u => u.replace(/"/g, '').replace(/\\/g, ''));

      if (safeUrls.length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'no valid urls' }));
        return;
      }

      // AppleScriptで新しいウィンドウを開く
      const tabLines = safeUrls.slice(1)
        .map(u => `  tell w to make new tab with properties {URL:"${u}"}`)
        .join('\n');

      const script = [
        'tell application "Google Chrome"',
        '  set w to make new window',
        `  set URL of active tab of w to "${safeUrls[0]}"`,
        tabLines,
        '  activate',
        'end tell',
      ].join('\n');

      execFile('osascript', ['-e', script], (err) => {
        if (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'failed to open Chrome', detail: err.message }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, count: safeUrls.length }));
      });
    });
    return;
  }

  // GET /fetch-ical?url=<encoded_url> → ICSデータをプロキシ取得（CORSを回避）
  if (parsed.pathname === '/fetch-ical' && req.method === 'GET') {
    const icalUrl = parsed.searchParams.get('url');
    let urlObj;
    try {
      urlObj = new URL(icalUrl);
      if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') throw new Error();
    } catch (_) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid url' }));
      return;
    }
    const client = urlObj.protocol === 'https:' ? https : http;
    const icsReq = client.get(icalUrl, (icsRes) => {
      let data = '';
      icsRes.on('data', chunk => { data += chunk; });
      icsRes.on('end', () => {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, data }));
      });
    });
    icsReq.on('error', (err) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'fetch failed', detail: err.message }));
    });
    icsReq.setTimeout(12000, () => {
      icsReq.destroy();
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'timeout' }));
    });
    return;
  }

  // GET /open-claude?dir=/path/to/project → 指定ディレクトリでTerminalを開きClaudeを起動
  if (parsed.pathname === '/open-claude' && req.method === 'GET') {
    const dir = (parsed.searchParams.get('dir') || '').trim();
    if (!dir || dir.includes('..') || !dir.startsWith('/')) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid dir parameter' }));
      return;
    }
    const safeDir = dir.replace(/"/g, '');
    const script = [
      'tell application "Terminal"',
      '  activate',
      `  do script "cd \\"${safeDir}\\" && claude"`,
      'end tell'
    ].join('\n');
    execFile('osascript', ['-e', script], (err) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'failed', detail: err.message }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, dir: safeDir }));
    });
    return;
  }

  // POST /exec-terminal → 指定コマンドをターミナルで実行
  // Body: { command: "cd /path && npm run dev", terminal: "Terminal" }
  if (parsed.pathname === '/exec-terminal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let command, terminal;
      try {
        const parsed2 = JSON.parse(body);
        command = (parsed2.command || '').trim();
        terminal = (parsed2.terminal || 'Terminal').trim();
      } catch (_) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }
      if (!command || command.length > 2048) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid command' }));
        return;
      }
      // zsh -l -c で実行することでログインシェルのPATHを引き継ぐ
      const safeCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const wrappedCmd = `zsh -i -l -c \\"${safeCommand}\\"`;
      let script;
      if (terminal === 'iTerm2' || terminal === 'iTerm') {
        script = [
          'tell application "iTerm"',
          '  activate',
          '  tell current window',
          '    create tab with default profile',
          `    tell current session to write text "${wrappedCmd}"`,
          '  end tell',
          'end tell'
        ].join('\n');
      } else {
        script = [
          'tell application "Terminal"',
          '  activate',
          `  do script "${wrappedCmd}"`,
          'end tell'
        ].join('\n');
      }
      execFile('osascript', ['-e', script], (err) => {
        if (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'failed', detail: err.message }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      });
    });
    return;
  }

  // GET /dock-apps → Dockのアプリ一覧を取得
  if (parsed.pathname === '/dock-apps' && req.method === 'GET') {
    execFile('defaults', ['read', 'com.apple.dock', 'persistent-apps'], (err, stdout) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'failed to read dock', detail: err.message }));
        return;
      }
      try {
        const labels = [...stdout.matchAll(/"file-label"\s*=\s*"([^"]+)"/g)].map(m => m[1]);
        const apps = [...new Set(labels)].filter(Boolean).map(appName => ({ appName, url: '' }));
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, apps }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'parse error', detail: e.message }));
      }
    });
    return;
  }

  // 静的ファイル配信（mydash.html / widget.html / icons/*.svg）
  const MIME_TYPES = { '.html': 'text/html', '.svg': 'image/svg+xml' };
  const reqFile = parsed.pathname === '/' ? 'mydash.html' : parsed.pathname.slice(1);
  const ext = path.extname(reqFile);
  const isAllowed = STATIC_FILES[reqFile] || (reqFile.startsWith('icons/') && ext === '.svg');
  if (isAllowed && MIME_TYPES[ext]) {
    const filePath = path.join(STATIC_DIR, reqFile);
    if (!filePath.startsWith(STATIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      res.setHeader('Content-Type', MIME_TYPES[ext]);
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[MyDash Server] http://${HOST}:${PORT} で起動中`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[MyDash Server] ポート ${PORT} は既に使用中です`);
  } else {
    console.error('[MyDash Server] エラー:', err.message);
  }
  process.exit(1);
});
