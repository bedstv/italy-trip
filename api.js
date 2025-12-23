/***********************
 * TripAPI — 統一後端 API（JSONP）
 * - 只需要在 config.js 設定 EXEC_URL / API_KEY
 * - 提供所有頁面共用：export / add / update / delete
 * - trips 更新時同時送「中文欄位」與「英文欄位」相容不同後端版本
 ***********************/
(function(){
  const cfg = window.TRIP_CONFIG || {};
  const EXEC_URL = cfg.EXEC_URL || "";
  const API_KEY  = cfg.API_KEY  || "";

  if (!EXEC_URL) throw new Error("Missing TRIP_CONFIG.EXEC_URL (請編輯 config.js)");
  if (!API_KEY)  throw new Error("Missing TRIP_CONFIG.API_KEY (請編輯 config.js)");

  function jsonp(url){
    return new Promise((resolve, reject) => {
      const cbName = "__cb_" + Date.now() + "_" + Math.floor(Math.random()*1e6);
      const script = document.createElement("script");
      const TIMEOUT_MS = 15000;

async function ensureXLSX(){
  if (window.ensureXLSX) return window.ensureXLSX();
  if (window.XLSX) return true;
  throw new Error('XLSX not loaded');
}
      let timer = null;

      function cleanup(){
        if (timer) { clearTimeout(timer); timer = null; }
        try { delete window[cbName]; } catch(e) {}
        try { script.remove(); } catch(e) {}
      }

      timer = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP 逾時（請確認 EXEC_URL 是 /exec、Web App 權限為 Anyone、且已重新部署最新版本）"));
      }, TIMEOUT_MS);


      window[cbName] = (payload) => {
        try{
          cleanup();
          resolve(payload);
        }catch(e){
          reject(e);
        }
      };

      script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${cbName}&t=${Date.now()}`;
      script.async = true;
      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP 載入失敗（可能是 Web App 權限/URL 錯誤或後端拋錯）"));
      };

      document.body.appendChild(script);
    });
  }

  function applyTripCompatFields_(fields){
    const out = Object.assign({}, fields || {});
    // 兼容：日期
    if (out.date !== undefined && out["日期"] === undefined) out["日期"] = out.date;
    if (out["日期"] !== undefined && out.date === undefined) out.date = out["日期"];

    // 兼容：城市/類型/必去備選/名稱/時段/地點/地圖
    const map = [
      ["city","城市"],
      ["type","項目類型"],
      ["prio","必去/備選"],
      ["name","名稱"],
      ["time","建議時段"],
      ["place","地點文字"],
      ["map","Google Maps 連結"],
    ];
    for (const [en, zh] of map){
      if (out[en] !== undefined && out[zh] === undefined) out[zh] = out[en];
      if (out[zh] !== undefined && out[en] === undefined) out[en] = out[zh];
    }
    return out;
  }

  function buildUrl(action, params){
    const url = new URL(EXEC_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("api_key", API_KEY);
    for (const [k,v] of Object.entries(params || {})){
      url.searchParams.set(k, v ?? "");
    }
    return url.toString();
  }

  async function meta(){
    return await jsonp(buildUrl("meta", {}));
  }

  async function exportXlsx(){
    return await jsonp(buildUrl("export", {}));
  }

  async function update(table, id, fields){
    const p = { table, id };
    if (table === "trips") p.trip_id = id; // 舊後端相容
    let f = fields || {};
    if (table === "trips") f = applyTripCompatFields_(f);
    const url = new URL(EXEC_URL);
    url.searchParams.set("action","update");
    url.searchParams.set("api_key", API_KEY);
    url.searchParams.set("table", table);
    url.searchParams.set("id", id);
    if (table === "trips") url.searchParams.set("trip_id", id);
    for (const [k,v] of Object.entries(f)){
      url.searchParams.set(k, v ?? "");
    }
    return await jsonp(url.toString());
  }

  async function add(table, fields){
    let f = fields || {};
    if (table === "trips") f = applyTripCompatFields_(f);
    const url = new URL(EXEC_URL);
    url.searchParams.set("action","add");
    url.searchParams.set("api_key", API_KEY);
    url.searchParams.set("table", table);
    for (const [k,v] of Object.entries(f)){
      url.searchParams.set(k, v ?? "");
    }
    return await jsonp(url.toString());
  }

  async function del(table, id){
    const url = new URL(EXEC_URL);
    url.searchParams.set("action","delete");
    url.searchParams.set("api_key", API_KEY);
    url.searchParams.set("table", table);
    url.searchParams.set("id", id);
    if (table === "trips") url.searchParams.set("trip_id", id);
    return await jsonp(url.toString());
  }

  window.TripAPI = { EXEC_URL, API_KEY, jsonp, meta, exportXlsx, update, add, del };
})();
