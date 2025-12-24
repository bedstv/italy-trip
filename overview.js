
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

loadAny();
