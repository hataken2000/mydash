// Slackページに注入 — リダイレクトページを自動スキップ
(function() {
  function clickBrowserLink() {
    const links = Array.from(document.querySelectorAll('a'));
    const webLink = links.find(a =>
      a.textContent.includes('ブラウザで開く') ||
      a.textContent.toLowerCase().includes('open in browser')
    );
    if (webLink) { webLink.click(); return true; }
    return false;
  }

  // DOM構築直後に試みる
  if (!clickBrowserLink()) {
    // 少し待ってから再試行（SPAの場合）
    setTimeout(clickBrowserLink, 500);
  }
})();
