// src/worker.js
// Cloudflare Workers (Module Worker) + embedded single-page UI
// - Google Custom Search (server-side) -> list PDF links
// - Server-side PDF fetch + robust text extraction
// - Extract "Handling and storage" and "Transport information"
// - ALSO extract MIL-PRF codes from PDF text and show in UI

import { getDocument } from "pdfjs-serverless";

/* =========================
   Worker Entrypoint
========================= */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") return htmlResponse(UI_HTML);

    if (url.pathname === "/api/search") {
      return withCors(handleSearch(request, env));
    }

    if (url.pathname === "/api/extract") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      return withCors(handleExtract(request, env));
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

    .sectionTitle{display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px}
    .sectionTitle h3{margin:0; font-size:14px}
    .subinfo{color:var(--muted); font-size:12.5px}

    .kv{
      display:grid;
      grid-template-columns: 140px 1fr;
      gap: 8px 10px;
      margin: 8px 0 10px;
      padding: 10px 12px;
      border: 1px solid rgba(20,70,110,0.14);
      border-radius: 14px;
      background: rgba(255,253,248,.65);
      font-size: 13px;
      line-height: 1.45;
    }
    .kv .k{color: rgba(22,50,79,.72); font-weight: 900}
    .kv .v{color: rgba(22,50,79,.92); word-break: break-word}

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
    .hint{margin:6px 0 0; color:var(--muted); font-size:13px; line-height:1.45}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar__inner">
      <div class="brand">
        <h1>MSDS Section Extractor</h1>
        <p>Parça no yaz → PDF bul → Handling & Storage + Transport Information + MIL-PRF kodunu çıkar</p>
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
          Arama ve PDF işleme sunucuda yapılır. “direct” etiketli linkler daha çok gerçek PDF olur.
          Viewer/HTML dönen linklerde PDF bozulabilir.
        </p>
        <div id="st" class="status"></div>
        <div id="res" class="results"></div>
      </section>

      <section class="card">
        <div class="sectionTitle">
          <h3>Handling and storage (Section 7)</h3>
          <button class="ghost" id="c7">Kopyala</button>
        </div>

        <div class="subinfo" id="info">Seçili PDF yok.</div>

        <div class="kv">
          <div class="k">MIL-PRF</div>
          <div class="v" id="mil">Not found</div>

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

<script>
  const $ = (id)=>document.getElementById(id);
  const st = $("st"), res = $("res"), btn=$("btn"), q=$("q");
  const s7=$("s7"), s14=$("s14"), info=$("info"), meta=$("meta");
  const mil=$("mil"), pg=$("pg"), src=$("src");

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
      setStatus((data.items||[]).length + " sonuç bulundu. 'direct' olanları öncelikle deneyin.","ok");
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
      left.querySelector(".pill").textContent = (it.host || "") + (it.directPdf ? " • direct" : " • viewer");
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
    mil.textContent = "Searching...";
    pg.textContent = "—";
    src.textContent = it.host || "—";

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
      mil.textContent = (data.milPrf && data.milPrf.length) ? data.milPrf.join(", ") : "Not found";
      pg.textContent = (data.pages ?? "—");
      src.textContent = it.host || "—";
      meta.textContent = "Tamamlandı.";
    }catch(e){
      meta.textContent = "";
      s7.textContent = "Hata: " + (e.message||"");
      s14.textContent = "Hata: " + (e.message||"");
      mil.textContent = "Not found";
      pg.textContent = "—";
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

/* =========================
   /api/search
========================= */
async function handleSearch(request, env) {
  try {
    const u = new URL(request.url);
    const q = (u.searchParams.get("q") || "").trim();
    if (!q) return json({ error: "q parametresi gerekli." }, 400);

    if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
      return json({ error: "Worker secrets eksik: GOOGLE_API_KEY / GOOGLE_CX." }, 500);
    }

    const query = `${q} (MSDS OR SDS OR "Safety Data Sheet") filetype:pdf`;

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

    const raw = (data.items || [])
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
      });

    raw.sort((a, b) => Number(b.directPdf) - Number(a.directPdf));
    return json({ items: raw.slice(0, 10) });
  } catch (e) {
    return json({ error: e?.message || "Search error" }, 500);
  }
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

/* =========================
   /api/extract
========================= */
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25000;

const extractCache = new Map();

async function handleExtract(request, env) {
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
          "Invalid PDF structure: Seçilen link gerçek PDF olmayabilir (viewer/HTML sayfası döndürüyor olabilir) veya PDF bozuk olabilir. " +
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
    const milPrf = extractMilPrf(fullText);

    const out = {
      section7: finalizeForDisplay(section7),
      section14: finalizeForDisplay(section14),
      milPrf,
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

/* =========================
   MIL-PRF extractor
   Captures variants:
   - MIL-PRF-81733
   - MIL PRF 680
   - MILPRF-5606
   - MIL-PRF-32033/1 (etc)
========================= */
function extractMilPrf(text) {
  const t = String(text || "");
  const re = /\bMIL\s*-?\s*PRF\s*-?\s*([A-Z0-9]{2,}(?:[-/][A-Z0-9]{1,})*)\b/gi;

  const found = new Set();
  let m;
  while ((m = re.exec(t)) !== null) {
    const code = `MIL-PRF-${String(m[1]).toUpperCase()}`.replace(/--+/g, "-");
    // Basic sanity: must include at least one digit
    if (/\d/.test(code)) found.add(code);
  }

  return Array.from(found).slice(0, 10);
}

/* =========================
   PDF text extraction (line reconstruction)
========================= */
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

/* =========================
   URL resolve (Google Drive view => direct download)
========================= */
function resolvePdfUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

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

/* =========================
   Fetch PDF + validation
========================= */
async function fetchPdfAsUint8(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MSDS-Extractor/1.7)",
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
      throw new Error(
        `Bu link PDF döndürmüyor (başlık %PDF- ile başlamıyor). İlk içerik: "${snippet}".`
      );
    }

    if (!hasPdfEof(u8)) {
      throw new Error(
        "PDF doğrulama başarısız: %%EOF bulunamadı. Bu link büyük ihtimalle PDF viewer/HTML döndürüyor veya içerik bozuk."
      );
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

  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
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
   SSRF guard (minimal)
========================= */
async function assertSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Geçersiz URL.");
  }
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
   Section extraction
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
    if (!line) {
      filtered.push("");
      continue;
    }
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

/* =========================
   Final display post-processing
========================= */
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
   Responses + CORS
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
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
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
