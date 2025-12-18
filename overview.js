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
  let rows=[...all];
  if(mustOnly) rows=rows.filter(x=>x.prio==="必去");
  if(todoOnly) rows=rows.filter(isTodo);

  const days=[...new Set(rows.map(r=>r.date))];

  kpiDays.textContent=days.length;
  kpiItems.textContent=rows.length;
  kpiMust.textContent=rows.filter(r=>r.prio==="必去").length;
  kpiOpt.textContent=rows.filter(r=>r.prio==="備選").length;
  kpiTicketTodo.textContent=rows.filter(r=>r.ticket==="未買"||r.ticket==="需預約").length;
  kpiBookingTodo.textContent=rows.filter(r=>r.booking==="需訂").length;

  daysEl.innerHTML="";

  days.forEach(date=>{
    const items=rows.filter(r=>r.date===date);

    const section=document.createElement("section");
    section.className="dayCard";

    // ---- header ----
    const header=document.createElement("div");
    header.className="dayHead";
    header.innerHTML=`
      <div class="dayTitle">${date}</div>
      <div class="dayMeta">
        <span>共 ${items.length} 項</span>
        <span>必去 ${items.filter(i=>i.prio==="必去").length}</span>
        <span class="${items.filter(isTodo).length?"warn":""}">
          待辦 ${items.filter(isTodo).length}
        </span>
      </div>
    `;

    // ---- items (預設收合) ----
    const list=document.createElement("div");
    list.className="dayItems";
    list.style.display="none";

    list.innerHTML = items.map(i=>`
      <div class="itemRow">
        <div class="itemMain">
          <span class="itemName">${i.name}</span>
          ${i.prio==="備選" ? `<span class="tag opt">備選</span>` : ""}
        </div>
        <div class="itemSub">
          ${i.city || ""}
          ${isTodo(i) ? `<span class="warn">待辦</span>` : ""}
        </div>
      </div>
    `).join("");

    // ---- toggle ----
    header.addEventListener("click",()=>{
      list.style.display = list.style.display==="none" ? "block" : "none";
    });

    section.appendChild(header);
    section.appendChild(list);
    daysEl.appendChild(section);
  });
}

/* ========= UI ========= */
mustOnlyBtn.onclick=()=>{ mustOnly=!mustOnly; render(); };
todoOnlyBtn.onclick=()=>{ todoOnly=!todoOnly; render(); };

load();