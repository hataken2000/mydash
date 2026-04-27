const MYDASH_SERVER = 'http://localhost:3737';

// ── ウィンドウセッション管理（window-saverと同一ロジック）──
let lastNormalWindowId = null;

const WS_SKIP_SCHEMES = ['chrome-extension://', 'devtools://', 'about:'];
const WS_SKIP_URLS    = ['chrome://settings', 'chrome://extensions', 'chrome://history', 'chrome://downloads'];

async function wsGetSessionId(windowId) {
  const r = await chrome.storage.session.get(`ws_${windowId}`);
  return r[`ws_${windowId}`] || null;
}
async function wsSetSessionId(windowId, sessionId) {
  await chrome.storage.session.set({ [`ws_${windowId}`]: sessionId });
}
async function wsGetWindowCache(windowId) {
  const r = await chrome.storage.session.get(`wc_${windowId}`);
  return r[`wc_${windowId}`] || null;
}
async function wsSetWindowCache(windowId, data) {
  await chrome.storage.session.set({ [`wc_${windowId}`]: data });
}
async function wsClearWindowCache(windowId) {
  await chrome.storage.session.remove(`wc_${windowId}`);
}

async function wsUpdateWindowCache(windowId) {
  try {
    const win = await chrome.windows.get(windowId, { populate: true });
    if (win.type !== 'normal') return;
    let groups = {};
    try {
      const tabGroups = await chrome.tabGroups.query({ windowId });
      tabGroups.forEach(g => { groups[g.id] = { title: g.title, color: g.color, collapsed: g.collapsed }; });
    } catch (_) {}
    const tabs = win.tabs
      .filter(t => !WS_SKIP_SCHEMES.some(s => t.url.startsWith(s)) && !WS_SKIP_URLS.some(u => t.url.startsWith(u)))
      .map(t => ({ url: t.url, title: t.title, pinned: t.pinned, groupId: t.groupId >= 0 ? t.groupId : null }));
    await wsSetWindowCache(windowId, { tabs, groups });
  } catch (_) {}
}

chrome.tabs.onCreated.addListener(tab => wsUpdateWindowCache(tab.windowId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title || changeInfo.pinned || changeInfo.status === 'complete') wsUpdateWindowCache(tab.windowId);
});
chrome.tabs.onMoved.addListener((tabId, { windowId }) => wsUpdateWindowCache(windowId));
chrome.tabs.onAttached.addListener((tabId, { newWindowId }) => wsUpdateWindowCache(newWindowId));
chrome.tabs.onDetached.addListener((tabId, { oldWindowId }) => wsUpdateWindowCache(oldWindowId));
try {
  chrome.tabGroups.onUpdated.addListener(group => wsUpdateWindowCache(group.windowId));
  chrome.tabGroups.onRemoved.addListener(group => wsUpdateWindowCache(group.windowId));
} catch (_) {}

chrome.tabs.onRemoved.addListener(async (tabId, { windowId, isWindowClosing }) => {
  if (!isWindowClosing) { wsUpdateWindowCache(windowId); return; }
  const sessionId = await wsGetSessionId(windowId);
  if (!sessionId) return;
  await chrome.storage.session.remove(`ws_${windowId}`);
  const snapshot = await wsGetWindowCache(windowId);
  await wsClearWindowCache(windowId);
  if (snapshot) await wsOverwriteSession(sessionId, snapshot);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type === 'normal') lastNormalWindowId = windowId;
  } catch (_) {}
});

async function wsGetTargetWindow() {
  if (lastNormalWindowId) {
    try { return await chrome.windows.get(lastNormalWindowId, { populate: true }); } catch (_) {}
  }
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  return windows.find(w => w.focused) || windows[0];
}

async function wsGetSessions() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  return sessions;
}

async function wsSaveSession(name) {
  const win = await wsGetTargetWindow();
  if (!win) return { ok: false };
  let groups = {};
  try {
    const tabGroups = await chrome.tabGroups.query({ windowId: win.id });
    tabGroups.forEach(g => { groups[g.id] = { title: g.title, color: g.color, collapsed: g.collapsed }; });
  } catch (_) {}
  const tabs = win.tabs
    .filter(t => !WS_SKIP_SCHEMES.some(s => t.url.startsWith(s)))
    .map(t => ({ url: t.url, title: t.title, pinned: t.pinned, groupId: t.groupId >= 0 ? t.groupId : null }));
  const session = {
    id: Date.now().toString(),
    name: name || new Date().toLocaleString('ja-JP'),
    savedAt: Date.now(),
    tabs,
    groups,
  };
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  sessions.unshift(session);
  await chrome.storage.local.set({ sessions });
  await wsSetSessionId(win.id, session.id);
  await wsSetWindowCache(win.id, { tabs, groups });

  // MyDashタブにアイテム追加を通知
  const mydashTabs = await chrome.tabs.query({ url: ['http://127.0.0.1:3737/*', 'https://hataken2000.github.io/*', 'file://*/*'] });
  for (const tab of mydashTabs) {
    try { chrome.tabs.sendMessage(tab.id, { type: 'WS_SESSION_SAVED', session }); } catch (_) {}
  }

  return { ok: true, session };
}

async function wsOverwriteSession(sessionId, { tabs, groups }) {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;
  session.tabs = tabs;
  session.groups = groups;
  session.savedAt = Date.now();
  await chrome.storage.local.set({ sessions });
}

async function wsRestoreSession(session) {
  try {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    for (const win of windows) {
      const savedId = await wsGetSessionId(win.id);
      if (savedId === session.id) {
        await chrome.windows.update(win.id, { focused: true });
        return { ok: true };
      }
    }
  } catch (_) {}
  const newWin = await chrome.windows.create({});
  const newWindowId = newWin.id;
  const groupIdMap = {};
  for (const tab of session.tabs) {
    let created;
    try {
      created = await chrome.tabs.create({
        windowId: newWindowId,
        url: tab.url === 'chrome://newtab/' ? undefined : tab.url,
        pinned: tab.pinned,
      });
    } catch (_) { continue; }
    if (tab.groupId !== null) {
      const oldGroupId = tab.groupId;
      if (!groupIdMap[oldGroupId]) {
        const group = session.groups?.[oldGroupId];
        const newGroupId = await chrome.tabs.group({ tabIds: [created.id], createProperties: { windowId: newWindowId } });
        if (group) await chrome.tabGroups.update(newGroupId, { title: group.title || '', color: group.color || 'grey', collapsed: group.collapsed || false });
        groupIdMap[oldGroupId] = newGroupId;
      } else {
        await chrome.tabs.group({ tabIds: [created.id], groupId: groupIdMap[oldGroupId] });
      }
    }
  }
  const allTabs = await chrome.tabs.query({ windowId: newWindowId });
  const emptyTab = allTabs.find(t => t.url === 'chrome://newtab/' && t.index === 0);
  if (emptyTab && allTabs.length > 1) await chrome.tabs.remove(emptyTab.id);
  await wsSetSessionId(newWindowId, session.id);
  return { ok: true };
}

async function wsDeleteSession(id) {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  await chrome.storage.local.set({ sessions: sessions.filter(s => s.id !== id) });
  return { ok: true };
}

async function wsRenameSession(id, name) {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const s = sessions.find(s => s.id === id);
  if (s) s.name = name;
  await chrome.storage.local.set({ sessions });
  return { ok: true };
}

async function wsImportSessions(incoming) {
  if (!Array.isArray(incoming)) return { ok: false };
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  const existingIds = new Set(sessions.map(s => s.id));
  const merged = [...sessions, ...incoming.filter(s => !existingIds.has(s.id))];
  await chrome.storage.local.set({ sessions: merged });
  return { ok: true };
}
// ────────────────────────────────────────────────────────

// service worker起動時にアラームを確認・作成
chrome.alarms.get('slackSavedPoll', (alarm) => {
  if (!alarm) chrome.alarms.create('slackSavedPoll', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'slackSavedPoll') pollSlackSaved();
});

async function pollSlackSaved() {
  const tabs = await chrome.tabs.query({ url: ['https://app.slack.com/*'] });
  for (const tab of tabs) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: async () => {
          try {
            const raw = localStorage.localConfig_v2 || localStorage.localConfig;
            const teams = JSON.parse(raw || '{}').teams || {};
            const teamId = Object.keys(teams)[0];
            const token = teams[teamId]?.token;
            const domain = teams[teamId]?.domain || 'slack';
            if (!token) return null;
            const fd = new FormData();
            fd.append('token', token);
            fd.append('limit', '15');
            fd.append('filter', 'saved');
            fd.append('_x_app_name', 'client');
            const res = await fetch(`https://${domain}.slack.com/api/saved.list?slack_route=${teamId}&_x_gantry=true`, {
              method: 'POST',
              credentials: 'include',
              body: fd
            });
            const data = await res.json();
            return data.ok ? (data.saved_items || []) : null;
          } catch(_) { return null; }
        }
      });
      const items = results?.[0]?.result;
      if (items?.length) {
        sendSavedToMyDash(items);
        return;
      }
    } catch(e) {}
  }
}

async function sendSavedToMyDash(items) {
  try {
    await fetch(`${MYDASH_SERVER}/slack-saved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
  } catch(e) {
    console.warn('[MyDash] ローカルサーバーへの送信失敗:', e);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SLACK_SEND') {
    openSlackAndSend(msg.url, msg.message);
  } else if (msg.type === 'OPEN_SET') {
    openSetInTabGroup(msg.urls, msg.title);
  } else if (msg.type === 'SLACK_SAVED_ITEMS') {
    sendSavedToMyDash(msg.items);
  } else if (msg.type === 'WS_GET_SESSIONS') {
    wsGetSessions().then(sendResponse);
    return true;
  } else if (msg.type === 'WS_SAVE_SESSION') {
    wsSaveSession(msg.name).then(sendResponse);
    return true;
  } else if (msg.type === 'WS_RESTORE_SESSION') {
    wsRestoreSession(msg.session).then(sendResponse);
    return true;
  } else if (msg.type === 'WS_DELETE_SESSION') {
    wsDeleteSession(msg.id).then(sendResponse);
    return true;
  } else if (msg.type === 'WS_RENAME_SESSION') {
    wsRenameSession(msg.id, msg.name).then(sendResponse);
    return true;
  } else if (msg.type === 'WS_IMPORT_SESSIONS') {
    wsImportSessions(msg.sessions).then(sendResponse);
    return true;
  }
});

async function openSetInTabGroup(urls, title) {
  if (!urls || !urls.length) return;

  // 新ウィンドウで最初のURLを開く
  const win = await chrome.windows.create({ url: urls[0], focused: true });
  const tabIds = [win.tabs[0].id];

  // 残りのURLをタブとして追加
  for (const url of urls.slice(1)) {
    const tab = await chrome.tabs.create({ windowId: win.id, url });
    tabIds.push(tab.id);
  }

  // タブをグループ化してセット名を付ける
  try {
    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: win.id } });
    await chrome.tabGroups.update(groupId, { title, color: 'cyan' });
  } catch (e) {
    console.warn('タブグループ作成失敗（Chromeでのみ対応）:', e);
  }
}

async function openSlackAndSend(url, message) {
  const tabs = await chrome.tabs.query({
    url: ['https://app.slack.com/*', 'https://*.slack.com/*']
  });

  let tabId;
  let isNew = false;

  if (tabs.length > 0) {
    tabId = tabs[0].id;
    await chrome.tabs.update(tabId, { active: true, url });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    await waitForTabLoad(tabId);
  } else {
    const tab = await chrome.tabs.create({ url });
    tabId = tab.id;
    isNew = true;
    await waitForTabLoad(tabId);
  }

  await delay(isNew ? 2000 : 1500);

  // リダイレクトページ（デスクトップアプリ転送）を検知してブラウザ版に切り替え
  const redirectResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: clickBrowserLinkIfRedirect
  });

  const wasRedirect = redirectResult[0]?.result;
  if (wasRedirect) {
    // ブラウザ版Slackが開くまで待つ
    await waitForTabLoad(tabId);
    await delay(3000);
  }

  // メッセージを入力して送信
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: typeAndSendSlack,
      args: [message]
    });
  } catch (e) {
    console.error('Slack送信エラー:', e);
  }
}

// リダイレクトページなら「ブラウザで開く」リンクをクリックする
function clickBrowserLinkIfRedirect() {
  const links = Array.from(document.querySelectorAll('a'));
  const webLink = links.find(a =>
    a.textContent.includes('ブラウザで開く') ||
    a.textContent.toLowerCase().includes('open in browser')
  );
  if (webLink) {
    webLink.click();
    return true;
  }
  return false;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Slackページのコンテキストで実行: 入力欄にテキストを入れる（送信はユーザーが行う）
function typeAndSendSlack(message) {
  const inputSelectors = [
    '[data-qa="message_input"] .ql-editor',
    '[data-qa="message-input"] .ql-editor',
    '.p-message_input .ql-editor',
    'div.p-message_input_field [contenteditable="true"]',
    '[contenteditable="true"][data-qa]',
  ];

  let input = null;
  for (const sel of inputSelectors) {
    input = document.querySelector(sel);
    if (input) break;
  }

  if (!input) {
    alert('Slackの入力欄が見つかりませんでした。ページが完全に読み込まれているか確認してください。');
    return;
  }

  input.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, message);
}
