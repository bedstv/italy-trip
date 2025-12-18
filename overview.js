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

let all = [];
let mustOnly = true;
let todoOnly = false;
let q = "";

/* =========================
 * 日期解析（最終穩定版）
 * ========================= */
function parseSafeDate(v){
  if (v === null || v === undefined || v === "") return null;

  // Date 物件
  if (v instanceof Date && !isNaN(v)) return v;

  // number（Excel serial）
  if (typeof v === "number") {
    const base = new Date(Date.UTC(1899,11,30));
    return new Date(base.getTime() + v * 86400000);
  }

  // string
  if (typeof v === "string") {
    const s = v.trim();

    // 「數字字串」的 Excel serial（重點）
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const base = new Date(Date.UTC(1899,11,30));
      return new Date(base.getTime() + n * 86400000);
    }

    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(Number);
      return new Date(y, m-1, d);
    }

    // ISO
    const d = new Date(s);
    if (!isNaN(d)) return d;
  }

  return null;
}

function formatYMD(d){
  if (!(d instanceof Date) || isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* =========================
 * 必去 / 備選（關鍵修正）
 * ========================= */
function normalizePrio(v){
  const s = String(v ?? "")
    .replace(/\s+/g,"")
    .replace(/　/g,""); // 全形空白

  if (s.includes("備選")) return "備選";
  if (s.includes("必去")) return "必去";
  return "";
}

/* ========================= */

function toStr(v){ return (v==null) ? "" : String(v).trim(); }

function isTodo(x){
  return x.ticket==="未買" || x.ticket==="需預約" || x.booking==="需訂";
}

async function loadWorkbookArrayBuffer(buf){
  const wb = XLSX.read(buf,{type:"array",cellDates:true});
  const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws,{defval:""});

  all = rows.map(r=>{
    const d = parseSafeDate(r["日期"]);
    return {
      dateObj: d,
      date: formatYMD(d),
      city: toStr(r["城市"]),
      type: toStr(r["項目類型"]),
      prio: normalizePrio(r["必去/備選"]),
      name: toStr(r["名稱"]),
      note: toStr(r["備註"]) || toStr(r["地點文字"]),
      ticket: toStr(r["票務"]),
      booking: toStr(r["訂位"]),
    };
  }).filter(x=>x.date && x.name);

  render();
}

function computeKpi(rows){
  const ds=new Set(); let must=0,opt=0,t=0,b=0;
  for(const x of rows){
    ds.add(x.date);
    if(x.prio==="必去") must++;
    if(x.prio==="備選") opt++;
    if(x.ticket==="未買"||x.ticket==="需預約") t++;
    if(x.booking==="需訂") b++;
  }
  return {days:ds.size,items:rows.length,must,opt,ticketTodo:t,bookingTodo:b};
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
  for(const d of days){
    const el=document.createElement("section");
    el.className="dayCard";
    el.innerHTML=`
      <div class="dayHead">
        <div class="dayTitle">${d.date}</div>
      </div>
      <div class="dayMeta">
        <span>共 ${d.items.length} 項</span>
        <span>必去 ${d.mustItems.length}</span>
        <span class="${d.todoItems.length?"warn":""}">待辦 ${d.todoItems.length}</span>
      </div>`;
    daysEl.appendChild(el);
  }
}

loadFromExec();