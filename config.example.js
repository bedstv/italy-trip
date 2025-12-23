// 複製一份成 config.js，並填入你自己的設定
// 這個檔案不會被 Service Worker 預先快取，更新後重新整理即可生效

window.TRIP_CONFIG = {
  // Apps Script 部署成 Web App 後的 /exec URL
  EXEC_URL: "https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec",

  // ⚠️ 要跟 Apps Script 端的 API_KEY 一樣
  API_KEY: "Italy-Trip-Is-Good",
};
