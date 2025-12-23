/* global pdfjsLib */
(() => {
  const url = "dergi/sayi-1.pdf";

  const canvas = document.getElementById("pdfCanvas");
  const ctx = canvas.getContext("2d");
  const loadingEl = document.getElementById("loading");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInput = document.getElementById("pageInput");
  const pageTotal = document.getElementById("pageTotal");

  const zoomIn = document.getElementById("zoomIn");
  const zoomOut = document.getElementById("zoomOut");
  const zoomLabel = document.getElementById("zoomLabel");

  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const resultsEl = document.getElementById("results");

  let pdfDoc = null;
  let pageNum = 1;
  let scale = 1.2; // başlangıç zoom
  let rendering = false;
  let pendingPage = null;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js";

  function setLoading(on){
    if(!loadingEl) return;
    loadingEl.style.display = on ? "flex" : "none";
  }

  async function renderPage(num){
    rendering = true;
    setLoading(true);

    const page = await pdfDoc.getPage(num);

    // Ekran genişliğine göre scale düzelt (responsive)
    const viewport0 = page.getViewport({ scale: 1 });
    const containerWidth = canvas.parentElement.clientWidth - 20;
    const fitScale = containerWidth / viewport0.width;
    const viewport = page.getViewport({ scale: Math.max(0.6, fitScale) * scale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;

    setLoading(false);
    rendering = false;

    pageInput.value = String(pageNum);
    pageTotal.textContent = `/ ${pdfDoc.numPages}`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;

    if (pendingPage !== null){
      const p = pendingPage;
      pendingPage = null;
      renderPage(p);
    }
  }

  function queueRender(num){
    if (rendering) pendingPage = num;
    else renderPage(num);
  }

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function goTo(num){
    if (!pdfDoc) return;
    pageNum = clamp(num, 1, pdfDoc.numPages);
    queueRender(pageNum);
  }

  function next(){ goTo(pageNum + 1); }
  function prev(){ goTo(pageNum - 1); }

  // Arama: her sayfanın textContent'ini tarar, eşleşenleri listeler
  async function searchPdf(q){
    if(!pdfDoc) return;
    const query = (q || "").trim().toLowerCase();
    if(!query){
      resultsEl.textContent = "Aramak için bir şey yaz.";
      return;
    }

    resultsEl.textContent = "Aranıyor… (PDF uzun ise biraz sürebilir)";
    const hits = [];

    for (let i = 1; i <= pdfDoc.numPages; i++){
      const page = await pdfDoc.getPage(i);
      const text = await page.getTextContent();
      const str = text.items.map(it => it.str).join(" ").toLowerCase();

      if (str.includes(query)){
        // küçük bir snippet üret
        const idx = str.indexOf(query);
        const start = Math.max(0, idx - 35);
        const end = Math.min(str.length, idx + query.length + 60);
        const snippet = str.slice(start, end).replace(/\s+/g, " ");
        hits.push({ page: i, snippet });
      }
    }

    if(!hits.length){
      resultsEl.textContent = "Sonuç bulunamadı.";
      return;
    }

    resultsEl.innerHTML = "";
    hits.slice(0, 40).forEach(h => {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML = `
        <div class="r-top">
          <div class="r-page">Sayfa ${h.page}</div>
          <span class="badge">Bulundu</span>
        </div>
        <div class="muted tiny">${escapeHtml(h.snippet)}…</div>
        <button class="btn ghost" type="button">Bu sayfaya git</button>
      `;
      div.querySelector("button").addEventListener("click", () => goTo(h.page));
      resultsEl.appendChild(div);
    });

    if(hits.length > 40){
      const more = document.createElement("div");
      more.className = "muted tiny";
      more.textContent = `+ ${hits.length - 40} sonuç daha var (istersen “daha fazla” yaparız).`;
      resultsEl.appendChild(more);
    }
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  async function init(){
    setLoading(true);
    const loadingTask = pdfjsLib.getDocument({ url, disableWorker: true });
    pdfDoc = await loadingTask.promise;

    pageTotal.textContent = `/ ${pdfDoc.numPages}`;
    goTo(1);

    // Buttons
    prevBtn?.addEventListener("click", prev);
    nextBtn?.addEventListener("click", next);

    pageInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter"){
        const n = parseInt(pageInput.value, 10);
        if (!Number.isNaN(n)) goTo(n);
      }
    });

    zoomIn?.addEventListener("click", () => { scale = clamp(scale + 0.1, 0.6, 2.2); queueRender(pageNum); });
    zoomOut?.addEventListener("click", () => { scale = clamp(scale - 0.1, 0.6, 2.2); queueRender(pageNum); });

    // Search
    searchBtn?.addEventListener("click", () => searchPdf(searchInput.value));
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchPdf(searchInput.value);
    });

    // Quick go buttons
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => {
        const n = parseInt(btn.getAttribute("data-go"), 10);
        if (!Number.isNaN(n)) goTo(n);
      });
    });

    // Keyboard arrows
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "+" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); scale = clamp(scale + 0.1, 0.6, 2.2); queueRender(pageNum); }
      if (e.key === "-" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); scale = clamp(scale - 0.1, 0.6, 2.2); queueRender(pageNum); }
    });

    // Resize → yeniden render
    window.addEventListener("resize", () => queueRender(pageNum));
  }

  init().catch(err => {
    console.error(err);
    if (resultsEl) resultsEl.textContent = "PDF yüklenemedi. Konsolu kontrol et.";
    setLoading(false);
  });
})();
