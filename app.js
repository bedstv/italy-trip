
/***********************
 * 日程（index.html）
 * - 讀取 Apps Script export (base64 xlsx)
 * - 支援：今天/全部、只看必去、顯示備選、搜尋、下拉篩選
 * - CRUD：新增/編輯/刪除（TripAPI）
 ***********************/

const statusEl   = document.getElementById("status");
const listEl     = document.getElementById("list");
const reloadBtn  = document.getElementById("reloadBtn");
const fileInput  = document.getElementById("fileInput");

const modeTodayBtn   = document.getElementById("modeTodayBtn");
const modeAllBtn     = document.getElementById("modeAllBtn");
const toggleMustBtn  = document.getElementById("toggleMustBtn");
const toggleOptBtn   = document.getElementById("toggleOptBtn");
const searchInput    = document.getElementById("searchInput");

const dateSel = document.getElementById("dateSel");
const citySel = document.getElementById("citySel");
const typeSel = document.getElementById("typeSel");
const prioSel = document.getElementById("prioSel");

let data = null;
let tripsTable = null;
let allRows = [];

const state = {
  mode: "today",        // today | all
  mustOnly: true,       // 只看必去
  showOptional: false,  // 顯示備選
  q: "",
  date: "",
  city: "",
  type: "",
  prio: "",
};

function todayStr(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function buildOptions(sel, values, placeholder){
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  sel.appendChild(opt0);
  values.forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

function normDate(d){
  // 資料來源可能是 YYYY-MM-DD / YYYY/M/D / 空
  const s = (d || "").trim();
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

function matchesFilters(r){
  const date = normDate(tableRowValue(tripsTable, r, "日期"));
  const city = tableRowValue(tripsTable, r, "城市");
  const type = tableRowValue(tripsTable, r, "項目類型");
  const prio = tableRowValue(tripsTable, r, "必去/備選");
  const name = tableRowValue(tripsTable, r, "名稱");
  const place= tableRowValue(tripsTable, r, "地點文字");
  const note = tableRowValue(tripsTable, r, "備註");

  // mode
  if (state.mode === "today"){
    const t = todayStr();
    if (date !== t) return false;
  }

  // must/opt
  if (state.mustOnly){
    if (prio && prio !== "必去") return false;
  } else {
    if (!state.showOptional){
      if (prio && prio !== "必去") return false;
    }
  }

  // selects
  if (state.date && date !== state.date) return false;
  if (state.city && city !== state.city) return false;
  if (state.type && type !== state.type) return false;
  if (state.prio && prio !== state.prio) return false;

  // search
  const q = (state.q || "").trim().toLowerCase();
  if (q){
    const hay = [date, city, type, prio, name, place, note].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

function sortKeyTime(t){
  const s = (t||"").trim();
  // 嘗試抓 08:30、8:30、上午/下午等；抓不到就放後面
  const m = s.match(/(\d{1,2})[:：](\d{2})/);
  if (m){
    const hh = Math.min(23, Math.max(0, parseInt(m[1],10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2],10)));
    return hh*60+mm;
  }
  if (s.includes("早")) return 8*60;
  if (s.includes("午") && !s.includes("下午")) return 12*60;
  if (s.includes("下") || s.includes("晚")) return 18*60;
  return 9999;
}

function render(){
  if (!tripsTable){ listEl.innerHTML = ""; return; }

  const rows = allRows.filter(matchesFilters);

  // group by 日期
  const groups = new Map();
  rows.forEach(r=>{
    const d = normDate(tableRowValue(tripsTable, r, "日期")) || "（未排日期）";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(r);
  });

  // sort dates (unassigned last)
  const dates = [...groups.keys()].sort((a,b)=>{
    if (a === "（未排日期）") return 1;
    if (b === "（未排日期）") return -1;
    return a.localeCompare(b);
  });

  // build
  const html = [];
  dates.forEach(d=>{
    const items = groups.get(d);
    items.sort((ra, rb)=>{
      const ta = sortKeyTime(tableRowValue(tripsTable, ra, "建議時段"));
      const tb = sortKeyTime(tableRowValue(tripsTable, rb, "建議時段"));
      if (ta !== tb) return ta - tb;
      return tableRowValue(tripsTable, ra, "名稱").localeCompare(tableRowValue(tripsTable, rb, "名稱"));
    });

    html.push(`<section class="card">`);
    html.push(`<div class="row" style="justify-content:space-between;align-items:center">`);
    html.push(`<div class="h2">${escapeHtml(d)}</div>`);
    html.push(`<div class="sub">${escapeHtml(items.length)} 項</div>`);
    html.push(`</div>`);

    items.forEach(r=>{
      const id    = tableRowValue(tripsTable, r, "行程ID");
      const city  = tableRowValue(tripsTable, r, "城市");
      const type  = tableRowValue(tripsTable, r, "項目類型");
      const prio  = tableRowValue(tripsTable, r, "必去/備選");
      const time  = tableRowValue(tripsTable, r, "建議時段");
      const name  = tableRowValue(tripsTable, r, "名稱");
      const place = tableRowValue(tripsTable, r, "地點文字");
      const map   = tableRowValue(tripsTable, r, "Google Maps 連結");
      const ticket= tableRowValue(tripsTable, r, "票務");
      const book  = tableRowValue(tripsTable, r, "訂位");
      const note  = tableRowValue(tripsTable, r, "備註");
      const hard  = tableRowValue(tripsTable, r, "是否硬點(需預約/排隊)");
      const done  = isDone(r);

      const mapUrl = map || mapSearchUrl([name, place, city].filter(Boolean).join(" "));
      const hardBadge = hard ? fmtBadge("硬點", "pill warn") : "";
      const prioBadge = prio ? fmtBadge(prio, prio==="必去" ? "pill" : "pill") : "";

      html.push(`
        <div class="itemLine ${done ? "" : ""}">
          <div class="itemIcon">${done ? "✔" : "•"}</div>
          <div class="itemBody">
            <div class="itemTop">
              <div class="itemTitle">${escapeHtml(name || "(未命名)")}</div>
              <div class="itemMeta">
                ${prioBadge}
                ${hardBadge}
                ${fmtBadge(city)}
                ${fmtBadge(type)}
                ${fmtBadge(time)}
              </div>
            </div>
            ${place ? `<div class="itemSub">${escapeHtml(place)}</div>` : ""}
            ${(ticket || book) ? `<div class="itemSub">${ticket ? `🎫 ${escapeHtml(ticket)} ` : ""}${book ? `🍽️ ${escapeHtml(book)}` : ""}</div>` : ""}
            ${note ? `<div class="itemSub">${escapeHtml(note)}</div>` : ""}
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <a class="btn small" style="padding:6px 10px;border-radius:10px" href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">地圖</a>
              <button class="btn small" style="padding:6px 10px;border-radius:10px" data-act="toggleDone" data-id="${escapeHtml(id)}">${done ? "標記未完成" : "標記完成"}</button>
              <button class="btn small" style="padding:6px 10px;border-radius:10px" data-act="edit" data-id="${escapeHtml(id)}">編輯</button>
              <button class="btn danger small" style="padding:6px 10px;border-radius:10px" data-act="del" data-id="${escapeHtml(id)}">刪除</button>
            </div>
          </div>
        </div>
      `);
    });

    html.push(`</section>`);
  });

  listEl.innerHTML = html.join("") || `<div class="card"><div class="sub">沒有符合的項目</div></div>`;
}

function refreshFilters(){
  const dates = uniq(allRows.map(r => normDate(tableRowValue(tripsTable, r, "日期"))).filter(Boolean)).sort();
  const cities= uniq(allRows.map(r => tableRowValue(tripsTable, r, "城市"))).sort();
  const types = uniq(allRows.map(r => tableRowValue(tripsTable, r, "項目類型"))).sort();
  const prios = uniq(allRows.map(r => tableRowValue(tripsTable, r, "必去/備選"))).sort();

  buildOptions(dateSel, dates, "選日期（全部）");
  buildOptions(citySel, cities, "選城市（全部）");
  buildOptions(typeSel, types, "選類型（全部）");
  buildOptions(prioSel, prios, "選必去/備選（全部）");
}

async function loadOnline(){
  statusEl.textContent = "載入中…";
  const r = await loadFromExec();
  data = r.data;
  tripsTable = data.tables.trips;
  if (!tripsTable) throw new Error(`找不到工作表：${SHEETS.trips}`);
  allRows = tripsTable.rows;

  refreshFilters();
  statusEl.textContent = `已載入（${r.from === "online" ? "線上" : "離線"}）｜最後更新：${formatIso(r.generated_at) || "未知"}`;
  render();
}

async function loadAny(){
  try{
    await loadOnline();
  }catch(err){
    const offline = await tryLoadFromLocalCache();
    if (offline){
      data = offline.data;
      tripsTable = data.tables.trips;
      allRows = tripsTable?.rows || [];
      refreshFilters();
      statusEl.textContent = `已載入（離線快取）｜最後更新：${formatIso(offline.generated_at) || "未知"}｜${err.message}`;
      render();
    }else{
      statusEl.textContent = `載入失敗：${err.message}`;
      listEl.innerHTML = `<div class="card"><div class="sub">${escapeHtml(err.message)}</div></div>`;
    }
  }
}

/***********************
 * CRUD: add / edit / delete / toggle done
 ***********************/
function findRowById(id){
  const idx = tripsTable?.cols?.["行程ID"];
  if (idx === undefined) return null;
  return allRows.find(r => String(r[idx] ?? "") === String(id));
}

function buildTripModalV2(){
  const mask = document.createElement("div");
  mask.className = "modalMask";
  mask.style.display = "none";
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modalHead">
        <div class="modalTitle" id="mTitle">新增行程</div>
        <button class="modalClose" type="button" aria-label="close">✕</button>
      </div>

      <div class="modalBody full" style="grid-column:1 / -1; display:block;">
        <div class="editRow">
          <label>日期</label>
          <input class="mDate" type="date" />
          <label>城市</label>
          <input class="mCity" placeholder="Rome / Florence…" />
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
          <input class="mMap" placeholder="可留空，系統會用名稱搜尋" />
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
          <button class="mSave">儲存</button>
          <span class="mStatus"></span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(mask);

  const els = {
    mask,
    title: mask.querySelector("#mTitle"),
    hint: mask.querySelector(".mHint"),
    status: mask.querySelector(".mStatus"),
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
    save: mask.querySelector(".mSave"),
    close: mask.querySelector(".modalClose"),
  };

  function open(){
    els.status.textContent = "";
    mask.style.display = "flex";
  }
  function close(){ mask.style.display = "none"; }

  els.close.addEventListener("click", close);
  mask.addEventListener("click", (e)=>{ if (e.target === mask) close(); });

  return { els, open, close };
}

// 取代舊版 modal（保持 openAdd/openEdit/saveModal 的行為）
const tripModal = buildTripModalV2();
let modalMode = "add"; // add | edit
let editingId = "";

function openAdd(){
  modalMode = "add";
  editingId = "";
  tripModal.els.title.textContent = "新增行程";
  tripModal.els.hint.textContent = "";
  tripModal.els.status.textContent = "";
  tripModal.els.date.value = state.mode==="today" ? todayStr() : "";
  tripModal.els.city.value = "";
  tripModal.els.type.value = "";
  tripModal.els.prio.value = "必去";
  tripModal.els.time.value = "";
  tripModal.els.name.value = "";
  tripModal.els.place.value = "";
  tripModal.els.map.value = "";
  tripModal.els.ticket.value = "";
  tripModal.els.book.value = "";
  tripModal.els.note.value = "";
  tripModal.open();
}

function openEdit(id){
  const r = findRowById(id);
  if (!r) return;
  modalMode = "edit";
  editingId = id;
  tripModal.els.title.textContent = "編輯行程";
  tripModal.els.hint.textContent = `行程ID：${id}`;
  tripModal.els.status.textContent = "";
  tripModal.els.date.value = normDate(tableRowValue(tripsTable, r, "日期"));
  tripModal.els.city.value = tableRowValue(tripsTable, r, "城市");
  tripModal.els.type.value = tableRowValue(tripsTable, r, "項目類型");
  tripModal.els.prio.value = tableRowValue(tripsTable, r, "必去/備選");
  tripModal.els.time.value = tableRowValue(tripsTable, r, "建議時段");
  tripModal.els.name.value = tableRowValue(tripsTable, r, "名稱");
  tripModal.els.place.value = tableRowValue(tripsTable, r, "地點文字");
  tripModal.els.map.value = tableRowValue(tripsTable, r, "Google Maps 連結");
  tripModal.els.ticket.value = tableRowValue(tripsTable, r, "票務");
  tripModal.els.book.value = tableRowValue(tripsTable, r, "訂位");
  tripModal.els.note.value = tableRowValue(tripsTable, r, "備註");
  tripModal.open();
}

async function saveModal(){
  if (!window.TripAPI) throw new Error("TripAPI not loaded");
  const f = {
    "日期": normDate(tripModal.els.date.value),
    "城市": tripModal.els.city.value.trim(),
    "項目類型": tripModal.els.type.value.trim(),
    "必去/備選": tripModal.els.prio.value.trim(),
    "建議時段": tripModal.els.time.value.trim(),
    "名稱": tripModal.els.name.value.trim(),
    "地點文字": tripModal.els.place.value.trim(),
    "Google Maps 連結": tripModal.els.map.value.trim(),
    "票務": tripModal.els.ticket.value.trim(),
    "訂位": tripModal.els.book.value.trim(),
    "備註": tripModal.els.note.value.trim(),
  };

  if (!f["名稱"]) throw new Error("請填「名稱」");

  tripModal.els.save.disabled = true;
  try{
    if (modalMode === "add"){
      await TripAPI.add("trips", f);
    }else{
      await TripAPI.update("trips", editingId, f);
    }
    tripModal.close();
    await loadOnline();
  }finally{
    tripModal.els.save.disabled = false;
  }
}

tripModal.els.save.addEventListener("click", async ()=>{
  try{
    tripModal.els.status.textContent = "儲存中…";
    await saveModal();
  }catch(err){
    tripModal.els.status.textContent = "❌ " + err.message;
  }
});

async function toggleDoneById(id){
  const r = findRowById(id);
  if (!r) return;
  const done = isDone(r);
  await TripAPI.update("trips", id, { "完成(✔/✖)": done ? "✖" : "✔" });
  await loadOnline();
}

async function deleteById(id){
  if (!confirm(`確定刪除行程ID ${id}？`)) return;
  await TripAPI.delete("trips", id);
  await loadOnline();
}

/***********************
 * Events
 ***********************/
reloadBtn.addEventListener("click", loadAny);

modeTodayBtn.addEventListener("click", ()=>{
  state.mode = "today";
  modeTodayBtn.classList.add("chipOn");
  modeAllBtn.classList.remove("chipOn");
  render();
});
modeAllBtn.addEventListener("click", ()=>{
  state.mode = "all";
  modeAllBtn.classList.add("chipOn");
  modeTodayBtn.classList.remove("chipOn");
  render();
});

toggleMustBtn.addEventListener("click", ()=>{
  state.mustOnly = !state.mustOnly;
  toggleMustBtn.classList.toggle("chipOn", state.mustOnly);
  render();
});
toggleOptBtn.addEventListener("click", ()=>{
  state.showOptional = !state.showOptional;
  toggleOptBtn.classList.toggle("chipOn", state.showOptional);
  render();
});

searchInput.addEventListener("input", ()=>{
  state.q = searchInput.value;
  render();
});

dateSel.addEventListener("change", ()=>{ state.date = dateSel.value; render(); });
citySel.addEventListener("change", ()=>{ state.city = citySel.value; render(); });
typeSel.addEventListener("change", ()=>{ state.type = typeSel.value; render(); });
prioSel.addEventListener("change", ()=>{ state.prio = prioSel.value; render(); });

listEl.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  if (!act || !id) return;
  try{
    if (act === "edit") return openEdit(id);
    if (act === "toggleDone") return await toggleDoneById(id);
    if (act === "del") return await deleteById(id);
  }catch(err){
    alert("操作失敗：" + err.message);
  }
});

// 以檔案開啟（本機 XLSX）
fileInput.addEventListener("change", async ()=>{
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  try{
    statusEl.textContent = "讀取檔案中…";
    await requireXLSX();
    const buf = await f.arrayBuffer();
    data = parseWorkbook(buf);
    tripsTable = data.tables.trips;
    allRows = tripsTable?.rows || [];
    refreshFilters();
    statusEl.textContent = "已載入（檔案）";
    render();
  }catch(err){
    statusEl.textContent = "讀檔失敗：" + err.message;
  }finally{
    fileInput.value = "";
  }
});

/***********************
 * FAB: 新增行程
 ***********************/
(function injectFab(){
  const fab = document.createElement("button");
  fab.className = "fabAdd";
  fab.type = "button";
  fab.textContent = "＋ 新增";
  fab.title = "新增行程";
  fab.addEventListener("click", openAdd);
  document.body.appendChild(fab);
})();

// init
loadAny();
