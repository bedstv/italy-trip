/**
 * 交通資訊（航班 / 火車）
 * - 介面/編輯方式與其他頁一致：卡片 +「編輯/收合」內嵌表單 + FAB 新增
 * - 使用 TripAPI 統一 API（api.js）
 * - 從 export 的 xlsx 讀取「交通」工作表
 */

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const typeSel = document.getElementById("typeSel");
const dateSel = document.getElementById("dateSel");
const searchInput = document.getElementById("searchInput");
const reloadBtn = document.getElementById("reloadBtn");

let table = null;   // { header:[], rows:[[]] }
let rows = [];      // alias of table.rows
let q = "";

function setStatus(text){ statusEl.textContent = text; }

function buildOptions(select, values, placeholder){
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder || "全部";
  select.appendChild(opt0);
  values.forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function rowVal(r, key){ return tableRowValue(table, r, key) || ""; }

function matchesQuery(r, qq){
  const hay = [
    rowVal(r,"類型(航班/火車)"),
    rowVal(r,"日期"),
    rowVal(r,"出發地"),
    rowVal(r,"抵達地"),
    rowVal(r,"出發時間"),
    rowVal(r,"抵達時間"),
    rowVal(r,"航空/鐵路公司"),
    rowVal(r,"航班/車次"),
    rowVal(r,"訂位代碼"),
    rowVal(r,"座位"),
    rowVal(r,"備註"),
  ].join(" ").toLowerCase();
  return hay.includes(qq);
}

function render(){
  if (!table) return;

  const typeV = typeSel.value;
  const dateV = dateSel.value;

  let xs = rows.slice();
  if (typeV) xs = xs.filter(r => rowVal(r,"類型(航班/火車)") === typeV);
  if (dateV) xs = xs.filter(r => rowVal(r,"日期") === dateV);
  if (q){
    const qq = q.toLowerCase();
    xs = xs.filter(r => matchesQuery(r, qq));
  }

  // 排序：日期、出發時間、類型
  xs.sort((a,b)=>{
    const da = rowVal(a,"日期") || "9999-12-31";
    const db = rowVal(b,"日期") || "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    const ta = rowVal(a,"出發時間") || "";
    const tb = rowVal(b,"出發時間") || "";
    if (ta !== tb) return ta.localeCompare(tb);
    return (rowVal(a,"航班/車次") || "").localeCompare(rowVal(b,"航班/車次") || "");
  });

  listEl.innerHTML = "";

  // 空狀態
  if (xs.length === 0){
    listEl.innerHTML = `<div class="card"><div class="sub">沒有符合條件的資料</div></div>`;
    return;
  }

  // 以日期分組（方便掃描）
  const groups = new Map();
  for (const r of xs){
    const d = rowVal(r,"日期") || "(未填日期)";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(r);
  }

  for (const [d, rs] of groups.entries()){
    const det = document.createElement("details");
    det.className = "group";
    det.open = true;
    det.innerHTML = `
      <summary class="groupSum">
        <div>
          <div class="sumTitle">${escapeHtml(d)}</div>
          <div class="sumMeta">${rs.length} 筆</div>
        </div>
        <div class="sumMeta">點開/收合</div>
      </summary>
      <div class="groupBody"></div>
    `;
    const body = det.querySelector(".groupBody");
    listEl.appendChild(det);

    for (const r of rs){
    const id = rowVal(r,"交通ID") || rowVal(r,"id") || rowVal(r,"ID") || "";
    const type = rowVal(r,"類型(航班/火車)") || "";
    const date = rowVal(r,"日期") || "";
    const from = rowVal(r,"出發地") || "";
    const to = rowVal(r,"抵達地") || "";
    const dep = rowVal(r,"出發時間") || "";
    const arr = rowVal(r,"抵達時間") || "";
    const company = rowVal(r,"航空/鐵路公司") || "";
    const no = rowVal(r,"航班/車次") || "";
    const pnr = rowVal(r,"訂位代碼") || "";
    const seat = rowVal(r,"座位") || "";
    const note = rowVal(r,"備註") || "";

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = id;

    const timeLabel = [dep && `出:${dep}`, arr && `到:${arr}`].filter(Boolean).join(" · ");

    card.innerHTML = `
      <div class="row">
        <div class="meta">
          <span class="badge">${escapeHtml(type || "交通")}</span>
          ${date ? `<span class="badge">${escapeHtml(date)}</span>` : `<span class="badge">(未填日期)</span>`}
          ${timeLabel ? `<span class="badge">${escapeHtml(timeLabel)}</span>` : ""}
        </div>
      </div>

      <div class="name">${escapeHtml(no || "(未填航班/車次)")}</div>
      <div class="sub">${escapeHtml(company || "")} · ${escapeHtml(from || "(出發地)")} → ${escapeHtml(to || "(抵達地)")}</div>
      <div class="sub">${pnr ? `PNR: ${escapeHtml(pnr)}` : ""}${pnr && seat ? " ｜ " : ""}${seat ? `座位: ${escapeHtml(seat)}` : ""}</div>
      ${note ? `<div class="note">${escapeHtml(note)}</div>` : ""}

      <div class="editWrap">
        <button class="editToggle">編輯</button>
        <div class="editBox" style="display:none;">

          <div class="editRow">
            <label>類型</label>
            <input class="eType" list="typeHints" value="${escapeHtml(type||"")}" placeholder="航班 / 火車" />

            <label>日期</label>
            <input class="eDate" type="date" value="${escapeHtml(date||"")}" />
          </div>

          <div class="editRow">
            <label>出發地</label>
            <input class="eFrom" value="${escapeHtml(from||"")}" />
          </div>
          <div class="editRow">
            <label>抵達地</label>
            <input class="eTo" value="${escapeHtml(to||"")}" />
          </div>

          <div class="editRow">
            <label>出發時間</label>
            <input class="eDep" placeholder="例如 09:10" value="${escapeHtml(dep||"")}" />
            <label>抵達時間</label>
            <input class="eArr" placeholder="例如 12:30" value="${escapeHtml(arr||"")}" />
          </div>

          <div class="editRow">
            <label>航空/鐵路公司</label>
            <input class="eCompany" value="${escapeHtml(company||"")}" />
          </div>

          <div class="editRow">
            <label>航班/車次</label>
            <input class="eNo" value="${escapeHtml(no||"")}" />
          </div>

          <div class="editRow">
            <label>訂位代碼</label>
            <input class="ePnr" value="${escapeHtml(pnr||"")}" />
            <label>座位</label>
            <input class="eSeat" value="${escapeHtml(seat||"")}" />
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

          <div class="editHint">ID：<span class="mono">${escapeHtml(id||"")}</span></div>
        </div>
      </div>
    `;

      body.appendChild(card);
    }
  }
}

// 事件代理：編輯/儲存/刪除
listEl.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const card = ev.target.closest(".card");
  if (!card) return;

  if (btn.classList.contains("editToggle")){
    const box = card.querySelector(".editBox");
    const isOpen = box.style.display !== "none";
    box.style.display = isOpen ? "none" : "block";
    btn.textContent = isOpen ? "編輯" : "收合";
    return;
  }

  const id = card.dataset.id;
  const statusEl2 = card.querySelector(".saveStatus");

  if (btn.classList.contains("delBtn")){
    const ok = confirm(`確定要刪除這筆交通資訊？\n\n${id}`);
    if (!ok) return;
    statusEl2.textContent = "刪除中…";
    try{
      const res = await TripAPI.del("transport", id);
      if (!res || !res.ok) {
        statusEl2.textContent = `❌ 刪除失敗：${res?.error || "未知錯誤"}`;
        return;
      }
      statusEl.textContent = "已刪除，重新載入…";
      await loadAll(true);
    }catch(e){
      statusEl2.textContent = `❌ 例外：${e.message}`;
    }
    return;
  }

  if (btn.classList.contains("saveBtn")){
    const fields = {
      "類型(航班/火車)": card.querySelector(".eType")?.value || "",
      "日期": card.querySelector(".eDate")?.value || "",
      "出發地": card.querySelector(".eFrom")?.value || "",
      "抵達地": card.querySelector(".eTo")?.value || "",
      "出發時間": card.querySelector(".eDep")?.value || "",
      "抵達時間": card.querySelector(".eArr")?.value || "",
      "航空/鐵路公司": card.querySelector(".eCompany")?.value || "",
      "航班/車次": card.querySelector(".eNo")?.value || "",
      "訂位代碼": card.querySelector(".ePnr")?.value || "",
      "座位": card.querySelector(".eSeat")?.value || "",
      "備註": card.querySelector(".eNote")?.value || "",
    };

    // 最少要有類型或航班/車次其中一個
    if (!fields["類型(航班/火車)"] && !fields["航班/車次"]) {
      statusEl2.textContent = "❌ 類型或航班/車次至少填一個";
      return;
    }

    statusEl2.textContent = "儲存中…";
    try{
      const res = await TripAPI.update("transport", id, fields);
      if (!res || !res.ok) {
        statusEl2.textContent = `❌ 失敗：${res?.error || "未知錯誤"}`;
        return;
      }

      // 更新記憶體資料
      const r = rows.find(x => (rowVal(x,"交通ID") || rowVal(x,"id") || rowVal(x,"ID")) === id);
      if (r){
        for (const k of Object.keys(fields)) tableSetRowValue(table, r, k, fields[k]);
      }

      statusEl2.textContent = `✅ 已儲存 ${formatIso(res.updated_at)}`;
      setFiltersFromTable();
      render();
      setStatus(`已載入（線上）｜最後更新：${formatIso(res.updated_at)}`);
    }catch(e){
      statusEl2.textContent = `❌ 例外：${e.message}`;
    }
  }
});

async function doAdd(fields){
  try{
    setStatus("寫入中…");
    const res = await TripAPI.add("transport", fields);
    if (!res || res.ok !== true) throw new Error(res?.error || "新增失敗");
    await loadAll(true);
  }catch(e){
    setStatus("失敗：" + (e.message || e));
  }
}

async function doUpdate(id, fields){
  try{
    if (!id) throw new Error("Missing id");
    setStatus("儲存中…");
    const res = await TripAPI.update("transport", id, fields);
    if (!res || res.ok !== true) throw new Error(res?.error || "更新失敗");
    await loadAll(true);
  }catch(e){
    setStatus("失敗：" + (e.message || e));
  }
}

async function doDelete(row){
  try{
    const id = rowVal(row,"id") || rowVal(row,"ID") || "";
    if (!id) throw new Error("Missing id");
    if (!confirm("確定要刪除這筆交通資訊？")) return;
    setStatus("刪除中…");
    const res = await TripAPI.del("transport", id);
    if (!res || res.ok !== true) throw new Error(res?.error || "刪除失敗");
    await loadAll(true);
  }catch(e){
    setStatus("失敗：" + (e.message || e));
  }
}

function setFiltersFromTable(){
  const types = uniq(rows.map(r=>rowVal(r,"類型(航班/火車)")).filter(Boolean)).sort();
  const dates = uniq(rows.map(r=>rowVal(r,"日期")).filter(Boolean)).sort();
  buildOptions(typeSel, types, "全部類型");
  buildOptions(dateSel, dates, "全部日期");
}

async function loadAll(forceNetwork){
  setStatus("載入中…");

  try{
    // cache
    let loaded = null;
    if (!forceNetwork) loaded = await tryLoadFromLocalCache();
    if (!loaded){
      const payload = await TripAPI.exportXlsx();
      if (!payload || !payload.ok || !payload.b64) throw new Error(payload?.error || "export 失敗");
      localStorage.setItem("trip_v2_cache_ok", "1");
      localStorage.setItem("trip_v2_cache_b64", payload.b64);
      localStorage.setItem("trip_v2_cache_time", payload.generated_at || "");
      const buf = base64ToArrayBuffer(payload.b64);
      loaded = { data: parseWorkbook(buf), generated_at: payload.generated_at || "", from: "線上" };
    }

    const t = loaded.data.tables.transport;
    if (!t || !t.header || !t.rows) throw new Error("找不到「交通」工作表，請確認 Google Sheet 有名為：交通");

    table = t;
    rows = t.rows || [];
    setFiltersFromTable();
    render();
    setStatus(`已載入（${loaded.from}）｜最後更新：${loaded.generated_at || "-"}`);
  }catch(e){
    setStatus("載入失敗：" + (e.message || e));
    listEl.innerHTML = `<div class="card"><div class="sub">載入失敗：${escapeHtml(e.message || String(e))}</div></div>`;
  }
}

function init(){
  searchInput.addEventListener("input", ()=>{
    q = searchInput.value.trim();
    render();
  });
  typeSel.addEventListener("change", render);
  dateSel.addEventListener("change", render);
  reloadBtn.addEventListener("click", ()=> loadAll(true));
  loadAll(false);
}

init();

// 類型提示（避免手機選單不好輸入，又能自訂）
(() => {
  if (document.getElementById("typeHints")) return;
  const dl = document.createElement("datalist");
  dl.id = "typeHints";
  ["航班","火車","巴士","地鐵","渡輪","租車","計程車"].forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    dl.appendChild(o);
  });
  document.body.appendChild(dl);
})();

// ===== 新增：FAB + Modal（與備忘錄頁一致） =====
const fab = document.createElement("button");
fab.className = "fabAdd";
fab.textContent = "＋ 新增";
document.body.appendChild(fab);

const modalMask = document.createElement("div");
modalMask.className = "modalMask";
modalMask.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modalHead">
      <div class="modalTitle">新增交通資訊</div>
      <button class="modalClose" aria-label="close">✕</button>
    </div>

    <div class="modalBody">
      <div class="editRow">
        <label>類型</label>
        <input class="mType" list="typeHints" placeholder="航班 / 火車" />
        <label>日期</label>
        <input class="mDate" type="date" />
      </div>

      <div class="editRow">
        <label>出發地</label>
        <input class="mFrom" />
      </div>

      <div class="editRow">
        <label>抵達地</label>
        <input class="mTo" />
      </div>

      <div class="editRow">
        <label>出發時間</label>
        <input class="mDep" placeholder="例如 09:10" />
        <label>抵達時間</label>
        <input class="mArr" placeholder="例如 12:30" />
      </div>

      <div class="editRow">
        <label>航空/鐵路公司</label>
        <input class="mCompany" />
      </div>

      <div class="editRow">
        <label>航班/車次</label>
        <input class="mNo" />
      </div>

      <div class="editRow">
        <label>訂位代碼</label>
        <input class="mPnr" />
        <label>座位</label>
        <input class="mSeat" />
      </div>

      <div class="editRow">
        <label>備註</label>
        <textarea class="mNote" rows="3"></textarea>
      </div>

      <div class="editRow">
        <button class="mSave">新增</button>
        <span class="mStatus"></span>
      </div>
    </div>
  </div>
`;

document.body.appendChild(modalMask);
modalMask.style.display = "none";

function openModal(){
  modalMask.style.display = "flex";
  modalMask.querySelector(".mStatus").textContent = "";
}

function closeModal(){
  modalMask.style.display = "none";
}

fab.addEventListener("click", openModal);
modalMask.addEventListener("click", (ev)=>{
  if (ev.target === modalMask) closeModal();
  if (ev.target.closest(".modalClose")) closeModal();
});

modalMask.querySelector(".mSave").addEventListener("click", async ()=>{
  const status = modalMask.querySelector(".mStatus");
  const fields = {
    "類型(航班/火車)": modalMask.querySelector(".mType")?.value || "",
    "日期": modalMask.querySelector(".mDate")?.value || "",
    "出發地": modalMask.querySelector(".mFrom")?.value || "",
    "抵達地": modalMask.querySelector(".mTo")?.value || "",
    "出發時間": modalMask.querySelector(".mDep")?.value || "",
    "抵達時間": modalMask.querySelector(".mArr")?.value || "",
    "航空/鐵路公司": modalMask.querySelector(".mCompany")?.value || "",
    "航班/車次": modalMask.querySelector(".mNo")?.value || "",
    "訂位代碼": modalMask.querySelector(".mPnr")?.value || "",
    "座位": modalMask.querySelector(".mSeat")?.value || "",
    "備註": modalMask.querySelector(".mNote")?.value || "",
  };

  if (!fields["類型(航班/火車)"] && !fields["航班/車次"]) {
    status.textContent = "❌ 類型或航班/車次至少填一個";
    return;
  }

  status.textContent = "新增中…";
  try{
    const res = await TripAPI.add("transport", fields);
    if (!res || !res.ok) {
      status.textContent = `❌ 新增失敗：${res?.error || "未知錯誤"}`;
      return;
    }
    status.textContent = "✅ 已新增，重新載入…";
    await loadAll(true);
    closeModal();
  }catch(e){
    status.textContent = `❌ 例外：${e.message}`;
  }
});
