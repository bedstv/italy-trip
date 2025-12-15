const SHEET_NAME = "行程清單（iPhone）";   // 你的 Excel 工作表名稱
const DEFAULT_XLSX_URL =
  "https://docs.google.com/spreadsheets/d/1D5h99g7ajUQoRm-YzFRneb9rcm7FcFAv/export?format=xlsx";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const dateSel = document.getElementById("dateSel");
const citySel = document.getElementById("citySel");
const typeSel = document.getElementById("typeSel");
const prioSel = document.getElementById("prioSel");

document.getElementById("reloadBtn").addEventListener("click", () => loadFromUrl(DEFAULT_XLSX_URL, true));
document.getElementById("fileInput").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  await loadFromFile(f);
});

let allRows = [];
let cols = {};

function normalizeHeader(h){
  return String(h || "").trim();
}

function toStr(v){
  if (v === null || v === undefined) return "";
  return String(v).trim();
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

function rowValue(r, key){
  const idx = cols[key];
  if (idx === undefined) return "";
  return toStr(r[idx]);
}

function render(){
  const dateV = dateSel.value;
  const cityV = citySel.value;
  const typeV = typeSel.value;
  const prioV = prioSel.value;

  const rows = allRows.filter(r => {
    if (dateV && rowValue(r,"日期") !== dateV) return false;
    if (cityV && rowValue(r,"城市") !== cityV) return false;
    if (typeV && rowValue(r,"項目類型") !== typeV) return false;
    if (prioV && rowValue(r,"必去/備選") !== prioV) return false;
    return true;
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

    const card = document.createElement("div");
    card.className = "card" + (prio === "備選" ? " dim" : "");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span class="badge">${date || "-"}</span>
      <span class="badge">${city || "-"}</span>
      <span class="badge">${type || "-"}</span>
      <span class="badge">${prio || "-"}</span>
      ${time ? `<span class="badge">${time}</span>` : ""}
    `;

    const title = document.createElement("div");
    title.className = "name";
    title.textContent = name || "(未命名)";

    const noteEl = document.createElement("div");
    noteEl.className = "note";
    noteEl.textContent = note || "";

    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("a");
    left.className = "a";
    left.href = link || "#";
    left.target = "_blank";
    left.rel = "noopener noreferrer";
    left.appendChild(meta);
    left.appendChild(title);
    if (note) left.appendChild(noteEl);

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

function bindFilters(){
  for (const sel of [dateSel, citySel, typeSel, prioSel]){
    sel.addEventListener("change", render);
  }
}

async function loadWorkbookArrayBuffer(buf){
  const wb = XLSX.read(buf, { type: "array" });

  // 取指定工作表；找不到就用第一張
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // 轉成 2D array
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

  if (rows.length < 2) throw new Error("工作表沒有資料");

  const header = rows[0].map(normalizeHeader);
  cols = {};
  header.forEach((h, i) => { cols[h] = i; });

  const required = ["日期","城市","項目類型","必去/備選","名稱","Google Maps 連結"];
  const missing = required.filter(k => cols[k] === undefined);
  if (missing.length){
    throw new Error(`缺少欄位：${missing.join("、")}（請確認 Excel 標題列一致）`);
  }

  allRows = rows.slice(1).filter(r => r.some(v => toStr(v) !== ""));

  // 組 filter 值
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];

  const dates = uniq(allRows.map(r => rowValue(r,"日期")));
  const cities = uniq(allRows.map(r => rowValue(r,"城市")));
  const types = uniq(allRows.map(r => rowValue(r,"項目類型")));

  buildOptions(dateSel, dates, "選日期（全部）");
  buildOptions(citySel, cities, "選城市（全部）");
  buildOptions(typeSel, types, "選類型（全部）");

  // 預設：如果今天日期剛好在資料內，自動選今天
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,"0");
  const d = String(today.getDate()).padStart(2,"0");
  const todayStr = `${y}-${m}-${d}`;
  if (dates.includes(todayStr)) dateSel.value = todayStr;

  statusEl.textContent = `已載入：${sheetName}（${allRows.length} 筆）`;
  render();
}

async function loadFromUrl(url, bustCache=false){
  try{
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

bindFilters();
loadFromUrl(DEFAULT_XLSX_URL);