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
      const city = tableRowValue(trips,r,"城市");
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
          <button class="editToggle">編輯</button>
          <div class="editBox" style="display:none;">

            <div class="editRow">
              <label>日期</label>
              <input class="eDate" type="date" value="${escapeHtml(date||"")}" />
              <button class="setTodayBtn">今天</button>
              <button class="clearDateBtn">清空日期</button>
            </div>

            <div class="editRow">
              <label>城市</label>
              <input class="eCity" value="${escapeHtml(city||"")}" />
            </div>

            <div class="editRow">
              <label>類型</label>
              <input class="eType" value="${escapeHtml(type||"")}" />
              <label>必去/備選</label>
              <input class="ePrio" value="${escapeHtml(prio||"")}" placeholder="必去 / 備選" />
            </div>

            <div class="editRow">
              <label>名稱</label>
              <input class="eName" value="${escapeHtml(name||"")}" />
            </div>

            <div class="editRow">
              <label>地點文字</label>
              <input class="ePlace" value="${escapeHtml(place||"")}" />
            </div>

            <div class="editRow">
              <label>Google Maps 連結</label>
              <input class="eMap" value="${escapeHtml(rawLink||"")}" placeholder="可留空" />
            </div>

            <div class="editRow">
              <label>備註</label>
              <textarea class="eNote" rows="3">${escapeHtml(note||"")}</textarea>
            </div>

            <div class="editRow">
              <button class="saveBtn">儲存</button>
              <button class="delBtn dangerBtn">刪除</button>
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
    btn.textContent = isOpen ? "編輯" : "收合";
    return;
  }

  if (btn.classList.contains("setTodayBtn")){
    const inp = card.querySelector(".eDate");
    inp.value = todayStrLocal();
    return;
  }

  if (btn.classList.contains("clearDateBtn")){
    const inp = card.querySelector(".eDate");
    inp.value = "";
    return;
  }

  if (btn.classList.contains("delBtn")){
    const id = card.dataset.id;
    if (!id) return;
    if (!confirm("確定要刪除這筆景點/行程？")) return;
    const status = card.querySelector(".saveStatus");
    status.textContent = "刪除中…";
    try{
      await TripAPI.del("trips", id);
      status.textContent = "✅ 已刪除，重新載入…";
      await init();
    }catch(e){
      status.textContent = `❌ 例外：${e.message}`;
    }
    return;
  }

  if (btn.classList.contains("saveBtn")){
    const id = card.dataset.id;
    const status = card.querySelector(".saveStatus");
    const f = {
      "日期": card.querySelector(".eDate")?.value || "",
      "城市": card.querySelector(".eCity")?.value?.trim() || "",
      "項目類型": card.querySelector(".eType")?.value?.trim() || "",
      "必去/備選": card.querySelector(".ePrio")?.value?.trim() || "",
      "名稱": card.querySelector(".eName")?.value?.trim() || "",
      "地點文字": card.querySelector(".ePlace")?.value?.trim() || "",
      "Google Maps 連結": card.querySelector(".eMap")?.value?.trim() || "",
      "備註": card.querySelector(".eNote")?.value || "",
    };
    if (!f["名稱"]) { status.textContent = "❌ 請填名稱"; return; }

    status.textContent = "儲存中…";
    try{
      await TripAPI.update("trips", id, f);
      status.textContent = "✅ 已儲存，重新載入…";
      await init();
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

// ===== 新增：FAB + Modal（與交通/備忘錄一致） =====
const fab = document.createElement("button");
fab.className = "fabAdd";
fab.textContent = "＋ 新增";
fab.type = "button";
fab.title = "新增景點";
document.body.appendChild(fab);

const modalMask = document.createElement("div");
modalMask.className = "modalMask";
modalMask.style.display = "none";
modalMask.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modalHead">
      <div class="modalTitle">新增景點</div>
      <button class="modalClose" aria-label="close">✕</button>
    </div>
    <div class="modalBody full" style="grid-column:1 / -1; display:block;">
      <div class="editRow">
        <label>日期</label>
        <input class="mDate" type="date" />
        <label>城市</label>
        <input class="mCity" placeholder="米蘭/羅馬…" />
      </div>
      <div class="editRow">
        <label>類型</label>
        <input class="mType" placeholder="景點/餐廳/購物…" />
        <label>必去/備選</label>
        <input class="mPrio" placeholder="必去 / 備選" />
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
document.body.appendChild(modalMask);

function openModal(){
  modalMask.querySelector(".mHint").textContent = "";
  modalMask.querySelector(".mStatus").textContent = "";
  // 預設：日期留空（代表未排日期）
  modalMask.querySelector(".mDate").value = "";
  modalMask.querySelector(".mPrio").value = "必去";
  modalMask.style.display = "flex";
}
function closeModal(){ modalMask.style.display = "none"; }

fab.addEventListener("click", openModal);
modalMask.addEventListener("click", (ev)=>{
  if (ev.target === modalMask) closeModal();
  if (ev.target.closest(".modalClose")) closeModal();
});

modalMask.querySelector(".mSave").addEventListener("click", async ()=>{
  const status = modalMask.querySelector(".mStatus");
  const f = {
    "日期": modalMask.querySelector(".mDate")?.value || "",
    "城市": modalMask.querySelector(".mCity")?.value?.trim() || "",
    "項目類型": modalMask.querySelector(".mType")?.value?.trim() || "",
    "必去/備選": modalMask.querySelector(".mPrio")?.value?.trim() || "必去",
    "名稱": modalMask.querySelector(".mName")?.value?.trim() || "",
    "地點文字": modalMask.querySelector(".mPlace")?.value?.trim() || "",
    "Google Maps 連結": modalMask.querySelector(".mMap")?.value?.trim() || "",
    "備註": modalMask.querySelector(".mNote")?.value || "",
  };
  if (!f["名稱"]) { status.textContent = "❌ 請填名稱"; return; }
  status.textContent = "新增中…";
  try{
    await TripAPI.add("trips", f);
    status.textContent = "✅ 已新增，重新載入…";
    closeModal();
    await init();
  }catch(e){
    status.textContent = `❌ ${e.message}`;
  }
});

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
