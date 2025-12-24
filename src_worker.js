export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Routing
    if (url.pathname === "/") return htmlResponse(UI_HTML);
    if (url.pathname === "/api/search") return handleSearch(request, env);
    if (url.pathname === "/api/extract") return handleExtract(request, env);

    return new Response("Not Found", { status: 404 });
  },
};

// -------------------------
// UI (single-page)
// -------------------------
const UI_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>MSDS Section Extractor</title>
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
      position:sticky; top:0; z-index:10;
      backdrop-filter: blur(10px);
      background: rgba(255,253,248,.70);
      border-bottom:1px solid rgba(20,70,110,0.10);
    }
    .topbar__inner{
      max-width:1100px; margin:0 auto; padding:14px 20px;
      display:flex; align-items:center; justify-content:space-between; gap:12px;
    }
    .brand h1{margin:0; font-size:18px; letter-spacing:.2px}
    .brand p{margin:2px 0 0; color:var(--muted); font-size:13px; line-height:1.35}
    .by{font-size:8pt; color: rgba(22,50,79,.70); white-space:nowrap; user-select:none}
    .wrap{max-width:1100px; margin:0 auto; padding:18px 20px 44px}
    .grid{display:grid; grid-template-columns:1.1fr .9fr; gap:16px}
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
      font-weight:800; cursor:pointer; color:var(--ink);
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      box-shadow:0 10px 18px rgba(74,168,216,.25);
    }
    button:disabled{opacity:.6; cursor:not-allowed; box-shadow:none}
    .ghost{
      background:transparent; border:1px solid rgba(20,70,110,0.18);
      color:var(--text); box-shadow:none; font-weight:800;
    }
    .status{margin-top:10px; min-height:18px; font-size:13px}
    .status.ok{color:var(--success)} .status.err{color:var(--danger)}
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
      font-weight:800; font-size:12px;
    }
    .actions{display:flex; flex-direction:column; gap:8px; min-width:160px}
    .linkbtn{
      display:inline-flex; justify-content:center; align-items:center;
      text-decoration:none; border-radius:12px;
      padding:10px 12px; border:1px solid rgba(20,70,110,0.18);
      color:var(--text); background:#fffdfa; font-weight:900;
    }
    .sectionTitle{display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px}
    .sectionTitle h3{margin:0; font-size:14px}
    .subinfo{color:var(--muted); font-size:12.5px}
    pre{
      margin:0; border:1px solid rgba(20,70,110,0.16);
      border-radius:14px; padding:12px; background:#fffdfa;
      white-space:pre-wrap; line-height:1.55; min-height:170px; font-size:13px;
    }
    .hint{margin:6px 0 0; color:var(--muted); font-size:13px; line-height:1.45}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar__inner">
      <div class="brand">
        <h1>MSDS Section Extractor</h1>
        <p>Parça numarası yaz → PDF MSDS bul → Section 7 & Section 14 göster</p>
      </div>
      <div class="by">by Furkan ATABEY</div>
    </div>
  </div>

  <div class="wrap">
    <div class="grid">
      <section class="card">
        <h2 style="margin:0 0 10px; font-size:16px">Arama</h2>
        <div class="row">
          <input id="q" type="text" placeholder="Örn: RTV 102 MSDS" />
          <button id="btn">Ara</button>
        </div>
        <p class="hint">
          Bu sürümde arama ve PDF işleme sunucu tarafında yapılır (Cloudflare Worker). Böylece CORS hatası olmaz.
        </p>
        <div id="st" class="status"></div>
        <div id="res" class="results"></div>
      </section>

      <section class="card">
        <div class="sectionTitle">
          <h3>Section 7: Handling and Storage</h3>
          <button class="ghost" id="c7">Kopyala</button>
        </div>
        <div class="subinfo" id="info">Seçili PDF yok.</div>
        <pre id="s7">Bir PDF seçin (Bölümleri Ayıkla).</pre>

        <div style="height:14px"></div>

        <div class="sectionTitle">
          <h3>Section 14: Transport Information</h3>
          <button class="ghost" id="c14">Kopyala</button>
        </div>
        <div class="subinfo" id="meta"></div>
        <pre id="s14">Bir PDF seçin (Bölümleri Ayıkla).</pre>
      </section>
    </div>
  </div>

<script>
  const $ = (id)=>document.getElementById(id);
  const st = $("st"), res = $("res"), btn=$("btn"), q=$("q");
  const s7=$("s7"), s14=$("s14"), info=$("info"), meta=$("meta");

  function setStatus(msg, type=""){
    st.textContent = msg||"";
    st.className = "status " + (type==="err"?"err": type==="ok"?"ok":"");
  }

  async function search(){
    const term = q.value.trim();
    if(!term){ setStatus("Parça numarası / arama terimi girin.", "err"); return; }
    btn.disabled=true;
    res.innerHTML="";
    setStatus("Aranıyor...","ok");
    try{
      const r = await fetch("/api/search?q="+encodeURIComponent(term));
      const data = await r.json();
      if(!r.ok) throw new Error(data.error || "Arama başarısız.");
      render(data.items||[]);
      setStatus((data.items||[]).length + " PDF bulundu. Birini seçip ayıklayın.","ok");
    }catch(e){
      setStatus(e.message||"Hata","err");
    }finally{
      btn.disabled=false;
    }
  }

  function render(items){
    res.innerHTML="";
    if(!items.length){
      res.innerHTML = '<div class="hint">Sonuç bulunamadı.</div>';
      return;
    }
    for(const it of items){
      const d=document.createElement("div");
      d.className="result";
      const left=document.createElement("div");
      left.innerHTML = '<h3></h3><div class="meta"><span class="pill"></span><span class="sn"></span></div>';
      left.querySelector("h3").textContent = it.title || "Adsız PDF";
      left.querySelector(".pill").textContent = it.host || "";
      left.querySelector(".sn").textContent = it.snippet || "";

      const act=document.createElement("div");
      act.className="actions";
      const b=document.createElement("button");
      b.textContent="Bölümleri Ayıkla";
      b.onclick=()=>extract(it);
      const a=document.createElement("a");
      a.className="linkbtn"; a.href=it.link; a.target="_blank"; a.rel="noopener noreferrer"; a.textContent="PDF Aç";
      act.appendChild(b); act.appendChild(a);

      d.appendChild(left); d.appendChild(act);
      res.appendChild(d);
    }
  }

  async function extract(it){
    info.textContent = (it.title||"Adsız PDF") + " — " + (it.host||"");
    meta.textContent = "İşleniyor...";
    s7.textContent="Yükleniyor...";
    s14.textContent="Yükleniyor...";
    try{
      const r = await fetch("/api/extract", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ pdfUrl: it.link })
      });
      const data = await r.json();
      if(!r.ok) throw new Error(data.error || "Extract başarısız.");
      s7.textContent = data.section7 || "Bulunamadı";
      s14.textContent = data.section14 || "Bulunamadı";
      meta.textContent = "Sayfa: " + (data.pages ?? "?") + " | Kaynak: " + (it.host||"");
    }catch(e){
      meta.textContent = "";
      s7.textContent = "Hata: " + (e.message||"");
      s14.textContent = "Hata: " + (e.message||"");
    }
  }

  async function copyText(t){
    try{ await navigator.clipboard.writeText(t||""); setStatus("Panoya kopyalandı.","ok"); }
    catch{ setStatus("Kopyalama başarısız.","err"); }
  }
  $("c7").onclick=()=>copyText(s7.textContent);
  $("c14").onclick=()=>copyText(s14.textContent);

  btn.onclick=search;
  q.addEventListener("keydown",(e)=>{ if(e.key==="Enter") search(); });
</script>
</body>
</html>`;

// -------------------------
// /api/search
// -------------------------
async function handleSearch(request, env) {
  try {
    const u = new URL(request.url);
    const q = (u.searchParams.get("q") || "").trim();
    if (!q) return json({ error: "q parametresi gerekli." }, 400);

    if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
      return json({ error: "Worker secrets eksik: GOOGLE_API_KEY / GOOGLE_CX." }, 500);
    }

    const query = `${q} (MSDS OR SDS) filetype:pdf`;
    const apiUrl =
      "https://www.googleapis.com/customsearch/v1" +
      `?key=${encodeURIComponent(env.GOOGLE_API_KEY)}` +
      `&cx=${encodeURIComponent(env.GOOGLE_CX)}` +
      `&q=${encodeURIComponent(query)}` +
      `&fileType=pdf&num=10&safe=off`;

    const resp = await fetch(apiUrl);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: data?.error?.message || `Google API hata: ${resp.status}` }, 502);
    }

    const items = (data.items || [])
      .filter((it) => it.link && (String(it.mime || "").includes("pdf") || it.link.toLowerCase().includes(".pdf")))
      .map((it) => ({
        title: it.title || "",
        link: it.link,
        snippet: it.snippet || "",
        host: it.displayLink || safeHost(it.link),
      }));

    return json({ items });
  } catch (e) {
    return json({ error: e?.message || "Search error" }, 500);
  }
}

// -------------------------
// /api/extract
// -------------------------
const cache = new Map(); // url -> { expiresAt, value }
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

async function handleExtract(request, env) {
  try {
    if (request.method !== "POST") return json({ error: "POST gerekli." }, 405);

    const body = await request.json().catch(() => null);
    const pdfUrl = String(body?.pdfUrl || "").trim();
    if (!pdfUrl) return json({ error: "pdfUrl gerekli." }, 400);

    // cache
    const cached = cacheGet(pdfUrl);
    if (cached) return json(cached);

    const safe = await assertSafeUrl(pdfUrl);
    const pdfBuf = await fetchPdfAsUint8(safe);

    // pdf parse (edge compatible)
    const { getDocument } = await import("pdfjs-serverless");

    const doc = await getDocument({ data: pdfBuf, useSystemFonts: true }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map((x) => x.str).join(" ") + "\n";
    }

    const { section7, section14 } = parseSections(text);

    const out = { section7, section14, pages: doc.numPages };
    cacheSet(pdfUrl, out);
    return json(out);
  } catch (e) {
    const msg =
      e?.name === "AbortError" ? "Zaman aşımı: PDF indirilemedi." : (e?.message || "Extract error");
    return json({ error: msg }, 500);
  }
}

// -------------------------
// Utilities
// -------------------------
function htmlResponse(html) {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
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

function cacheGet(key) {
  const it = cache.get(key);
  if (!it) return null;
  if (Date.now() > it.expiresAt) {
    cache.delete(key);
    return null;
  }
  return it.value;
}
function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchPdfAsUint8(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`PDF indirilemedi (HTTP ${resp.status}).`);

    const len = Number(resp.headers.get("content-length") || "0");
    if (len && len > MAX_PDF_BYTES) throw new Error("PDF çok büyük (content-length).");

    const ab = await resp.arrayBuffer();
    if (ab.byteLength > MAX_PDF_BYTES) throw new Error("PDF çok büyük (indirilen veri).");

    return new Uint8Array(ab);
  } finally {
    clearTimeout(t);
  }
}

// --- Basic SSRF guard (minimal) ---
async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Geçersiz URL."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Sadece http/https URL.");

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("Güvenlik: localhost engellendi.");

  // Cloudflare Workers ortamında ileri seviye DNS/IP doğrulaması kurgulanabilir,
  // ancak burada minimal güvenlik: private IP'lere doğrudan URL verilmesini engelle.
  // (Üretimde: allowlist domain yaklaşımı önerilir.)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    // raw IPv4
    const parts = host.split(".").map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) {
      throw new Error("Güvenlik: private IP engellendi.");
    }
  }
  return u.toString();
}

// --- Section parsing ---
function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findFirst(text, regexes) {
  let best = null;
  for (const re of regexes) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      if (!best || m.index < best.index) best = { match: m[0], index: m.index };
    }
  }
  return best;
}

function cleanSection(section) {
  const lines = section.split("\n").map((l) => l.trim());
  const counts = new Map();
  for (const l of lines) {
    if (!l) continue;
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  const filtered = lines.filter((l) => {
    if (!l) return false;
    const c = counts.get(l) || 0;
    if (c >= 3 && l.length < 120) return false;
    return true;
  });
  return filtered.join("\n").trim();
}

function extractSection(text, startRegexes, endRegexes, fallbackRegexes = []) {
  const start = findFirst(text, startRegexes) || findFirst(text, fallbackRegexes);
  if (!start) return null;

  const from = start.index;
  const afterStart = text.slice(from + start.match.length);
  const end = findFirst(afterStart, endRegexes);
  const to = end ? (from + start.match.length + end.index) : text.length;

  return cleanSection(text.slice(from, to));
}

function parseSections(rawText) {
  const text = normalizeText(rawText);

  const s7Start = [
    /(^|\n)\s*SECTION\s*7\b.*$/im,
    /(^|\n)\s*7\.\s*(HANDLING|Handling)\b.*$/im,
    /(^|\n)\s*7\)\s*(HANDLING|Handling)\b.*$/im,
  ];
  const s7Fallback = [/(^|\n).{0,30}HANDLING AND STORAGE\b.*$/im];
  const s7End = [
    /(^|\n)\s*SECTION\s*8\b.*$/im,
    /(^|\n)\s*8\.\s*/im,
    /(^|\n)\s*8\)\s*/im,
  ];

  const s14Start = [
    /(^|\n)\s*SECTION\s*14\b.*$/im,
    /(^|\n)\s*14\.\s*(TRANSPORT|Transport)\b.*$/im,
    /(^|\n)\s*14\)\s*(TRANSPORT|Transport)\b.*$/im,
  ];
  const s14Fallback = [/(^|\n).{0,30}TRANSPORT INFORMATION\b.*$/im];
  const s14End = [
    /(^|\n)\s*SECTION\s*15\b.*$/im,
    /(^|\n)\s*15\.\s*/im,
    /(^|\n)\s*15\)\s*/im,
  ];

  const section7 = extractSection(text, s7Start, s7End, s7Fallback);
  const section14 = extractSection(text, s14Start, s14End, s14Fallback);

  return {
    section7: section7 || "Section 7 bulunamadı (format farklı olabilir).",
    section14: section14 || "Section 14 bulunamadı (format farklı olabilir).",
  };
}