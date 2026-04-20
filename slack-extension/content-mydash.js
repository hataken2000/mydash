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
        window.postMessage({ type: 'WINDOW_SAVER_RESTORED', success: !!resp?.success }, '*');
      });
    } catch (err) {
      console.warn('[MyDash] WindowSaver RESTORE_SESSION失敗:', err.message);
      window.postMessage({ type: 'WINDOW_SAVER_RESTORED', success: false }, '*');
    }
  });
})();
