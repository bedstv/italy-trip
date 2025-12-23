/***********************
 * 交通資訊（航班 / 火車）
 ***********************/

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const typeSel = document.getElementById("typeSel");
const dateSel = document.getElementById("dateSel");
const searchInput = document.getElementById("searchInput");
const reloadBtn = document.getElementById("reloadBtn");

let table = null;
let rows = [];
let q = "";

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

function rowVal(r, key){ return tableRowValue(table, r, key); }

function render(){
  if (!table) return;
  const typeV = typeSel.value;
  const dateV = dateSel.value;
  const dateV = dateSel.value;

  let xs = rows.slice();
  if (typeV) xs = xs.filter(r => rowVal(r,"類型(航班/火車)") === typeV);
  if (dateV) xs = xs.filter(r => rowVal(r,"日期") === dateV);
  if (dateV) xs = xs.filter(r => rowVal(r,"日期") === dateV);

  if (q){
    const qq = q.toLowerCase();
    xs = xs.filter(r => [
      rowVal(r,"類型(航班/火車)"),
      rowVal(r,"日期"),
      rowVal(r,"出發地"),
      rowVal(r,"抵達地"),
      rowVal(r,"航空/鐵路公司"),
      rowVal(r,"航班/車次"),
      rowVal(r,"備註"),
      rowVal(r,"訂位代碼"),
    ].join(" ").toLowerCase().includes(qq));
  }

  xs.sort((a,b)=>{
    const da = rowVal(a,"日期");
    const db = rowVal(b,"日期");
    if (da !== db) return da.localeCompare(db);
    const ta = rowVal(a,"出發時間");
    const tb = rowVal(b,"出發時間");
    return ta.localeCompare(tb);
  });

  listEl.innerHTML = "";
  if (!xs.length){
    listEl.innerHTML = `<div class="sub">沒有符合的交通資訊</div>`;
    return;
  }

  for (const r of xs){
    const id = rowVal(r, "交通ID");
    const typ = rowVal(r, "類型(航班/火車)");
    const date = rowVal(r, "日期");
    const from = rowVal(r, "出發地");
    const to = rowVal(r, "抵達地");
    const dep = rowVal(r, "出發時間");
    const arr = rowVal(r, "抵達時間");
    const carrier = rowVal(r, "航空/鐵路公司");
    const num = rowVal(r, "航班/車次");
    const pnr = rowVal(r, "訂位代碼");
    const seat = rowVal(r, "座位");
    const note = rowVal(r, "備註");

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = id;

    card.innerHTML = `
      <div class="row">
        <div style="flex:1;">
          <div class="meta">
            <span class="badge">${escapeHtml(date || "-")}</span>
            <span class="badge">${escapeHtml(typ || "-")}</span>
            ${carrier ? `<span class="badge">${escapeHtml(carrier)}</span>` : ""}
            ${num ? `<span class="badge">${escapeHtml(num)}</span>` : ""}
          </div>
          <div class="name">${escapeHtml(from || "-")} → ${escapeHtml(to || "-")}</div>
          <div class="note">${escapeHtml([dep && `出發 ${dep}`, arr && `抵達 ${arr}`, pnr && `PNR ${pnr}`, seat && `座位 ${seat}`].filter(Boolean).join("｜") || note || "")}</div>
        </div>
        <button class="navBtn editToggle" style="min-width:84px;">編輯</button>
      </div>

      <div class="editBox" style="display:none;">
        <div class="editRow">
          <label>類型</label>
          <select class="eType">
            <option value="">--</option>
            <option value="航班" ${typ==="航班"?"selected":""}>航班</option>
            <option value="火車" ${typ==="火車"?"selected":""}>火車</option>
          </select>
          <label>日期</label>
          <input class="eDate" type="date" value="${escapeHtml(date || "")}" />
        </div>

        <div class="editRow">
          <label>出發地</label>
          <input class="eFrom" value="${escapeHtml(from || "")}" />
          <label>抵達地</label>
          <input class="eTo" value="${escapeHtml(to || "")}" />
        </div>

        <div class="editRow">
          <label>出發時間</label>
          <input class="eDep" value="${escapeHtml(dep || "")}" placeholder="09:30" />
          <label>抵達時間</label>
          <input class="eArr" value="${escapeHtml(arr || "")}" placeholder="12:10" />
        </div>

        <div class="editRow">
          <label>公司</label>
          <input class="eCarrier" value="${escapeHtml(carrier || "")}" />
          <label>航班/車次</label>
          <input class="eNum" value="${escapeHtml(num || "")}" />
        </div>

        <div class="editRow">
          <label>訂位代碼</label>
          <input class="ePnr" value="${escapeHtml(pnr || "")}" />
          <label>座位</label>
          <input class="eSeat" value="${escapeHtml(seat || "")}" />
        </div>

        <div class="editRow">
          <label>備註</label>
          <textarea class="eNote" rows="2">${escapeHtml(note || "")}</textarea>
        </div>

        <div class="editRow">
          <button class="saveBtn">儲存</button>
          <button class="delBtn dangerBtn">刪除</button>
          <span class="saveStatus"></span>
        </div>

        <div class="editHint">交通ID：<span class="mono">${escapeHtml(id)}</span></div>
      </div>
    `;

    listEl.appendChild(card);
  }
}

listEl.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const card = ev.target.closest(".card");
  if (!card) return;

  if (btn.classList.contains("editToggle")){
    const box = card.querySelector(".editBox");
    const open = box.style.display !== "none";
    box.style.display = open ? "none" : "block";
    btn.textContent = open ? "編輯" : "收合";
    return;
  }

  const id = card.dataset.id;
  const status = card.querySelector(".saveStatus");

  if (btn.classList.contains("delBtn")){
    const ok = confirm(`確定要刪除這筆交通資訊？\n\n${id}`);
    if (!ok) return;
    status.textContent = "刪除中…";
    try{
      const res = await TripAPI.del("transport", id);
      if (!res || !res.ok) {
        status.textContent = `❌ 刪除失敗：${res?.error || "未知錯誤"}`;
        return;
      }
      status.textContent = "✅ 已刪除，重新載入…";
      await init(true);
    }catch(e){
      status.textContent = `❌ 例外：${e.message}`;
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
      "航空/鐵路公司": card.querySelector(".eCarrier")?.value || "",
      "航班/車次": card.querySelector(".eNum")?.value || "",
      "訂位代碼": card.querySelector(".ePnr")?.value || "",
      "座位": card.querySelector(".eSeat")?.value || "",
      "備註": card.querySelector(".eNote")?.value || "",
    };

    if (!fields["類型(航班/火車)"] && !fields["出發地"] && !fields["抵達地"]) {
      status.textContent = "❌ 至少填：類型 / 出發地 / 抵達地";
      return;
    }

    status.textContent = "儲存中…";
    try{
      const res = await TripAPI.update("transport", id, fields);
      if (!res || !res.ok) {
        status.textContent = `❌ 失敗：${res?.error || "未知錯誤"}`;
        return;
      }
      status.textContent = `✅ 已儲存 ${formatIso(res.updated_at)}`;
      await init(true);
    }catch(e){
      status.textContent = `❌ 例外：${e.message}`;
    }
  }
});

// 新增（floating button）
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
      <button class="modalClose">關閉</button>
    </div>

    <div class="modalBody">
      <div>
        <label>類型</label>
        <select id="mType">
          <option value="航班">航班</option>
          <option value="火車">火車</option>
        </select>
      </div>
      <div>
        <label>日期</label>
        <input id="mDate" type="date" />
      </div>

      <div>
        <label>出發地</label>
        <input id="mFrom" placeholder="MXP / Milano / Roma" />
      </div>
      <div>
        <label>抵達地</label>
        <input id="mTo" placeholder="FCO / Firenze" />
      </div>

      <div>
        <label>出發時間</label>
        <input id="mDep" placeholder="09:30" />
      </div>
      <div>
        <label>抵達時間</label>
        <input id="mArr" placeholder="12:10" />
      </div>

      <div>
        <label>公司</label>
        <input id="mCarrier" placeholder="ITA Airways / Trenitalia" />
      </div>
      <div>
        <label>航班/車次</label>
        <input id="mNum" placeholder="AZxxx / FRxxxx / Frecciarossa" />
      </div>

      <div>
        <label>訂位代碼</label>
        <input id="mPnr" />
      </div>
      <div>
        <label>座位</label>
        <input id="mSeat" />
      </div>

      <div class="full">
        <label>備註</label>
        <textarea id="mNote" rows="2"></textarea>
      </div>
    </div>

    <div class="modalFoot">
      <button class="btn modalCancel">取消</button>
      <button class="btn btnPrimary modalSubmit">新增</button>
    </div>
  </div>
`;

document.body.appendChild(modalMask);

function openModal(){
  modalMask.querySelector("#mDate").value = todayStrLocal();
  modalMask.style.display = "flex";
}
function closeModal(){ modalMask.style.display = "none"; }

fab.addEventListener("click", openModal);
modalMask.addEventListener("click", (e)=>{ if (e.target===modalMask) closeModal(); });
modalMask.querySelector(".modalClose").addEventListener("click", closeModal);
modalMask.querySelector(".modalCancel").addEventListener("click", closeModal);

modalMask.querySelector(".modalSubmit").addEventListener("click", async () => {
  const fields = {
    "類型(航班/火車)": modalMask.querySelector("#mType").value || "",
    "日期": modalMask.querySelector("#mDate").value || "",
    "出發地": modalMask.querySelector("#mFrom").value.trim(),
    "抵達地": modalMask.querySelector("#mTo").value.trim(),
    "出發時間": modalMask.querySelector("#mDep").value.trim(),
    "抵達時間": modalMask.querySelector("#mArr").value.trim(),
    "航空/鐵路公司": modalMask.querySelector("#mCarrier").value.trim(),
    "航班/車次": modalMask.querySelector("#mNum").value.trim(),
    "訂位代碼": modalMask.querySelector("#mPnr").value.trim(),
    "座位": modalMask.querySelector("#mSeat").value.trim(),
    "備註": modalMask.querySelector("#mNote").value.trim(),
  };

  if (!fields["出發地"] && !fields["抵達地"] && !fields["航班/車次"]) {
    alert("至少填：出發地 / 抵達地 / 航班(車次)");
    return;
  }

  try{
    statusEl.textContent = "新增中…";
    const res = await TripAPI.add("transport", fields);
    if (!res || !res.ok) {
      alert(`新增失敗：${res?.error || "未知錯誤"}`);
      return;
    }
    closeModal();
    await init(true);
  }catch(e){
    alert(`新增例外：${e.message}`);
  }
});

async function init(forceOnline=false){
  try{
    statusEl.textContent = "載入中…";
    const r = await loadFromExec();
    const t = r.data.tables.transport;
    table = t;
    rows = t?.rows || [];

    const types = uniq(rows.map(r => tableRowValue(table,r,"類型(航班/火車)")));
    buildOptions(typeSel, types, "全部類型");

    const dates = uniq(rows.map(r => tableRowValue(table,r,"日期"))).sort((a,b)=>a.localeCompare(b));
    buildOptions(dateSel, dates, "選日期（全部）");

    const dates = uniq(rows.map(r => tableRowValue(table,r,"日期"))).sort((a,b)=>a.localeCompare(b));
    buildOptions(dateSel, dates, "選日期（全部）");

    statusEl.textContent = `已載入（線上）｜最後更新：${formatIso(r.generated_at) || "未知"}`;
    render();
  }catch(err){
    const offline = await tryLoadFromLocalCache();
    if (!offline) {
      statusEl.textContent = `載入失敗：${err.message}`;
      listEl.innerHTML = `<div class="sub">${escapeHtml(err.message)}</div>`;
      return;
    }

    const t = offline.data.tables.transport;
    table = t;
    rows = t?.rows || [];

    const types = uniq(rows.map(r => tableRowValue(table,r,"類型(航班/火車)")));
    buildOptions(typeSel, types, "全部類型");

    const dates = uniq(rows.map(r => tableRowValue(table,r,"日期"))).sort((a,b)=>a.localeCompare(b));
    buildOptions(dateSel, dates, "選日期（全部）");

    statusEl.textContent = `⚠️ 離線模式｜最後更新：${formatIso(offline.generated_at) || "未知"}`;
    render();
  }
}

reloadBtn.addEventListener("click", ()=>init(true));
typeSel.addEventListener("change", render);
dateSel.addEventListener("change", render);
searchInput.addEventListener("input", ()=>{ q = toStr(searchInput.value); render(); });

init(false);
