# italy-trip

## 快速設定

1. 先把 `config.example.js` 複製成 `config.js`
2. 編輯 `config.js`：填入你的 Apps Script Web App `EXEC_URL`，以及對應的 `API_KEY`

> `config.js` 不會被 Service Worker 預先快取，調整後重新整理即可生效。



## GitHub Pages 發佈注意
- 如果你的 GitHub Pages 設定是 **/docs**，請確認此專案的 `docs/` 內也有 `index.html`（本版本已自動提供）。
- 如果設定是 **root**，則使用根目錄的 `index.html`。
