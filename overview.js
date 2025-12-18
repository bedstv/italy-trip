/***********************
 * 行程總覽（XLSX 對齊最終版）
 ***********************/

const EXEC_URL =
  "https://script.google.com/macros/s/AKfycbxMVr13SBFWdJICZNkaceB-pV_ijfaDXwoH_ySMzhTVqqzDD5l6dtLnU0dIVbkSZzb4/exec";
const SHEET_NAME = "行程清單（iPhone）";

const statusEl = document.getElementById("status");
const daysEl = document.getElementById("days");

const mustOnlyBtn = document.getElementById("mustOnlyBtn");
const todoOnlyBtn = document.getElementById("todoOnlyBtn");

const kpiDays = document.getElementById("kpiDays");
const kpiItems = document.getElementById("kpiItems");
const kpiMust = document.getElementById("kpiMust");
const kpiOpt = document.getElementById("kpiOpt");
const kpiTicketTodo = document.getElementById("kpiTicketTodo");
const kpiBookingTodo = document.getElementById("kpiBookingTodo");

let all = [];
let mustOnly = true;
let todoOnly = false;

/* ========= JSONP ========= */
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb="__cb_"+Date.now();
    const s=document.createElement("script");
    window[cb]=(p)=>{ delete window[cb]; s.remove(); resolve(p); };
    s.onerror=()=>{ delete window[cb]; s.remove(); reject(); };
    s.src=url+(url.includes("?")?"&":"?")+"callback="+cb;
    document.body.appendChild(s);
  });
}

/* ========= Excel 日期 → yyyy-mm-dd ========= */
function excelDateToYMD(v){
  if (v instanceof Date && !isNaN(v)) {
    const y=v.getFullYear();
    const m=String(v.getMonth()+1).padStart(2,"0");
    const d=String(v.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

/* ========= 載入 ========= */
async function load(){
  try{
    statusEl.textContent="載入中…";
    const payload = await jsonp(`${EXEC_URL}?action=export`);
    const buf = Uint8Array.from(atob(payload.b64), c=>c.charCodeAt(0)).buffer;

    const wb = XLSX.read(buf,{type:"array",cellDates:true});
    const ws = wb.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(ws,{defval:""});

    all = rows.map(r=>{
      return {
        date: excelDateToYMD(r["日期"]),
        city: String(r["城市"]||"").trim(),
        type: String(r["項目類型"]||"").trim(),
        prio: String(r["必去/備選"]||"").trim(),
        name: String(r["名稱"]||"").trim(),
        ticket: String(r["票務"]||"").trim(),
        booking: String(r["訂位"]||"").trim(),
      };
    }).filter(x=>x.date && x.name);

    render();
    statusEl.textContent="已載入（線上）";
  }catch(e){
    statusEl.textContent="載入失敗";
  }
}

/* ========= 判斷 ========= */
function isTodo(x){
  return x.ticket==="未買" || x.ticket==="需預約" || x.booking==="需訂";
}

/* ========= render ========= */
function render(){
  let rows = [...all];
  if (mustOnly) rows = rows.filter(x => x.prio === "必去");
  if (todoOnly) rows = rows.filter(isTodo);

  const days = [...new Set(rows.map(r => r.date))];

  // KPI
  kpiDays.textContent = days.length;
  kpiItems.textContent = rows.length;
  kpiMust.textContent = rows.filter(r => r.prio === "必去").length;
  kpiOpt.textContent = rows.filter(r => r.prio === "備選").length;
  kpiTicketTodo.textContent = rows.filter(r => r.ticket === "未買" || r.ticket === "需預約").length;
  kpiBookingTodo.textContent = rows.filter(r => r.booking === "需訂").length;

  daysEl.innerHTML = "";

  days.forEach(date => {
    const items = rows.filter(r => r.date === date);
    const city = items[0]?.city || "";

    const must = items.filter(i => i.prio === "必去");
    const opt  = items.filter(i => i.prio === "備選");

    const card = document.createElement("section");
    card.className = "dayCardReadable";

    card.innerHTML = `
      <div class="dayHeader">
        <div class="dayDate">${date}</div>
        <div class="dayCity">${city}</div>
      </div>

      <div class="block must">
        <div class="blockTitle">✅ 必去 (${must.length})</div>
        ${must.map(i => `
          <div class="itemRow">
            <span class="icon">${typeIcon(i.type)}</span>
            <span class="name">${i.name}</span>
          </div>
        `).join("")}
      </div>

      ${opt.length ? `
      <div class="block opt">
        <div class="blockTitle">⭐ 備選 (${opt.length})</div>
        ${opt.map(i => `
          <div class="itemRow">
            <span class="icon">${typeIcon(i.type)}</span>
            <span class="name">${i.name}</span>
          </div>
        `).join("")}
      </div>
      ` : ""}
    `;

    daysEl.appendChild(card);
  });
}

/* icon helper */
function typeIcon(type=""){
  if (type.includes("餐")) return "🍽";
  if (type.includes("住")) return "🏠";
  if (type.includes("車") || type.includes("站")) return "🚉";
  return "🏛";
}

/* ========= UI ========= */
mustOnlyBtn.onclick=()=>{ mustOnly=!mustOnly; render(); };
todoOnlyBtn.onclick=()=>{ todoOnly=!todoOnly; render(); };

load();