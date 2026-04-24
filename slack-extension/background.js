const WINDOW_SAVER_EXT_ID = 'jjfmikbhobeolfbihplmklplpfmmfhnn';
const MYDASH_SERVER = 'http://localhost:3737';

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
    chrome.runtime.sendMessage(WINDOW_SAVER_EXT_ID, { type: 'GET_SESSIONS' }, (resp) => {
      sendResponse(resp ?? { sessions: [] });
    });
    return true;
  } else if (msg.type === 'WS_RESTORE_SESSION') {
    chrome.runtime.sendMessage(WINDOW_SAVER_EXT_ID, { type: 'RESTORE_SESSION', session: msg.session }, (resp) => {
      sendResponse(resp ?? { success: false });
    });
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
