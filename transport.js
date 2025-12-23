/***********************
 * 交通資訊（航班 / 火車）
 * - 使用 TripAPI 統一 API（api.js）
 * - 從 export 的 xlsx 讀取「交通」工作表
 ***********************/

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
    rowVal(r,"航空/鐵路公司"),
    rowVal(r,"航班/車次"),
    rowVal(r,"訂位代碼"),
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

  xs.sort((a,b)=>{
    const da = rowVal(a,"日期");
    const db = rowVal(b,"日期");
    if (da !== db) return (da || "").localeCompare(db || "");
    const ta = rowVal(a,"時間") || "";
    const tb = rowVal(b,"時間") || "";
    return ta.localeCompare(tb);
  });

  // header row
  listEl.innerHTML = "";

  // top actions
  const top = document.createElement("div");
  top.className = "card";
  top.innerHTML = `
    <div class="row">
      <div class="title">交通資訊</div>
      <div class="chips">
        <button class="btn" id="addBtn">新增</button>
      </div>
    </div>
    <div class="sub">航班與火車資訊（讀寫 Google Sheet 的「交通」工作表）</div>
  `;
  listEl.appendChild(top);
  top.querySelector("#addBtn").onclick = () => openEditor(null);

  if (xs.length === 0){
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = `<div class="sub">沒有符合條件的資料</div>`;
    listEl.appendChild(empty);
    return;
  }

  xs.forEach(r=>{
    const id = rowVal(r,"id") || rowVal(r,"ID") || rowVal(r,"Id") || "";
    const type = rowVal(r,"類型(航班/火車)") || "";
    const date = rowVal(r,"日期") || "";
    const time = rowVal(r,"時間") || "";
    const from = rowVal(r,"出發地") || "";
    const to = rowVal(r,"抵達地") || "";
    const company = rowVal(r,"航空/鐵路公司") || "";
    const no = rowVal(r,"航班/車次") || "";
    const pnr = rowVal(r,"訂位代碼") || "";
    const seat = rowVal(r,"座位") || "";
    const note = rowVal(r,"備註") || "";

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div class="title">${escapeHtml(type)} ${escapeHtml(no)}</div>
        <div class="chips">
          <span class="chip">${escapeHtml(date || "(未填日期)")}</span>
          ${time ? `<span class="chip">${escapeHtml(time)}</span>` : ``}
        </div>
      </div>
      <div class="sub">${escapeHtml(company)} · ${escapeHtml(from)} → ${escapeHtml(to)}</div>
      <div class="sub">${pnr ? `PNR: ${escapeHtml(pnr)} ` : ""}${seat ? `座位: ${escapeHtml(seat)} ` : ""}</div>
      ${note ? `<div class="sub">${escapeHtml(note)}</div>` : ``}
      <div class="row" style="margin-top:8px;">
        <button class="btn" data-act="edit">編輯</button>
        <button class="btn danger" data-act="del">刪除</button>
        <div class="sub" style="margin-left:auto; opacity:.6;">${escapeHtml(id)}</div>
      </div>
    `;
    card.querySelector('[data-act="edit"]').onclick = () => openEditor(r);
    card.querySelector('[data-act="del"]').onclick = () => doDelete(r);
    listEl.appendChild(card);
  });
}

function promptField(label, def){
  const v = prompt(label, def || "");
  return v === null ? null : v;
}

function openEditor(row){
  // 以 prompt 簡單編輯（手機友善）
  const isNew = !row;

  const cur = (k)=> row ? (rowVal(row,k) || "") : "";

  const type = promptField("類型(航班/火車)：", cur("類型(航班/火車)"));
  if (type === null) return;

  const date = promptField("日期 (YYYY-MM-DD，可空白)：", cur("日期"));
  if (date === null) return;

  const time = promptField("時間（可空白）：", cur("時間"));
  if (time === null) return;

  const from = promptField("出發地：", cur("出發地"));
  if (from === null) return;

  const to = promptField("抵達地：", cur("抵達地"));
  if (to === null) return;

  const company = promptField("航空/鐵路公司：", cur("航空/鐵路公司"));
  if (company === null) return;

  const no = promptField("航班/車次：", cur("航班/車次"));
  if (no === null) return;

  const pnr = promptField("訂位代碼（可空白）：", cur("訂位代碼"));
  if (pnr === null) return;

  const seat = promptField("座位（可空白）：", cur("座位"));
  if (seat === null) return;

  const note = promptField("備註（可空白）：", cur("備註"));
  if (note === null) return;

  const fields = {
    "類型(航班/火車)": type,
    "日期": date,
    "時間": time,
    "出發地": from,
    "抵達地": to,
    "航空/鐵路公司": company,
    "航班/車次": no,
    "訂位代碼": pnr,
    "座位": seat,
    "備註": note,
  };

  if (isNew){
    doAdd(fields);
  }else{
    const id = rowVal(row,"id") || rowVal(row,"ID") || "";
    doUpdate(id, fields);
  }
}

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
