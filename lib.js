/***********************
 * Italy Trip Planner v2 — Shared Library
 *
 * - XLSX export parsing (multiple sheets)
 * - Offline cache (localStorage)
 * - Helper utils for pages
 ***********************/

// ✅ 統一設定（config.js）
const EXEC_URL = (window.TRIP_CONFIG && window.TRIP_CONFIG.EXEC_URL) || "";
const API_KEY  = (window.TRIP_CONFIG && window.TRIP_CONFIG.API_KEY)  || "";

// 工作表名稱（與 XLSX 一致）
const SHEETS = {
  trips: "行程清單（iPhone）",
  transport: "交通",
  memos: "備忘錄",
};

/***********************
 * XLSX loader
 * - xlsx_loader.js 會提供 window.ensureXLSX()
 * - 這裡避免與其同名，改用 requireXLSX()
 ***********************/
async function requireXLSX(){
  // 已經有 XLSX
  if (window.XLSX) return true;

  // 專案內建 loader（建議）
  if (typeof window.ensureXLSX === "function"){
    await window.ensureXLSX();
    if (window.XLSX) return true;
  }

  // 最後備援：直接載 CDN
  await loadScript_("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  if (!window.XLSX) throw new Error("XLSX not loaded");
  return true;
}

function loadScript_(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=src;
    s.async=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error("Failed to load: " + src));
    document.head.appendChild(s);
  });
}

/***********************
 * Base64 helpers
 ***********************/
function base64ToArrayBuffer(b64){
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i=0; i<len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/***********************
 * JSONP（只用在沒有 TripAPI 的備援路徑）
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

    window[cbName] = (payload) => { cleanup(); resolve(payload); };

    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${cbName}&t=${Date.now()}`;
    script.async = true;
    script.onerror = () => { cleanup(); reject(new Error("JSONP 載入失敗（可能是 EXEC_URL/權限/部署版本錯誤）")); };

    const timer = setTimeout(() => { cleanup(); reject(new Error("JSONP Timeout")); }, timeoutMs);

    document.head.appendChild(script);
  });
}

/***********************
 * Workbook parsing
 ***********************/
function normalizeHeader(h){ return String(h || "").trim(); }
function toStr(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }

function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function fmtBadge(text, cls="pill"){
  const t = escapeHtml(text || "");
  if (!t) return "";
  return `<span class="${cls}">${t}</span>`;
}

function formatIso(iso){
  const s = toStr(iso);
  if (!s) return "";
  // Apps Script 有時回 ISO；直接顯示日期時間（不做時區推算）
  return s.replace("T"," ").replace(".000Z","Z");
}

function mapSearchUrl(q){
  q = toStr(q);
  if (!q) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

// 讓各頁面可以安全產生 Google Maps 連結
// - 若 rawLink 看起來就是 http(s) 連結，直接用
// - 否則用 place/name 做 search query
function ensureMapsLink(rawLink, fallbackQuery=""){
  const u = toStr(rawLink);
  if (u && /^https?:\/\//i.test(u)) return u;
  const q = toStr(fallbackQuery);
  return q ? mapSearchUrl(q) : "";
}

// 以使用者本地時區產生 YYYY-MM-DD
function todayStrLocal(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function todayStrLocal(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

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

/***********************
 * Offline cache + load
 ***********************/
const LS_OK   = "trip_cache_ok_v2";
const LS_B64  = "trip_cache_b64_v2";
const LS_TIME = "trip_cache_time_v2";

async function tryLoadFromLocalCache(){
  if (localStorage.getItem(LS_OK) !== "1") return null;
  const b64 = localStorage.getItem(LS_B64);
  const t = localStorage.getItem(LS_TIME);
  if (!b64) return null;
  const buf = base64ToArrayBuffer(b64);
  await requireXLSX();
  return { data: parseWorkbook(buf), generated_at: t || "" , from:"offline" };
}

async function apiExport(){
  // 優先使用 api.js 的 TripAPI（會自動帶 api_key、timeout、retry）
  if (window.TripAPI && typeof window.TripAPI.exportXlsx === "function"){
    return await window.TripAPI.exportXlsx();
  }
  if (!EXEC_URL) throw new Error("Missing TRIP_CONFIG.EXEC_URL");
  const url = `${EXEC_URL}?action=export${API_KEY ? `&api_key=${encodeURIComponent(API_KEY)}` : ""}`;
  return await jsonp(url, { timeoutMs: 20000 });
}

async function loadFromExec(){
  const payload = await apiExport();
  if (!payload || payload.ok !== true || !payload.b64) {
    throw new Error(payload?.error || "Proxy 回傳格式錯誤");
  }
  localStorage.setItem(LS_OK, "1");
  localStorage.setItem(LS_B64, payload.b64);
  localStorage.setItem(LS_TIME, payload.generated_at || "");
  const buf = base64ToArrayBuffer(payload.b64);
  await requireXLSX();
  return { data: parseWorkbook(buf), generated_at: payload.generated_at || "", from:"online" };
}

// expose a few globals (for pages)
window.SHEETS = SHEETS;
window.requireXLSX = requireXLSX;
window.parseWorkbook = parseWorkbook;
window.tryLoadFromLocalCache = tryLoadFromLocalCache;
window.loadFromExec = loadFromExec;
window.tableRowValue = tableRowValue;
window.tableSetRowValue = tableSetRowValue;
window.escapeHtml = escapeHtml;
window.uniq = uniq;
window.formatIso = formatIso;
window.fmtBadge = fmtBadge;
window.mapSearchUrl = mapSearchUrl;
window.ensureMapsLink = ensureMapsLink;
window.todayStrLocal = todayStrLocal;
