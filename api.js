/***********************
 * TripAPI — 統一後端 API（JSONP）
 * - 只需要在 config.js 設定 EXEC_URL / API_KEY
 * - 提供所有頁面共用：export / add / update / delete
 * - trips 欄位會自動做中英欄位相容
 ***********************/
(function(){
  const cfg = window.TRIP_CONFIG || {};
  const EXEC_URL = cfg.EXEC_URL || "";
  const API_KEY  = cfg.API_KEY  || "";

  if (!EXEC_URL) throw new Error("Missing TRIP_CONFIG.EXEC_URL (請編輯 config.js)");
  if (!API_KEY)  throw new Error("Missing TRIP_CONFIG.API_KEY (請編輯 config.js)");

  const TIMEOUT_READ_MS  = 20000;  // meta/export
  const TIMEOUT_WRITE_MS = 45000;  // add/update/delete
  const RETRY_ON_TIMEOUT = 1;

  function buildUrl(params){
    const u = new URL(EXEC_URL);
    Object.entries(params).forEach(([k,v])=>{
      if (v === undefined || v === null) return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  function jsonp(params, timeoutMs, attempt=0){
    return new Promise((resolve, reject) => {
      const cbName = "__cb_" + Date.now() + "_" + Math.floor(Math.random()*1e9);
      const url = buildUrl(Object.assign({}, params, { callback: cbName }));
      const script = document.createElement("script");

      let done = false;
      const timer = setTimeout(() => {
        cleanup();
        const err = new Error("JSONP timeout");
        err.code = "JSONP_TIMEOUT";
        err.url = url;
        reject(err);
      }, timeoutMs);

      function cleanup(){
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cbName]; } catch(e){}
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        const err = new Error("JSONP script load failed");
        err.code = "JSONP_LOAD_FAILED";
        err.url = url;
        reject(err);
      };

      script.src = url;
      document.body.appendChild(script);
    }).catch(err => {
      if (err && err.code === "JSONP_TIMEOUT" && attempt < RETRY_ON_TIMEOUT){
        return jsonp(params, timeoutMs, attempt+1);
      }
      throw err;
    });
  }

  function normTripFields(fields){
    const f = Object.assign({}, fields || {});
    const map = {
      date: "日期",
      city: "城市",
      type: "項目類型",
      prio: "必去/備選",
      name: "名稱",
      time: "建議時段",
      place: "地點文字",
      map: "Google Maps 連結",
    };

    // 英->中
    Object.entries(map).forEach(([en, zh])=>{
      if (f[en] !== undefined && f[zh] === undefined) f[zh] = f[en];
    });
    // 中->英
    Object.entries(map).forEach(([en, zh])=>{
      if (f[zh] !== undefined && f[en] === undefined) f[en] = f[zh];
    });
    return f;
  }

  async function exportXlsx(){
    const res = await jsonp({ action:"export" }, TIMEOUT_READ_MS);
    if (!res || res.ok !== true) throw new Error((res && res.error) || "Export failed");
    return res; // {ok,b64,generated_at}
  }

  async function meta(){
    const res = await jsonp({ action:"meta" }, TIMEOUT_READ_MS);
    if (!res || res.ok !== true) throw new Error((res && res.error) || "Meta failed");
    return res;
  }

  async function add(table, fields){
    const f = (table === "trips") ? normTripFields(fields) : (fields || {});
    const res = await jsonp(Object.assign({ action:"add", table, api_key: API_KEY }, f), TIMEOUT_WRITE_MS);
    if (!res || res.ok !== true) throw new Error((res && res.error) || "Add failed");
    return res;
  }

  async function update(table, id, fields){
    const f = (table === "trips") ? normTripFields(fields) : (fields || {});
    const res = await jsonp(Object.assign({ action:"update", table, id, trip_id:id, api_key: API_KEY }, f), TIMEOUT_WRITE_MS);
    if (!res || res.ok !== true) throw new Error((res && res.error) || "Update failed");
    return res;
  }

  async function del(table, id){
    const res = await jsonp({ action:"delete", table, id, trip_id:id, api_key: API_KEY }, TIMEOUT_WRITE_MS);
    if (!res || res.ok !== true) throw new Error((res && res.error) || "Delete failed");
    return res;
  }

  window.TripAPI = { exportXlsx, meta, add, update, del };
})();
