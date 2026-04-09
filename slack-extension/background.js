chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SLACK_SEND') {
    openSlackAndSend(msg.url, msg.message);
  } else if (msg.type === 'OPEN_SET') {
    openSetInTabGroup(msg.urls, msg.title);
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

// Slackページのコンテキストで実行: 入力欄にテキストを入れて送信ボタンをクリック
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

  // 送信ボタンをクリック
  setTimeout(() => {
    const sendBtnSelectors = [
      '[data-qa="texty_send_button"]',
      'button[data-qa="send-button"]',
      '.c-icon_button[aria-label="Send Now"]',
      'button[aria-label="メッセージを送信"]',
      'button[aria-label="Send message"]',
    ];
    let sendBtn = null;
    for (const sel of sendBtnSelectors) {
      sendBtn = document.querySelector(sel);
      if (sendBtn) break;
    }

    if (sendBtn) {
      sendBtn.click();
    } else {
      // ボタンが見つからない場合はEnterキーで試みる
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true,
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13
      }));
    }
  }, 300);
}
