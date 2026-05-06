/* ══════════════════════════════════════
   PDF VIEWER — MOTOR DE RENDERIZAÇÃO CORRIGIDO
   
   Princípios:
   1. Um único viewport por página (page.getViewport({scale}))
   2. Canvas interno: resolução = viewport * devicePixelRatio (nitidez)
   3. Canvas visual (CSS): tamanho = viewport (sem zoom CSS)
   4. textLayer: mesmo tamanho CSS do canvas (alinhamento perfeito)
   5. Zoom: re-renderização completa, nunca CSS transform
══════════════════════════════════════ */
const PV = {
  // Cancellation token: ao abrir novo doc ou mudar zoom, aborta renders anteriores
  _renderToken: 0,
  _citationBusy: false,
  _observer: null,

  _setupObserver() {
    if (this._observer) this._observer.disconnect();
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const wrap = entry.target;
        const pageNum = parseInt(wrap.dataset.page, 10);
        if (entry.isIntersecting) {
          if (!wrap.dataset.rendered) {
            wrap.dataset.rendered = '1';
            this._renderPageContent(pageNum, wrap, this._renderToken);
          }
        } else {
          if (wrap.dataset.rendered) {
            delete wrap.dataset.rendered;
            wrap.replaceChildren(); // empty the wrap to free canvas/DOM
          }
        }
      });
    }, {
      root: document.getElementById('pdf-scroller'),
      rootMargin: '150% 0px'
    });
  },

  updateReaderActions(doc = S.currentDoc) {
    const copyBtn = document.getElementById('copy-ref-btn');
    if (!copyBtn) return;

    const isScientificPaper = String(doc?.type || '').trim().toLowerCase() === 'artigo';
    const hasDoi = Boolean(String(doc?.doi || '').trim());
    copyBtn.style.display = isScientificPaper && hasDoi ? 'inline-flex' : 'none';
    copyBtn.disabled = this._citationBusy;
    copyBtn.textContent = this._citationBusy ? '⏳ Buscando referência...' : '📋 Copiar Referência';
  },

  promptCitationStyle() {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Modal.show(`
        <h3>Copiar Referência</h3>
        <p class="modal-subtle">Escolha o padrão da referência que será buscada e copiada para a área de transferência.</p>
        <div class="mactions" style="justify-content:flex-start;">
          ${CITATION_STYLE_OPTIONS.map(option => `
            <button class="btn btn-p" onclick="PV.confirmCitationStyle('${option.value}')">${escHtml(option.label)}</button>
          `).join('')}
          <button class="btn" onclick="PV.cancelCitationStyle()">Cancelar</button>
        </div>
      `, {
        onHide: () => finish(null),
      });

      this._finishCitationStylePrompt = finish;
    });
  },

  _finishCitationStylePrompt: null,

  confirmCitationStyle(style) {
    const finish = this._finishCitationStylePrompt;
    this._finishCitationStylePrompt = null;
    if (finish) finish(style);
    Modal.hide();
  },

  cancelCitationStyle() {
    this._finishCitationStylePrompt = null;
    Modal.hide();
  },

  async copyCitation() {
    const doc = S.currentDoc;
    if (!doc) return;
    if (this._citationBusy) return;
    if (String(doc.type || '').trim().toLowerCase() !== 'artigo') {
      toast('A cópia automática de referência está disponível apenas para papers científicos.');
      return;
    }
    if (!String(doc.doi || '').trim()) {
      toast('Este paper ainda não possui DOI salvo.');
      return;
    }

    const selectedStyle = await this.promptCitationStyle();
    if (!selectedStyle) return;

    this._citationBusy = true;
    this.updateReaderActions(doc);

    try {
      const payload = await DB.pdfs.getCitation(doc.id, { style: selectedStyle });
      const citation = String(payload?.citation || '').trim();
      if (!citation) throw new Error('Nenhuma referência foi retornada para este DOI.');

      const style = String(payload?.style || selectedStyle).trim().toLowerCase();
      doc.citationCache = {
        ...(doc.citationCache || {}),
        [style]: {
          citation,
          cachedAt: Number(payload?.cachedAt) || Date.now(),
        },
      };
      if (style === 'apa') {
        doc.citationApa = citation;
        doc.citationCachedAt = Number(payload?.cachedAt) || Date.now();
      }
      const ix = S.docs.findIndex(item => item.id === doc.id);
      if (ix >= 0) S.docs[ix] = doc;

      await navigator.clipboard.writeText(citation);
      const styleLabel = citationStyleLabel(style);
      toast(payload?.cached ? `Referência ${styleLabel} copiada do cache!` : `Referência ${styleLabel} copiada!`);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Falha ao copiar referência.');
    } finally {
      this._citationBusy = false;
      this.updateReaderActions(doc);
    }
  },

  _captureViewState() {
    const scroller = document.getElementById('pdf-scroller');
    if (!scroller || !S.totalPages) {
      return { page: Math.max(1, S.currentPage || 1), centerRatio: 0.5 };
    }

    const mid = scroller.scrollTop + (scroller.clientHeight / 2);
    let page = Math.max(1, S.currentPage || 1);
    let wrap = null;

    for (let i = 1; i <= S.totalPages; i++) {
      const candidate = document.getElementById(`pw-${i}`);
      if (!candidate) continue;
      if (mid >= candidate.offsetTop && mid <= candidate.offsetTop + candidate.offsetHeight) {
        page = i;
        wrap = candidate;
        break;
      }
    }

    if (!wrap) wrap = document.getElementById(`pw-${page}`);
    if (!wrap) {
      return { page, centerRatio: 0.5 };
    }

    const centerRatio = wrap.offsetHeight > 0
      ? (mid - wrap.offsetTop) / wrap.offsetHeight
      : 0.5;

    return {
      page,
      centerRatio: Math.max(0, Math.min(1, centerRatio)),
    };
  },

  _restoreViewState(viewState) {
    const scroller = document.getElementById('pdf-scroller');
    if (!scroller || !viewState?.page) return;

    const wrap = document.getElementById(`pw-${viewState.page}`);
    if (!wrap) return;

    const ratio = Number.isFinite(viewState.centerRatio) ? viewState.centerRatio : 0.5;
    const targetMid = wrap.offsetTop + (wrap.offsetHeight * Math.max(0, Math.min(1, ratio)));
    const nextScrollTop = Math.max(0, targetMid - (scroller.clientHeight / 2));

    scroller.scrollTop = nextScrollTop;
    S.currentPage = viewState.page;
    document.getElementById('pg-in').value = viewState.page;
  },

  _buildZoomPlaceholders(nextScale, previousScale) {
    if (!S.totalPages || !previousScale || previousScale <= 0) return null;

    const ratio = nextScale / previousScale;
    const pages = [];

    for (let pageNum = 1; pageNum <= S.totalPages; pageNum += 1) {
      const wrap = document.getElementById(`pw-${pageNum}`);
      if (!wrap) return null;

      const width = wrap.clientWidth || parseFloat(wrap.style.width) || 0;
      const height = wrap.clientHeight || parseFloat(wrap.style.height) || 0;
      if (!width || !height) return null;

      pages.push({
        pageNum,
        width: width * ratio,
        height: height * ratio,
      });
    }

    return { pages };
  },

  _capturePlaceholderLayout() {
    if (!S.totalPages) return null;

    const pages = [];
    for (let pageNum = 1; pageNum <= S.totalPages; pageNum += 1) {
      const wrap = document.getElementById(`pw-${pageNum}`);
      if (!wrap) return null;

      const width = wrap.clientWidth || parseFloat(wrap.style.width) || 0;
      const height = wrap.clientHeight || parseFloat(wrap.style.height) || 0;
      if (!width || !height) return null;

      pages.push({ pageNum, width, height });
    }

    return { pages };
  },

  _applyPlaceholders(container, placeholderLayout) {
    if (!container || !placeholderLayout?.pages?.length) return false;

    container.innerHTML = '';
    placeholderLayout.pages.forEach(({ pageNum, width, height }) => {
      const wrap = document.createElement('div');
      wrap.className = 'page-wrap page-wrap-placeholder';
      wrap.id = `pw-${pageNum}`;
      wrap.style.width = `${width}px`;
      wrap.style.height = `${height}px`;
      container.appendChild(wrap);
    });

    return true;
  },

  _renderSequence(totalPages, preferredPage = 1) {
    const total = Math.max(0, Number(totalPages) || 0);
    if (!total) return [];

    const target = Math.max(1, Math.min(total, Number(preferredPage) || 1));
    const order = [target];

    for (let offset = 1; order.length < total; offset += 1) {
      const next = target + offset;
      const prev = target - offset;

      if (next <= total) order.push(next);
      if (prev >= 1 && order.length < total) order.push(prev);
    }

    return order;
  },

  async open(doc, options = {}) {
    const preserveView = Boolean(options?.preserveView);
    const viewState = preserveView ? (options?.viewState || this._captureViewState()) : null;
    const placeholderLayout = preserveView ? options?.placeholderLayout : null;
    S.currentDoc = doc;
    S.currentPage = preserveView ? Math.max(1, viewState?.page || S.currentPage || 1) : 1;
    S.highlights = await DB.highlights.byPDF(doc.id);
    this._citationBusy = false;
    this.updateReaderActions(doc);

    const scroller = document.getElementById('pdf-scroller');
    const reusedPlaceholders = this._applyPlaceholders(scroller, placeholderLayout);
    if (!reusedPlaceholders) {
      scroller.innerHTML = '<div class="loading"><div class="spin"></div>Carregando PDF…</div>';
    }

    // Invalida renders em andamento
    const token = ++this._renderToken;

    if (preserveView && viewState && reusedPlaceholders) {
      this._restoreViewState(viewState);
    }

    try {
      // Use streaming instead of ArrayBuffer to drastically reduce memory usage
      S.pdfDoc = await pdfjsLib.getDocument(`/api/pdfs/${doc.id}/file`).promise;
      S.totalPages = S.pdfDoc.numPages;

      document.getElementById('pg-total').textContent  = S.totalPages;
      document.getElementById('pg-in').max             = S.totalPages;
      document.getElementById('pg-in').value           = S.currentPage;
      document.getElementById('zoom-lbl').textContent  = Math.round(S.scale * 100) + '%';
      document.getElementById('pdf-bar').style.display = 'flex';
      document.getElementById('reader-doc-name').textContent = doc.title || doc.name;

      if (!reusedPlaceholders) {
        scroller.innerHTML = '';
        // Estimate dimensions from the first page
        const firstPage = await S.pdfDoc.getPage(1);
        const vp = firstPage.getViewport({scale: S.scale});
        const defaultW = vp.width;
        const defaultH = vp.height;

        // Build placeholders for all pages synchronously
        for (let i = 1; i <= S.totalPages; i++) {
          const wrap = document.createElement('div');
          wrap.id = `pw-${i}`;
          wrap.className = 'page-wrap page-wrap-placeholder';
          wrap.dataset.page = i;
          wrap.style.width = defaultW + 'px';
          wrap.style.height = defaultH + 'px';
          scroller.appendChild(wrap);
        }
      }

      this._setupObserver();
      
      for (let i = 1; i <= S.totalPages; i++) {
        const wrap = document.getElementById(`pw-${i}`);
        if (wrap) {
          wrap.dataset.page = i; // ensure dataset.page is present for reused placeholders
          this._observer.observe(wrap);
        }
      }

      if (token === this._renderToken && preserveView && viewState) {
        requestAnimationFrame(() => this._restoreViewState(viewState));
      }
    } catch(err) {
      console.error(err);
      scroller.innerHTML = `<div class="loading" style="color:#c0392b;">
        Erro ao carregar PDF.<br><small>${escHtml(err.message)}</small>
      </div>`;
    }
  },

  async _renderPageContent(pageNum, wrap, token) {
    const page = await S.pdfDoc.getPage(pageNum);
    if (token !== this._renderToken) return;

    wrap.classList.remove('page-wrap-placeholder');

    // ── 1. Viewport único para canvas E textLayer ──
    const dpr   = window.devicePixelRatio || 1;
    const vp    = page.getViewport({scale: S.scale});

    // Tamanho visual (CSS) da página
    const cssW  = vp.width;
    const cssH  = vp.height;

    // ── 2. Container da página ──
    wrap.style.width  = cssW + 'px';
    wrap.style.height = cssH + 'px';
    wrap.replaceChildren();

    // ── 3. Canvas de alta resolução ──
    const canvas = document.createElement('canvas');
    // Resolução interna = tamanho visual × DPR (nitidez em telas HiDPI)
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // Tamanho visual via CSS (idêntico ao viewport)
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';

    // ── 4. Camada de highlights (abaixo da textLayer para não bloquear seleção) ──
    const hDiv = document.createElement('div');
    hDiv.className = 'hl-layer';
    hDiv.id = `hl-${pageNum}`;

    // ── 5. textLayer — DEVE ser a última camada (z mais alto) para receber eventos ──
    const tDiv = document.createElement('div');
    tDiv.className = 'textLayer';
    tDiv.style.width  = cssW + 'px';
    tDiv.style.height = cssH + 'px';

    // Ordem: canvas → hl-layer → textLayer (textLayer no topo para seleção)
    wrap.appendChild(canvas);
    wrap.appendChild(hDiv);
    wrap.appendChild(tDiv);

    // ── 6. Renderizar canvas com viewport escalado por DPR ──
    const renderVP = page.getViewport({scale: S.scale * dpr});
    const ctx = canvas.getContext('2d');
    await page.render({canvasContext: ctx, viewport: renderVP}).promise;
    if (token !== this._renderToken) return;

    // ── 7. Renderizar textLayer com o viewport VISUAL (scale original, sem DPR) ──
    // Coordenadas dos spans em pixels CSS — alinhamento perfeito com o canvas.
    try {
      const textContent = await page.getTextContent();
      if (token !== this._renderToken) return;

      tDiv.replaceChildren();
      tDiv.style.setProperty('--scale-factor', String(vp.scale || 1));

      let rendered = false;

      // PDF.js 3/4 usa textContentSource. Mantemos fallback para textContent
      // para ambientes que ainda expõem a assinatura antiga.
      if (typeof pdfjsLib.renderTextLayer === 'function') {
        const runRender = async opts => {
          const task = pdfjsLib.renderTextLayer(opts);
          if (task?.promise) await task.promise;
          if (!task?.promise) await new Promise(r => requestAnimationFrame(r));
          return !!tDiv.querySelector('span');
        };

        rendered = await runRender({
          textContentSource: textContent,
          container: tDiv,
          viewport: vp,
          textDivs: [],
        });

        if (!rendered) {
          tDiv.replaceChildren();
          rendered = await runRender({
            textContent,
            container: tDiv,
            viewport: vp,
            textDivs: [],
          });
        }
      }

      // Fallback para builds que expõem TextLayer como classe.
      if (!rendered && typeof pdfjsLib.TextLayer === 'function') {
        tDiv.replaceChildren();
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: tDiv,
          viewport: vp,
        });
        await textLayer.render();
        rendered = !!tDiv.querySelector('span');
      }

      if (!rendered) {
        console.warn(`textLayer p.${pageNum}: nenhuma camada de texto interativa foi criada.`);
      }
    } catch(e) {
      console.warn(`textLayer p.${pageNum}:`, e);
    }

    if (token !== this._renderToken) return;

    this._drawHLs(pageNum, hDiv, cssW, cssH);

    // Seleção de texto: escuta mouseup na textLayer
    tDiv.addEventListener('mouseup', e =>
      setTimeout(() => HL.onSelect(e, pageNum, wrap), 60)
    );

    // Clique em highlight: detectado por coordenadas na wrap (hl-layer está abaixo)
    wrap.addEventListener('click', async e => {
      if (typeof Links !== 'undefined' && await Links.onClick(e, pageNum, wrap)) return;

      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const wRect = wrap.getBoundingClientRect();
      const rx = (e.clientX - wRect.left) / cssW;
      const ry = (e.clientY - wRect.top)  / cssH;
      const hit = S.highlights.filter(h => h.page === pageNum).find(h =>
        (h.rects || []).some(r => rx >= r.x && rx <= r.x + r.w && ry >= r.y && ry <= r.y + r.h)
      );
      if (hit) RP.showHighlight(hit);
    });
  },

  _drawHLs(pageNum, layer, cssW, cssH) {
    layer.innerHTML = '';
    S.highlights.filter(h => h.page === pageNum).forEach(h => {
      const cat = getCat(h.catId);
      if (h.type === 'origin' || h.type === 'end') {
        const r = h.rects[0];
        if (!r) return;
        const el = document.createElement('div');
        el.className = 'hl-mark-point';
        el.style.position = 'absolute';
        el.style.left = (r.x * cssW) + 'px';
        el.style.top = (r.y * cssH) + 'px';
        el.style.width = (r.w * cssW) + 'px';
        el.style.height = (r.h * cssH) + 'px';
        el.style.backgroundColor = cat.color;
        el.style.borderRadius = '50%';
        el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        el.style.border = '2px solid white';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '12px';
        el.style.color = 'white';
        el.style.zIndex = '50';
        el.innerHTML = h.type === 'origin' ? '📍' : '🎯';
        el.title = h.type === 'origin' ? 'Ponto de Origem' : 'Ponto de Fim';
        layer.appendChild(el);
      } else if (h.type === 'image') {
        (h.rects || []).forEach(r => {
          const el = document.createElement('div');
          el.className = 'hl-mark-img';
          el.style.left   = (r.x * cssW) + 'px';
          el.style.top    = (r.y * cssH) + 'px';
          el.style.width  = (r.w * cssW) + 'px';
          el.style.height = (r.h * cssH) + 'px';
          el.style.borderColor = cat.color;
          el.title = `[${cat.name}] Imagem capturada`;
          layer.appendChild(el);
        });
      } else {
        const filtered = (h.rects || []).filter(r => r.w > 0.005 && r.h > 0.003);
        filtered.forEach(r => {
          const el = document.createElement('div');
          el.className = 'hl-mark';
          el.style.left       = (r.x * cssW) + 'px';
          el.style.top        = (r.y * cssH) + 'px';
          el.style.width      = (r.w * cssW) + 'px';
          el.style.height     = (r.h * cssH) + 'px';
          el.style.background = cat.color;
          el.style.opacity    = '0.32';
          el.title = `[${cat.name}] ${h.text.substring(0, 60)}`;
          layer.appendChild(el);
        });
      }
    });
  },

  refreshPage(pageNum) {
    const layer  = document.getElementById(`hl-${pageNum}`);
    const canvas = document.querySelector(`#pw-${pageNum} canvas`);
    if (layer && canvas) {
      // Usa tamanho CSS (não interno) para coordenadas de highlight
      const cssW = parseFloat(canvas.style.width)  || canvas.width;
      const cssH = parseFloat(canvas.style.height) || canvas.height;
      this._drawHLs(pageNum, layer, cssW, cssH);
    }
  },

  prev() { if (S.currentPage > 1) this.go(S.currentPage - 1); },
  next() { if (S.currentPage < S.totalPages) this.go(S.currentPage + 1); },
  go(n) {
    n = Math.max(1, Math.min(n, S.totalPages));
    S.currentPage = n;
    document.getElementById('pg-in').value = n;
    document.getElementById(`pw-${n}`)?.scrollIntoView({behavior: 'smooth', block: 'start'});
  },
  zoomIn() {
    const previousScale = S.scale;
    const nextScale = Math.min(3, S.scale + 0.25);
    if (nextScale === previousScale) return;
    S.scale = nextScale;
    this._reopen(previousScale);
  },
  zoomOut() {
    const previousScale = S.scale;
    const nextScale = Math.max(0.5, S.scale - 0.25);
    if (nextScale === previousScale) return;
    S.scale = nextScale;
    this._reopen(previousScale);
  },
  _reopen(previousScale = S.scale) {
    document.getElementById('zoom-lbl').textContent = Math.round(S.scale * 100) + '%';
    if (!S.currentDoc || !S.totalPages) return;

    const viewState = this._captureViewState();
    const ratio = S.scale / previousScale;

    // Invalida renders em andamento
    this._renderToken++;

    for (let i = 1; i <= S.totalPages; i++) {
      const wrap = document.getElementById(`pw-${i}`);
      if (!wrap) continue;

      const width = parseFloat(wrap.style.width) || 0;
      const height = parseFloat(wrap.style.height) || 0;
      
      wrap.style.width = `${width * ratio}px`;
      wrap.style.height = `${height * ratio}px`;
      
      delete wrap.dataset.rendered;
      wrap.replaceChildren();
      wrap.classList.add('page-wrap-placeholder');
    }

    this._restoreViewState(viewState);

    // Re-observar forca o IntersectionObserver a disparar para os elementos visiveis
    this._setupObserver();
    for (let i = 1; i <= S.totalPages; i++) {
      const wrap = document.getElementById(`pw-${i}`);
      if (wrap) this._observer.observe(wrap);
    }
  },
};

// Rastreia página atual pelo scroll
document.getElementById('pdf-scroller').addEventListener('scroll', function() {
  if (!S.pdfDoc) return;
  const mid = this.scrollTop + this.clientHeight / 2;
  for (let i = 1; i <= S.totalPages; i++) {
    const pw = document.getElementById(`pw-${i}`);
    if (!pw) continue;
    if (mid >= pw.offsetTop && mid <= pw.offsetTop + pw.offsetHeight) {
      if (S.currentPage !== i) {
        S.currentPage = i;
        document.getElementById('pg-in').value = i;
      }
      break;
    }
  }
});
