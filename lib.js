/***********************
 * Italy Trip Planner v2 — Shared Library
 *
 * - JSONP (GitHub Pages) + Apps Script
 * - XLSX export parsing (multiple sheets)
 * - Offline cache (localStorage)
 ***********************/

// ✅ 統一設定（config.js）
const EXEC_URL = (window.TRIP_CONFIG && window.TRIP_CONFIG.EXEC_URL) || "";
const API_KEY = (window.TRIP_CONFIG && window.TRIP_CONFIG.API_KEY) || "";

if (!EXEC_URL) throw new Error("Missing TRIP_CONFIG.EXEC_URL (請編輯 config.js)");
if (!API_KEY) throw new Error("Missing TRIP_CONFIG.API_KEY (請編輯 config.js)");

// 工作表名稱（Excel / Google Sheet）
const SHEETS = {
  trips: "行程清單（iPhone）",
  transport: "交通",
  memos: "備忘錄",
};

/***********************
 * ensureXLSX — 動態載入 XLSX（避免 CDN 偶發失敗導致一直載入中）
 ***********************/
function loadScript_(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=src;
    s.async=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error("Failed to load script: "+src));
    document.head.appendChild(s);
  });
}

async function ensureXLSX(){
  if (window.ensureXLSX) return window.ensureXLSX();
  if (window.XLSX) return true;
  throw new Error("XLSX not loaded");
}

// localStorage offline cache (v2)
const LS_OK = "trip_v2_cache_ok";
const LS_B64 = "trip_v2_cache_b64";
const LS_TIME = "trip_v2_cache_time";

/***********************
 * utils
 ***********************/
function normalizeHeader(h){ return String(h || "").trim(); }
function toStr(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }

function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function todayStrLocal(){
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth()+1).padStart(2,"0");
  const d = String(t.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function formatIso(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function base64ToArrayBuffer(b64){
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/***********************
 * JSONP
 ***********************/
function jsonp(url, opts={}){
  const timeoutMs = opts.timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    const cbName = "__cb_" + Date.now() + "_" + Math.floor(Math.random()*1e6);
    const script = document.createElement("script");
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      try{ delete window[cbName]; }catch(_){}
      try{ script.remove(); }catch(_){}
      try{ clearTimeout(timer); }catch(_){}
    };

    window[cbName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${cbName}&t=${Date.now()}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP 載入失敗（可能是 EXEC_URL/權限/部署版本錯誤）"));
    };
    // 若後端回 200 但未呼叫 callback，會卡住；加 timeout 保底
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP 等待逾時（後端未呼叫 callback，常見原因：Web App 權限/URL/打到 HTML 登入頁）"));
    }, timeoutMs);

    document.body.appendChild(script);
  });
}

/***********************
 * API
 ***********************/
async function apiUpdate(tableKey, id, fields){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "update");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("table", tableKey);
  url.searchParams.set("id", id);
  // backward compat: old backend expects trip_id
  if (tableKey === "trips") url.searchParams.set("trip_id", id);
  for (const [k,v] of Object.entries(fields || {})) {
    url.searchParams.set(k, v ?? "");
  }
  return await jsonp(url.toString());
}

async function apiAdd(tableKey, fields){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "add");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("table", tableKey);
  for (const [k,v] of Object.entries(fields || {})) {
    url.searchParams.set(k, v ?? "");
  }
  return await jsonp(url.toString());
}

async function apiDelete(tableKey, id){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "delete");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("table", tableKey);
  url.searchParams.set("id", id);
  // backward compat: old backend expects trip_id
  if (tableKey === "trips") url.searchParams.set("trip_id", id);
  return await jsonp(url.toString());
}

async function apiExport(){
  const url = `${EXEC_URL}?action=export`;
  return await jsonp(url);
}

/***********************
 * Workbook parsing
 ***********************/
function sheetToTable_(wb, sheetName){
  if (!wb.SheetNames.includes(sheetName)) return null;
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (!rows || rows.length < 1) return null;
  const header = (rows[0] || []).map(normalizeHeader);
  const cols = {};
  header.forEach((h,i)=>{ if (h) cols[h]=i; });
  const body = (rows.slice(1) || []).filter(r => (r||[]).some(v => toStr(v) !== ""));
  return { sheetName, header, cols, rows: body };
}

function parseWorkbook(buf){
  const wb = XLSX.read(buf, { type: "array" });
  return {
    wb,
    tables: {
      trips: sheetToTable_(wb, SHEETS.trips),
      transport: sheetToTable_(wb, SHEETS.transport),
      memos: sheetToTable_(wb, SHEETS.memos),
    }
  };
}

/***********************
 * Offline + load
 ***********************/
async function tryLoadFromLocalCache(){
  if (localStorage.getItem(LS_OK) !== "1") return null;
  const b64 = localStorage.getItem(LS_B64);
  const t = localStorage.getItem(LS_TIME);
  if (!b64) return null;
  const buf = base64ToArrayBuffer(b64);
  await ensureXLSX();
  return { data: parseWorkbook(buf), generated_at: t || "" , from:"offline" };
}

async function loadFromExec(){
  const payload = await apiExport();
  if (!payload || !payload.ok || !payload.b64) {
    throw new Error(payload?.error || "Proxy 回傳格式錯誤");
  }
  localStorage.setItem(LS_OK, "1");
  localStorage.setItem(LS_B64, payload.b64);
  localStorage.setItem(LS_TIME, payload.generated_at || "");
  const buf = base64ToArrayBuffer(payload.b64);
  await ensureXLSX();
  return { data: parseWorkbook(buf), generated_at: payload.generated_at || "", from:"online" };
}

/***********************
 * helpers for Trips
 ***********************/
function ensureMapsLink(link, placeText){
  if (link) return link;
  const q = toStr(placeText);
  if (!q) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

function tableRowValue(table, r, key){
  const idx = table?.cols?.[key];
  if (idx === undefined) return "";
  return toStr(r[idx]);
}

function tableSetRowValue(table, r, key, val){
  const idx = table?.cols?.[key];
  if (idx === undefined) return false;
  r[idx] = val;
  return true;
}