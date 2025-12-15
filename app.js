const DEFAULT_XLSX_URL =
  "https://script.google.com/macros/s/AKfycbyOjHro8rmVfn9Dz3A-n_LK9V1dxtG8-WCqAO9rZ0nQJwxSU-uybzyV3rJ8ttuX5snc/exec";

const SHEET_NAME = "行程清單（iPhone）";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const dateSel = document.getElementById("dateSel");
const citySel = document.getElementById("citySel");
const typeSel = document.getElementById("typeSel");
const prioSel = document.getElementById("prioSel");

const modeTodayBtn = document.getElementById("modeTodayBtn");
const modeAllBtn = document.getElementById("modeAllBtn");
const toggleMustBtn = document.getElementById("toggleMustBtn");
const toggleOptBtn = document.getElementById("toggleOptBtn");
const searchInput = document.getElementById("searchInput");

document.getElementById("reloadBtn")
  .addEventListener("click", () => loadFromUrl(DEFAULT_XLSX_URL, true));

document.getElementById("fileInput")
  .addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await loadFromFile(f);
  });

let allRows = [];
let cols = {};

// UI state
let mode = "today";        // today | all
let mustOnly = true;       // 只看必去
let showOptional = false;  // 顯示備選
let q = "";                // 搜尋字串

// -------------------- utils --------------------
function normalizeHeader(h){ return String(h || "").trim(); }
function toStr(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }

function rowValue(r, key){
  const idx = cols[key];
  if (idx === undefined) return "";
  return toStr(r[idx]);
}

function todayStrLocal(){
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth()+1).padStart(2,"0");
  const d = String(t.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function chipSet(btn, on){
  btn.classList.toggle("chipOn", !!on);
}

function buildOptions(select, values, placeholder){
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  select.appendChild(opt0);

  for (const v of values){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  }
}

// Base64 → ArrayBuffer
function base64ToArrayBuffer(b64){
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// JSONP loader (避開 CORS)
function loadFromJsonp(url){
  return new Promise((resolve, reject) => {
    statusEl.textContent = "透過 Google Script 載入中…";

    const cbName = "__xlsx_cb_" + Date.now();
    const script = document.createElement("script");

    window[cbName] = async (payload) => {
      try{
        delete window[cbName];
        script.remove();

        if (!payload || !payload.b64) throw new Error("Proxy 回傳格式錯誤（缺 b64）");
        const buf = base64ToArrayBuffer(payload.b64);
        statusEl.textContent = "解析 Excel 中…";
        await loadWorkbookArrayBuffer(buf);
        resolve();
      }catch(e){
        reject(e);
      }
    };

    // ✅ 重要：加 t=Date.now() 避免 script 被快取
    script.src = `${url}?callback=${cbName}&t=${Date.now()}`;
    script.async = true;
    script.onerror = () => {
      delete window[cbName];
      script.remove();
      reject(new Error("JSONP 載入失敗（部署/權限/網址）"));
    };

    document.body.appendChild(script);
  });
}

// -------------------- render --------------------
function render(){
  const dateV = dateSel.value;
  const cityV = citySel.value;
  const typeV = typeSel.value;
  const prioV = prioSel.value;

  const today = todayStrLocal();

  let rows = allRows.slice();

  // 模式：今天 / 全部
  if (mode === "today") {
    rows = rows.filter(r => rowValue(r,"日期") === today);
  }

  // 快速：只看必去 / 顯示備選
  if (mustOnly) rows = rows.filter(r => rowValue(r,"必去/備選") === "必去");
  if (!showOptional) rows = rows.filter(r => rowValue(r,"必去/備選") !== "備選");

  // 進階下拉：仍然可用
  if (dateV) rows = rows.filter(r => rowValue(r,"日期") === dateV);
  if (cityV) rows = rows.filter(r => rowValue(r,"城市") === cityV);
  if (typeV) rows = rows.filter(r => rowValue(r,"項目類型") === typeV);
  if (prioV) rows = rows.filter(r => rowValue(r,"必去/備選") === prioV);

  // 搜尋（名稱/地點文字/備註/城市）
  if (q) {
    const qq = q.toLowerCase();
    rows = rows.filter(r => {
      const s = [
        rowValue(r,"名稱"),
        rowValue(r,"地點文字"),
        rowValue(r,"備註"),
        rowValue(r,"城市"),
        rowValue(r,"項目類型")
      ].join(" ").toLowerCase();
      return s.includes(qq);
    });
  }

  // 排序：日期 → 順序 → 建議時段（有就用） → 名稱
  rows.sort((a,b) => {
    const da = rowValue(a,"日期");
    const db = rowValue(b,"日期");
    if (da !== db) return da.localeCompare(db);

    const oa = parseInt(rowValue(a,"順序") || "9999", 10);
    const ob = parseInt(rowValue(b,"順序") || "9999", 10);
    if (oa !== ob) return oa - ob;

    const ta = rowValue(a,"建議時段");
    const tb = rowValue(b,"建議時段");
    if (ta !== tb) return ta.localeCompare(tb);

    return rowValue(a,"名稱").localeCompare(rowValue(b,"名稱"));
  });

  listEl.innerHTML = "";
  if (!rows.length){
    listEl.innerHTML = `<div class="sub">沒有符合的項目</div>`;
    return;
  }

  for (const r of rows){
    const date = rowValue(r,"日期");
    const city = rowValue(r,"城市");
    const type = rowValue(r,"項目類型");
    const prio = rowValue(r,"必去/備選");
    const name = rowValue(r,"名稱");
    const link = rowValue(r,"Google Maps 連結");
    const time = rowValue(r,"建議時段");
    const note = rowValue(r,"備註");

    // 新欄位（可有可無）
    const order = rowValue(r,"順序");
    const stay = rowValue(r,"停留(分)");
    const ticket = rowValue(r,"票務");
    const book = rowValue(r,"訂位");
    const place = rowValue(r,"地點文字");

    const card = document.createElement("div");
    card.className = "card" + (prio === "備選" ? " dim" : "");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span class="badge">${date || "-"}</span>
      <span class="badge">${city || "-"}</span>
      <span class="badge">${type || "-"}</span>
      ${time ? `<span class="badge">${time}</span>` : ""}
      ${order ? `<span class="badge">#${order}</span>` : ""}
      ${stay ? `<span class="badge">${stay}分</span>` : ""}
      ${ticket ? `<span class="badge">票務:${ticket}</span>` : ""}
      ${book ? `<span class="badge">訂位:${book}</span>` : ""}
    `;

    const title = document.createElement("div");
    title.className = "name";
    title.textContent = name || "(未命名)";

    const noteEl = document.createElement("div");
    noteEl.className = "note";
    noteEl.textContent = (note || place || "");

    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("a");
    left.className = "a";
    left.href = link || "#";
    left.target = "_blank";
    left.rel = "noopener noreferrer";
    left.appendChild(meta);
    left.appendChild(title);
    if (note || place) left.appendChild(noteEl);

    const btn = document.createElement("a");
    btn.className = "navBtn";
    btn.href = link || "#";
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btn.textContent = link ? "導航" : "無連結";
    if (!link) btn.style.background = "#9ca3af";

    row.appendChild(left);
    row.appendChild(btn);
    card.appendChild(row);
    listEl.appendChild(card);
  }
}

// -------------------- load workbook --------------------
async function loadWorkbookArrayBuffer(buf){
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (rows.length < 2) throw new Error("工作表沒有資料");

  const header = rows[0].map(normalizeHeader);
  cols = {};
  header.forEach((h,i)=>{ cols[h]=i; });

  // 必要欄位（其他欄位都是加分）
  const required = ["日期","城市","項目類型","必去/備選","名稱","Google Maps 連結"];
  const missing = required.filter(k => cols[k] === undefined);
  if (missing.length){
    throw new Error(`缺少欄位：${missing.join("、")}（請確認標題列一致）`);
  }

  allRows = rows.slice(1).filter(r => r.some(v => toStr(v) !== ""));

  // 下拉選單選項
  const dates = uniq(allRows.map(r => rowValue(r,"日期")));
  const cities = uniq(allRows.map(r => rowValue(r,"城市")));
  const types = uniq(allRows.map(r => rowValue(r,"項目類型")));
  const prios = uniq(allRows.map(r => rowValue(r,"必去/備選")));

  buildOptions(dateSel, dates, "選日期（全部）");
  buildOptions(citySel, cities, "選城市（全部）");
  buildOptions(typeSel, types, "選類型（全部）");
  buildOptions(prioSel, prios, "全部（必去+備選）");

  // 模式預設：如果今天在資料裡，預設 today；否則 all
  const today = todayStrLocal();
  mode = dates.includes(today) ? "today" : "all";
  chipSet(modeTodayBtn, mode==="today");
  chipSet(modeAllBtn, mode==="all");

  statusEl.textContent = `已載入：${sheetName}（${allRows.length} 筆）`;
  render();
}

async function loadFromUrl(url, bustCache=false){
  try{
    if (url.includes("script.google.com")){
      await loadFromJsonp(url);
      return;
    }
    statusEl.textContent = "下載 Excel 中…";
    const u = bustCache ? `${url}?v=${Date.now()}` : url;
    const res = await fetch(u);
    if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(buf);
  }catch(err){
    statusEl.textContent = `載入失敗：${err.message}`;
    listEl.innerHTML = `<div class="sub">${err.message}</div>`;
  }
}

async function loadFromFile(file){
  try{
    statusEl.textContent = "讀取檔案中…";
    const buf = await file.arrayBuffer();
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(buf);
  }catch(err){
    statusEl.textContent = `載入失敗：${err.message}`;
    listEl.innerHTML = `<div class="sub">${err.message}</div>`;
  }
}

// -------------------- UI events --------------------
modeTodayBtn.addEventListener("click", () => {
  mode = "today";
  chipSet(modeTodayBtn, true);
  chipSet(modeAllBtn, false);
  render();
});
modeAllBtn.addEventListener("click", () => {
  mode = "all";
  chipSet(modeTodayBtn, false);
  chipSet(modeAllBtn, true);
  render();
});
toggleMustBtn.addEventListener("click", () => {
  mustOnly = !mustOnly;
  chipSet(toggleMustBtn, mustOnly);
  render();
});
toggleOptBtn.addEventListener("click", () => {
  showOptional = !showOptional;
  chipSet(toggleOptBtn, showOptional);
  render();
});

searchInput.addEventListener("input", () => {
  q = toStr(searchInput.value);
  render();
});

// 進階下拉
for (const sel of [dateSel, citySel, typeSel, prioSel]){
  sel.addEventListener("change", render);
}

// init
loadFromUrl(DEFAULT_XLSX_URL);