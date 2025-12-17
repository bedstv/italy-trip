/***********************
 * 行程總覽（只讀、摘要）
 * - 沿用既有後端：action=export（JSONP 回 base64 xlsx）
 * - 沿用既有離線快取（localStorage）
 ***********************/

const EXEC_URL =
  "https://script.google.com/macros/s/AKfycbxMVr13SBFWdJICZNkaceB-pV_ijfaDXwoH_ySMzhTVqqzDD5l6dtLnU0dIVbkSZzb4/exec";

const SHEET_NAME = "行程清單（iPhone）";

// 與主頁共用快取 keys（兩頁互相備援）
const LS_OK = "trip_cache_ok";
const LS_B64 = "trip_cache_b64";
const LS_TIME = "trip_cache_time";

const statusEl = document.getElementById("status");
const daysEl = document.getElementById("days");

const mustOnlyBtn = document.getElementById("mustOnlyBtn");
const todoOnlyBtn = document.getElementById("todoOnlyBtn");
const searchInput = document.getElementById("searchInput");

const kpiDays = document.getElementById("kpiDays");
const kpiItems = document.getElementById("kpiItems");
const kpiMust = document.getElementById("kpiMust");
const kpiOpt = document.getElementById("kpiOpt");
const kpiTicketTodo = document.getElementById("kpiTicketTodo");
const kpiBookingTodo = document.getElementById("kpiBookingTodo");

document.getElementById("reloadBtn")
  .addEventListener("click", () => loadFromExec(true));

let all = [];
let mustOnly = true;
let todoOnly = false;
let q = "";

function toStr(v){ return (v === null || v === undefined) ? "" : String(v).trim(); }
function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function chipSet(btn, on){ btn.classList.toggle("chipOn", !!on); }

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

function jsonp(url){
  return new Promise((resolve, reject) => {
    const cbName = "__cb_" + Date.now() + "_" + Math.floor(Math.random()*1e6);
    const script = document.createElement("script");
    window[cbName] = (payload) => {
      try{
        delete window[cbName];
        script.remove();
        resolve(payload);
      }catch(e){ reject(e); }
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

async function tryLoadFromLocalCache(){
  if (localStorage.getItem(LS_OK) !== "1") return false;
  const b64 = localStorage.getItem(LS_B64);
  const t = localStorage.getItem(LS_TIME);
  if (!b64) return false;
  await loadWorkbookArrayBuffer(base64ToArrayBuffer(b64));
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
    statusEl.textContent = "解析 Excel 中…";
    await loadWorkbookArrayBuffer(base64ToArrayBuffer(payload.b64));

    localStorage.setItem(LS_OK, "1");
    localStorage.setItem(LS_B64, payload.b64);
    localStorage.setItem(LS_TIME, payload.generated_at || "");

    statusEl.textContent = `已載入（線上）｜最後更新：${formatIso(payload.generated_at) || "未知"}`;
  }catch(err){
    const ok = await tryLoadFromLocalCache();
    if (!ok){
      statusEl.textContent = `載入失敗：${err.message}`;
      daysEl.innerHTML = `<div class="sub">${escapeHtml(err.message)}</div>`;
    }
  }
}

async function loadWorkbookArrayBuffer(buf){
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // 直接用 header row 轉成 object array
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  all = rows.map(r => ({
    date: toStr(r["日期"]),
    city: toStr(r["城市"]),
    type: toStr(r["項目類型"]),
    prio: toStr(r["必去/備選"]),
    name: toStr(r["名稱"]),
    time: toStr(r["建議時段"]),
    note: toStr(r["備註"]) || toStr(r["地點文字"]),
    ticket: toStr(r["票務"]),
    booking: toStr(r["訂位"]),
  })).filter(x => x.date && x.name);

  render();
}

function isTodo(x){
  return x.ticket === "未買" || x.ticket === "需預約" || x.booking === "需訂";
}

function computeKpi(rows){
  const dates = new Set();
  let must = 0, opt = 0, ticketTodo = 0, bookingTodo = 0;
  for (const x of rows){
    dates.add(x.date);
    if (x.prio === "必去") must++;
    if (x.prio === "備選") opt++;
    if (x.ticket === "未買" || x.ticket === "需預約") ticketTodo++;
    if (x.booking === "需訂") bookingTodo++;
  }
  return {
    days: dates.size,
    items: rows.length,
    must,
    opt,
    ticketTodo,
    bookingTodo,
  };
}

function groupByDate(rows){
  const m = new Map();
  for (const x of rows){
    if (!m.has(x.date)) m.set(x.date, []);
    m.get(x.date).push(x);
  }
  const dates = [...m.keys()].sort();
  return dates.map(d => {
    const items = m.get(d);
    const cities = [...new Set(items.map(i => i.city).filter(Boolean))];
    const mustItems = items.filter(i => i.prio === "必去");
    const todoItems = items.filter(isTodo);
    return { date: d, cities, items, mustItems, todoItems };
  });
}

function render(){
  let rows = all.slice();

  if (mustOnly) rows = rows.filter(x => x.prio === "必去");
  if (todoOnly) rows = rows.filter(isTodo);

  if (q){
    const qq = q.toLowerCase();
    rows = rows.filter(x =>
      [x.name, x.city, x.note, x.type].join(" ").toLowerCase().includes(qq)
    );
  }

  const kpi = computeKpi(rows);
  kpiDays.textContent = kpi.days;
  kpiItems.textContent = kpi.items;
  kpiMust.textContent = kpi.must;
  kpiOpt.textContent = kpi.opt;
  kpiTicketTodo.textContent = kpi.ticketTodo;
  kpiBookingTodo.textContent = kpi.bookingTodo;

  const days = groupByDate(rows);
  daysEl.innerHTML = "";

  if (!days.length){
    daysEl.innerHTML = `<div class="sub" style="padding:14px;">沒有符合的項目</div>`;
    return;
  }

  for (const d of days){
    const el = document.createElement("section");
    el.className = "dayCard";

    const cityTags = d.cities.map(c => `<span class="tag">${escapeHtml(c)}</span>`).join("");
    const todoCount = d.todoItems.length;

    const todoList = d.todoItems.slice(0, 8).map(x => {
      const t = x.ticket ? `票務:${escapeHtml(x.ticket)}` : "";
      const b = x.booking ? `訂位:${escapeHtml(x.booking)}` : "";
      const meta = [t,b].filter(Boolean).join(" ");
      return `<li><b>${escapeHtml(x.name)}</b>${meta ? `<div class="mini">${meta}</div>` : ""}</li>`;
    }).join("");

    const mustList = d.mustItems.slice(0, 12).map(x => {
      const time = x.time ? `<span class="muted">${escapeHtml(x.time)}</span>` : "";
      return `<li>${escapeHtml(x.name)} ${time}</li>`;
    }).join("");

    el.innerHTML = `
      <div class="dayHead">
        <div class="dayTitle">${escapeHtml(d.date)}</div>
        <div class="dayTags">${cityTags}</div>
      </div>
      <div class="dayMeta">
        <span>共 ${d.items.length} 項</span>
        <span>必去 ${d.mustItems.length}</span>
        <span class="${todoCount ? "warn" : ""}">待辦 ${todoCount}</span>
      </div>

      <details class="dayDetails" ${todoCount ? "open" : ""}>
        <summary>待辦（票務/訂位）</summary>
        <ul>${todoCount ? todoList : `<li class="muted">沒有待辦</li>`}</ul>
      </details>

      <details class="dayDetails">
        <summary>必去清單</summary>
        <ul>${d.mustItems.length ? mustList : `<li class="muted">沒有必去</li>`}</ul>
      </details>
    `;

    daysEl.appendChild(el);
  }
}

mustOnlyBtn.addEventListener("click", () => {
  mustOnly = !mustOnly;
  chipSet(mustOnlyBtn, mustOnly);
  render();
});

todoOnlyBtn.addEventListener("click", () => {
  todoOnly = !todoOnly;
  chipSet(todoOnlyBtn, todoOnly);
  render();
});

searchInput.addEventListener("input", (e) => {
  q = toStr(e.target.value);
  render();
});

chipSet(mustOnlyBtn, mustOnly);
chipSet(todoOnlyBtn, todoOnly);
loadFromExec();
