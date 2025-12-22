/***********************
 * 設定
 ***********************/
const EXEC_URL =
  "https://script.google.com/macros/s/AKfycbyNdMZJDAU_vZLxn4_MC8xauheraJUhHJVwPv5oP8V9L9ow-1WzdgVX-lqD1YuG38I/exec";

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
// ✅ 新版：支援多欄位；也相容舊版 (tripId, note, ticket, booking)
async function writeBackUpdate(tripId, a, b, c){
  const url = new URL(EXEC_URL);
  url.searchParams.set("action", "update");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("trip_id", tripId);

  // 相容舊版參數：note/ticket/booking
  if (typeof a === "string" || typeof a === "number" || a === "" || a === null || a === undefined) {
    const note = a ?? "";
    const ticket = b ?? "";
    const booking = c ?? "";
    url.searchParams.set("note", note);
    url.searchParams.set("ticket", ticket);
    url.searchParams.set("booking", booking);
  } else {
    // 新版：a 是 object，key 可用「欄位名」(中文) 或舊 key(note/ticket/booking)
    const fields = a || {};

    // 舊 key（可選）
    if (fields.note !== undefined) url.searchParams.set("note", fields.note ?? "");
    if (fields.ticket !== undefined) url.searchParams.set("ticket", fields.ticket ?? "");
    if (fields.booking !== undefined) url.searchParams.set("booking", fields.booking ?? "");

    // 新 key：直接用欄位名當 querystring key（後端白名單會擋）
    for (const [k, v] of Object.entries(fields)) {
      if (k === "note" || k === "ticket" || k === "booking") continue;
      url.searchParams.set(k, v ?? "");
    }
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

  // ✅ 用現有資料產生下拉選單（城市/類型）
  const cityOptions = uniq(allRows.map(x => rowValue(x,"城市")));
  const typeOptions = uniq(allRows.map(x => rowValue(x,"項目類型")));

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
            <span class="badge">${escapeHtml(date || "-")}</span>
            <span class="badge">${escapeHtml(city || "-")}</span>
            <span class="badge">${escapeHtml(type || "-")}</span>
            ${prio ? `<span class="badge">${escapeHtml(prio)}</span>` : ""}
            ${time ? `<span class="badge">${escapeHtml(time)}</span>` : ""}
            ${order ? `<span class="badge">#${escapeHtml(order)}</span>` : ""}
            ${stay ? `<span class="badge">${escapeHtml(stay)}分</span>` : ""}
            ${ticket ? `<span class="badge">票務:${escapeHtml(ticket)}</span>` : ""}
            ${booking ? `<span class="badge">訂位:${escapeHtml(booking)}</span>` : ""}
          </div>
          <div class="name">${escapeHtml(name || "(未命名)")}</div>
          <div class="note">${escapeHtml((note || place || ""))}</div>
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
            <label>日期</label>
            <input class="editDate" type="date" value="${escapeHtml(date || "")}" />

            <label>城市</label>
            <select class="editCity">
              <option value="">--</option>
              ${cityOptions.map(c => `<option value="${escapeHtml(c)}" ${c===city?"selected":""}>${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>

          <div class="editRow">
            <label>類型</label>
            <select class="editType">
              <option value="">--</option>
              ${typeOptions.map(t => `<option value="${escapeHtml(t)}" ${t===type?"selected":""}>${escapeHtml(t)}</option>`).join("")}
            </select>

            <label>必去/備選</label>
            <select class="editPrio">
              <option value="必去" ${prio==="必去"?"selected":""}>必去</option>
              <option value="備選" ${prio==="備選"?"selected":""}>備選</option>
            </select>
          </div>

          <div class="editRow">
            <label>名稱</label>
            <input class="editName" value="${escapeHtml(name || "")}" />
          </div>

          <div class="editRow">
            <label>建議時段</label>
            <input class="editTime" value="${escapeHtml(time || "")}" placeholder="上午 / 下午 / 晚上…" />
          </div>

          <div class="editRow">
            <label>地點文字</label>
            <input class="editPlace" value="${escapeHtml(place || "")}" placeholder="用於 maps 搜尋" />
          </div>

          <div class="editRow">
            <label>Google Maps 連結</label>
            <input class="editMap" value="${escapeHtml(rawLink || "")}" placeholder="https://maps.google.com/..." />
          </div>

          <div class="editRow">
            <label>備註</label>
            <textarea class="editNote" rows="2" placeholder="輸入備註…">${escapeHtml(note || "")}</textarea>
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
            <button class="delBtn dangerBtn">刪除</button>
            <span class="saveStatus"></span>
          </div>

          <div class="editHint">
            行程ID：<span class="mono">${escapeHtml(tripId)}</span>
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

  // 刪除（需二次確認）
  if (btn.classList.contains("delBtn")) {
    const tripId = card.dataset.tripId;
    const name = card.querySelector(".name")?.textContent || "";
    const ok = confirm(`確定要刪除這筆行程？\n\n${name}\n${tripId}\n\n（此操作會直接刪除 Google Sheet 該列）`);
    if (!ok) return;

    const status = card.querySelector(".saveStatus");
    status.textContent = "刪除中…";

    try{
      const payload = await deleteTrip(tripId);
      if (!payload || !payload.ok) {
        status.textContent = `❌ 刪除失敗：${payload?.error || "未知錯誤"}`;
        return;
      }

      status.textContent = "✅ 已刪除，重新載入…";
      await loadFromExec(true); // 直接重新抓，避免本地狀態不一致
    }catch(e){
      status.textContent = `❌ 例外：${e.message}`;
    }
    return;
  }

  // 儲存（✅ 改為多欄位更新）
  if (btn.classList.contains("saveBtn")) {
    let tripId = card.dataset.tripId; // let：因為可能被 new_trip_id 更新
    const status = card.querySelector(".saveStatus");

    if (cols["行程ID"] === undefined) {
      status.textContent = "❌ 缺少行程ID欄位，請先匯入 writeback 版表格";
      return;
    }

    const fields = {
      "日期": card.querySelector(".editDate")?.value || "",
      "城市": card.querySelector(".editCity")?.value || "",
      "項目類型": card.querySelector(".editType")?.value || "",
      "必去/備選": card.querySelector(".editPrio")?.value || "",
      "名稱": card.querySelector(".editName")?.value || "",
      "建議時段": card.querySelector(".editTime")?.value || "",
      "地點文字": card.querySelector(".editPlace")?.value || "",
      "Google Maps 連結": card.querySelector(".editMap")?.value || "",
      "備註": card.querySelector(".editNote")?.value || "",
      "票務": card.querySelector(".editTicket")?.value || "",
      "訂位": card.querySelector(".editBooking")?.value || "",
    };

    if (!fields["城市"] || !fields["名稱"]) {
      status.textContent = "❌ 城市/名稱 不能為空";
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

      // ✅ 更新記憶體資料（allRows）
      for (const r of allRows) {
        if (rowValue(r, "行程ID") === tripId) {
          setRowValue(r, "日期", fields["日期"]);
          setRowValue(r, "城市", fields["城市"]);
          setRowValue(r, "項目類型", fields["項目類型"]);
          setRowValue(r, "必去/備選", fields["必去/備選"]);
          setRowValue(r, "名稱", fields["名稱"]);
          setRowValue(r, "建議時段", fields["建議時段"]);
          setRowValue(r, "地點文字", fields["地點文字"]);
          setRowValue(r, "Google Maps 連結", fields["Google Maps 連結"]);
          setRowValue(r, "備註", fields["備註"]);
          setRowValue(r, "票務", fields["票務"]);
          setRowValue(r, "訂位", fields["訂位"]);

          if (newTripId !== tripId) {
            setRowValue(r, "行程ID", newTripId);
          }
          break;
        }
      }

      // ✅ dataset 也要同步，否則下一次 update/delete 會用舊 ID
      if (newTripId !== tripId) {
        card.dataset.tripId = newTripId;
        tripId = newTripId;
      }

      status.textContent = `✅ 已儲存 ${formatIso(payload.updated_at)}`;
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
 * 新增行程：彈窗 UI（JS 注入）
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
  // 用現有資料填 select（城市/類型）
  const cities = uniq(allRows.map(r => rowValue(r,"城市")));
  const types = uniq(allRows.map(r => rowValue(r,"項目類型")));

  const mCity = modalMask.querySelector("#mCity");
  const mType = modalMask.querySelector("#mType");
  mCity.innerHTML = cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  mType.innerHTML = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  // 日期預設今天
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
    await loadFromExec(true); // 重新抓最新資料
  }catch(e){
    alert(`新增例外：${e.message}`);
  }
});

/***********************
 * init
 ***********************/
loadFromExec(false);