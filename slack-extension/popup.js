const saveBtn = document.getElementById('saveBtn');
const sessionNameInput = document.getElementById('sessionName');

function defaultName() {
  return new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

saveBtn.addEventListener('click', async () => {
  const name = sessionNameInput.value.trim() || defaultName();
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';
  await chrome.runtime.sendMessage({ type: 'WS_SAVE_SESSION', name });
  sessionNameInput.value = '';
  saveBtn.disabled = false;
  saveBtn.textContent = '保存';
  window.close();
});

