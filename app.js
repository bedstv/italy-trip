/***********************
 * 設定
 ***********************/
const EXEC_URL =
  "https://script.google.com/macros/s/AKfycbw2yKi00xQHjvkdxyJT3Fji4g-XSqhnveCOWQQ9OrRkIp3DS3S_O2W4Xj7Saj_fC8gL/exec";

// ⚠️ 要跟 Apps Script 的 API_KEY 一樣
const API_KEY = "Italy-Trip-Is-Good";

const SHEET_NAME = "行程清單（iPhone）";

// localStorage offline cache
const LS_OK = "trip_cache_ok";
const LS_B64 = "trip_cache_b64";
const LS_TIME = "trip_cache_time";

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
  .addEventListener("click", () => loadFromExec(true));

document.getElementById("fileInput")
  .addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await loadFromFile(f);
  });

/***********************
 * 狀態
 ***********************/
let allRows = []; // 2D array rows (without header)
let cols = {};    // header -> index

let mode = "today";        // today | all
let mustOnly = true;       // 只看必去
let showOptional = false;  // 顯示備選
let q = "";                // search

/***********************
 * utils
 ***********************/
function normalizeHeader(h){ return String(h || "").trim(); }
function toStr(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }

function rowValue(r, key){
  const idx = cols[key];
  if (idx === undefined) return "";
  return toStr(r[idx]);
}
function setRowValue(r, key, val){
  const idx = cols[key];
  if (idx === undefined) return false;
  r[idx] = val;
  return true;
}

function todayStrLocal(){
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth()+1).padStart(2,"0");
  const d = String(t.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function chipSet(btn, on){ btn.classList.toggle("chipOn", !!on); }

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

// Base64 → ArrayBuffer
function base64ToArrayBuffer(b64){
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/***********************
 * JSONP helper
 ***********************/
function jsonp(url){
  return new Promise((resolve, reject) => {
    const cbName = "__cb_" + Date.now() + "_" + Math.floor(Math.random()*1e6);
    const script = document.createElement("script");

    window[cbName] = (payload) => {
      try{
        delete window[cbName];
        script.remove();
        resolve(payload);
      }catch(e){
        reject(e);
      }
    };

    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${cbName}&t=${Date.now()}`;
    script.async = true;
    script.onerror = () => {
      delete window[cbName];
      script.remove();
      reject(new Error("JSONP 載入失敗"));
    };

    document.body.appendChild(script);
  });
}

/***********************
 * A) 讀取資料（export）
 ***********************/
async function tryLoadFromLocalCache(){
  if (localStorage.getItem(LS_OK) !== "1") return false;
  const b64 = localStorage.getItem(LS_B64);
  const t = localStorage.getItem(LS_TIME);
  if (!b64) return false;

  const buf = base64ToArrayBuffer(b64);
  await loadWorkbookArrayBuffer(buf);
  statusEl.textContent = `⚠️ 離線模式｜最後更新：${formatIso(t) || "未知"}`;
  return true;
}

async function loadFromExec(bust=false){
  try{
    statusEl.textContent = "載入中…";
    const url = `${EXEC_URL}?action=export`;
    const payload = await jsonp(url);

    if (!payload || !payload.ok || !payload.b64) {
      throw new Error(payload?.error || "Proxy 回傳格式錯誤");
    }

    const buf = base64ToArrayBuffer(payload.b64);
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(buf);

    // 存離線備援
    localStorage.setItem(LS_OK, "1");
    localStorage.setItem(LS_B64, payload.b64);
    localStorage.setItem(LS_TIME, payload.generated_at || "");

    statusEl.textContent = `已載入（線上）｜最後更新：${formatIso(payload.generated_at) || "未知"}`;

  }catch(err){
    // 線上失敗 → 離線
    const ok = await tryLoadFromLocalCache();
    if (!ok){
      statusEl.textContent = `載入失敗：${err.message}`;
      listEl.innerHTML = `<div class="sub">${err.message}</div>`;
    }
  }
}

async function loadFromFile(file){
  try{
    statusEl.textContent = "讀取檔案中…";
    const buf = await file.arrayBuffer();
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(buf);

    statusEl.textContent = `已載入（本機檔案）｜${formatIso(new Date().toISOString())}`;
  }catch(err){
    statusEl.textContent = `載入失敗：${err.message}`;
    listEl.innerHTML = `<div class="sub">${err.message}</div>`;
  }
}

/***********************
 * B) 產生導航連結
 ***********************/
function ensureMapsLink(link, placeText){
  if (link) return link;
  const q = toStr(placeText);
  if (!q) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

/***********************
 * 寫回（update）
 * 用 JSONP 避免 CORS
 ***********************/
async function writeBackUpdate(tripId, note, ticket, booking){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "update");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("trip_id", tripId);
  url.searchParams.set("note", note ?? "");
  url.searchParams.set("ticket", ticket ?? "");
  url.searchParams.set("booking", booking ?? "");
  const payload = await jsonp(url.toString());
  return payload;
}

/***********************
 * Excel 解析
 ***********************/
async function loadWorkbookArrayBuffer(buf){
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (rows.length < 2) throw new Error("工作表沒有資料");

  const header = rows[0].map(normalizeHeader);
  cols = {};
  header.forEach((h,i)=>{ cols[h]=i; });

  // 必要欄位（寫回版本強烈建議有 行程ID）
  const required = ["日期","城市","項目類型","必去/備選","名稱"];
  const missing = required.filter(k => cols[k] === undefined);
  if (missing.length){
    throw new Error(`缺少欄位：${missing.join("、")}（請確認標題列一致）`);
  }

  // 如果沒有 行程ID，仍可顯示，但寫回會失敗
  if (cols["行程ID"] === undefined) {
    statusEl.textContent = "⚠️ 缺少「行程ID」欄位：可看行程，但無法寫回";
  }

  allRows = rows.slice(1).filter(r => r.some(v => toStr(v) !== ""));

  const dates = uniq(allRows.map(r => rowValue(r,"日期")));
  const cities = uniq(allRows.map(r => rowValue(r,"城市")));
  const types = uniq(allRows.map(r => rowValue(r,"項目類型")));
  const prios = uniq(allRows.map(r => rowValue(r,"必去/備選")));

  buildOptions(dateSel, dates, "選日期（全部）");
  buildOptions(citySel, cities, "選城市（全部）");
  buildOptions(typeSel, types, "選類型（全部）");
  buildOptions(prioSel, prios, "全部（必去+備選）");

  const today = todayStrLocal();
  mode = dates.includes(today) ? "today" : "all";
  chipSet(modeTodayBtn, mode==="today");
  chipSet(modeAllBtn, mode==="all");

  render();
}

/***********************
 * 渲染（含可編輯 UI）
 ***********************/
function render(){
  const dateV = dateSel.value;
  const cityV = citySel.value;
  const typeV = typeSel.value;
  const prioV = prioSel.value;

  const today = todayStrLocal();
  let rows = allRows.slice();

  if (mode === "today") rows = rows.filter(r => rowValue(r,"日期") === today);

  if (mustOnly) rows = rows.filter(r => rowValue(r,"必去/備選") === "必去");
  if (!showOptional) rows = rows.filter(r => rowValue(r,"必去/備選") !== "備選");

  if (dateV) rows = rows.filter(r => rowValue(r,"日期") === dateV);
  if (cityV) rows = rows.filter(r => rowValue(r,"城市") === cityV);
  if (typeV) rows = rows.filter(r => rowValue(r,"項目類型") === typeV);
  if (prioV) rows = rows.filter(r => rowValue(r,"必去/備選") === prioV);

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

    const tripId = rowValue(r,"行程ID") || `${date}|${city}|${name}`; // 備援
    const rawLink = rowValue(r,"Google Maps 連結");
    const place = rowValue(r,"地點文字");
    const link = ensureMapsLink(rawLink, place);

    const time = rowValue(r,"建議時段");
    const note = rowValue(r,"備註");
    const ticket = rowValue(r,"票務");
    const booking = rowValue(r,"訂位");

    const order = rowValue(r,"順序");
    const stay = rowValue(r,"停留(分)");

    const card = document.createElement("div");
    card.className = "card" + (prio === "備選" ? " dim" : "");
    card.dataset.tripId = tripId;

    card.innerHTML = `
      <div class="row">
        <a class="a" href="${link || "#"}" target="_blank" rel="noopener noreferrer">
          <div class="meta">
            <span class="badge">${date || "-"}</span>
            <span class="badge">${city || "-"}</span>
            <span class="badge">${type || "-"}</span>
            ${prio ? `<span class="badge">${prio}</span>` : ""}
            ${time ? `<span class="badge">${time}</span>` : ""}
            ${order ? `<span class="badge">#${order}</span>` : ""}
            ${stay ? `<span class="badge">${stay}分</span>` : ""}
            ${ticket ? `<span class="badge">票務:${ticket}</span>` : ""}
            ${booking ? `<span class="badge">訂位:${booking}</span>` : ""}
          </div>
          <div class="name">${name || "(未命名)"}</div>
          <div class="note">${(note || place || "")}</div>
        </a>

        <a class="navBtn" href="${link || "#"}" target="_blank" rel="noopener noreferrer"
           style="${link ? "" : "background:#9ca3af;"}">
          ${link ? "導航" : "無連結"}
        </a>
      </div>

      <div class="editWrap">
        <button class="editToggle">編輯</button>
        <div class="editBox" style="display:none;">
          <div class="editRow">
            <label>備註</label>
            <textarea class="editNote" rows="2" placeholder="輸入備註…">${note || ""}</textarea>
          </div>

          <div class="editRow">
            <label>票務</label>
            <select class="editTicket">
              <option value="">--</option>
              <option value="已買" ${ticket==="已買"?"selected":""}>已買</option>
              <option value="未買" ${ticket==="未買"?"selected":""}>未買</option>
              <option value="需預約" ${ticket==="需預約"?"selected":""}>需預約</option>
              <option value="現場" ${ticket==="現場"?"selected":""}>現場</option>
            </select>

            <label>訂位</label>
            <select class="editBooking">
              <option value="">--</option>
              <option value="已訂" ${booking==="已訂"?"selected":""}>已訂</option>
              <option value="需訂" ${booking==="需訂"?"selected":""}>需訂</option>
              <option value="不用" ${booking==="不用"?"selected":""}>不用</option>
            </select>
          </div>

          <div class="editRow">
            <button class="saveBtn">儲存</button>
            <span class="saveStatus"></span>
          </div>

          <div class="editHint">
            行程ID：<span class="mono">${tripId}</span>
          </div>
        </div>
      </div>
    `;

    listEl.appendChild(card);
  }
}

/***********************
 * 事件：列表委派（避免每次 render 重綁）
 ***********************/
listEl.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;

  const card = ev.target.closest(".card");
  if (!card) return;

  // 展開/收合
  if (btn.classList.contains("editToggle")) {
    const box = card.querySelector(".editBox");
    const isOpen = box.style.display !== "none";
    box.style.display = isOpen ? "none" : "block";
    btn.textContent = isOpen ? "編輯" : "收合";
    return;
  }

  // 儲存
  if (btn.classList.contains("saveBtn")) {
    const tripId = card.dataset.tripId;
    const status = card.querySelector(".saveStatus");

    // 若缺行程ID欄位，仍可能寫回失敗（因為 Sheet 端找不到）
    if (cols["行程ID"] === undefined) {
      status.textContent = "❌ 缺少行程ID欄位，請先匯入 writeback 版表格";
      return;
    }

    const note = card.querySelector(".editNote").value || "";
    const ticket = card.querySelector(".editTicket").value || "";
    const booking = card.querySelector(".editBooking").value || "";

    status.textContent = "儲存中…";
    try{
      const payload = await writeBackUpdate(tripId, note, ticket, booking);
      if (!payload || !payload.ok) {
        status.textContent = `❌ 失敗：${payload?.error || "未知錯誤"}`;
        return;
      }

      // 更新記憶體資料（allRows）讓畫面一致
      for (const r of allRows) {
        if (rowValue(r, "行程ID") === tripId) {
          setRowValue(r, "備註", note);
          setRowValue(r, "票務", ticket);
          setRowValue(r, "訂位", booking);
          break;
        }
      }

      status.textContent = `✅ 已儲存 ${formatIso(payload.updated_at)}`;
      // 重新渲染，讓 badge / note 更新
      render();

    }catch(e){
      status.textContent = `❌ 例外：${e.message}`;
    }
  }
});

/***********************
 * UI 控制
 ***********************/
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

for (const sel of [dateSel, citySel, typeSel, prioSel]){
  sel.addEventListener("change", render);
}

/***********************
 * init
 ***********************/
loadFromExec(false);