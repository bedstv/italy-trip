// 你的 Apps Script Web App（exec）網址：JSONP 方式避開 CORS
const DEFAULT_XLSX_URL =
  "https://script.google.com/macros/s/AKfycbyOjHro8rmVfn9Dz3A-n_LK9V1dxtG8-WCqAO9rZ0nQJwxSU-uybzyV3rJ8ttuX5snc/exec";

// Excel 工作表名稱（找不到會自動用第一張）
const SHEET_NAME = "行程清單（iPhone）";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const dateSel = document.getElementById("dateSel");
const citySel = document.getElementById("citySel");
const typeSel = document.getElementById("typeSel");
const prioSel = document.getElementById("prioSel");

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

// -------------------- utils --------------------
function normalizeHeader(h) {
  return String(h || "").trim();
}

function toStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function buildOptions(select, values, placeholder) {
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  select.appendChild(opt0);

  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  }
}

function rowValue(r, key) {
  const idx = cols[key];
  if (idx === undefined) return "";
  return toStr(r[idx]);
}

// Base64 → ArrayBuffer（給 XLSX.read 用）
function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// JSONP：避開 CORS（script.google.com /exec 用）
function loadFromJsonp(url) {
  return new Promise((resolve, reject) => {
    statusEl.textContent = "透過 Google Script 載入中…";

    const cbName = "__xlsx_cb_" + Date.now();
    const script = document.createElement("script");

    window[cbName] = async (payload) => {
      try {
        delete window[cbName];
        script.remove();

        if (!payload || !payload.b64) {
          throw new Error("Proxy 回傳格式錯誤（缺少 b64）");
        }

        const buf = base64ToArrayBuffer(payload.b64);
        statusEl.textContent = "解析 Excel 中…";
        await loadWorkbookArrayBuffer(buf);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    script.src = `${url}?callback=${cbName}&t=${Date.now()}`;
    script.async = true;
    script.onerror = () => {
      delete window[cbName];
      script.remove();
      reject(new Error("JSONP 載入失敗（可能是部署權限/網址錯誤）"));
    };

    document.body.appendChild(script);
  });
}

// -------------------- rendering --------------------
function bindFilters() {
  for (const sel of [dateSel, citySel, typeSel, prioSel]) {
    sel.addEventListener("change", render);
  }
}

function render() {
  const dateV = dateSel.value;
  const cityV = citySel.value;
  const typeV = typeSel.value;
  const prioV = prioSel.value;

  const rows = allRows.filter(r => {
    if (dateV && rowValue(r, "日期") !== dateV) return false;
    if (cityV && rowValue(r, "城市") !== cityV) return false;
    if (typeV && rowValue(r, "項目類型") !== typeV) return false;
    if (prioV && rowValue(r, "必去/備選") !== prioV) return false;
    return true;
  });

  listEl.innerHTML = "";
  if (!rows.length) {
    listEl.innerHTML = `<div class="sub">沒有符合的項目</div>`;
    return;
  }

  for (const r of rows) {
    const date = rowValue(r, "日期");
    const city = rowValue(r, "城市");
    const type = rowValue(r, "項目類型");
    const prio = rowValue(r, "必去/備選");
    const name = rowValue(r, "名稱");
    const link = rowValue(r, "Google Maps 連結");
    const time = rowValue(r, "建議時段");
    const note = rowValue(r, "備註");

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

// -------------------- data loading --------------------
async function loadWorkbookArrayBuffer(buf) {
  const wb = XLSX.read(buf, { type: "array" });

  const sheetName = wb.SheetNames.includes(SHEET_NAME)
    ? SHEET_NAME
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

  if (rows.length < 2) throw new Error("工作表沒有資料");

  const header = rows[0].map(normalizeHeader);
  cols = {};
  header.forEach((h, i) => { cols[h] = i; });

  const required = ["日期", "城市", "項目類型", "必去/備選", "名稱", "Google Maps 連結"];
  const missing = required.filter(k => cols[k] === undefined);
  if (missing.length) {
    throw new Error(`缺少欄位：${missing.join("、")}（請確認 Excel 標題列一致）`);
  }

  allRows = rows.slice(1).filter(r => r.some(v => toStr(v) !== ""));

  const dates = uniq(allRows.map(r => rowValue(r, "日期")));
  const cities = uniq(allRows.map(r => rowValue(r, "城市")));
  const types = uniq(allRows.map(r => rowValue(r, "項目類型")));

  buildOptions(dateSel, dates, "選日期（全部）");
  buildOptions(citySel, cities, "選城市（全部）");
  buildOptions(typeSel, types, "選類型（全部）");

  // 自動選今天（如果剛好在資料內）
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  if (dates.includes(todayStr)) dateSel.value = todayStr;

  statusEl.textContent = `已載入：${sheetName}（${allRows.length} 筆）`;
  render();
}

async function loadFromUrl(url, bustCache = false) {
  try {
    // Apps Script exec：走 JSONP（避開 CORS）
    if (url.includes("script.google.com")) {
      // bustCache 會讓 JSONP 每次換 callback，等同強制更新
      await loadFromJsonp(url);
      return;
    }

    // 其他來源：走 fetch
    statusEl.textContent = "下載 Excel 中…";
    const u = bustCache ? `${url}?v=${Date.now()}` : url;
    const res = await fetch(u);
    if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(buf);

  } catch (err) {
    statusEl.textContent = `載入失敗：${err.message}`;
    listEl.innerHTML = `<div class="sub">${err.message}</div>`;
  }
}

async function loadFromFile(file) {
  try {
    statusEl.textContent = "讀取檔案中…";
    const buf = await file.arrayBuffer();
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(buf);
  } catch (err) {
    statusEl.textContent = `載入失敗：${err.message}`;
    listEl.innerHTML = `<div class="sub">${err.message}</div>`;
  }
}

// init
bindFilters();
loadFromUrl(DEFAULT_XLSX_URL);