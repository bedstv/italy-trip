/***********************
async function _ensureXLSX(){
  if (window.ensureXLSX) return window.ensureXLSX();
  if (window.XLSX) return true;
  throw new Error('XLSX not loaded');
}

 * 行程總覽（Dashboard / Timeline）
 * - 讀取 Apps Script export (base64 xlsx, JSONP)
 * - 支援：搜尋、只看必去、只看待辦
 * - 行動裝置友善：可摺疊日卡、待辦徽章
 * - 離線：localStorage 快取最後一次的 b64
 ***********************/

const EXEC_URL = (window.TripAPI && window.TripAPI.EXEC_URL) || ((window.TRIP_CONFIG && window.TRIP_CONFIG.EXEC_URL) || "");
const API_KEY  = (window.TripAPI && window.TripAPI.API_KEY ) || ((window.TRIP_CONFIG && window.TRIP_CONFIG.API_KEY ) || "");
if (!EXEC_URL) throw new Error("Missing TRIP_CONFIG.EXEC_URL (請編輯 config.js)");
if (!API_KEY) throw new Error("Missing TRIP_CONFIG.API_KEY (請編輯 config.js)");
const SHEET_NAME = "行程清單（iPhone）";

const LS_KEY_B64 = "italyTrip_overview_b64";
const LS_KEY_TS  = "italyTrip_overview_ts";

const statusEl = document.getElementById("status");
const daysEl = document.getElementById("days");

const mustOnlyBtn = document.getElementById("mustOnlyBtn");
const todoOnlyBtn = document.getElementById("todoOnlyBtn");
const searchInput = document.getElementById("searchInput");
const reloadBtn = document.getElementById("reloadBtn");

const kpiDays = document.getElementById("kpiDays");
const kpiItems = document.getElementById("kpiItems");
const kpiMust = document.getElementById("kpiMust");
const kpiOpt = document.getElementById("kpiOpt");
const kpiTicketTodo = document.getElementById("kpiTicketTodo");
const kpiBookingTodo = document.getElementById("kpiBookingTodo");

let all = [];
let mustOnly = true;
let todoOnly = false;
let query = "";

/* ========= JSONP ========= */
function jsonp(url){ return TripAPI.jsonp(url); }

/* ========= Excel 日期 → yyyy-mm-dd ========= */
function excelDateToYMD(v) {
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

function ymdToLabel(ymd) {
  // 2025-12-25 → 12/25（四）
  try {
    const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    const wd = ["日", "一", "二", "三", "四", "五", "六"][dt.getDay()];
    return `${m}/${d}（${wd}）`;
  } catch {
    return ymd;
  }
}

/* ========= 判斷 ========= */
function isTicketTodo(x) {
  return x.ticket === "未買" || x.ticket === "需預約";
}

function isBookingTodo(x) {
  return x.booking === "需訂";
}

function isTodo(x) {
  return isTicketTodo(x) || isBookingTodo(x);
}

function typeIcon(type = "") {
  if (type.includes("餐")) return "🍽";
  if (type.includes("住")) return "🏠";
  if (type.includes("車") || type.includes("站")) return "🚉";
  if (type.includes("機") || type.includes("航")) return "✈️";
  return "🏛";
}

/* ========= 解析 XLSX ========= */
function parseFromB64(b64) {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  await _ensureXLSX();
    const wb = (await _ensureXLSX(), XLSX.read)(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  all = rows
    .map((r) => {
      const date = excelDateToYMD(r["日期"]);
      const city = String(r["城市"] || "").trim();
      const type = String(r["項目類型"] || "").trim();
      const prio = String(r["必去/備選"] || "").trim();
      const name = String(r["名稱"] || "").trim();
      const ticket = String(r["票務"] || "").trim();
      const booking = String(r["訂位"] || "").trim();
      const note = String(r["備註"] || "").trim();
      const maps = String(r["Google Maps 連結"] || "").trim();
      const place = String(r["地點文字"] || "").trim();
      return { date, city, type, prio, name, ticket, booking, note, maps, place };
    })
    .filter((x) => x.date && x.name);
}

/* ========= 載入（線上 → 離線） ========= */
async function load() {
  statusEl.textContent = "載入中…";
  try {
    const u = new URL(EXEC_URL);
    u.searchParams.set("action", "export");
    u.searchParams.set("api_key", API_KEY);
    const payload = await jsonp(u.toString());
    if (!payload?.b64) throw new Error("No b64 in payload");

    // cache
    localStorage.setItem(LS_KEY_B64, payload.b64);
    localStorage.setItem(LS_KEY_TS, String(Date.now()));

    parseFromB64(payload.b64);
    render();
    statusEl.textContent = "已載入（線上）";
  } catch (e) {
    const cached = localStorage.getItem(LS_KEY_B64);
    if (cached) {
      parseFromB64(cached);
      render();
      const ts = Number(localStorage.getItem(LS_KEY_TS) || 0);
      const hint = ts ? `（離線，快取：${new Date(ts).toLocaleString()}）` : "（離線）";
      statusEl.textContent = `已載入 ${hint}`;
    } else {
      statusEl.textContent = "載入失敗（無離線快取）";
      daysEl.innerHTML = `<div class="emptyState">無法載入資料。請檢查網路後按「重新載入」。</div>`;
    }
  }
}

/* ========= 搜尋 / 篩選 ========= */
function applyFilters() {
  let rows = all;

  if (mustOnly) rows = rows.filter((x) => x.prio === "必去");
  if (todoOnly) rows = rows.filter(isTodo);

  const q = query.trim().toLowerCase();
  if (q) {
    rows = rows.filter((x) => {
      const hay = [x.name, x.city, x.type, x.note, x.place].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // sort by date then city then type
  rows = rows
    .slice()
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.city.localeCompare(b.city) ||
      a.prio.localeCompare(b.prio) ||
      a.type.localeCompare(b.type) ||
      a.name.localeCompare(b.name)
    );

  return rows;
}

/* ========= UI ========= */
function syncChipUI() {
  mustOnlyBtn.classList.toggle("chipOn", mustOnly);
  todoOnlyBtn.classList.toggle("chipOn", todoOnly);
}

function render() {
  syncChipUI();

  const rows = applyFilters();
  const dayKeys = [...new Set(rows.map((r) => r.date))];

  // KPI（以當前 rows 為準，避免使用者誤會）
  kpiDays.textContent = dayKeys.length;
  kpiItems.textContent = rows.length;
  kpiMust.textContent = rows.filter((r) => r.prio === "必去").length;
  kpiOpt.textContent = rows.filter((r) => r.prio === "備選").length;
  kpiTicketTodo.textContent = rows.filter(isTicketTodo).length;
  kpiBookingTodo.textContent = rows.filter(isBookingTodo).length;

  if (!rows.length) {
    daysEl.innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">沒有符合條件的行程</div>
        <div class="emptySub">試試看清空搜尋，或關掉「只看必去 / 只看待辦」。</div>
      </div>
    `;
    return;
  }

  daysEl.innerHTML = "";

  for (const date of dayKeys) {
    const items = rows.filter((r) => r.date === date);
    const city = items[0]?.city || "";

    const must = items.filter((i) => i.prio === "必去");
    const opt = items.filter((i) => i.prio === "備選");

    const ticketTodo = items.filter(isTicketTodo).length;
    const bookingTodo = items.filter(isBookingTodo).length;

    const card = document.createElement("section");
    card.className = "dayCardNew";

    // 一天一個 <details>：預設展開「必去」、備選可獨立展開
    card.innerHTML = `
      <div class="dayTop">
        <div class="dayLeft">
          <div class="dayDate">${ymdToLabel(date)}</div>
          <div class="dayYmd">${date}</div>
        </div>
        <div class="dayRight">
          ${city ? `<div class="cityPill">${escapeHtml(city)}</div>` : ""}
          <div class="miniKpis">
            <span class="pill">✅ ${must.length}</span>
            ${opt.length ? `<span class="pill">⭐ ${opt.length}</span>` : ""}
            ${(ticketTodo || bookingTodo)
              ? `<span class="pill warn">⚠️ 待辦 ${ticketTodo + bookingTodo}</span>`
              : `<span class="pill ok">✓ 無待辦</span>`}
          </div>
        </div>
      </div>

      <details class="group" open>
        <summary class="groupSum">
          <span class="sumTitle">✅ 必去</span>
          <span class="sumMeta">${must.length} 項</span>
        </summary>
        <div class="groupBody">
          ${renderItems(must)}
        </div>
      </details>

      ${opt.length
        ? `
        <details class="group">
          <summary class="groupSum">
            <span class="sumTitle">⭐ 備選</span>
            <span class="sumMeta">${opt.length} 項</span>
          </summary>
          <div class="groupBody">
            ${renderItems(opt)}
          </div>
        </details>
      `
        : ""}
    `;

    daysEl.appendChild(card);
  }
}

function renderItems(items) {
  if (!items.length) return `<div class="emptyInline">（無）</div>`;
  return items
    .map((i) => {
      const todoParts = [];
      if (isTicketTodo(i)) todoParts.push(i.ticket);
      if (isBookingTodo(i)) todoParts.push(i.booking);

      const todoBadge = todoParts.length
        ? `<span class="todoBadge">待辦：${escapeHtml(todoParts.join(" / "))}</span>`
        : "";

      const meta = [i.type, i.city].filter(Boolean).join(" · ");

      // 有 maps 就顯示小按鈕（不打擾閱讀）
      const mapsLink = i.maps
        ? `<a class="miniBtn" href="${escapeAttr(i.maps)}" target="_blank" rel="noopener">地圖</a>`
        : i.place
          ? `<a class="miniBtn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.place)}" target="_blank" rel="noopener">地圖</a>`
          : "";

      return `
        <div class="itemLine ${todoParts.length ? "itemTodo" : ""}">
          <div class="itemIcon">${typeIcon(i.type)}</div>
          <div class="itemMain">
            <div class="itemName">${escapeHtml(i.name)}</div>
            ${meta ? `<div class="itemMeta">${escapeHtml(meta)}</div>` : ""}
            ${todoBadge}
          </div>
          ${mapsLink ? `<div class="itemSide">${mapsLink}</div>` : ""}
        </div>
      `;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s) {
  // same as escapeHtml; clarity for href attribute usage
  return escapeHtml(s);
}

/* ========= events ========= */
mustOnlyBtn.addEventListener("click", () => {
  mustOnly = !mustOnly;
  render();
});

todoOnlyBtn.addEventListener("click", () => {
  todoOnly = !todoOnly;
  render();
});

let searchT;
searchInput.addEventListener("input", () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    query = searchInput.value || "";
    render();
  }, 80);
});

reloadBtn.addEventListener("click", () => load());

// UX：iOS 上按 Enter 收鍵盤
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchInput.blur();
});

load();