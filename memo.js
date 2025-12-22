/***********************
 * 備忘錄（待辦 / 臨時記錄）
 ***********************/

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const reloadBtn = document.getElementById("reloadBtn");
const showTodoBtn = document.getElementById("showTodoBtn");
const showDoneBtn = document.getElementById("showDoneBtn");
const searchInput = document.getElementById("searchInput");

let table = null;
let rows = [];
let showTodo = true;
let showDone = false;
let q = "";

function chipSet(btn,on){ btn.classList.toggle("chipOn",!!on); }

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

function render(){
  listEl.innerHTML = "";
  if (!table){
    listEl.innerHTML = `<div class="sub">找不到工作表：${escapeHtml(SHEETS.memos)}</div>`;
    return;
  }

  let filtered = rows.slice();

  filtered = filtered.filter(r => {
    const st = tableRowValue(table,r,"狀態(TODO/DONE)") || "TODO";
    if (st === "DONE" && !showDone) return false;
    if (st !== "DONE" && !showTodo) return false;
    return true;
  });

  if (q){
    const qq = q.toLowerCase();
    filtered = filtered.filter(r => {
      const s = [
        tableRowValue(table,r,"標題"),
        tableRowValue(table,r,"內容"),
        tableRowValue(table,r,"到期日"),
      ].join(" ").toLowerCase();
      return s.includes(qq);
    });
  }

  // 排序：TODO 先、到期日近的先
  filtered.sort((a,b)=>{
    const sa = tableRowValue(table,a,"狀態(TODO/DONE)") || "TODO";
    const sb = tableRowValue(table,b,"狀態(TODO/DONE)") || "TODO";
    if (sa !== sb) return sa === "DONE" ? 1 : -1;
    const da = tableRowValue(table,a,"到期日") || "9999-12-31";
    const db = tableRowValue(table,b,"到期日") || "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    return (tableRowValue(table,a,"標題") || "").localeCompare(tableRowValue(table,b,"標題") || "");
  });

  if (!filtered.length){
    listEl.innerHTML = `<div class="sub">沒有符合的備忘</div>`;
    return;
  }

  for (const r of filtered){
    const id = tableRowValue(table,r,"備忘ID");
    const st = tableRowValue(table,r,"狀態(TODO/DONE)") || "TODO";
    const due = tableRowValue(table,r,"到期日");
    const title = tableRowValue(table,r,"標題");
    const body = tableRowValue(table,r,"內容");

    const card = document.createElement("div");
    card.className = "card" + (st === "DONE" ? " dim" : "");
    card.dataset.id = id;

    card.innerHTML = `
      <div class="row">
        <div class="meta">
          <span class="badge">${escapeHtml(st)}</span>
          ${due ? `<span class="badge">到期:${escapeHtml(due)}</span>` : ""}
        </div>
      </div>

      <div class="name">${escapeHtml(title || "(未命名)")}</div>
      <div class="note">${escapeHtml(body || "")}</div>

      <div class="editWrap">
        <button class="editToggle">編輯</button>
        <div class="editBox" style="display:none;">

          <div class="editRow">
            <label>狀態</label>
            <select class="eStatus">
              <option value="TODO" ${st!=="DONE"?"selected":""}>TODO</option>
              <option value="DONE" ${st==="DONE"?"selected":""}>DONE</option>
            </select>

            <label>到期日</label>
            <input class="eDue" type="date" value="${escapeHtml(due||"")}" />
          </div>

          <div class="editRow">
            <label>標題</label>
            <input class="eTitle" value="${escapeHtml(title||"")}" />
          </div>

          <div class="editRow">
            <label>內容</label>
            <textarea class="eBody" rows="3">${escapeHtml(body||"")}</textarea>
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
    const isOpen = box.style.display !== "none";
    box.style.display = isOpen ? "none" : "block";
    btn.textContent = isOpen ? "編輯" : "收合";
    return;
  }

  const id = card.dataset.id;
  const statusEl2 = card.querySelector(".saveStatus");

  if (btn.classList.contains("delBtn")){
    const ok = confirm(`確定要刪除這則備忘？\n\n${id}`);
    if (!ok) return;
    statusEl2.textContent = "刪除中…";
    try{
      const res = await apiDelete("memos", id);
      if (!res || !res.ok) {
        statusEl2.textContent = `❌ 刪除失敗：${res?.error || "未知錯誤"}`;
        return;
      }
      statusEl.textContent = "已刪除，重新載入…";
      await init(true);
    }catch(e){
      statusEl2.textContent = `❌ 例外：${e.message}`;
    }
    return;
  }

  if (btn.classList.contains("saveBtn")){
    const fields = {
      "狀態(TODO/DONE)": card.querySelector(".eStatus")?.value || "TODO",
      "到期日": card.querySelector(".eDue")?.value || "",
      "標題": card.querySelector(".eTitle")?.value || "",
      "內容": card.querySelector(".eBody")?.value || "",
    };
    if (!fields["標題"] && !fields["內容"]) {
      statusEl2.textContent = "❌ 標題/內容至少填一個";
      return;
    }

    statusEl2.textContent = "儲存中…";
    try{
      const res = await apiUpdate("memos", id, fields);
      if (!res || !res.ok) {
        statusEl2.textContent = `❌ 失敗：${res?.error || "未知錯誤"}`;
        return;
      }
      // 更新記憶體
      const r = rows.find(x => tableRowValue(table,x,"備忘ID") === id);
      if (r){
        tableSetRowValue(table,r,"狀態(TODO/DONE)", fields["狀態(TODO/DONE)"]);
        tableSetRowValue(table,r,"到期日", fields["到期日"]);
        tableSetRowValue(table,r,"標題", fields["標題"]);
        tableSetRowValue(table,r,"內容", fields["內容"]);
      }
      statusEl2.textContent = `✅ 已儲存 ${formatIso(res.updated_at)}`;
      render();
    }catch(e){
      statusEl2.textContent = `❌ 例外：${e.message}`;
    }
  }
});

showTodoBtn.addEventListener("click", ()=>{
  showTodo = !showTodo;
  chipSet(showTodoBtn, showTodo);
  render();
});
showDoneBtn.addEventListener("click", ()=>{
  showDone = !showDone;
  chipSet(showDoneBtn, showDone);
  render();
});

searchInput.addEventListener("input", ()=>{
  q = toStr(searchInput.value);
  render();
});

document.getElementById("reloadBtn").addEventListener("click", ()=>init(true));

// 新增：FAB
const fab = document.createElement("button");
fab.className = "fabAdd";
fab.textContent = "＋ 新增";
document.body.appendChild(fab);

const modalMask = document.createElement("div");
modalMask.className = "modalMask";
modalMask.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modalHead">
      <div class="modalTitle">新增備忘</div>
      <button class="modalClose">關閉</button>
    </div>

    <div class="modalBody">
      <div>
        <label>狀態</label>
        <select id="mStatus">
          <option value="TODO">TODO</option>
          <option value="DONE">DONE</option>
        </select>
      </div>
      <div>
        <label>到期日（選填）</label>
        <input id="mDue" type="date" />
      </div>
      <div class="full">
        <label>標題（選填）</label>
        <input id="mTitle" placeholder="例如：買SIM卡 / 確認飯店入住時間" />
      </div>
      <div class="full">
        <label>內容（選填）</label>
        <textarea id="mBody" rows="4" placeholder="臨時想到什麼就記…"></textarea>
      </div>
    </div>

    <div class="modalFoot">
      <button class="btn modalCancel">取消</button>
      <button class="btn btnPrimary modalSubmit">新增</button>
    </div>
  </div>
`;

document.body.appendChild(modalMask);

function openModal(){ modalMask.style.display = "flex"; }
function closeModal(){ modalMask.style.display = "none"; }

fab.addEventListener("click", openModal);
modalMask.querySelector(".modalClose").addEventListener("click", closeModal);
modalMask.querySelector(".modalCancel").addEventListener("click", closeModal);
modalMask.addEventListener("click", (e)=>{ if (e.target === modalMask) closeModal(); });

modalMask.querySelector(".modalSubmit").addEventListener("click", async () => {
  const fields = {
    "狀態(TODO/DONE)": modalMask.querySelector("#mStatus").value,
    "到期日": modalMask.querySelector("#mDue").value || "",
    "標題": modalMask.querySelector("#mTitle").value.trim(),
    "內容": modalMask.querySelector("#mBody").value.trim(),
  };

  if (!fields["標題"] && !fields["內容"]) {
    alert("標題/內容至少填一個");
    return;
  }

  try{
    statusEl.textContent = "新增中…";
    const res = await apiAdd("memos", fields);
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

async function init(bust=false){
  try{
    statusEl.textContent = "載入中…";
    const r = await loadFromExec();
    table = r.data.tables.memos;
    rows = table?.rows || [];
    statusEl.textContent = `已載入（線上）｜最後更新：${formatIso(r.generated_at) || "未知"}`;
    render();
  }catch(err){
    const offline = await tryLoadFromLocalCache();
    if (!offline){
      statusEl.textContent = `載入失敗：${err.message}`;
      listEl.innerHTML = `<div class="sub">${escapeHtml(err.message)}</div>`;
      return;
    }
    table = offline.data.tables.memos;
    rows = table?.rows || [];
    statusEl.textContent = `⚠️ 離線模式｜最後更新：${formatIso(offline.generated_at) || "未知"}`;
    render();
  }
}

chipSet(showTodoBtn, showTodo);
chipSet(showDoneBtn, showDone);

init(false);
