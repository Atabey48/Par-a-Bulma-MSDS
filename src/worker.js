// src/worker.js
// Cloudflare Workers (Module Worker) + Single-HTML UI embedded
//
// Routes:
// - GET  /                     : UI
// - GET  /api/health            : health
// - GET  /api/search?q=         : MSDS PDF list + MIL-PRF codes (web)
// - POST /api/extract           : { pdfUrl } -> extract Section 7/14 (server-side PDF parse)
// - GET  /api/wheels?tail=      : tail number -> Google web scan -> NLG/MLG wheel/tire PNs (clean)
//
// Required Worker secrets:
// - GOOGLE_API_KEY
// - GOOGLE_CX

import { getDocument } from "pdfjs-serverless";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") return htmlResponse(UI_HTML);

    if (url.pathname === "/api/health") {
      return withCors(Promise.resolve(json({ ok: true })));
    }

    if (url.pathname === "/api/search") {
      return withCors(handleSearch(request, env));
    }

    if (url.pathname === "/api/extract") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      return withCors(handleExtract(request));
    }

    if (url.pathname === "/api/wheels") {
      return withCors(handleWheels(request, env));
    }

    return new Response("Not Found", { status: 404 });
  },
};

/* =========================
   UI (Single HTML embedded)
========================= */
const UI_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Depot Tools | MSDS + Wheel</title>
  <style>
    :root{
      --bg:#fbf7ef; --bg2:#fffdf8; --card:#ffffff;
      --border: rgba(20,70,110,0.16);
      --text:#16324f; --muted: rgba(22,50,79,0.65);
      --accent:#7ec8e3; --accent2:#4aa8d8; --ink:#0f2b3a;
      --danger:#c2413b; --success:#1f7a5a;
      --shadow:0 14px 34px rgba(15,43,58,0.10);
      --r:16px;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }
    *{box-sizing:border-box}
    body{
      margin:0; color:var(--text);
      background:
        radial-gradient(circle at 18% 18%, rgba(126,200,227,.25), transparent 35%),
        radial-gradient(circle at 85% 5%, rgba(74,168,216,.18), transparent 28%),
        linear-gradient(180deg, var(--bg2), var(--bg));
      min-height:100vh;
    }

    .topbar{
      position:sticky; top:0; z-index:20;
      backdrop-filter: blur(10px);
      background: rgba(255,253,248,.74);
      border-bottom:1px solid rgba(20,70,110,0.10);
    }
    .topbar__inner{
      max-width:1180px; margin:0 auto; padding:12px 16px;
      display:grid; grid-template-columns: 44px 1fr auto; align-items:center; gap:10px;
    }
    .hamb{
      width:38px; height:38px; border-radius:12px;
      border:1px solid rgba(20,70,110,0.16);
      background: rgba(255,253,248,.78);
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow: 0 8px 16px rgba(15,43,58,0.06);
    }
    .hamb:hover{transform: translateY(-1px)}
    .hamb .lines{width:18px}
    .hamb .lines span{
      display:block; height:2px; background: rgba(22,50,79,.78);
      margin:4px 0; border-radius:2px;
    }

    .brand h1{margin:0; font-size:16px; letter-spacing:.2px}
    .brand p{margin:2px 0 0; color:var(--muted); font-size:12.8px; line-height:1.35}
    .by{font-size:8pt; color: rgba(22,50,79,.70); white-space:nowrap; user-select:none}

    .wrap{max-width:1180px; margin:0 auto; padding:16px 16px 44px}
    .grid{display:grid; grid-template-columns:1.15fr .85fr; gap:14px}
    @media(max-width:980px){.grid{grid-template-columns:1fr}}

    .card{
      background:var(--card); border:1px solid var(--border);
      border-radius:var(--r); box-shadow:var(--shadow);
      padding:16px;
    }

    .row{display:grid; grid-template-columns:1fr auto; gap:10px; margin-top:10px}
    @media(max-width:640px){.row{grid-template-columns:1fr} button{width:100%}}

    input{
      width:100%; border:1px solid rgba(20,70,110,0.18);
      background:#fffdfa; border-radius:12px;
      padding:12px 14px; font-size:15px; color:var(--text); outline:none;
    }
    input:focus{border-color: rgba(74,168,216,.55); box-shadow:0 0 0 4px rgba(126,200,227,.22)}

    button{
      border:none; border-radius:12px; padding:12px 14px;
      font-weight:900; cursor:pointer; color:var(--ink);
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      box-shadow:0 10px 18px rgba(74,168,216,.25);
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    button:hover{transform: translateY(-1px); box-shadow:0 14px 22px rgba(74,168,216,.30)}
    button:disabled{opacity:.6; cursor:not-allowed; transform:none; box-shadow:none}

    .ghost{
      background:transparent; border:1px solid rgba(20,70,110,0.18);
      color:var(--text); box-shadow:none; font-weight:900;
    }

    .status{margin-top:10px; min-height:18px; font-size:13px}
    .status.ok{color:var(--success)} .status.err{color:var(--danger)}
    .hint{margin:8px 0 0; color:var(--muted); font-size:13px; line-height:1.45}

    .results{margin-top:12px; display:grid; gap:10px}
    .result{
      border:1px solid rgba(20,70,110,0.16);
      border-radius:14px; padding:12px;
      background: rgba(255,253,248,.70);
      display:grid; grid-template-columns:1fr auto; gap:10px; align-items:start;
    }
    @media(max-width:640px){.result{grid-template-columns:1fr}}
    .result h3{margin:0 0 6px; font-size:14px; line-height:1.35}
    .meta{display:flex; flex-wrap:wrap; gap:8px; align-items:center; color:var(--muted); font-size:12.5px}
    .pill{
      display:inline-flex; align-items:center; gap:6px;
      padding:4px 10px; border-radius:999px;
      border:1px solid rgba(20,70,110,0.18);
      background: rgba(126,200,227,0.10);
      color: rgba(22,50,79,0.85);
      font-weight:900; font-size:12px;
    }
    .actions{display:flex; flex-direction:column; gap:8px; min-width:160px}
    .linkbtn{
      display:inline-flex; justify-content:center; align-items:center;
      text-decoration:none; border-radius:12px;
      padding:10px 12px; border:1px solid rgba(20,70,110,0.18);
      color:var(--text); background:#fffdfa; font-weight:900;
    }

    pre{
      margin:0; border:1px solid rgba(20,70,110,0.16);
      border-radius:14px; padding:12px; background:#fffdfa;
      white-space:pre-wrap;
      line-height:1.75;
      min-height:170px;
      font-size:13.6px;
      word-break:break-word;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .kv{
      display:grid;
      grid-template-columns: 150px 1fr;
      gap: 8px 10px;
      margin: 10px 0 12px;
      padding: 10px 12px;
      border: 1px solid rgba(20,70,110,0.14);
      border-radius: 14px;
      background: rgba(255,253,248,.65);
      font-size: 13px;
      line-height: 1.45;
    }
    .kv .k{color: rgba(22,50,79,.72); font-weight: 900}
    .kv .v{color: rgba(22,50,79,.92); word-break: break-word}

    .sectionTitle{
      display:flex; align-items:baseline; justify-content:space-between;
      gap:10px; flex-wrap:wrap; margin-bottom:8px
    }
    .sectionTitle h3{margin:0; font-size:14px}
    .subinfo{color:var(--muted); font-size:12.5px}

    /* Drawer */
    .drawerBackdrop{
      position:fixed; inset:0; background: rgba(15,43,58,0.22);
      display:none; z-index:30;
    }
    .drawerBackdrop.show{display:block;}
    .drawer{
      position:fixed; top:0; left:0; height:100vh; width:320px;
      max-width: 86vw;
      background: rgba(255,253,248,.96);
      border-right: 1px solid rgba(20,70,110,0.14);
      box-shadow: 18px 0 40px rgba(15,43,58,0.15);
      transform: translateX(-102%);
      transition: transform 160ms ease;
      z-index:40;
      padding: 14px;
      display:flex; flex-direction:column; gap:12px;
    }
    .drawer.show{transform: translateX(0);}
    .drawerHeader{display:flex; align-items:center; justify-content:space-between; gap:10px}
    .drawerHeader .t{font-weight: 950}
    .drawerHeader .x{
      width:36px; height:36px; border-radius:12px;
      border:1px solid rgba(20,70,110,0.16);
      background: #fffdfa;
      cursor:pointer;
    }
    .menu{
      display:grid; gap:10px;
      margin-top: 6px;
    }
    .menuBtn{
      text-align:left;
      border:1px solid rgba(20,70,110,0.16);
      border-radius: 14px;
      background: #fffdfa;
      padding: 12px;
      cursor:pointer;
      font-weight: 950;
      color: rgba(22,50,79,.92);
    }
    .menuBtn small{display:block; color: rgba(22,50,79,.62); font-weight: 700; margin-top: 3px}
    .menuBtn.active{
      outline: 3px solid rgba(126,200,227,.20);
      border-color: rgba(74,168,216,.45);
    }

    .badge{
      display:inline-flex; align-items:center; gap:6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(126,200,227,0.12);
      border: 1px solid rgba(20,70,110,0.14);
      font-weight: 950;
      font-size: 12px;
      color: rgba(22,50,79,.85);
      user-select:none;
    }

    /* WHEEL VIEW (screenshot-like) */
    .wheelTable{
      margin-top: 12px;
      border: 1px solid rgba(20,70,110,0.14);
      border-radius: 16px;
      overflow: hidden;
      background: rgba(255,253,248,.65);
    }
    .wheelHeader, .wheelRow{
      display:grid;
      grid-template-columns: 1.05fr 0.9fr 0.85fr 0.85fr;
      gap: 0;
      align-items: stretch;
    }
    .wheelHeader{
      background: rgba(126,200,227,0.10);
      border-bottom: 1px solid rgba(20,70,110,0.12);
    }
    .wheelHeader .cell{
      padding: 12px 12px;
      font-weight: 950;
      font-size: 13px;
      letter-spacing: .2px;
    }
    .wheelHeader .cell.nlg{color:#2a6fd6}
    .wheelHeader .cell.mlg{color:#7c3aed}

    .wheelRow .cell{
      padding: 14px 12px;
      border-bottom: 1px solid rgba(20,70,110,0.10);
      background: rgba(255,253,248,.70);
    }
    .wheelRow:last-child .cell{border-bottom:none}

    .airTitle{
      font-weight: 950;
      font-size: 18px;
      margin: 0 0 6px;
    }
    .airSub{
      margin: 0;
      color: rgba(22,50,79,.75);
      font-weight: 800;
      font-size: 13px;
      line-height: 1.35;
    }
    .tag{
      display:inline-flex;
      margin-top: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(20,70,110,0.14);
      background: rgba(126,200,227,0.08);
      font-weight: 900;
      font-size: 12px;
      color: rgba(22,50,79,.84);
    }

    .opLine{
      display:flex;
      flex-direction:column;
      gap: 8px;
      font-size: 13px;
      color: rgba(22,50,79,.86);
      font-weight: 800;
    }
    .opItem{display:flex; gap:8px; align-items:center}
    .dot{
      width: 8px; height: 8px; border-radius: 999px;
      background: rgba(74,168,216,.55);
      border: 1px solid rgba(20,70,110,0.10);
      flex: 0 0 auto;
    }

    .pnBox{
      display:flex;
      flex-direction:column;
      gap: 12px;
      height: 100%;
    }
    .pnGroup{
      display:flex;
      flex-direction:column;
      gap: 6px;
    }
    .pnLabel{
      font-size: 12px;
      font-weight: 950;
      letter-spacing: .2px;
      color: rgba(22,50,79,.62);
    }
    .pnValue{
      display:inline-flex;
      align-items:center;
      width: fit-content;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(20,70,110,0.14);
      background: #fffdfa;
      font-weight: 950;
      font-size: 14px;
      color: rgba(22,50,79,.92);
    }
    .pnValue.mlg{border-color: rgba(124,58,237,.18)}
    .pnValue.nlg{border-color: rgba(42,111,214,.18)}

    @media(max-width:980px){
      .wheelHeader, .wheelRow{
        grid-template-columns: 1fr;
      }
      .wheelHeader .cell{display:none;}
      .wheelRow .cell{border-bottom: none;}
      .wheelRow{
        border-bottom: 1px solid rgba(20,70,110,0.12);
      }
      .wheelRow:last-child{border-bottom:none;}
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar__inner">
      <button class="hamb" id="hamb" aria-label="menu">
        <div class="lines"><span></span><span></span><span></span></div>
      </button>

      <div class="brand">
        <h1>Depot Tools</h1>
        <p id="subtitle">MSDS (Section 7/14) + MIL-PRF • Wheel lookup</p>
      </div>

      <div class="by">by Furkan ATABEY</div>
    </div>
  </div>

  <div class="drawerBackdrop" id="backdrop"></div>
  <aside class="drawer" id="drawer">
    <div class="drawerHeader">
      <div class="t">Navigation</div>
      <button class="x" id="closeDrawer">✕</button>
    </div>

    <div class="menu">
      <button class="menuBtn" id="navMsds">
        MSDS
        <small>Parça no → PDF → Handling & Storage + Transport Info</small>
      </button>
      <button class="menuBtn" id="navWheel">
        Wheel
        <small>Tail → NLG/MLG Wheel P/N + Tire P/N</small>
      </button>
    </div>

    <div class="hint">
      Not: En stabil kullanım için bu sayfayı Worker domaininden açın (aynı origin).
    </div>
  </aside>

  <div class="wrap">
    <!-- VIEW: MSDS (UI DEĞİŞTİRİLMEDİ) -->
    <div id="viewMsds">
      <div class="grid">
        <section class="card">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:950; font-size:16px;">MSDS Search</div>
            <span class="badge">Google → PDF</span>
            <span class="badge">MIL-PRF (web)</span>
          </div>

          <div class="hint" style="margin-top:8px;">
            Eğer UI GitHub Pages’te, backend Worker’da ise aşağıdaki API_BASE ayarı gerekir.
          </div>

          <div class="row">
            <input id="q" type="text" placeholder="Örn: RTV 102 MSDS veya MIL-PRF-81733" />
            <button id="btn">Ara</button>
          </div>

          <div id="st" class="status"></div>

          <div class="kv">
            <div class="k">MIL-PRF (Google)</div>
            <div class="v" id="mil">Not searched</div>
          </div>

          <div id="res" class="results"></div>

          <div class="hint">
            İpucu: Listede “direct” görünen linkler genelde gerçek PDF indirir ve daha stabil parse olur.
          </div>
        </section>

        <section class="card">
          <div class="sectionTitle">
            <h3>Handling and storage (Section 7)</h3>
            <button class="ghost" id="c7">Kopyala</button>
          </div>

          <div class="subinfo" id="info">Seçili PDF yok.</div>

          <div class="kv">
            <div class="k">Pages</div>
            <div class="v" id="pg">—</div>
            <div class="k">Source</div>
            <div class="v" id="src">—</div>
          </div>

          <pre id="s7">Bir PDF seçin (Bölümleri Ayıkla).</pre>

          <div style="height:14px"></div>

          <div class="sectionTitle">
            <h3>Transport information (Section 14)</h3>
            <button class="ghost" id="c14">Kopyala</button>
          </div>

          <div class="subinfo" id="meta"></div>
          <pre id="s14">Bir PDF seçin (Bölümleri Ayıkla).</pre>
        </section>
      </div>
    </div>

    <!-- VIEW: WHEEL (GÖRSELDEKİ GİBİ) -->
    <div id="viewWheel" style="display:none;">
      <div class="grid">
        <section class="card">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:950; font-size:16px;">Wheel</div>
            <span class="badge">Tail No → Result</span>
          </div>

          <div class="row">
            <input id="tail" type="text" placeholder="Örn: TC-JHK / SU-BQN / N123AB" />
            <button id="btnWheel">Ara</button>
          </div>
          <div id="stWheel" class="status"></div>

          <div class="wheelTable" id="wheelTable" style="display:none;">
            <div class="wheelHeader">
              <div class="cell">UÇAK BİLGİSİ</div>
              <div class="cell">OPERATÖR</div>
              <div class="cell nlg">NLG (BURUN)</div>
              <div class="cell mlg">MLG (ANA)</div>
            </div>
            <div id="wheelRows"></div>
          </div>

          <div class="hint" id="wheelHint">
            Sadece jant ve lastik bilgileri gösterilir: NLG/MLG için Wheel P/N ve Tire P/N.
          </div>
        </section>

        <section class="card">
          <div style="font-weight:950; font-size:16px;">Quick Copy</div>
          <div class="hint">İstersen buradan kopyalayıp rapora atabilirsin.</div>

          <div style="height:10px"></div>
          <div class="sectionTitle">
            <h3>Summary (text)</h3>
            <button class="ghost" id="copyWheel">Kopyala</button>
          </div>
          <pre id="wheelSummary">Arama yapınca özet burada oluşur.</pre>
        </section>
      </div>
    </div>

  </div>

<script>
  const $ = (id)=>document.getElementById(id);

  // If you open this UI from Worker domain, keep API_BASE = "".
  // If you open UI from GitHub Pages, set API_BASE to your Worker URL:
  // const API_BASE = "https://your-worker-name.your-subdomain.workers.dev";
  const API_BASE = "";

  function apiUrl(path){
    if(!API_BASE) return new URL(path, window.location.origin).toString();
    return new URL(path, API_BASE).toString();
  }

  async function safeJson(resp){
    const ct = (resp.headers.get("content-type")||"").toLowerCase();
    if(ct.includes("application/json")) return await resp.json();
    const txt = await resp.text();
    throw new Error("Backend JSON dönmedi. Gelen içerik (ilk 120): " + txt.replace(/\\s+/g," ").slice(0,120));
  }

  /* ===== Drawer / Navigation ===== */
  const drawer = $("drawer");
  const backdrop = $("backdrop");
  const hamb = $("hamb");
  const closeDrawer = $("closeDrawer");

  function openDrawer(){
    drawer.classList.add("show");
    backdrop.classList.add("show");
  }
  function hideDrawer(){
    drawer.classList.remove("show");
    backdrop.classList.remove("show");
  }
  hamb.onclick=openDrawer;
  closeDrawer.onclick=hideDrawer;
  backdrop.onclick=hideDrawer;

  const navMsds = $("navMsds");
  const navWheel = $("navWheel");
  const viewMsds = $("viewMsds");
  const viewWheel = $("viewWheel");

  function setActive(view){
    navMsds.classList.toggle("active", view==="msds");
    navWheel.classList.toggle("active", view==="wheel");
    viewMsds.style.display = (view==="msds") ? "block" : "none";
    viewWheel.style.display = (view==="wheel") ? "block" : "none";
    hideDrawer();
    location.hash = view==="msds" ? "#/msds" : "#/wheel";
  }
  navMsds.onclick = ()=>setActive("msds");
  navWheel.onclick = ()=>setActive("wheel");

  (function initRoute(){
    const h = location.hash || "#/msds";
    if(h.includes("wheel")) setActive("wheel"); else setActive("msds");
  })();

  window.addEventListener("hashchange", ()=>{
    const h = location.hash || "#/msds";
    if(h.includes("wheel")) setActive("wheel"); else setActive("msds");
  });

  /* ===== MSDS ===== */
  const st = $("st"), res = $("res"), btn=$("btn"), q=$("q");
  const s7=$("s7"), s14=$("s14"), info=$("info"), meta=$("meta");
  const mil=$("mil"), pg=$("pg"), src=$("src");

  function setStatus(el,msg,type=""){
    el.textContent = msg||"";
    el.className = "status " + (type==="err"?"err": type==="ok"?"ok":"");
  }

  function renderMsds(items){
    res.innerHTML="";
    if(!items.length){
      res.innerHTML = '<div class="hint">PDF sonuç bulunamadı.</div>';
      return;
    }
    for(const it of items){
      const d=document.createElement("div");
      d.className="result";

      const left=document.createElement("div");
      left.innerHTML = '<h3></h3><div class="meta"><span class="pill"></span><span class="sn"></span></div>';
      left.querySelector("h3").textContent = it.title || "Adsız PDF";
      left.querySelector(".pill").textContent = (it.host || "") + (it.directPdf ? " • direct" : " • viewer");
      left.querySelector(".sn").textContent = it.snippet || "";

      const act=document.createElement("div");
      act.className="actions";

      const b=document.createElement("button");
      b.textContent="Bölümleri Ayıkla";
      b.onclick=()=>extractMsds(it);

      const a=document.createElement("a");
      a.className="linkbtn"; a.href=it.link; a.target="_blank"; a.rel="noopener noreferrer"; a.textContent="PDF Aç";

      act.appendChild(b); act.appendChild(a);
      d.appendChild(left); d.appendChild(act);
      res.appendChild(d);
    }
  }

  async function searchMsds(){
    const term = q.value.trim();
    if(!term){ setStatus(st,"Parça numarası / arama terimi girin.","err"); return; }

    btn.disabled=true;
    res.innerHTML="";
    setStatus(st,"Aranıyor...","ok");
    mil.textContent="Searching...";

    try{
      const r = await fetch(apiUrl("/api/search?q="+encodeURIComponent(term)));
      const data = await safeJson(r);
      if(!r.ok) throw new Error(data.error || "Arama başarısız.");

      if (data.milPrf && data.milPrf.length) mil.textContent = data.milPrf.join(", ");
      else mil.textContent = "Not found";

      renderMsds(data.items||[]);
      setStatus(st,(data.items||[]).length + " PDF bulundu. 'direct' olanları öncelikle deneyin.","ok");
    }catch(e){
      setStatus(st,e.message||"Hata","err");
      mil.textContent="Not found";
    }finally{
      btn.disabled=false;
    }
  }

  async function extractMsds(it){
    info.textContent = (it.title||"Adsız PDF") + " — " + (it.host||"");
    meta.textContent = "İşleniyor...";
    s7.textContent="Yükleniyor...";
    s14.textContent="Yükleniyor...";
    pg.textContent="—";
    src.textContent=it.host||"—";

    try{
      const r = await fetch(apiUrl("/api/extract"), {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ pdfUrl: it.link })
      });
      const data = await safeJson(r);
      if(!r.ok) throw new Error(data.error || "Extract başarısız.");

      s7.textContent = data.section7 || "Bulunamadı";
      s14.textContent = data.section14 || "Bulunamadı";
      pg.textContent = (data.pages ?? "—");
      src.textContent = it.host || "—";
      meta.textContent = "Tamamlandı.";
    }catch(e){
      meta.textContent = "";
      s7.textContent = "Hata: " + (e.message||"");
      s14.textContent = "Hata: " + (e.message||"");
      pg.textContent = "—";
    }
  }

  btn.onclick=searchMsds;
  q.addEventListener("keydown",(e)=>{ if(e.key==="Enter") searchMsds(); });
  $("c7").onclick=()=>navigator.clipboard.writeText(s7.textContent||"");
  $("c14").onclick=()=>navigator.clipboard.writeText(s14.textContent||"");

  /* ===== WHEEL (clean, screenshot-like) ===== */
  const tail = $("tail");
  const btnWheel = $("btnWheel");
  const stWheel = $("stWheel");
  const wheelTable = $("wheelTable");
  const wheelRows = $("wheelRows");
  const wheelSummary = $("wheelSummary");
  const copyWheel = $("copyWheel");
  const wheelHint = $("wheelHint");

  function clearWheel(){
    wheelRows.innerHTML="";
    wheelTable.style.display="none";
    wheelHint.style.display="block";
    wheelSummary.textContent="Arama yapınca özet burada oluşur.";
  }

  function esc(s){ return String(s??"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

  function makeWheelRow(d){
    const tail = d.tail || "—";
    const model = d.aircraft?.model || d.aircraft?.family || "—";
    const typeCode = d.aircraft?.typeCode ? '"' + d.aircraft.typeCode + '"' : "";
    const bodyTag = d.aircraft?.bodyType ? d.aircraft.bodyType : "";

    const opName = d.operator?.name || "—";
    const opCountry = d.operator?.country || "";

    const nlgWheel = d.nlg?.wheelPn || "—";
    const nlgTire  = d.nlg?.tirePn  || "—";
    const mlgWheel = d.mlg?.wheelPn || "—";
    const mlgTire  = d.mlg?.tirePn  || "—";

    const row = document.createElement("div");
    row.className = "wheelRow";

    row.innerHTML = \`
      <div class="cell">
        <div class="airTitle">\${esc(tail)}</div>
        <p class="airSub">\${esc(model)}</p>
        \${typeCode ? \`<p class="airSub" style="margin-top:4px;">\${esc(typeCode)}</p>\` : ""}
        \${bodyTag ? \`<span class="tag">\${esc(bodyTag)}</span>\` : ""}
      </div>

      <div class="cell">
        <div class="opLine">
          <div class="opItem"><span class="dot"></span><span>\${esc(opName)}</span></div>
          \${opCountry ? \`<div class="opItem"><span class="dot" style="background: rgba(124,58,237,.35)"></span><span>\${esc(opCountry)}</span></div>\` : ""}
        </div>
      </div>

      <div class="cell">
        <div class="pnBox">
          <div class="pnGroup">
            <div class="pnLabel">WHEEL P/N</div>
            <div class="pnValue nlg">\${esc(nlgWheel)}</div>
          </div>
          <div class="pnGroup">
            <div class="pnLabel">TIRE P/N</div>
            <div class="pnValue nlg">\${esc(nlgTire)}</div>
          </div>
        </div>
      </div>

      <div class="cell">
        <div class="pnBox">
          <div class="pnGroup">
            <div class="pnLabel">WHEEL P/N</div>
            <div class="pnValue mlg">\${esc(mlgWheel)}</div>
          </div>
          <div class="pnGroup">
            <div class="pnLabel">TIRE P/N</div>
            <div class="pnValue mlg">\${esc(mlgTire)}</div>
          </div>
        </div>
      </div>
    \`;

    return row;
  }

  function buildWheelSummary(d){
    const lines=[];
    lines.push("TAIL: " + (d.tail||"—"));
    if (d.aircraft?.model) lines.push("AIRCRAFT: " + d.aircraft.model);
    if (d.operator?.name) lines.push("OPERATOR: " + d.operator.name + (d.operator?.country ? " ("+d.operator.country+")" : ""));
    lines.push("");
    lines.push("NLG (NOSE):");
    lines.push("  WHEEL P/N: " + (d.nlg?.wheelPn || "—"));
    lines.push("  TIRE  P/N: " + (d.nlg?.tirePn || "—"));
    lines.push("");
    lines.push("MLG (MAIN):");
    lines.push("  WHEEL P/N: " + (d.mlg?.wheelPn || "—"));
    lines.push("  TIRE  P/N: " + (d.mlg?.tirePn || "—"));

    if (d.sources && d.sources.length) {
      lines.push("");
      lines.push("SOURCES:");
      d.sources.slice(0,5).forEach(s=>lines.push("  - " + (s.link||"")));
    }
    return lines.join("\\n");
  }

  async function searchWheel(){
    const t = tail.value.trim();
    if(!t){ setStatus(stWheel,"Kuyruk numarası girin.","err"); return; }

    btnWheel.disabled=true;
    clearWheel();
    setStatus(stWheel,"Aranıyor...","ok");

    try{
      const r = await fetch(apiUrl("/api/wheels?tail="+encodeURIComponent(t)));
      const data = await safeJson(r);
      if(!r.ok) throw new Error(data.error || "Wheel search başarısız.");

      wheelRows.innerHTML="";
      wheelRows.appendChild(makeWheelRow(data));
      wheelTable.style.display="block";
      wheelHint.style.display="none";

      wheelSummary.textContent = buildWheelSummary(data);

      setStatus(stWheel,"Tamamlandı.","ok");
    }catch(e){
      setStatus(stWheel, e.message||"Hata", "err");
      clearWheel();
    }finally{
      btnWheel.disabled=false;
    }
  }

  btnWheel.onclick=searchWheel;
  tail.addEventListener("keydown",(e)=>{ if(e.key==="Enter") searchWheel(); });

  copyWheel.onclick= async ()=>{
    try{ await navigator.clipboard.writeText(wheelSummary.textContent||""); setStatus(stWheel,"Panoya kopyalandı.","ok"); }
    catch{ setStatus(stWheel,"Kopyalama başarısız.","err"); }
  };

  // default
  navMsds.classList.add("active");
</script>
</body>
</html>`;

/* =========================
   /api/search (MSDS + MIL-PRF)
   - MSDS UI değişmedi
   - Kullanıcı MIL-PRF ile arama yapabilsin diye:
     sorguda MIL-PRF geçerse PDF aramasını SDS/MSDS'e zorlamıyoruz.
========================= */
async function handleSearch(request, env) {
  try {
    const u = new URL(request.url);
    const q = (u.searchParams.get("q") || "").trim();
    if (!q) return json({ error: "q parametresi gerekli." }, 400);

    assertSecrets(env);

    const qUpper = q.toUpperCase();
    const isMilQuery = qUpper.includes("MIL-PRF") || qUpper.includes("MIL PRF") || qUpper.includes("MILPRF");

    // PDF query:
    // - Normalde MSDS/SDS ağırlıklı
    // - MIL-PRF odaklı arama yazılırsa SDS/MSDS filtrelemeyelim
    const pdfQuery = isMilQuery
      ? `${q} filetype:pdf`
      : `${q} (MSDS OR SDS OR "Safety Data Sheet") filetype:pdf`;

    const pdfItems = await googleCse(env, pdfQuery, { fileTypePdf: true, num: 10 });

    const items = (pdfItems || [])
      .filter((it) => it.link)
      .map((it) => {
        const link = it.link;
        const directPdf = isLikelyDirectPdfLink(link, it.mime);
        return {
          title: it.title || "",
          link,
          snippet: it.snippet || "",
          host: it.displayLink || safeHost(link),
          mime: it.mime || "",
          directPdf,
        };
      })
      .sort((a, b) => Number(b.directPdf) - Number(a.directPdf))
      .slice(0, 10);

    // MIL-PRF codes (web)
    const milQuery = `${q} ("MIL-PRF" OR "MIL PRF" OR MILPRF)`;
    const milResults = await googleCse(env, milQuery, { fileTypePdf: false, num: 5 });

    const milFromSnippets = extractMilPrfFromSearchResults(milResults || []);
    let milPrf = milFromSnippets;

    if (milPrf.length === 0) {
      const topLinks = (milResults || []).map((r) => r.link).filter(Boolean).slice(0, 2);
      milPrf = await extractMilPrfByFetchingPages(topLinks);
    }

    return json({ items, milPrf: milPrf.slice(0, 10) });
  } catch (e) {
    return json({ error: e?.message || "Search error" }, 500);
  }
}

/* =========================
   /api/wheels (Tail -> CLEAN Wheel/Tire PNs)
   - Sadece NLG/MLG için Wheel P/N ve Tire P/N döndürür
   - UI screenshot-like
========================= */
async function handleWheels(request, env) {
  try {
    const u = new URL(request.url);
    const tail = (u.searchParams.get("tail") || "").trim();
    if (!tail) return json({ error: "tail parametresi gerekli." }, 400);

    assertSecrets(env);

    // We search for pages that likely contain wheel/tire PNs for the tail
    const q1 = `${tail} (NLG OR "nose gear" OR "nose wheel" OR burun) ("wheel p/n" OR "wheel pn" OR "rim p/n" OR "tire p/n" OR "tyre")`;
    const q2 = `${tail} (MLG OR "main gear" OR "main wheel" OR ana) ("wheel p/n" OR "wheel pn" OR "rim p/n" OR "tire p/n" OR "tyre")`;
    const q3 = `${tail} wheel tire "wheel p/n" "tire p/n"`;

    const itemsA = await googleCse(env, q1, { fileTypePdf: false, num: 8 });
    const itemsB = await googleCse(env, q2, { fileTypePdf: false, num: 8 });
    const itemsC = await googleCse(env, q3, { fileTypePdf: false, num: 8 });

    const merged = dedupeByLink([...(itemsA || []), ...(itemsB || []), ...(itemsC || [])]).slice(0, 10);

    // Build a strong text corpus from snippets + a few fetched pages
    const corpusParts = [];
    for (const it of merged) {
      corpusParts.push(`${it.title || ""}\n${it.snippet || ""}`);
    }

    const toFetch = merged.map((x) => x.link).filter(Boolean).slice(0, 4);
    for (const link of toFetch) {
      try {
        const safe = await assertSafeUrl(link);
        const html = await fetchHtmlText(safe);
        const cleaned = stripHtmlToText(html);
        corpusParts.push(cleaned);
      } catch {
        // ignore
      }
    }

    const corpus = corpusParts.join("\n\n");
    const extracted = extractWheelCardFromText(corpus);

    // Optional: try to detect aircraft model/operator from corpus too
    const aircraft = detectAircraftInfo(tail, corpus);
    const operator = detectOperatorInfo(corpus);

    const out = {
      tail,
      aircraft,
      operator,
      nlg: {
        wheelPn: extracted.nlg.wheelPn || "—",
        tirePn: extracted.nlg.tirePn || "—",
      },
      mlg: {
        wheelPn: extracted.mlg.wheelPn || "—",
        tirePn: extracted.mlg.tirePn || "—",
      },
      sources: merged.slice(0, 6).map((x) => ({
        title: x.title || "",
        link: x.link || "",
        host: x.displayLink || safeHost(x.link || ""),
      })),
    };

    return json(out);
  } catch (e) {
    return json({ error: e?.message || "Wheel search error" }, 500);
  }
}

function stripHtmlToText(html) {
  const s = String(html || "");
  // remove scripts/styles
  const noScripts = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  const text = noScripts
    .replace(/<\/(p|div|br|li|tr|td|th|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function extractWheelCardFromText(raw) {
  const text = normalizeForWheel(raw);

  // side anchors
  const nlgAnchors = ["NLG", "NOSE", "NOSE GEAR", "NOSE WHEEL", "BURUN"];
  const mlgAnchors = ["MLG", "MAIN", "MAIN GEAR", "MAIN WHEEL", "ANA"];

  const wheelLabel = ["WHEEL P/N", "WHEEL PN", "WHEEL P N", "RIM P/N", "RIM PN", "WHEEL PART NUMBER", "RIM PART NUMBER"];
  const tireLabel  = ["TIRE P/N", "TIRE PN", "TYRE P/N", "TYRE PN", "TIRE PART NUMBER", "TYRE PART NUMBER", "TIRE SIZE", "TYRE SIZE"];

  const wheelPnRe = /(?:WHEEL|RIM)\s*(?:P\/?N|PN|PART\s*NUMBER)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/gi;
  const tirePnRe  = /(?:TIRE|TYRE)\s*(?:P\/?N|PN|PART\s*NUMBER)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/gi;

  // Also accept common tire sizes (H40x14.5-19, 1050x395R16, 1409x530R23, etc.)
  const tireSizeRe = /\bH?\d{2,4}\s*[xX]\s*\d{2,4}(?:\.\d{1,2})?\s*(?:R?\s*)?-?\s*\d{2}\b/g;

  function bestForSide(anchors) {
    const anchorHits = findAnchorPositions(text, anchors);
    const w = pickClosestLabelValue(text, anchorHits, wheelLabel, wheelPnRe);
    let t = pickClosestLabelValue(text, anchorHits, tireLabel, tirePnRe);

    if (!t) {
      // If explicit Tire PN not present, pick a size close to anchor
      const size = pickClosestByRegex(text, anchorHits, tireSizeRe);
      if (size) t = size;
    }

    return { wheelPn: w || null, tirePn: t || null };
  }

  const nlg = bestForSide(nlgAnchors);
  const mlg = bestForSide(mlgAnchors);

  return { nlg, mlg };
}

function normalizeForWheel(s) {
  return String(s || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/WHEEL\s*P\s*\/?\s*N/gi, "WHEEL P/N")
    .replace(/TIRE\s*P\s*\/?\s*N/gi, "TIRE P/N")
    .replace(/TYRE\s*P\s*\/?\s*N/gi, "TIRE P/N")
    .toUpperCase();
}

function findAnchorPositions(textUpper, anchorsUpper) {
  const positions = [];
  for (const a of anchorsUpper) {
    const aU = a.toUpperCase();
    let idx = 0;
    while (true) {
      const j = textUpper.indexOf(aU, idx);
      if (j === -1) break;
      positions.push(j);
      idx = j + aU.length;
    }
  }
  positions.sort((a, b) => a - b);
  return positions.slice(0, 20);
}

function pickClosestLabelValue(textUpper, anchorPositions, labels, valueRegex) {
  const hits = [];

  // Find all valueRegex matches in the whole text with position
  let m;
  const re = new RegExp(valueRegex.source, valueRegex.flags);
  while ((m = re.exec(textUpper)) !== null) {
    const val = (m[1] || "").trim();
    if (!val) continue;

    // small sanity
    if (val.length < 5) continue;

    hits.push({ idx: m.index, val });
  }

  if (hits.length === 0) return null;

  // Score by:
  //  - closeness to anchor positions
  //  - also if the nearby window contains one of the labels
  let best = null;

  for (const h of hits) {
    const dist = minAbsDistance(h.idx, anchorPositions);
    const winStart = Math.max(0, h.idx - 140);
    const winEnd = Math.min(textUpper.length, h.idx + 140);
    const win = textUpper.slice(winStart, winEnd);

    let labelBoost = 0;
    for (const lab of labels) {
      if (win.includes(lab.toUpperCase())) { labelBoost = 250; break; }
    }

    const score = (labelBoost) - dist; // higher is better
    if (!best || score > best.score) best = { score, val: h.val };
  }

  return best ? best.val : null;
}

function pickClosestByRegex(textUpper, anchorPositions, regex) {
  const hits = [];
  const re = new RegExp(regex.source, regex.flags);
  let m;
  while ((m = re.exec(textUpper)) !== null) {
    const val = (m[0] || "").replace(/\s+/g, "");
    if (!val) continue;
    hits.push({ idx: m.index, val });
  }
  if (!hits.length) return null;

  let best = null;
  for (const h of hits) {
    const dist = minAbsDistance(h.idx, anchorPositions);
    const score = -dist;
    if (!best || score > best.score) best = { score, val: h.val };
  }
  return best ? best.val : null;
}

function minAbsDistance(x, positions) {
  if (!positions || !positions.length) return 999999;
  let best = 999999;
  for (const p of positions) {
    const d = Math.abs(x - p);
    if (d < best) best = d;
  }
  return best;
}

function detectAircraftInfo(tail, corpusRaw) {
  const text = String(corpusRaw || "");

  // Aircraft model pattern
  const m1 = text.match(/\bBoeing\s+7\d{2}(?:-\d{3})?\b/i)
        || text.match(/\bAirbus\s+A\d{3}(?:-\d{3})?\b/i)
        || text.match(/\bA\d{3}(?:-\d{3})?\b/i)
        || text.match(/\bB\d{3}(?:-\d{3})?\b/i);

  const model = m1 ? normalizeModel(m1[0]) : null;

  const typeCode = (() => {
    const m = text.match(/\b737NG\b/i) || text.match(/\bA330\b/i) || text.match(/\bA320\b/i) || text.match(/\bA321\b/i);
    return m ? m[0].toUpperCase() : null;
  })();

  const bodyType = (() => {
    const u = text.toUpperCase();
    if (u.includes("WIDE BODY") || u.includes("WIDEBODY")) return "WIDE BODY";
    if (u.includes("NARROW BODY") || u.includes("NARROWBODY")) return "NARROW BODY";
    return null;
  })();

  const family = model ? (model.startsWith("BOEING") ? "BOEING" : (model.startsWith("AIRBUS") ? "AIRBUS" : null)) : null;

  return {
    model: model || null,
    family,
    typeCode,
    bodyType,
  };
}

function normalizeModel(s) {
  const x = String(s || "").trim();
  if (/^A\d{3}/i.test(x)) return "Airbus " + x.toUpperCase();
  if (/^B\d{3}/i.test(x)) return x.toUpperCase();
  return x.replace(/\s+/g, " ").replace(/^\w/, (c)=>c.toUpperCase());
}

function detectOperatorInfo(corpusRaw) {
  const u = String(corpusRaw || "").toUpperCase();

  // Minimal & safe extraction: try to catch common patterns without hallucinating
  let name = null;
  if (u.includes("TURKISH AIRLINES") || u.includes("TÜRK HAVA YOLLARI") || u.includes("THY")) name = "Turkish Airlines";
  else if (u.includes("PEGASUS")) name = "Pegasus";
  else if (u.includes("SUNEXPRESS")) name = "SunExpress";

  let country = null;
  if (u.includes("TURKEY")) country = "Turkey";
  else if (u.includes("TÜRKIYE") || u.includes("TURKIYE")) country = "Turkey";

  return { name, country };
}

/* =========================
   PDF Extract (/api/extract)  (unchanged logic)
========================= */
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const extractCache = new Map();

async function handleExtract(request) {
  try {
    if (request.method !== "POST") return json({ error: "POST gerekli." }, 405);

    const body = await request.json().catch(() => null);
    const pdfUrl0 = String(body?.pdfUrl || "").trim();
    if (!pdfUrl0) return json({ error: "pdfUrl gerekli." }, 400);

    const cached = cacheGet(extractCache, pdfUrl0);
    if (cached) return json(cached);

    const safe0 = await assertSafeUrl(pdfUrl0);
    const resolved = resolvePdfUrl(safe0);

    const pdfU8 = await fetchPdfAsUint8(resolved);

    let doc;
    try {
      doc = await getDocument({ data: pdfU8, useSystemFonts: true }).promise;
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes("invalid pdf structure")) {
        throw new Error(
          "Invalid PDF structure: Seçilen link gerçek PDF olmayabilir (viewer/HTML döndürüyor olabilir) veya PDF bozuk olabilir. " +
          "Arama listesindeki 'direct' etiketli PDF’leri tercih edin."
        );
      }
      throw e;
    }

    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const pageText = await extractPageTextWithLines(page);
      fullText += pageText + "\n";
    }

    const { section7, section14 } = parseSections(fullText);

    const out = {
      section7: finalizeForDisplay(section7),
      section14: finalizeForDisplay(section14),
      pages: doc.numPages,
    };

    cacheSet(extractCache, pdfUrl0, out);
    return json(out);
  } catch (e) {
    const msg =
      e?.name === "AbortError"
        ? "Zaman aşımı: PDF indirilemedi."
        : e?.message || "Extract error";
    return json({ error: msg }, 500);
  }
}

async function extractPageTextWithLines(page) {
  const tc = await page.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });

  const groups = new Map();
  const tol = 2.0;
  for (const it of tc.items || []) {
    const str = String(it.str || "");
    if (!str.trim()) continue;

    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4] ?? 0;
    const y = tr[5] ?? 0;

    let yKey = null;
    for (const k of groups.keys()) {
      if (Math.abs(k - y) <= tol) {
        yKey = k;
        break;
      }
    }
    if (yKey === null) yKey = y;

    if (!groups.has(yKey)) groups.set(yKey, []);
    groups.get(yKey).push({
      x,
      y: yKey,
      str,
      w: typeof it.width === "number" ? it.width : null,
    });
  }

  const ys = Array.from(groups.keys()).sort((a, b) => b - a);

  const lines = [];
  for (const y of ys) {
    const items = groups.get(y).sort((a, b) => a.x - b.x);

    let line = "";
    let lastEnd = null;
    for (const it of items) {
      const token = it.str;

      if (!line) {
        line = token;
        lastEnd = it.w != null ? it.x + it.w : it.x + token.length * 3;
        continue;
      }

      const curX = it.x;
      const gap = lastEnd != null ? (curX - lastEnd) : 0;

      const needsSpace =
        gap > 2.5 &&
        !/^[,.;:)\]]/.test(token) &&
        !/[([/]\s*$/.test(line);

      line += (needsSpace ? " " : "") + token;
      lastEnd = it.w != null ? it.x + it.w : it.x + token.length * 3;
    }

    line = deSpaceLettersInLine(line);
    lines.push(line.trimEnd());
  }

  return lines.join("\n").trim();
}

function deSpaceLettersInLine(line) {
  const tokens = line.split(/\s+/);
  const out = [];
  let i = 0;

  const isLetter = (s) => /^[A-Za-z]$/.test(s);

  while (i < tokens.length) {
    if (isLetter(tokens[i])) {
      let j = i;
      let seq = "";
      let count = 0;
      while (j < tokens.length && isLetter(tokens[j])) {
        seq += tokens[j];
        count++;
        j++;
      }
      if (count >= 4) out.push(seq);
      else for (let k = i; k < j; k++) out.push(tokens[k]);
      i = j;
      continue;
    }
    out.push(tokens[i]);
    i++;
  }

  return out.join(" ");
}

function resolvePdfUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // Google Drive "file/d/<id>" -> uc download
    if (host.includes("drive.google.com")) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)\//);
      if (m && m[1]) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(m[1])}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

async function fetchPdfAsUint8(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);

  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MSDS-Extractor/2.1)",
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
      },
    });

    if (!resp.ok) throw new Error(`PDF indirilemedi (HTTP ${resp.status}).`);

    const len = Number(resp.headers.get("content-length") || "0");
    if (len && len > MAX_PDF_BYTES) throw new Error("PDF çok büyük (content-length).");

    const ab = await resp.arrayBuffer();
    if (ab.byteLength > MAX_PDF_BYTES) throw new Error("PDF çok büyük (indirilen veri).");

    const u8 = new Uint8Array(ab);

    if (!startsWithPdfHeader(u8)) {
      const headTxt = new TextDecoder("latin1").decode(u8.slice(0, Math.min(u8.length, 512)));
      const snippet = headTxt.replace(/\s+/g, " ").slice(0, 220);
      throw new Error(`Bu link PDF döndürmüyor (başlık %PDF- ile başlamıyor). İlk içerik: "${snippet}".`);
    }
    if (!hasPdfEof(u8)) {
      throw new Error("PDF doğrulama başarısız: %%EOF bulunamadı. PDF viewer/HTML döndürüyor olabilir.");
    }

    return u8;
  } finally {
    clearTimeout(t);
  }
}

function startsWithPdfHeader(u8) {
  let i = 0;
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) i = 3;
  while (i < u8.length && (u8[i] === 0x20 || u8[i] === 0x0a || u8[i] === 0x0d || u8[i] === 0x09)) i++;

  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let k = 0; k < sig.length; k++) {
    if (i + k >= u8.length) return false;
    if (u8[i + k] !== sig[k]) return false;
  }
  return true;
}

function hasPdfEof(u8) {
  const tailStart = Math.max(0, u8.length - 16384);
  const tail = new TextDecoder("latin1").decode(u8.slice(tailStart));
  return tail.includes("%%EOF");
}

/* =========================
   Section extraction (MSDS)  (unchanged)
========================= */
function normalizeText(text) {
  let t = String(text || "");
  t = t.replace(/\r\n?/g, "\n");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");

  t = t.replace(/S\s+E\s+C\s+T\s+I\s+O\s+N/gi, "SECTION");
  t = t.replace(/H\s+A\s+N\s+D\s+L\s+I\s+N\s+G/gi, "Handling");
  t = t.replace(/S\s+T\s+O\s+R\s+A\s+G\s+E/gi, "Storage");
  t = t.replace(/T\s+R\s+A\s+N\s+S\s+P\s+O\s+R\s+T/gi, "Transport");
  t = t.replace(/S\s+H\s+I\s+P\s+P\s+I\s+N\s+G/gi, "Shipping");

  return t.trim();
}

function parseSections(rawText) {
  const text = normalizeText(rawText);
  const upper = text.toUpperCase();

  const headingRe =
    /(^|\n)\s*(?:SECTION|BÖLÜM|BOLUM|CHAPTER)?\s*(\d{1,2})\s*[:.)-]?\s*([^\n]{0,220})/gim;

  const headings = [];
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    const secNum = parseInt(m[2], 10);
    if (!Number.isFinite(secNum) || secNum < 1 || secNum > 16) continue;

    const idx = m.index + (m[1] ? m[1].length : 0);
    const title = (m[3] || "").trim();

    if (secNum === 7) {
      const tt = title.toUpperCase();
      const ok = /HANDLING|STORAGE/.test(tt) || /HANDLING AND STORAGE/.test(tt);
      if (!ok) continue;
    }
    if (secNum === 14) {
      const tt = title.toUpperCase();
      const ok = /TRANSPORT|TRANSPORTATION|SHIPPING|UN NUMBER|IATA|IMDG|ADR/.test(tt);
      if (!ok) continue;
    }

    headings.push({ sec: secNum, idx, title });
  }
  headings.sort((a, b) => a.idx - b.idx);

  function sliceByHeading(secNum, nextSecNum) {
    const start = headings.find((h) => h.sec === secNum);
    if (!start) return null;

    const after = headings.filter((h) => h.idx > start.idx);
    let end = after.find((h) => h.sec === nextSecNum);
    if (!end) end = after[0] || null;

    const endIdx = end ? end.idx : text.length;
    return cleanSection(text.slice(start.idx, endIdx));
  }

  let section7 = sliceByHeading(7, 8);
  let section14 = sliceByHeading(14, 15);

  if (!section7) section7 = sliceByKeywords(upper, text, ["SECTION 7", "HANDLING AND STORAGE", "HANDLING & STORAGE"], ["SECTION 8", "EXPOSURE CONTROLS", "PERSONAL PROTECTION"]);
  if (!section14) section14 = sliceByKeywords(upper, text, ["SECTION 14", "TRANSPORT INFORMATION", "TRANSPORTATION INFORMATION", "SHIPPING INFORMATION"], ["SECTION 15", "REGULATORY INFORMATION", "SECTION 16", "OTHER INFORMATION"]);
  if (!section14) section14 = sliceByKeywords(upper, text, ["UN NUMBER", "ADR", "IMDG", "IATA", "ICAO"], ["SECTION 15", "REGULATORY INFORMATION", "SECTION 16", "OTHER INFORMATION"]);

  return {
    section7: section7 || "Handling and storage (Section 7) bulunamadı. (Belge görüntü/tablo ağırlıklı olabilir.)",
    section14: section14 || "Transport information (Section 14) bulunamadı. (Belge görüntü/tablo ağırlıklı olabilir.)",
  };
}

function sliceByKeywords(upperAll, textAll, startKeys, stopKeys) {
  let startIdx = -1;
  for (const k of startKeys) {
    const i = upperAll.indexOf(k);
    if (i !== -1 && (startIdx === -1 || i < startIdx)) startIdx = i;
  }
  if (startIdx === -1) return null;

  const upperAfter = upperAll.slice(startIdx);
  let endRel = -1;
  for (const s of stopKeys) {
    const j = upperAfter.indexOf(s);
    if (j !== -1 && (endRel === -1 || j < endRel)) endRel = j;
  }

  const endIdx = endRel === -1 ? textAll.length : startIdx + endRel;
  return cleanSection(textAll.slice(startIdx, endIdx));
}

function cleanSection(section) {
  const lines = section.split("\n").map((l) => l.trimEnd());

  const filtered = [];
  for (const line0 of lines) {
    const line = line0.trim();
    if (!line) { filtered.push(""); continue; }
    if (looksLikeHeaderFooter(line)) continue;
    filtered.push(line0);
  }

  const counts = new Map();
  for (const l of filtered) {
    const key = l.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const out = filtered.filter((l) => {
    const key = l.trim();
    if (!key) return true;
    const c = counts.get(key) || 0;
    if (c >= 3 && key.length < 120) return false;
    return true;
  });

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function looksLikeHeaderFooter(line) {
  const hasPage = /\/\s*\d+\s*$/.test(line) || /\b\d+\s*\/\s*\d+\b/.test(line);
  const hasMsds = /MSDS/i.test(line) || /(M\s*S\s*D\s*S)/i.test(line);
  const tokens = line.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const singleLetters = tokens.filter((t) => /^[A-Za-z]$/.test(t)).length;
  const ratio = singleLetters / tokens.length;
  return (hasPage && (hasMsds || ratio > 0.45)) || (hasMsds && ratio > 0.55);
}

function finalizeForDisplay(t) {
  let s = String(t || "");
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/([A-Za-z])-\n([A-Za-z])/g, "$1$2");
  s = s.replace(/\s*:\s*/g, ": ");
  s = s.replace(/\s*;\s*/g, "; ");
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/* =========================
   Google CSE + MIL-PRF
========================= */
function assertSecrets(env) {
  if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
    throw new Error("Worker secrets eksik: GOOGLE_API_KEY / GOOGLE_CX.");
  }
}

async function googleCse(env, query, opts) {
  const { fileTypePdf, num } = opts || {};
  const base =
    "https://www.googleapis.com/customsearch/v1" +
    `?key=${encodeURIComponent(env.GOOGLE_API_KEY)}` +
    `&cx=${encodeURIComponent(env.GOOGLE_CX)}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=${encodeURIComponent(String(Math.min(Math.max(num || 5, 1), 10)))}` +
    `&safe=off`;

  const url = fileTypePdf ? (base + `&fileType=pdf`) : base;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Google API hata: ${resp.status}`);
  }
  return data.items || [];
}

function extractMilPrfFromSearchResults(items) {
  const found = new Set();
  for (const it of items || []) {
    const t = `${it.title || ""} ${it.snippet || ""}`.toUpperCase();
    for (const code of extractMilPrfCodes(t)) found.add(code);
  }
  return Array.from(found);
}

async function extractMilPrfByFetchingPages(links) {
  const found = new Set();
  for (const url of links || []) {
    try {
      const safe = await assertSafeUrl(url);
      const text = await fetchHtmlText(safe);
      const upper = text.toUpperCase();
      for (const code of extractMilPrfCodes(upper)) found.add(code);
      if (found.size >= 6) break;
    } catch {
      // ignore
    }
  }
  return Array.from(found);
}

function extractMilPrfCodes(upperText) {
  const out = new Set();
  const re = /\bMIL\s*[- ]?\s*PRF\s*[- ]?\s*([0-9]{3,6}[A-Z0-9/-]{0,12})\b/g;
  let m;
  while ((m = re.exec(upperText)) !== null) {
    const code = `MIL-PRF-${m[1]}`.replace(/--+/g, "-");
    out.add(code);
  }
  return Array.from(out);
}

function isLikelyDirectPdfLink(link, mime) {
  const l = String(link || "").toLowerCase();
  const m = String(mime || "").toLowerCase();
  if (m.includes("pdf")) return true;
  if (l.endsWith(".pdf")) return true;
  if (l.includes(".pdf?")) return true;
  if (l.includes("/uc?") && l.includes("export=download")) return true;
  return false;
}

function dedupeByLink(items) {
  const map = new Map();
  for (const it of items || []) {
    const k = it?.link || "";
    if (!k) continue;
    if (!map.has(k)) map.set(k, it);
  }
  return Array.from(map.values());
}

async function fetchHtmlText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Depot-Tools/2.1)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!resp.ok) throw new Error("HTML fetch failed");
    const ab = await resp.arrayBuffer();
    const max = 2 * 1024 * 1024;
    const u8 = new Uint8Array(ab.slice(0, Math.min(ab.byteLength, max)));
    return new TextDecoder("utf-8", { fatal: false }).decode(u8);
  } finally {
    clearTimeout(t);
  }
}

/* =========================
   SSRF guard
========================= */
async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Geçersiz URL."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Sadece http/https URL.");

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("Güvenlik: localhost engellendi.");

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map((n) => parseInt(n, 10));
    const isPrivate =
      a === 127 ||
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254);
    if (isPrivate) throw new Error("Güvenlik: private IP engellendi.");
  }
  return u.toString();
}

/* =========================
   Helpers: response + cache + CORS
========================= */
function htmlResponse(html) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeHost(u) {
  try { return new URL(u).hostname; } catch { return ""; }
}

function cacheGet(map, key) {
  const it = map.get(key);
  if (!it) return null;
  if (Date.now() > it.expiresAt) {
    map.delete(key);
    return null;
  }
  return it.value;
}

function cacheSet(map, key, value, ttlMs = CACHE_TTL_MS) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function withCors(promiseResponse) {
  const resp = await promiseResponse;
  const h = new Headers(resp.headers);
  const ch = corsHeaders();
  for (const k of Object.keys(ch)) h.set(k, ch[k]);
  return new Response(resp.body, { status: resp.status, headers: h });
}
