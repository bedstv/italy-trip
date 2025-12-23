/***********************
 * XLSX Loader (CDN fallback + single entry)
 * - Avoids "Can't find variable: XLSX"
 ***********************/
(function(){
  async function loadScript(src){
    return new Promise((resolve, reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.async=true;
      s.onload=()=>resolve(src);
      s.onerror=()=>reject(new Error('Failed to load script: '+src));
      document.head.appendChild(s);
    });
  }

  const CANDIDATES = [
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
  ];

  async function ensureXLSX(){
    if (window.XLSX) return true;
    let lastErr=null;
    for (const src of CANDIDATES){
      try{
        await loadScript(src);
        if (window.XLSX) return true;
      }catch(e){ lastErr=e; }
    }
    throw lastErr || new Error("XLSX load failed");
  }

  window.ensureXLSX = ensureXLSX;
})();
