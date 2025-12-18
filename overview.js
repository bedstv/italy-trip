/***********************
 * 行程總覽（只讀、摘要）
 ***********************/

const EXEC_URL =
  "https://script.google.com/macros/s/AKfycbxMVr13SBFWdJICZNkaceB-pV_ijfaDXwoH_ySMzhTVqqzDD5l6dtLnU0dIVbkSZzb4/exec";

const SHEET_NAME = "行程清單（iPhone）";

const LS_OK = "trip_cache_ok";
const LS_B64 = "trip_cache_b64";
const LS_TIME = "trip_cache_time";

const statusEl = document.getElementById("status");
const daysEl = document.getElementById("days");

const mustOnlyBtn = document.getElementById("mustOnlyBtn");
const todoOnlyBtn = document.getElementById("todoOnlyBtn");
const searchInput = document.getElementById("searchInput");

const kpiDays = document.getElementById("kpiDays");
const kpiItems = document.getElementById("kpiItems");
const kpiMust = document.getElementById("kpiMust");
const kpiOpt = document.getElementById("kpiOpt");
const kpiTicketTodo = document.getElementById("kpiTicketTodo");
const kpiBookingTodo = document.getElementById("kpiBookingTodo");

document.getElementById("reloadBtn")
  .addEventListener("click", () => loadFromExec(true));

let all = [];
let mustOnly = true;
let todoOnly = false;
let q = "";

/* =========================
 * 日期解析（已驗證穩定）
 * ========================= */
function parseSafeDate(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value)) return value;

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000);
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(Number);
      return new Date(y, m-1, d);
    }
    const d = new Date(s);
    if (!isNaN(d)) return d;
  }

  return null;
}

function formatDateYMD(d){
  if (!(d instanceof Date) || isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

/* =========================
 * 字串 & 優先順序防呆
 * ========================= */
function toStr(v){
  return (v === null || v === undefined) ? "" : String(v).trim();
}

function normalizePrio(v){
  const s = toStr(v).replace(/\s+/g, "");
  if (s === "必去") return "必去";
  if (s === "備選") return "備選";
  return "";
}

/* ========================= */

function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function chipSet(btn, on){ btn.classList.toggle("chipOn", !!on); }

function formatIso(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function base64ToArrayBuffer(b64){
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb="__cb_"+Date.now()+Math.random();
    const s=document.createElement("script");
    window[cb]=(p)=>{ delete window[cb]; s.remove(); resolve(p); };
    s.src=url+(url.includes("?")?"&":"?")+"callback="+cb;
    s.onerror=()=>{ delete window[cb]; s.remove(); reject(new Error("JSONP 失敗")); };
    document.body.appendChild(s);
  });
}

async function loadWorkbookArrayBuffer(buf){
  const wb = XLSX.read(buf,{type:"array",cellDates:true});
  const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws,{defval:""});

  all = rows.map(r=>{
    const dateObj = parseSafeDate(r["日期"]);
    return {
      dateObj,
      date: formatDateYMD(dateObj),
      city: toStr(r["城市"]),
      type: toStr(r["項目類型"]),
      prio: normalizePrio(r["必去/備選"]),
      name: toStr(r["名稱"]),
      time: toStr(r["建議時段"]),
      note: toStr(r["備註"]) || toStr(r["地點文字"]),
      ticket: toStr(r["票務"]),
      booking: toStr(r["訂位"]),
    };
  }).filter(x=>x.dateObj && x.name);

  render();
}

function isTodo(x){
  return x.ticket==="未買"||x.ticket==="需預約"||x.booking==="需訂";
}

function computeKpi(rows){
  const d=new Set(); let must=0,opt=0,t=0,b=0;
  for(const x of rows){
    d.add(x.date);
    if(x.prio==="必去") must++;
    if(x.prio==="備選") opt++;
    if(x.ticket==="未買"||x.ticket==="需預約") t++;
    if(x.booking==="需訂") b++;
  }
  return {days:d.size,items:rows.length,must,opt,ticketTodo:t,bookingTodo:b};
}

function groupByDate(rows){
  const m=new Map();
  for(const x of rows){
    if(!m.has(x.date)) m.set(x.date,[]);
    m.get(x.date).push(x);
  }
  return [...m.keys()].sort().map(d=>{
    const it=m.get(d);
    return {
      date:d,
      cities:[...new Set(it.map(i=>i.city).filter(Boolean))],
      items:it,
      mustItems:it.filter(i=>i.prio==="必去"),
      todoItems:it.filter(isTodo)
    };
  });
}

function render(){
  let rows=[...all];
  if(mustOnly) rows=rows.filter(x=>x.prio==="必去");
  if(todoOnly) rows=rows.filter(isTodo);
  if(q){
    const qq=q.toLowerCase();
    rows=rows.filter(x=>[x.name,x.city,x.note,x.type].join(" ").toLowerCase().includes(qq));
  }

  const k=computeKpi(rows);
  kpiDays.textContent=k.days;
  kpiItems.textContent=k.items;
  kpiMust.textContent=k.must;
  kpiOpt.textContent=k.opt;
  kpiTicketTodo.textContent=k.ticketTodo;
  kpiBookingTodo.textContent=k.bookingTodo;

  const days=groupByDate(rows);
  daysEl.innerHTML="";
  if(!days.length){
    daysEl.innerHTML=`<div class="sub" style="padding:14px;">沒有符合的項目</div>`;
    return;
  }

  for(const d of days){
    const el=document.createElement("section");
    el.className="dayCard";
    el.innerHTML=`
      <div class="dayHead">
        <div class="dayTitle">${escapeHtml(d.date)}</div>
        <div class="dayTags">${d.cities.map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join("")}</div>
      </div>
      <div class="dayMeta">
        <span>共 ${d.items.length} 項</span>
        <span>必去 ${d.mustItems.length}</span>
        <span class="${d.todoItems.length?"warn":""}">待辦 ${d.todoItems.length}</span>
      </div>`;
    daysEl.appendChild(el);
  }
}

mustOnlyBtn.onclick=()=>{mustOnly=!mustOnly;chipSet(mustOnlyBtn,mustOnly);render();};
todoOnlyBtn.onclick=()=>{todoOnly=!todoOnly;chipSet(todoOnlyBtn,todoOnly);render();};
searchInput.oninput=e=>{q=toStr(e.target.value);render();};

chipSet(mustOnlyBtn,mustOnly);
chipSet(todoOnlyBtn,todoOnly);
loadFromExec();