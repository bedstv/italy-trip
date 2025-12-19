/***********************
 * 設定
 ***********************/
const EXEC_URL =
  "https://script.google.com/macros/s/AKfycbxMVr13SBFWdJICZNkaceB-pV_ijfaDXwoH_ySMzhTVqqzDD5l6dtLnU0dIVbkSZzb4/exec";

// ⚠️ 要跟 Apps Script 的 API_KEY 一樣
const API_KEY = "Italy-Trip-Is-Good";
const SHEET_NAME = "行程清單（iPhone）";

// localStorage offline cache
const LS_OK = "trip_cache_ok";
const LS_B64 = "trip_cache_b64";
const LS_TIME = "trip_cache_time";

/***********************
 * DOM
 ***********************/
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
const toggleTodoBtn = document.getElementById("toggleTodoBtn");
const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const filtersBox = document.getElementById("filtersBox");
const searchInput = document.getElementById("searchInput");

const kpiDays = document.getElementById("kpiDays");
const kpiItems = document.getElementById("kpiItems");
const kpiTicketTodo = document.getElementById("kpiTicketTodo");
const kpiBookingTodo = document.getElementById("kpiBookingTodo");

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
let todoOnly = false;      // 只看待辦
let q = "";                // search
let filtersOpen = false;

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
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

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

function ymdToLabel(ymd){
  try{
    const [y,m,d] = ymd.split("-").map(n=>parseInt(n,10));
    const dt = new Date(y, m-1, d);
    const wd = ["日","一","二","三","四","五","六"][dt.getDay()];
    return `${m}/${d}（${wd}）`;
  }catch{
    return ymd;
  }
}

function typeIcon(type=""){
  if (type.includes("餐")) return "🍽";
  if (type.includes("住")) return "🏠";
  if (type.includes("車") || type.includes("站")) return "🚉";
  if (type.includes("機") || type.includes("航")) return "✈️";
  return "🏛";
}

function isTicketTodo(v){
  return v === "未買" || v === "需預約";
}
function isBookingTodo(v){
  return v === "需訂";
}
function isRowTodo(r){
  const ticket = rowValue(r,"票務");
  const booking = rowValue(r,"訂位");
  return isTicketTodo(ticket) || isBookingTodo(booking);
}

/***********************
 * Base64 → ArrayBuffer
 ***********************/
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

async function loadFromExec(){
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
    const ok = await tryLoadFromLocalCache();
    if (!ok){
      statusEl.textContent = `載入失敗：${err.message}`;
      listEl.innerHTML = `<div class="emptyState"><div class="emptyTitle">載入失敗</div><div class="emptySub">${escapeHtml(err.message)}</div></div>`;
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
    listEl.innerHTML = `<div class="emptyState"><div class="emptyTitle">載入失敗</div><div class="emptySub">${escapeHtml(err.message)}</div></div>`;
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
 * 寫回（update/add/delete）
 ***********************/
async function writeBackUpdate(tripId, fields){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "update");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("trip_id", tripId);

  for (const [k, v] of Object.entries(fields || {})) {
    url.searchParams.set(k, v ?? "");
  }

  return await jsonp(url.toString());
}

async function addTrip(payload){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "add");
  url.searchParams.set("api_key", API_KEY);

  // 必填
  url.searchParams.set("date", payload.date);
  url.searchParams.set("city", payload.city);
  url.searchParams.set("type", payload.type);
  url.searchParams.set("prio", payload.prio);
  url.searchParams.set("name", payload.name);

  // 選填
  if (payload.time) url.searchParams.set("time", payload.time);
  if (payload.place) url.searchParams.set("place", payload.place);
  if (payload.map) url.searchParams.set("map", payload.map);
  if (payload.note) url.searchParams.set("note", payload.note);
  if (payload.ticket) url.searchParams.set("ticket", payload.ticket);
  if (payload.booking) url.searchParams.set("booking", payload.booking);

  return await jsonp(url.toString());
}

async function deleteTrip(tripId){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "delete");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("trip_id", tripId);
  return await jsonp(url.toString());
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

  const required = ["日期","城市","項目類型","必去/備選","名稱"];
  const missing = required.filter(k => cols[k] === undefined);
  if (missing.length){
    throw new Error(`缺少欄位：${missing.join("、")}（請確認標題列一致）`);
  }

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
 * 渲染：依日期分段
 ***********************/
function applyFilters(){
  const dateV = dateSel.value;
  const cityV = citySel.value;
  const typeV = typeSel.value;
  const prioV = prioSel.value;

  const today = todayStrLocal();
  let rows = allRows.slice();

  if (mode === "today") rows = rows.filter(r => rowValue(r,"日期") === today);

  // 優先：必去/備選顯示規則
  if (mustOnly) rows = rows.filter(r => rowValue(r,"必去/備選") === "必去");
  if (!showOptional) rows = rows.filter(r => rowValue(r,"必去/備選") !== "備選");

  if (todoOnly) rows = rows.filter(isRowTodo);

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

  return rows;
}

function render(){
  const rows = applyFilters();

  // KPI（以目前視圖為準）
  const days = uniq(rows.map(r => rowValue(r,"日期")));
  kpiDays.textContent = days.length;
  kpiItems.textContent = rows.length;
  kpiTicketTodo.textContent = rows.filter(r => isTicketTodo(rowValue(r,"票務"))).length;
  kpiBookingTodo.textContent = rows.filter(r => isBookingTodo(rowValue(r,"訂位"))).length;

  listEl.innerHTML = "";
  if (!rows.length){
    listEl.innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">沒有符合條件的項目</div>
        <div class="emptySub">試試清空搜尋，或關掉「只看待辦 / 只看必去」。</div>
      </div>`;
    return;
  }

  // 依日期分組
  const map = new Map();
  for (const r of rows){
    const d = rowValue(r,"日期");
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(r);
  }

  for (const [date, items] of map.entries()){
    const mustCnt = items.filter(r => rowValue(r,"必去/備選")==="必去").length;
    const optCnt = items.filter(r => rowValue(r,"必去/備選")==="備選").length;
    const todoCnt = items.filter(isRowTodo).length;

    const day = document.createElement("section");
    day.className = "daySection";
    day.innerHTML = `
      <div class="dayHeader">
        <div class="dayHeaderLeft">
          <div class="dayHeaderTitle">${escapeHtml(ymdToLabel(date))}</div>
          <div class="dayHeaderSub">${escapeHtml(date)}</div>
        </div>
        <div class="dayHeaderRight">
          <span class="pill">✅ ${mustCnt}</span>
          ${optCnt ? `<span class="pill">⭐ ${optCnt}</span>` : ``}
          ${todoCnt ? `<span class="pill warn">⚠️ 待辦 ${todoCnt}</span>` : `<span class="pill ok">✓ 無待辦</span>`}
        </div>
      </div>
      <div class="dayItems"></div>
    `;

    const container = day.querySelector(".dayItems");

    for (const r of items){
      const city = rowValue(r,"城市");
      const type = rowValue(r,"項目類型");
      const prio = rowValue(r,"必去/備選");
      const name = rowValue(r,"名稱");

      const tripId = rowValue(r,"行程ID") || `${rowValue(r,"日期")}|${city}|${name}`;
      const rawLink = rowValue(r,"Google Maps 連結");
      const place = rowValue(r,"地點文字");
      const link = ensureMapsLink(rawLink, place);

      const time = rowValue(r,"建議時段");
      const note = rowValue(r,"備註");
      const ticket = rowValue(r,"票務");
      const booking = rowValue(r,"訂位");

      const todoParts = [];
      if (isTicketTodo(ticket)) todoParts.push(`票務：${ticket}`);
      if (isBookingTodo(booking)) todoParts.push(`訂位：${booking}`);

      const meta = [type, city].filter(Boolean).join(" · ");
      const sub = (note || place || "").trim();

      const card = document.createElement("div");
      card.className = `itemCard ${prio==="備選" ? "dim" : ""} ${todoParts.length ? "itemTodo" : ""}`;
      card.dataset.tripId = tripId;

      card.innerHTML = `
        <div class="itemRow">
          <a class="itemMainLink" href="${link || "#"}" target="_blank" rel="noopener noreferrer">
            <div class="itemTop">
              <div class="itemIcon">${typeIcon(type)}</div>
              <div class="itemText">
                <div class="itemName">${escapeHtml(name || "(未命名)")}</div>
                ${meta ? `<div class="itemMeta">${escapeHtml(meta)}${time ? ` · ${escapeHtml(time)}` : ""}</div>` : ""}
                ${sub ? `<div class="itemSub">${escapeHtml(sub)}</div>` : ""}
                ${todoParts.length ? `<div class="todoBadge">待辦：${escapeHtml(todoParts.join(" / "))}</div>` : ""}
              </div>
            </div>
          </a>

          <div class="itemActions">
            <a class="miniBtn" href="${link || "#"}" target="_blank" rel="noopener noreferrer" ${link ? "" : "aria-disabled='true'"}>${link ? "地圖" : "無連結"}</a>
            <button class="miniBtn editBtn" type="button">編輯</button>
          </div>
        </div>
      `;

      container.appendChild(card);
    }

    listEl.appendChild(day);
  }
}

/***********************
 * 事件：點「編輯」→ 開 Modal
 ***********************/
listEl.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;

  if (btn.classList.contains("editBtn")) {
    const card = ev.target.closest(".itemCard");
    if (!card) return;
    openEditModal(card.dataset.tripId);
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
toggleTodoBtn.addEventListener("click", () => {
  todoOnly = !todoOnly;
  chipSet(toggleTodoBtn, todoOnly);
  render();
});

let searchT;
searchInput.addEventListener("input", () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    q = toStr(searchInput.value);
    render();
  }, 80);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchInput.blur();
});

toggleFiltersBtn.addEventListener("click", () => {
  filtersOpen = !filtersOpen;
  filtersBox.classList.toggle("filtersCollapsed", !filtersOpen);
  chipSet(toggleFiltersBtn, filtersOpen);
});

for (const sel of [dateSel, citySel, typeSel, prioSel]){
  sel.addEventListener("change", render);
}

/***********************
 * 編輯 Modal（取代卡片內長表單）
 ***********************/
const editMask = document.createElement("div");
editMask.className = "modalMask";
editMask.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modalHead">
      <div class="modalTitle">編輯行程</div>
      <button class="modalClose">關閉</button>
    </div>

    <div class="modalBody">
      <div>
        <label>日期（必填）</label>
        <input id="eDate" type="date" />
      </div>
      <div>
        <label>城市（必填）</label>
        <select id="eCity"></select>
      </div>

      <div>
        <label>類型（必填）</label>
        <select id="eType"></select>
      </div>
      <div>
        <label>必去/備選（必填）</label>
        <select id="ePrio">
          <option value="必去">必去</option>
          <option value="備選">備選</option>
        </select>
      </div>

      <div class="full">
        <label>名稱（必填）</label>
        <input id="eName" />
      </div>

      <div>
        <label>建議時段</label>
        <input id="eTime" placeholder="上午 / 下午 / 晚上…" />
      </div>
      <div>
        <label>地點文字</label>
        <input id="ePlace" placeholder="用於 maps 搜尋" />
      </div>

      <div class="full">
        <label>Google Maps 連結</label>
        <input id="eMap" placeholder="https://maps.google.com/..." />
      </div>

      <div class="full">
        <label>備註</label>
        <textarea id="eNote" rows="2"></textarea>
      </div>

      <div>
        <label>票務</label>
        <select id="eTicket">
          <option value="">--</option>
          <option value="已買">已買</option>
          <option value="未買">未買</option>
          <option value="需預約">需預約</option>
          <option value="現場">現場</option>
        </select>
      </div>
      <div>
        <label>訂位</label>
        <select id="eBooking">
          <option value="">--</option>
          <option value="已訂">已訂</option>
          <option value="需訂">需訂</option>
          <option value="不用">不用</option>
        </select>
      </div>

      <div class="full">
        <div class="editIdLine">行程ID：<span class="mono" id="eTripId"></span></div>
        <div class="saveStatus" id="eStatus"></div>
      </div>
    </div>

    <div class="modalFoot">
      <button class="btn dangerBtn" id="eDelete">刪除</button>
      <div style="flex:1"></div>
      <button class="btn modalCancel">取消</button>
      <button class="btn btnPrimary" id="eSave">儲存</button>
    </div>
  </div>
`;
document.body.appendChild(editMask);

function closeEditModal(){
  editMask.style.display = "none";
}
editMask.querySelector(".modalClose").addEventListener("click", closeEditModal);
editMask.querySelector(".modalCancel").addEventListener("click", closeEditModal);
editMask.addEventListener("click", (e) => {
  if (e.target === editMask) closeEditModal();
});

function openEditModal(tripId){
  if (cols["行程ID"] === undefined) {
    alert("缺少「行程ID」欄位：目前只能瀏覽，無法寫回。");
    return;
  }

  const r = allRows.find(x => rowValue(x,"行程ID") === tripId);
  if (!r) {
    alert("找不到該筆資料（可能已更新或重新載入）。");
    return;
  }

  // select options
  const cities = uniq(allRows.map(x => rowValue(x,"城市")));
  const types  = uniq(allRows.map(x => rowValue(x,"項目類型")));
  const eCity = editMask.querySelector("#eCity");
  const eType = editMask.querySelector("#eType");
  eCity.innerHTML = cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  eType.innerHTML = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  editMask.dataset.tripId = tripId;
  editMask.querySelector("#eTripId").textContent = tripId;
  editMask.querySelector("#eStatus").textContent = "";

  editMask.querySelector("#eDate").value = rowValue(r,"日期");
  eCity.value = rowValue(r,"城市");
  eType.value = rowValue(r,"項目類型");
  editMask.querySelector("#ePrio").value = rowValue(r,"必去/備選");
  editMask.querySelector("#eName").value = rowValue(r,"名稱");
  editMask.querySelector("#eTime").value = rowValue(r,"建議時段");
  editMask.querySelector("#ePlace").value = rowValue(r,"地點文字");
  editMask.querySelector("#eMap").value = rowValue(r,"Google Maps 連結");
  editMask.querySelector("#eNote").value = rowValue(r,"備註");
  editMask.querySelector("#eTicket").value = rowValue(r,"票務");
  editMask.querySelector("#eBooking").value = rowValue(r,"訂位");

  editMask.style.display = "flex";
}

editMask.querySelector("#eSave").addEventListener("click", async () => {
  let tripId = editMask.dataset.tripId;
  const status = editMask.querySelector("#eStatus");

  if (cols["行程ID"] === undefined) {
    status.textContent = "❌ 缺少行程ID欄位，無法寫回";
    return;
  }

  const fields = {
    "日期": editMask.querySelector("#eDate").value || "",
    "城市": editMask.querySelector("#eCity").value || "",
    "項目類型": editMask.querySelector("#eType").value || "",
    "必去/備選": editMask.querySelector("#ePrio").value || "",
    "名稱": editMask.querySelector("#eName").value.trim() || "",
    "建議時段": editMask.querySelector("#eTime").value.trim() || "",
    "地點文字": editMask.querySelector("#ePlace").value.trim() || "",
    "Google Maps 連結": editMask.querySelector("#eMap").value.trim() || "",
    "備註": editMask.querySelector("#eNote").value.trim() || "",
    "票務": editMask.querySelector("#eTicket").value || "",
    "訂位": editMask.querySelector("#eBooking").value || "",
  };

  if (!fields["日期"] || !fields["城市"] || !fields["名稱"]) {
    status.textContent = "❌ 日期/城市/名稱 不能為空";
    return;
  }

  status.textContent = "儲存中…";
  try{
    const payload = await writeBackUpdate(tripId, fields);
    if (!payload || !payload.ok) {
      status.textContent = `❌ 失敗：${payload?.error || "未知錯誤"}`;
      return;
    }

    const newTripId = payload.new_trip_id || tripId;

    // 更新記憶體資料
    const r = allRows.find(x => rowValue(x,"行程ID") === tripId);
    if (r){
      for (const [k,v] of Object.entries(fields)) setRowValue(r, k, v);
      if (newTripId !== tripId) setRowValue(r, "行程ID", newTripId);
    }

    // 同步 modal id
    if (newTripId !== tripId){
      editMask.dataset.tripId = newTripId;
      editMask.querySelector("#eTripId").textContent = newTripId;
      tripId = newTripId;
    }

    status.textContent = `✅ 已儲存 ${formatIso(payload.updated_at)}`;
    render();
    setTimeout(closeEditModal, 350);

  }catch(e){
    status.textContent = `❌ 例外：${e.message}`;
  }
});

editMask.querySelector("#eDelete").addEventListener("click", async () => {
  const tripId = editMask.dataset.tripId;
  const r = allRows.find(x => rowValue(x,"行程ID") === tripId);
  const name = r ? rowValue(r,"名稱") : "";

  const ok = confirm(`確定要刪除這筆行程？\n\n${name}\n${tripId}\n\n（此操作會直接刪除 Google Sheet 該列）`);
  if (!ok) return;

  const status = editMask.querySelector("#eStatus");
  status.textContent = "刪除中…";

  try{
    const payload = await deleteTrip(tripId);
    if (!payload || !payload.ok) {
      status.textContent = `❌ 刪除失敗：${payload?.error || "未知錯誤"}`;
      return;
    }

    status.textContent = "✅ 已刪除，重新載入…";
    closeEditModal();
    await loadFromExec();
  }catch(e){
    status.textContent = `❌ 例外：${e.message}`;
  }
});

/***********************
 * 新增行程：沿用原本 FAB + Modal
 ***********************/
const modalMask = document.createElement("div");
modalMask.className = "modalMask";
modalMask.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modalHead">
      <div class="modalTitle">新增行程</div>
      <button class="modalClose">關閉</button>
    </div>

    <div class="modalBody">
      <div>
        <label>日期（必填）</label>
        <input id="mDate" type="date" />
      </div>
      <div>
        <label>城市（必填）</label>
        <select id="mCity"></select>
      </div>

      <div>
        <label>類型（必填）</label>
        <select id="mType"></select>
      </div>
      <div>
        <label>必去/備選（必填）</label>
        <select id="mPrio">
          <option value="必去">必去</option>
          <option value="備選">備選</option>
        </select>
      </div>

      <div class="full">
        <label>名稱（必填）</label>
        <input id="mName" placeholder="例如：Colosseum / 某餐廳…" />
      </div>

      <div>
        <label>建議時段（選填）</label>
        <input id="mTime" placeholder="上午 / 下午 / 晚上…" />
      </div>
      <div>
        <label>地點文字（選填）</label>
        <input id="mPlace" placeholder="地址或店名，用於 maps 搜尋" />
      </div>

      <div class="full">
        <label>Google Maps 連結（選填）</label>
        <input id="mMap" placeholder="https://maps.google.com/..." />
      </div>

      <div class="full">
        <label>備註（選填）</label>
        <textarea id="mNote" rows="2" placeholder="備忘、注意事項…"></textarea>
      </div>

      <div>
        <label>票務（選填）</label>
        <select id="mTicket">
          <option value="">--</option>
          <option value="已買">已買</option>
          <option value="未買">未買</option>
          <option value="需預約">需預約</option>
          <option value="現場">現場</option>
        </select>
      </div>
      <div>
        <label>訂位（選填）</label>
        <select id="mBooking">
          <option value="">--</option>
          <option value="已訂">已訂</option>
          <option value="需訂">需訂</option>
          <option value="不用">不用</option>
        </select>
      </div>
    </div>

    <div class="modalFoot">
      <button class="btn modalCancel">取消</button>
      <button class="btn btnPrimary modalSubmit">新增</button>
    </div>
  </div>
`;
document.body.appendChild(modalMask);

const fab = document.createElement("button");
fab.className = "fabAdd";
fab.textContent = "＋ 新增";
document.body.appendChild(fab);

function openModal(){
  const cities = uniq(allRows.map(r => rowValue(r,"城市")));
  const types = uniq(allRows.map(r => rowValue(r,"項目類型")));

  const mCity = modalMask.querySelector("#mCity");
  const mType = modalMask.querySelector("#mType");
  mCity.innerHTML = cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  mType.innerHTML = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  modalMask.querySelector("#mDate").value = todayStrLocal();
  modalMask.style.display = "flex";
}
function closeModal(){
  modalMask.style.display = "none";
}

fab.addEventListener("click", openModal);
modalMask.querySelector(".modalClose").addEventListener("click", closeModal);
modalMask.querySelector(".modalCancel").addEventListener("click", closeModal);
modalMask.addEventListener("click", (e) => {
  if (e.target === modalMask) closeModal();
});

modalMask.querySelector(".modalSubmit").addEventListener("click", async () => {
  const payload = {
    date: modalMask.querySelector("#mDate").value,
    city: modalMask.querySelector("#mCity").value,
    type: modalMask.querySelector("#mType").value,
    prio: modalMask.querySelector("#mPrio").value,
    name: modalMask.querySelector("#mName").value.trim(),
    time: modalMask.querySelector("#mTime").value.trim(),
    place: modalMask.querySelector("#mPlace").value.trim(),
    map: modalMask.querySelector("#mMap").value.trim(),
    note: modalMask.querySelector("#mNote").value.trim(),
    ticket: modalMask.querySelector("#mTicket").value,
    booking: modalMask.querySelector("#mBooking").value,
  };

  if (!payload.date || !payload.city || !payload.type || !payload.prio || !payload.name) {
    alert("請填完必填欄位：日期、城市、類型、必去/備選、名稱");
    return;
  }

  try{
    statusEl.textContent = "新增中…";
    const res = await addTrip(payload);
    if (!res || !res.ok) {
      alert(`新增失敗：${res?.error || "未知錯誤"}`);
      return;
    }

    closeModal();
    statusEl.textContent = "新增成功，重新載入…";
    await loadFromExec();
  }catch(e){
    alert(`新增例外：${e.message}`);
  }
});

/***********************
 * init
 ***********************/
loadFromExec();