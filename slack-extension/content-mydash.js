(function () {
  // chrome.runtime を触らずに拡張機能の存在をページに通知
  window.postMessage({ type: 'MYDASH_EXTENSION_READY' }, '*');

  window.addEventListener('mydash-slack-send', (e) => {
    try {
      chrome.runtime.sendMessage({ type: 'SLACK_SEND', url: e.detail.url, message: e.detail.message });
    } catch (err) {
      console.warn('[MyDash] Slack送信失敗:', err.message);
    }
  });

  window.addEventListener('mydash-open-set', (e) => {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_SET', urls: e.detail.urls, title: e.detail.title });
    } catch (err) {
      console.warn('[MyDash] セット起動失敗:', err.message);
    }
  });

  window.addEventListener('mydash-window-saver-get-sessions', () => {
    try {
      chrome.runtime.sendMessage({ type: 'WS_GET_SESSIONS' }, (resp) => {
        const sessions = Array.isArray(resp) ? resp : (resp?.sessions ?? []);
        window.postMessage({ type: 'WINDOW_SAVER_SESSIONS', sessions }, '*');
      });
    } catch (err) {
      console.warn('[MyDash] WindowSaver GET_SESSIONS失敗:', err.message);
      window.postMessage({ type: 'WINDOW_SAVER_SESSIONS', sessions: [] }, '*');
    }
  });

  window.addEventListener('mydash-window-saver-restore', (e) => {
    try {
      chrome.runtime.sendMessage({ type: 'WS_RESTORE_SESSION', session: e.detail.session }, (resp) => {
        window.postMessage({ type: 'WINDOW_SAVER_RESTORED', success: !!(resp?.ok) }, '*');
      });
    } catch (err) {
      console.warn('[MyDash] WindowSaver RESTORE_SESSION失敗:', err.message);
      window.postMessage({ type: 'WINDOW_SAVER_RESTORED', success: false }, '*');
    }
  });

  window.addEventListener('mydash-window-saver-save', (e) => {
    try {
      chrome.runtime.sendMessage({ type: 'WS_SAVE_SESSION', name: e.detail?.name || '' }, (resp) => {
        window.postMessage({ type: 'WINDOW_SAVER_SAVED', ok: !!(resp?.ok), session: resp?.session }, '*');
      });
    } catch (err) {
      console.warn('[MyDash] WindowSaver SAVE_SESSION失敗:', err.message);
      window.postMessage({ type: 'WINDOW_SAVER_SAVED', ok: false }, '*');
    }
  });

  window.addEventListener('mydash-window-saver-delete', (e) => {
    try {
      chrome.runtime.sendMessage({ type: 'WS_DELETE_SESSION', id: e.detail.id });
    } catch (err) {
      console.warn('[MyDash] WindowSaver DELETE_SESSION失敗:', err.message);
    }
  });

  window.addEventListener('mydash-window-saver-import', (e) => {
    try {
      chrome.runtime.sendMessage({ type: 'WS_IMPORT_SESSIONS', sessions: e.detail.sessions });
    } catch (err) {
      console.warn('[MyDash] WindowSaver IMPORT_SESSIONS失敗:', err.message);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WS_SESSION_SAVED') {
      window.postMessage({ type: 'WS_SESSION_ADDED', session: msg.session }, '*');
    }
  });
})();
