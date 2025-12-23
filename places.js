/***********************
 * 景點清單（地點為主、日期為輔）
 * - 依城市分組
 * - 可直接在這裡幫景點指定日期（或清空日期 → 備用）
 * - 與「日程/總覽」共用同一份行程資料
 ***********************/

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const citySel = document.getElementById("citySel");
const typeSel = document.getElementById("typeSel");
const searchInput = document.getElementById("searchInput");
const showUnscheduledBtn = document.getElementById("showUnscheduledBtn");
const showScheduledBtn = document.getElementById("showScheduledBtn");
const mustOnlyBtn = document.getElementById("mustOnlyBtn");

let data = null;            // { tables: { trips, transport, memos } }
let trips = null;           // table
let allRows = [];

let showUnscheduled = true;
let showScheduled = true;
let mustOnly = false;
let q = "";

function chipSet(btn,on){ btn.classList.toggle("chipOn", !!on); }

function buildOptions(select, values, placeholder){
  select.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = placeholder;
  select.appendChild(o0);
  for (const v of values){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  }
}

function getTripId(r){
  return tableRowValue(trips, r, "行程ID") || "";
}

function getDate(r){
  return tableRowValue(trips, r, "日期");
}

function getDates(){
  const ds = uniq(allRows.map(r => getDate(r)).filter(d => d));
  ds.sort((a,b)=>a.localeCompare(b));
  return ds;
}

function render(){
  if (!trips) return;

  const cityV = citySel.value;
  const typeV = typeSel.value;

  let rows = allRows.slice();

  rows = rows.filter(r => {
    const d = getDate(r);
    if (!showUnscheduled && !d) return false;
    if (!showScheduled && d) return false;
    return true;
  });

  if (mustOnly) rows = rows.filter(r => tableRowValue(trips,r,"必去/備選") === "必去");

  if (cityV) rows = rows.filter(r => tableRowValue(trips,r,"城市") === cityV);
  if (typeV) rows = rows.filter(r => tableRowValue(trips,r,"項目類型") === typeV);

  if (q){
    const qq = q.toLowerCase();
    rows = rows.filter(r => {
      const s = [
        tableRowValue(trips,r,"名稱"),
        tableRowValue(trips,r,"地點文字"),
        tableRowValue(trips,r,"備註"),
        tableRowValue(trips,r,"城市"),
        tableRowValue(trips,r,"項目類型"),
      ].join(" ").toLowerCase();
      return s.includes(qq);
    });
  }

  // group by city
  const groups = new Map();
  for (const r of rows){
    const c = tableRowValue(trips,r,"城市") || "(未填城市)";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(r);
  }

  // sort cities + items
  const cityKeys = [...groups.keys()].sort((a,b)=>a.localeCompare(b));
  for (const c of cityKeys){
    groups.get(c).sort((a,b) => {
      const da = getDate(a);
      const db = getDate(b);
      // 未排日期優先
      if (!!da !== !!db) return da ? 1 : -1;
      if (da !== db) return da.localeCompare(db);
      const ta = tableRowValue(trips,a,"項目類型");
      const tb = tableRowValue(trips,b,"項目類型");
      if (ta !== tb) return ta.localeCompare(tb);
      return tableRowValue(trips,a,"名稱").localeCompare(tableRowValue(trips,b,"名稱"));
    });
  }

  listEl.innerHTML = "";
  if (!rows.length){
    listEl.innerHTML = `<div class="sub">沒有符合的項目</div>`;
    return;
  }

  const dateOptions = getDates();

  for (const city of cityKeys){
    const h = document.createElement("div");
    h.className = "card";
    h.innerHTML = `<div class="name">${escapeHtml(city)}</div><div class="sub">共 ${groups.get(city).length} 筆</div>`;
    listEl.appendChild(h);

    for (const r of groups.get(city)){
      const id = getTripId(r);
      const date = getDate(r);
      const type = tableRowValue(trips,r,"項目類型");
      const prio = tableRowValue(trips,r,"必去/備選");
      const name = tableRowValue(trips,r,"名稱");
      const place = tableRowValue(trips,r,"地點文字");
      const rawLink = tableRowValue(trips,r,"Google Maps 連結");
      const link = ensureMapsLink(rawLink, place || name);
      const note = tableRowValue(trips,r,"備註");

      const card = document.createElement("div");
      card.className = "card" + (prio === "備選" ? " dim" : "");
      card.dataset.id = id;

      card.innerHTML = `
        <div class="row">
          <a class="a" href="${link || "#"}" target="_blank" rel="noopener noreferrer">
            <div class="meta">
              ${date ? `<span class="badge">${escapeHtml(date)}</span>` : `<span class="badge">未排日期</span>`}
              ${type ? `<span class="badge">${escapeHtml(type)}</span>` : ""}
              ${prio ? `<span class="badge">${escapeHtml(prio)}</span>` : ""}
            </div>
            <div class="name">${escapeHtml(name || "(未命名)")}</div>
            <div class="note">${escapeHtml(note || place || "")}</div>
          </a>
          <a class="navBtn" href="${link || "#"}" target="_blank" rel="noopener noreferrer" style="${link ? "" : "background:#9ca3af;"}">
            ${link ? "導航" : "無連結"}
          </a>
        </div>

        <div class="editWrap">
          <button class="editToggle">排到哪一天</button>
          <div class="editBox" style="display:none;">
            <div class="editRow">
              <label>日期</label>
              <select class="datePick">
                <option value="">（未排日期）</option>
                ${dateOptions.map(d => `<option value="${escapeHtml(d)}" ${d===date?"selected":""}>${escapeHtml(d)}</option>`).join("")}
              </select>
              <button class="setTodayBtn">今天</button>
            </div>
            <div class="editRow">
              <button class="saveBtn">儲存</button>
              <button class="clearBtn">清空日期</button>
              <span class="saveStatus"></span>
            </div>
            <div class="editHint">ID：<span class="mono">${escapeHtml(id)}</span></div>
          </div>
        </div>
      `;

      listEl.appendChild(card);
    }
  }
}

listEl.addEventListener("click", async (ev) => {
  const card = ev.target.closest(".card");
  if (!card) return;

  const btn = ev.target.closest("button");
  if (!btn) return;

  if (btn.classList.contains("editToggle")){
    const box = card.querySelector(".editBox");
    const isOpen = box.style.display !== "none";
    box.style.display = isOpen ? "none" : "block";
    btn.textContent = isOpen ? "排到哪一天" : "收合";
    return;
  }

  if (btn.classList.contains("setTodayBtn")){
    const sel = card.querySelector(".datePick");
    sel.value = todayStrLocal();
    return;
  }

  if (btn.classList.contains("clearBtn")){
    const sel = card.querySelector(".datePick");
    sel.value = "";
  }

  if (btn.classList.contains("saveBtn") || btn.classList.contains("clearBtn")){
    const id = card.dataset.id;
    const status = card.querySelector(".saveStatus");
    const date = card.querySelector(".datePick").value || "";

    status.textContent = "儲存中…";
    try{
      const res = await apiUpdate("trips", id, { "date": date });
      if (!res || !res.ok){
        status.textContent = `❌ 失敗：${res?.error || "未知錯誤"}`;
        return;
      }

      // 更新本地資料
      for (const r of allRows){
        if (getTripId(r) === id){
          tableSetRowValue(trips, r, "日期", date);
          break;
        }
      }

      status.textContent = `✅ 已儲存 ${formatIso(res.updated_at)}`;
      render();
    }catch(e){
      status.textContent = `❌ 例外：${e.message}`;
    }
  }
});

showUnscheduledBtn.addEventListener("click", ()=>{
  showUnscheduled = !showUnscheduled;
  chipSet(showUnscheduledBtn, showUnscheduled);
  render();
});
showScheduledBtn.addEventListener("click", ()=>{
  showScheduled = !showScheduled;
  chipSet(showScheduledBtn, showScheduled);
  render();
});
mustOnlyBtn.addEventListener("click", ()=>{
  mustOnly = !mustOnly;
  chipSet(mustOnlyBtn, mustOnly);
  render();
});

searchInput.addEventListener("input", ()=>{
  q = toStr(searchInput.value);
  render();
});

for (const sel of [citySel, typeSel]){
  sel.addEventListener("change", render);
}

document.getElementById("reloadBtn").addEventListener("click", init);

async function init(){
  try{
    statusEl.textContent = "載入中…";
    const r = await loadFromExec();
    data = r.data;
    trips = data.tables.trips;
    if (!trips) throw new Error(`找不到工作表：${SHEETS.trips}`);

    allRows = trips.rows;

    // filters
    const cities = uniq(allRows.map(r => tableRowValue(trips,r,"城市")));
    const types = uniq(allRows.map(r => tableRowValue(trips,r,"項目類型")));
    buildOptions(citySel, cities, "選城市（全部）");
    buildOptions(typeSel, types, "選類型（全部）");

    statusEl.textContent = `已載入（線上）｜最後更新：${formatIso(r.generated_at) || "未知"}`;
    render();
  }catch(err){
    const offline = await tryLoadFromLocalCache();
    if (!offline){
      statusEl.textContent = `載入失敗：${err.message}`;
      listEl.innerHTML = `<div class="sub">${escapeHtml(err.message)}</div>`;
      return;
    }
    data = offline.data;
    trips = data.tables.trips;
    allRows = trips?.rows || [];

    const cities = uniq(allRows.map(r => tableRowValue(trips,r,"城市")));
    const types = uniq(allRows.map(r => tableRowValue(trips,r,"項目類型")));
    buildOptions(citySel, cities, "選城市（全部）");
    buildOptions(typeSel, types, "選類型（全部）");

    statusEl.textContent = `⚠️ 離線模式｜最後更新：${formatIso(offline.generated_at) || "未知"}`;
    render();
  }
}

init();
