
/***********************
 * 行程總覽（overview.html）
 * - KPI：天數、項目、必去、備選、待辦、已完成
 * - 篩選：只看必去、只看待辦、搜尋
 ***********************/
const statusEl  = document.getElementById("status");
const reloadBtn = document.getElementById("reloadBtn");

const mustOnlyBtn = document.getElementById("mustOnlyBtn");
const todoOnlyBtn = document.getElementById("todoOnlyBtn");
const searchInput = document.getElementById("searchInput");

const daysEl = document.getElementById("days");

const kpiDays  = document.getElementById("kpiDays");
const kpiItems = document.getElementById("kpiItems");
const kpiMust  = document.getElementById("kpiMust");
const kpiOpt   = document.getElementById("kpiOpt");
// overview.html 的 KPI 是「票務待辦 / 訂位待辦」
const kpiTicketTodo  = document.getElementById("kpiTicketTodo");
const kpiBookingTodo = document.getElementById("kpiBookingTodo");

let data=null, tripsTable=null, allRows=[];

const state = { mustOnly:true, todoOnly:false, q:"" };

// ===== 新增：FAB + Modal（與交通/備忘錄一致） =====
function buildTripAddModal(){
  const mask = document.createElement("div");
  mask.className = "modalMask";
  mask.style.display = "none";
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modalHead">
        <div class="modalTitle">新增行程</div>
        <button class="modalClose" type="button" aria-label="close">✕</button>
      </div>

      <div class="modalBody full" style="grid-column:1 / -1; display:block;">
        <div class="editRow">
          <label>日期</label>
          <input class="mDate" type="date" />
          <label>城市</label>
          <input class="mCity" />
        </div>
        <div class="editRow">
          <label>類型</label>
          <input class="mType" placeholder="景點 / 餐廳 / 交通…" />
          <label>必去/備選</label>
          <input class="mPrio" placeholder="必去 / 備選" />
        </div>
        <div class="editRow">
          <label>建議時段</label>
          <input class="mTime" placeholder="09:00 / 下午…" />
        </div>
        <div class="editRow">
          <label>名稱</label>
          <input class="mName" />
        </div>
        <div class="editRow">
          <label>地點文字</label>
          <input class="mPlace" />
        </div>
        <div class="editRow">
          <label>Google Maps 連結</label>
          <input class="mMap" placeholder="可留空" />
        </div>
        <div class="editRow">
          <label>票務</label>
          <input class="mTicket" />
        </div>
        <div class="editRow">
          <label>訂位</label>
          <input class="mBook" />
        </div>
        <div class="editRow">
          <label>備註</label>
          <textarea class="mNote" rows="3"></textarea>
        </div>
        <div class="sub mHint"></div>
        <div class="editRow">
          <button class="mSave">新增</button>
          <span class="mStatus"></span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(mask);

  const els = {
    mask,
    date: mask.querySelector(".mDate"),
    city: mask.querySelector(".mCity"),
    type: mask.querySelector(".mType"),
    prio: mask.querySelector(".mPrio"),
    time: mask.querySelector(".mTime"),
    name: mask.querySelector(".mName"),
    place: mask.querySelector(".mPlace"),
    map: mask.querySelector(".mMap"),
    ticket: mask.querySelector(".mTicket"),
    book: mask.querySelector(".mBook"),
    note: mask.querySelector(".mNote"),
    hint: mask.querySelector(".mHint"),
    status: mask.querySelector(".mStatus"),
    save: mask.querySelector(".mSave"),
    close: mask.querySelector(".modalClose"),
  };

  function open(){
    els.hint.textContent = "";
    els.status.textContent = "";
    mask.style.display = "flex";
  }
  function close(){ mask.style.display = "none"; }

  els.close.addEventListener("click", close);
  mask.addEventListener("click", (e)=>{ if (e.target === mask) close(); });
  return { els, open, close };
}

const addModal = buildTripAddModal();

async function addTripFromModal(){
  const f = {
    "日期": addModal.els.date.value || "",
    "城市": addModal.els.city.value.trim(),
    "項目類型": addModal.els.type.value.trim(),
    "必去/備選": (addModal.els.prio.value.trim() || "必去"),
    "建議時段": addModal.els.time.value.trim(),
    "名稱": addModal.els.name.value.trim(),
    "地點文字": addModal.els.place.value.trim(),
    "Google Maps 連結": addModal.els.map.value.trim(),
    "票務": addModal.els.ticket.value.trim(),
    "訂位": addModal.els.book.value.trim(),
    "備註": addModal.els.note.value.trim(),
  };
  if (!f["名稱"]) throw new Error("請填「名稱」");
  addModal.els.save.disabled = true;
  try{
    await TripAPI.add("trips", f);
    addModal.close();
    await loadAny();
  }finally{
    addModal.els.save.disabled = false;
  }
}

function normDate(d){
  const s = (d||"").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  return s;
}

function isDone(r){
  const v = tableRowValue(tripsTable, r, "完成(✔/✖)");
  return v === "✔" || v.toLowerCase() === "done" || v === "1" || v.toLowerCase() === "y";
}

function matches(r){
  const prio = tableRowValue(tripsTable, r, "必去/備選");
  const done = isDone(r);

  if (state.mustOnly && prio && prio !== "必去") return false;
  if (state.todoOnly && done) return false;

  const q = (state.q||"").trim().toLowerCase();
  if (q){
    const hay = [
      normDate(tableRowValue(tripsTable, r, "日期")),
      tableRowValue(tripsTable, r, "城市"),
      tableRowValue(tripsTable, r, "名稱"),
      tableRowValue(tripsTable, r, "備註"),
      tableRowValue(tripsTable, r, "票務"),
      tableRowValue(tripsTable, r, "訂位"),
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function render(){
  if (!tripsTable){ daysEl.innerHTML=""; return; }
  const rows = allRows.filter(matches);

  // KPI
  const dates = uniq(rows.map(r=>normDate(tableRowValue(tripsTable,r,"日期"))).filter(Boolean));
  const must = rows.filter(r => tableRowValue(tripsTable,r,"必去/備選")==="必去").length;
  const opt  = rows.filter(r => tableRowValue(tripsTable,r,"必去/備選")==="備選").length;
  // 待辦：票務/訂位欄位有內容且尚未完成(✔)
  const ticketTodo = rows.filter(r=>{
    if (isDone(r)) return false;
    const v = tableRowValue(tripsTable,r,"票務");
    return !!(v && v !== "-" && v !== "—");
  }).length;
  const bookingTodo = rows.filter(r=>{
    if (isDone(r)) return false;
    const v = tableRowValue(tripsTable,r,"訂位");
    return !!(v && v !== "-" && v !== "—");
  }).length;

  kpiDays.textContent  = dates.length || 0;
  kpiItems.textContent = rows.length || 0;
  kpiMust.textContent  = must;
  kpiOpt.textContent   = opt;
  if (kpiTicketTodo)  kpiTicketTodo.textContent  = ticketTodo;
  if (kpiBookingTodo) kpiBookingTodo.textContent = bookingTodo;

  // group by date
  const groups = new Map();
  rows.forEach(r=>{
    const d = normDate(tableRowValue(tripsTable,r,"日期")) || "（未排日期）";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(r);
  });
  const ds = [...groups.keys()].sort((a,b)=>{
    if (a==="（未排日期）") return 1;
    if (b==="（未排日期）") return -1;
    return a.localeCompare(b);
  });

  const out=[];
  ds.forEach(d=>{
    const items = groups.get(d);
    const doneN = items.filter(isDone).length;
    out.push(`<section class="card">`);
    out.push(`<div class="row" style="justify-content:space-between;align-items:center">`);
    out.push(`<div class="h2">${escapeHtml(d)}</div>`);
    out.push(`<div class="sub">${doneN}/${items.length} 完成</div>`);
    out.push(`</div>`);

    items.forEach(r=>{
      const city = tableRowValue(tripsTable,r,"城市");
      const name = tableRowValue(tripsTable,r,"名稱");
      const prio = tableRowValue(tripsTable,r,"必去/備選");
      const type = tableRowValue(tripsTable,r,"項目類型");
      const time = tableRowValue(tripsTable,r,"建議時段");
      const done = isDone(r);
      out.push(`
        <div class="itemLine ${done ? "" : "itemTodo"}" style="${done ? "opacity:.65" : ""}">
          <div class="itemIcon">${done ? "✔" : "•"}</div>
          <div class="itemBody">
            <div class="itemTop">
              <div class="itemTitle">${escapeHtml(name||"(未命名)")}</div>
              <div class="itemMeta">
                ${prio ? `<span class="pill">${escapeHtml(prio)}</span>` : ""}
                ${city ? `<span class="pill">${escapeHtml(city)}</span>` : ""}
                ${type ? `<span class="pill">${escapeHtml(type)}</span>` : ""}
                ${time ? `<span class="pill">${escapeHtml(time)}</span>` : ""}
              </div>
            </div>
          </div>
        </div>
      `);
    });

    out.push(`</section>`);
  });

  daysEl.innerHTML = out.join("") || `<div class="card"><div class="sub">沒有符合的項目</div></div>`;
}

async function loadAny(){
  try{
    statusEl.textContent="載入中…";
    const r = await loadFromExec();
    data = r.data;
    tripsTable = data.tables.trips;
    if (!tripsTable) throw new Error(`找不到工作表：${SHEETS.trips}`);
    allRows = tripsTable.rows;
    statusEl.textContent = `已載入（${r.from==="online" ? "線上" : "離線"}）｜最後更新：${formatIso(r.generated_at) || "未知"}`;
    render();
  }catch(err){
    const offline = await tryLoadFromLocalCache();
    if (offline){
      data = offline.data;
      tripsTable = data.tables.trips;
      allRows = tripsTable?.rows || [];
      statusEl.textContent = `已載入（離線快取）｜最後更新：${formatIso(offline.generated_at) || "未知"}｜${err.message}`;
      render();
    }else{
      statusEl.textContent = `載入失敗：${err.message}`;
      daysEl.innerHTML = `<div class="card"><div class="sub">${escapeHtml(err.message)}</div></div>`;
    }
  }
}

reloadBtn.addEventListener("click", loadAny);

mustOnlyBtn.addEventListener("click", ()=>{
  state.mustOnly = !state.mustOnly;
  mustOnlyBtn.classList.toggle("chipOn", state.mustOnly);
  render();
});
todoOnlyBtn.addEventListener("click", ()=>{
  state.todoOnly = !state.todoOnly;
  todoOnlyBtn.classList.toggle("chipOn", state.todoOnly);
  render();
});
searchInput.addEventListener("input", ()=>{
  state.q = searchInput.value;
  render();
});

// Modal save
addModal.els.save.addEventListener("click", async ()=>{
  try{
    addModal.els.status.textContent = "新增中…";
    await addTripFromModal();
  }catch(e){
    addModal.els.status.textContent = "❌ " + e.message;
  }
});

// FAB
(function injectFab(){
  const fab = document.createElement("button");
  fab.className = "fabAdd";
  fab.type = "button";
  fab.textContent = "＋ 新增";
  fab.title = "新增行程";
  fab.addEventListener("click", ()=>{
    addModal.els.date.value = "";
    addModal.els.prio.value = "必去";
    addModal.open();
  });
  document.body.appendChild(fab);
})();

loadAny();
