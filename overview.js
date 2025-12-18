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

/* ========= 工具 ========= */

function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb="__cb_"+Date.now()+Math.random().toString(36).slice(2);
    const s=document.createElement("script");
    window[cb]=(p)=>{ delete window[cb]; s.remove(); resolve(p); };
    s.onerror=()=>{ delete window[cb]; s.remove(); reject(new Error("JSONP 失敗")); };
    s.src=url+(url.includes("?")?"&":"?")+"callback="+cb;
    document.body.appendChild(s);
  });
}

function base64ToArrayBuffer(b64){
  const bin=atob(b64);
  const u8=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  return u8.buffer;
}

function toStr(v){ return v==null?"":String(v).trim(); }

/* ========= 日期（完整支援） ========= */

function parseSafeDate(v){
  if(!v) return null;

  if(v instanceof Date && !isNaN(v)) return v;

  if(typeof v==="number"){
    const base=new Date(Date.UTC(1899,11,30));
    return new Date(base.getTime()+v*86400000);
  }

  if(typeof v==="string"){
    const s=v.trim();

    if(/^\d+$/.test(s)){
      const n=Number(s);
      const base=new Date(Date.UTC(1899,11,30));
      return new Date(base.getTime()+n*86400000);
    }

    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const [y,m,d]=s.split("-").map(Number);
      return new Date(y,m-1,d);
    }

    const d=new Date(s);
    if(!isNaN(d)) return d;
  }

  return null;
}

function formatYMD(d){
  if(!(d instanceof Date)||isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ========= 必去 / 備選 ========= */

function normalizePrio(v){
  const s=String(v??"")
    .replace(/\s+/g,"")
    .replace(/　/g,"");
  if(s.includes("備選")) return "備選";
  if(s.includes("必去")) return "必去";
  return "";
}

/* ========= 載入 ========= */

async function tryLoadFromLocalCache(){
  if(localStorage.getItem(LS_OK)!=="1") return false;
  const b64=localStorage.getItem(LS_B64);
  if(!b64) return false;
  await loadWorkbookArrayBuffer(base64ToArrayBuffer(b64));
  statusEl.textContent="⚠️ 離線模式";
  return true;
}

async function loadFromExec(){
  try{
    statusEl.textContent="載入中…";
    const payload=await jsonp(`${EXEC_URL}?action=export`);
    if(!payload?.ok||!payload.b64) throw new Error("資料錯誤");
    localStorage.setItem(LS_OK,"1");
    localStorage.setItem(LS_B64,payload.b64);
    await loadWorkbookArrayBuffer(base64ToArrayBuffer(payload.b64));
    statusEl.textContent="已載入（線上）";
  }catch(e){
    const ok=await tryLoadFromLocalCache();
    if(!ok) statusEl.textContent="載入失敗";
  }
}

/* ========= 資料處理 ========= */

async function loadWorkbookArrayBuffer(buf){
  const wb=XLSX.read(buf,{type:"array",cellDates:true});
  const ws=wb.Sheets[SHEET_NAME]||wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:""});

  all=rows.map(r=>{
    const d=parseSafeDate(r["日期"]);
    return {
      date: formatYMD(d),
      city: toStr(r["城市"]),
      prio: normalizePrio(r["必去/備選"]),
      name: toStr(r["名稱"]),
      ticket: toStr(r["票務"]),
      booking: toStr(r["訂位"])
    };
  }).filter(x=>x.date&&x.name);

  render();
}

function isTodo(x){
  return x.ticket==="未買"||x.ticket==="需預約"||x.booking==="需訂";
}

function render(){
  let rows=[...all];
  if(mustOnly) rows=rows.filter(x=>x.prio==="必去");
  if(todoOnly) rows=rows.filter(isTodo);

  kpiDays.textContent=new Set(rows.map(r=>r.date)).size;
  kpiItems.textContent=rows.length;
  kpiMust.textContent=rows.filter(r=>r.prio==="必去").length;
  kpiOpt.textContent=rows.filter(r=>r.prio==="備選").length;
  kpiTicketTodo.textContent=rows.filter(r=>r.ticket==="未買"||r.ticket==="需預約").length;
  kpiBookingTodo.textContent=rows.filter(r=>r.booking==="需訂").length;

  daysEl.innerHTML="";
}

/* ========= 啟動 ========= */

loadFromExec();