'use strict';

/* ══════════════════════════════════════
   PDF.JS WORKER
══════════════════════════════════════ */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
const DEF_CATS = [
  {id:'def',  name:'Definição',  color:'#1d6fb8', bg:'rgba(29,111,184,.18)'},
  {id:'evid', name:'Evidência',  color:'#1a7a40', bg:'rgba(26,122,64,.18)'},
  {id:'crit', name:'Crítica',    color:'#c0392b', bg:'rgba(192,57,43,.18)'},
  {id:'conc', name:'Conclusão',  color:'#c07a00', bg:'rgba(192,122,0,.18)'},
  {id:'obs',  name:'Observação', color:'#6e6e6a', bg:'rgba(110,110,106,.18)'},
];

/* ══════════════════════════════════════
   DATABASE — REST API (Node.js)
══════════════════════════════════════ */
const DB = (() => {
  const API_BASE = '/api';

  async function request(path, options = {}) {
    const res = await fetch(API_BASE + path, options);

    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try {
        const payload = await res.json();
        if (payload?.error) msg = payload.error;
      } catch (_e) {}
      throw new Error(msg);
    }

    if (res.status === 204) return null;

    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('application/json')) return res.json();
    return res.text();
  }

  function put(path, value) {
    return request(path, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(value),
    });
  }

  return {
    init: () => request('/health'),
    settings: {
      get: () => request('/settings'),
      patch: patch => request('/settings', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(patch),
      }),
    },
    pdfs: {
      upload: (file, doc) => {
        const form = new FormData();
        form.append('file', file);
        form.append('doc', JSON.stringify(doc || {}));
        return request('/pdfs/upload', {method: 'POST', body: form});
      },
      save: d => put(`/pdfs/${encodeURIComponent(d.id)}`, d),
      get: id => request(`/pdfs/${encodeURIComponent(id)}`),
      getBinary: async id => {
        const res = await fetch(`${API_BASE}/pdfs/${encodeURIComponent(id)}/file`);
        if (!res.ok) throw new Error('Falha ao carregar PDF do servidor.');
        return res.arrayBuffer();
      },
      all: () => request('/pdfs'),
      del: id => request(`/pdfs/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    highlights: {
      save: h => put(`/highlights/${encodeURIComponent(h.id)}`, h),
      byPDF: pid => request(`/highlights/by-pdf/${encodeURIComponent(pid)}`),
      all: () => request('/highlights'),
      del: id => request(`/highlights/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    projects: {
      save: pj => put(`/projects/${encodeURIComponent(pj.id)}`, pj),
      all: () => request('/projects'),
      get: id => request(`/projects/${encodeURIComponent(id)}`),
      del: id => request(`/projects/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    attachments: {
      save: a => put(`/attachments/${encodeURIComponent(a.id)}`, a),
      all: () => request('/attachments'),
      del: id => request(`/attachments/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    suco_notes: {
      save: n => put(`/suco-notes/${encodeURIComponent(n.id)}`, n),
      get: id => request(`/suco-notes/${encodeURIComponent(id)}`),
      byDoc: docId => request(`/suco-notes/by-doc/${encodeURIComponent(docId)}`),
      del: id => request(`/suco-notes/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
  };
})();

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
const S = {
  docs: [], currentDoc: null, pdfDoc: null,
  highlights: [], sucoNotes: {},
  currentPage: 1, totalPages: 0, scale: 1.5,
  view: 'library', activeTab: 'reader',
  cats: [], pending: null, openProjId: null,
  selectedHL: null, imgMode: false,
  libFilter: { tags: [], type: '', lang: '' },
};

async function loadCats() {
  try {
    const settings = await DB.settings.get();
    S.cats = Array.isArray(settings?.cats) && settings.cats.length ? settings.cats : DEF_CATS;
    document.body.classList.toggle('dark-mode', Boolean(settings?.darkMode));
  } catch (err) {
    console.warn('Falha ao carregar configurações do servidor.', err);
    S.cats = DEF_CATS;
  }
  if (!S.cats.length) S.cats = DEF_CATS;
}
function saveCats() {
  DB.settings.patch({cats: S.cats}).catch(err => {
    console.warn('Falha ao salvar categorias no servidor.', err);
  });
}
function getCat(id) { return S.cats.find(c=>c.id===id) || S.cats[0] || {id:'?',name:'?',color:'#888',bg:'rgba(136,136,136,.18)'}; }

/* ══════════════════════════════════════
   TOAST & MODAL
══════════════════════════════════════ */
let _toastT;
function toast(msg, dur=2400) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(()=>el.classList.remove('on'), dur);
}
const Modal = {
  show(html) { document.getElementById('modal-body').innerHTML=html; document.getElementById('moverlay').classList.add('on'); },
  hide() { document.getElementById('moverlay').classList.remove('on'); },
};

/* ══════════════════════════════════════
   RIGHT PANEL CONTROLLER
══════════════════════════════════════ */
const RP = {
  showDefault() {
    document.getElementById('rp-default').style.display   = 'none';
    document.getElementById('rp-highlight').style.display = 'none';
    document.getElementById('rp-idle').style.display      = 'flex';
    S.selectedHL = null;
  },

  showHighlight(h) {
    S.selectedHL = h;
    document.getElementById('rp-default').style.display   = 'none';
    document.getElementById('rp-idle').style.display      = 'none';
    document.getElementById('rp-highlight').style.display = 'flex';
    this.renderHL(h);
  },

  renderHL(h) {
    const c   = getCat(h.catId);
    const doc = S.currentDoc;
    const ref = doc ? `${doc.author||'Autor desconhecido'}, ${doc.year||'s.d.'}${doc.doi?` | DOI: ${doc.doi}`:''}` : '';

    const catOpts = S.cats.map(c2 =>
      `<option value="${c2.id}" ${c2.id===h.catId?'selected':''}>${c2.name}</option>`
    ).join('');

    const isImg = h.type === 'image';

    document.getElementById('rp-hl-content').innerHTML = `
      ${isImg
        ? `<div class="hl-panel-img"><img src="${h.imageData||''}" alt="Imagem capturada"></div>`
        : `<div class="hl-panel-text">"${escHtml(h.text.substring(0,300))}${h.text.length>300?'…':''}"</div>`
      }
      <div class="hl-panel-sect">
        <div class="hl-panel-lbl">Categoria</div>
        <select class="hl-cat-sel" id="rp-cat-sel" onchange="RP.changeCat('${h.id}',this.value)">${catOpts}</select>
      </div>
      <div class="hl-panel-sect">
        <div class="hl-panel-lbl">Nota</div>
        <textarea class="hl-panel-note" id="rp-note" placeholder="Adicione uma nota…" oninput="RP.noteChange('${h.id}',this.value)">${escHtml(h.note||'')}</textarea>
      </div>
      ${ref ? `<div class="hl-panel-sect">
        <div class="hl-panel-lbl">Referência</div>
        <div class="hl-ref-box">${escHtml(ref)}</div>
      </div>` : ''}
      <div class="hl-panel-sect">
        <div class="hl-panel-lbl">Origem</div>
        <div style="font-size:12px;color:var(--text3);">Página ${h.page}${doc?' · '+escHtml(doc.title||doc.name):''}</div>
      </div>
      ${h.isAttachment ? `<div class="hl-panel-sect"><div class="hl-att-badge">📎 Já é um Anexo</div></div>` : ''}
      <div class="hl-actions">
        ${!h.isAttachment ? `<button class="btn btn-sm" style="width:100%;text-align:left;" onclick="RP.makeAttachment('${h.id}')">📎 Tornar Anexo</button>` : ''}
        <button class="btn btn-sm" style="width:100%;text-align:left;" onclick="Suco.insertInProject('${h.id}')">📌 Inserir em Projeto</button>
        <button class="btn btn-sm" style="width:100%;text-align:left;" onclick="PV.go(${h.page});UI.tab('reader')">→ Ver no PDF (p.${h.page})</button>
        <button class="btn btn-d btn-sm" style="width:100%;text-align:left;" onclick="RP.deleteHL('${h.id}')">🗑 Deletar Highlight</button>
      </div>
    `;
  },

  close() { this.showDefault(); UI.renderCats(); },

  _noteTimer: null,
  noteChange(hlId, val) {
    clearTimeout(this._noteTimer);
    this._noteTimer = setTimeout(async () => {
      const h = S.highlights.find(x=>x.id===hlId);
      if (!h) return;
      h.note = val;
      await DB.highlights.save(h);
      if (S.view === 'suco') Suco.render();
    }, 600);
  },

  async changeCat(hlId, catId) {
    const h = S.highlights.find(x=>x.id===hlId);
    if (!h) return;
    h.catId = catId;
    await DB.highlights.save(h);
    PV.refreshPage(h.page);
    UI.renderCats();
    this.renderHL(h);
    if (S.view === 'suco') Suco.render();
  },

  async makeAttachment(hlId) {
    const h = S.highlights.find(x=>x.id===hlId);
    if (!h || !S.currentDoc) return;
    const doc = S.currentDoc;
    const att = {
      id: 'att_' + hlId,
      highlightId: hlId,
      pdfId: h.pdfId,
      page: h.page,
      text: h.text,
      type: h.type,
      imageData: h.imageData || null,
      catId: h.catId,
      note: h.note,
      reference: {
        title: doc.title || doc.name,
        author: doc.author || '',
        year: doc.year || '',
        doi: doc.doi || '',
      },
      createdAt: Date.now(),
    };
    h.isAttachment = true;
    await DB.highlights.save(h);
    await DB.attachments.save(att);
    this.renderHL(h);
    toast('Transformado em Anexo! Visível em "Anexos".');
  },

  async deleteHL(hlId) {
    if (!confirm('Remover este highlight?')) return;
    const h = S.highlights.find(x=>x.id===hlId);
    const page = h ? h.page : 1;
    await DB.highlights.del(hlId);
    S.highlights = S.highlights.filter(x=>x.id!==hlId);
    this.close();
    PV.refreshPage(page);
    UI.renderCats();
    if (S.view==='suco') Suco.render();
    toast('Highlight removido.');
  },
};

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

  async open(doc) {
    S.currentDoc = doc;
    S.currentPage = 1;
    S.highlights = await DB.highlights.byPDF(doc.id);

    const scroller = document.getElementById('pdf-scroller');
    scroller.innerHTML = '<div class="loading"><div class="spin"></div>Carregando PDF…</div>';

    // Invalida renders em andamento
    const token = ++this._renderToken;

    try {
      const arr = await DB.pdfs.getBinary(doc.id);
      S.pdfDoc = await pdfjsLib.getDocument({data: arr}).promise;
      S.totalPages = S.pdfDoc.numPages;

      document.getElementById('pg-total').textContent  = S.totalPages;
      document.getElementById('pg-in').max             = S.totalPages;
      document.getElementById('pg-in').value           = 1;
      document.getElementById('zoom-lbl').textContent  = Math.round(S.scale * 100) + '%';
      document.getElementById('pdf-bar').style.display = 'flex';
      document.getElementById('reader-doc-name').textContent = doc.title || doc.name;

      scroller.innerHTML = '';

      for (let i = 1; i <= S.totalPages; i++) {
        if (token !== this._renderToken) break; // abortado
        await this._renderPage(i, scroller, token);
      }
    } catch(err) {
      console.error(err);
      scroller.innerHTML = `<div class="loading" style="color:#c0392b;">
        Erro ao carregar PDF.<br><small>${escHtml(err.message)}</small>
      </div>`;
    }
  },

  async _renderPage(pageNum, container, token) {
    const page = await S.pdfDoc.getPage(pageNum);
    if (token !== this._renderToken) return;

    // ── 1. Viewport único para canvas E textLayer ──
    const dpr   = window.devicePixelRatio || 1;
    const vp    = page.getViewport({scale: S.scale});

    // Tamanho visual (CSS) da página
    const cssW  = vp.width;
    const cssH  = vp.height;

    // ── 2. Container da página ──
    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.id = `pw-${pageNum}`;
    wrap.style.width  = cssW + 'px';
    wrap.style.height = cssH + 'px';

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
    container.appendChild(wrap);

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
    wrap.addEventListener('click', e => {
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
      if (h.type === 'image') {
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
  zoomIn()  { S.scale = Math.min(3, S.scale + 0.25); this._reopen(); },
  zoomOut() { S.scale = Math.max(0.5, S.scale - 0.25); this._reopen(); },
  _reopen() {
    document.getElementById('zoom-lbl').textContent = Math.round(S.scale * 100) + '%';
    if (S.currentDoc) this.open(S.currentDoc);
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

/* ══════════════════════════════════════
   IMAGE CAPTURE
══════════════════════════════════════ */
const ImgCapture = {
  active: false,
  startX: 0, startY: 0,
  pageWrap: null, pageNum: 0,
  selBox: document.getElementById('img-sel-box'),

  toggle() {
    this.active = !this.active;
    const overlay = document.getElementById('img-overlay');
    const btn     = document.getElementById('img-mode-btn');
    // Usa classe .on — o CSS controla display e pointer-events juntos
    overlay.classList.toggle('on', this.active);
    btn.classList.toggle('on', this.active);
    if (this.active) toast('Modo captura ativo — arraste para selecionar uma região do PDF');
  },

  onDown(e) {
    if (!this.active) return;
    e.preventDefault();
    this.startX = e.clientX; this.startY = e.clientY;
    this.pageWrap = null; this.pageNum = 0;

    for (let i = 1; i <= S.totalPages; i++) {
      const pw = document.getElementById(`pw-${i}`);
      if (!pw) continue;
      const r = pw.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right) {
        this.pageWrap = pw; this.pageNum = i; break;
      }
    }
    if (!this.pageWrap) return;

    this.selBox.style.cssText = `position:fixed;border:2px dashed #2a8ae8;background:rgba(42,138,232,.08);pointer-events:none;z-index:9999;border-radius:2px;display:block;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;`;
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup',   this._onUp);
  },

  _onMove: null, _onUp: null,

  init() {
    this._onMove = e => {
      if (!this.selBox) return;
      const x = Math.min(e.clientX, this.startX), y = Math.min(e.clientY, this.startY);
      const w = Math.abs(e.clientX - this.startX),  h = Math.abs(e.clientY - this.startY);
      this.selBox.style.left  = x + 'px';
      this.selBox.style.top   = y + 'px';
      this.selBox.style.width = w + 'px';
      this.selBox.style.height= h + 'px';
    };

    this._onUp = async e => {
      document.removeEventListener('mousemove', this._onMove);
      document.removeEventListener('mouseup',   this._onUp);
      this.selBox.style.display = 'none';

      if (!this.pageWrap || !S.currentDoc) { this.toggle(); return; }

      const pw     = this.pageWrap;
      const pwRect = pw.getBoundingClientRect();
      const canvas = pw.querySelector('canvas');

      const x1 = Math.min(e.clientX, this.startX), y1 = Math.min(e.clientY, this.startY);
      const x2 = Math.max(e.clientX, this.startX), y2 = Math.max(e.clientY, this.startY);
      const sw = x2 - x1, sh = y2 - y1;
      if (sw < 10 || sh < 10) { this.toggle(); return; }

      // Coordenadas relativas [0,1]
      const relX = Math.max(0, (x1 - pwRect.left) / pwRect.width);
      const relY = Math.max(0, (y1 - pwRect.top)  / pwRect.height);
      const relW = Math.min(sw / pwRect.width,  1 - relX);
      const relH = Math.min(sh / pwRect.height, 1 - relY);

      // Captura da região do canvas (considera DPR internamente)
      const dpr    = window.devicePixelRatio || 1;
      const scaleX = canvas.width  / pwRect.width;   // = DPR (canvas interno / CSS)
      const scaleY = canvas.height / pwRect.height;
      const capX   = Math.max(0, (x1 - pwRect.left) * scaleX);
      const capY   = Math.max(0, (y1 - pwRect.top)  * scaleY);
      const capW   = Math.min(sw * scaleX, canvas.width  - capX);
      const capH   = Math.min(sh * scaleY, canvas.height - capY);

      const off = document.createElement('canvas');
      off.width  = capW;
      off.height = capH;
      off.getContext('2d').drawImage(canvas, capX, capY, capW, capH, 0, 0, capW, capH);
      const imageData = off.toDataURL('image/png');

      const h = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        pdfId: S.currentDoc.id, page: this.pageNum,
        text: `[Imagem capturada — p.${this.pageNum}]`,
        catId: S.cats[0]?.id || 'obs',
        rects: [{x: relX, y: relY, w: relW, h: relH}],
        note: '', type: 'image', imageData,
        attachments: [], isAttachment: false,
        createdAt: Date.now(),
      };

      await DB.highlights.save(h);
      S.highlights.push(h);
      PV.refreshPage(h.page);
      UI.renderCats();
      this.toggle();
      RP.showHighlight(h);
      toast('Imagem capturada com sucesso!');
    };

    const overlay = document.getElementById('img-overlay');
    overlay.addEventListener('mousedown', e => this.onDown(e));
  },
};

/* ══════════════════════════════════════
   HIGHLIGHTS (TEXT)
══════════════════════════════════════ */
const HL = {
  onSelect(e, pageNum, wrap) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { CTX.hide(); return; }
    const text = sel.toString().trim();
    if (text.length < 2) { CTX.hide(); return; }

    const range  = sel.getRangeAt(0);
    const wRect  = wrap.getBoundingClientRect();
    const rects  = Array.from(range.getClientRects())
      .map(r => ({
        x: (r.left - wRect.left) / wRect.width,
        y: (r.top  - wRect.top)  / wRect.height,
        w: r.width  / wRect.width,
        h: r.height / wRect.height,
      }))
      .filter(r => r.w > 0.005 && r.h > 0.003);

    S.pending = {text, page: pageNum, rects};
    CTX.show(e.clientX, e.clientY);
  },

  async save(catId) {
    const sel = S.pending;
    if (!sel || !S.currentDoc) return;
    const h = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pdfId: S.currentDoc.id, page: sel.page,
      text: sel.text, catId, rects: sel.rects,
      note: '', type: 'text', attachments: [],
      isAttachment: false, createdAt: Date.now(),
    };
    await DB.highlights.save(h);
    S.highlights.push(h);
    S.pending = null;
    CTX.hide();
    window.getSelection().removeAllRanges();
    PV.refreshPage(h.page);
    UI.renderCats();
    RP.showHighlight(h);
    toast(`Highlight criado: ${getCat(catId).name}`);
  },
};

/* ══════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════ */
const CTX = {
  show(x, y) {
    document.getElementById('ctx-cats').innerHTML = S.cats.map(c =>
      `<div class="ctx-item" onclick="HL.save('${c.id}')">
        <span class="cdot" style="background:${c.color};"></span>${escHtml(c.name)}
      </div>`
    ).join('');
    const m = document.getElementById('ctx');
    m.style.left = Math.min(x, innerWidth - 210) + 'px';
    m.style.top  = Math.min(y, innerHeight - 260) + 'px';
    m.classList.add('on');
  },
  hide() { document.getElementById('ctx').classList.remove('on'); },
};
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctx')) CTX.hide(); });

/* ══════════════════════════════════════
   SUCO — Hybrid view
══════════════════════════════════════ */
let _sucoNoteTimers = {};

const Suco = {
  async render() {
    const doc = S.currentDoc;
    if (!doc) {
      document.getElementById('suco-body').innerHTML =
        '<div class="empty"><h3>Nenhum documento aberto</h3><p>Abra um PDF no leitor.</p></div>';
      return;
    }

    const snotes = await DB.suco_notes.byDoc(doc.id);
    S.sucoNotes = {};
    snotes.forEach(n => S.sucoNotes[n.page] = n.content);

    document.getElementById('suco-title').textContent = (doc.title || doc.name) + ' — Suco';
    document.getElementById('suco-sub').textContent =
      `${S.highlights.length} highlight${S.highlights.length !== 1 ? 's' : ''} · Notas por highlight e por página`;

    if (!S.highlights.length) {
      document.getElementById('suco-body').innerHTML =
        '<div class="empty"><h3>Nenhum highlight neste documento</h3><p>Selecione trechos no Leitor para criar highlights.</p></div>';
      return;
    }

    const refStr = [
      doc.author ? doc.author : null,
      doc.year   ? doc.year   : null,
    ].filter(Boolean).join(', ') + (doc.doi ? ` | DOI: ${doc.doi}` : '');

    const byPage = {};
    S.highlights.forEach(h => (byPage[h.page] = [...(byPage[h.page] || []), h]));

    document.getElementById('suco-body').innerHTML =
      Object.keys(byPage).map(Number).sort((a, b) => a - b).map(pg => {
        const hls = byPage[pg];
        const noteVal = escHtml(S.sucoNotes[pg] || '');
        return `<div class="page-group" id="pg-group-${pg}">
          <div class="page-lbl">Página ${pg}</div>
          ${hls.map(h => {
            const c = getCat(h.catId);
            const hasNote = h.note && h.note.trim();
            return `<div class="suco-item" id="suco-hl-${h.id}" style="border-left-color:${c.color};">
              <div class="suco-item-header" onclick="Suco.jump(${h.page})">
                <div style="flex:1;">
                  ${h.type === 'image'
                    ? `<img class="suco-img-thumb" src="${escHtml(h.imageData||'')}" alt="Imagem p.${h.page}">`
                    : `<div class="suco-text" style="text-decoration:underline;text-decoration-color:${c.color};text-underline-offset:3px;">"${escHtml(h.text)}"</div>`
                  }
                  <div class="suco-meta">
                    <span class="cat-badge" style="background:${c.bg};color:${c.color};">${escHtml(c.name)}</span>
                    <span>p. ${h.page}</span>
                    ${h.isAttachment ? '<span>📎</span>' : ''}
                    ${refStr ? `<span class="suco-ref">(${escHtml(refStr)})</span>` : ''}
                  </div>
                </div>
              </div>
              ${hasNote
                ? `<div class="suco-hl-note-preview" id="suco-note-preview-${h.id}">📝 ${escHtml(h.note)}</div>`
                : ''
              }
              <div class="suco-hl-actions">
                <button class="btn btn-sm" style="font-size:11px;" onclick="Suco.toggleNoteEdit('${h.id}')">
                  ${hasNote ? '✏ Editar nota' : '+ Nota'}
                </button>
                <button class="btn btn-sm" style="font-size:11px;" onclick="Suco.insertInProject('${h.id}')">📌 Inserir</button>
                <button class="btn btn-d btn-sm" style="font-size:11px;margin-left:auto;" onclick="Suco.deleteHL('${h.id}')">🗑</button>
              </div>
              <textarea id="suco-note-ta-${h.id}" class="suco-hl-note-area" style="display:none;"
                placeholder="Adicione uma nota a este highlight…"
                oninput="Suco.onHLNote('${h.id}',this.value)">${escHtml(h.note||'')}</textarea>
              <div class="suco-hl-freetext">
                <div class="suco-hl-freetext-lbl">Elaboração</div>
                <textarea class="suco-hl-freetext-area"
                  placeholder="Escreva livremente sobre este trecho…"
                  oninput="Suco.onHLFreeNote('${h.id}',this.value)">${escHtml(h.sucoNote||'')}</textarea>
              </div>
            </div>`;
          }).join('')}
          <div class="suco-user-note">
            <div class="suco-user-note-lbl">Notas da Página ${pg}</div>
            <textarea placeholder="Escreva aqui sua síntese ou comentários sobre esta página…"
              oninput="Suco.onNote(${pg},this.value)">${noteVal}</textarea>
          </div>
        </div>`;
      }).join('');
  },

  toggleNoteEdit(hlId) {
    const ta      = document.getElementById(`suco-note-ta-${hlId}`);
    const preview = document.getElementById(`suco-note-preview-${hlId}`);
    if (!ta) return;
    const open = ta.style.display === 'none';
    ta.style.display = open ? 'block' : 'none';
    if (preview) preview.style.display = open ? 'none' : 'block';
    if (open) ta.focus();
  },

  onHLNote(hlId, val) {
    clearTimeout(_sucoNoteTimers['hl_' + hlId]);
    _sucoNoteTimers['hl_' + hlId] = setTimeout(async () => {
      const h = S.highlights.find(x => x.id === hlId);
      if (!h) return;
      h.note = val;
      await DB.highlights.save(h);
    }, 600);
  },

  async deleteHL(hlId) {
    if (!confirm('Remover este highlight?')) return;
    const h = S.highlights.find(x => x.id === hlId);
    const page = h ? h.page : 1;
    await DB.highlights.del(hlId);
    S.highlights = S.highlights.filter(x => x.id !== hlId);
    const el = document.getElementById(`suco-hl-${hlId}`);
    if (el) el.remove();
    PV.refreshPage(page);
    UI.renderCats();
    toast('Highlight removido.');
    // If page group is empty now, remove it
    const pg = document.getElementById(`pg-group-${page}`);
    if (pg && pg.querySelectorAll('.suco-item').length === 0) pg.remove();
  },

  async insertInProject(hlId) {
    const h = S.highlights.find(x => x.id === hlId);
    if (!h || !S.currentDoc) return;
    // Build a temporary attachment object from the highlight
    const doc = S.currentDoc;
    const ref = { title: doc.title||doc.name, author: doc.author||'', year: doc.year||'', doi: doc.doi||'' };
    const fakeAtt = { id: h.id, pdfId: h.pdfId, page: h.page, text: h.text, type: h.type,
                      imageData: h.imageData||null, catId: h.catId, note: h.note, reference: ref };
    await Attachments.insertInProject(fakeAtt.id, fakeAtt);
  },

  onHLFreeNote(hlId, val) {
    clearTimeout(_sucoNoteTimers['free_' + hlId]);
    _sucoNoteTimers['free_' + hlId] = setTimeout(async () => {
      const h = S.highlights.find(x => x.id === hlId);
      if (!h) return;
      h.sucoNote = val;
      await DB.highlights.save(h);
    }, 600);
  },

  onNote(page, content) {
    clearTimeout(_sucoNoteTimers[page]);
    _sucoNoteTimers[page] = setTimeout(async () => {
      const docId = S.currentDoc?.id;
      if (!docId) return;
      const id = `${docId}:${page}`;
      await DB.suco_notes.save({id, docId, page, content, updatedAt: Date.now()});
      S.sucoNotes[page] = content;
    }, 700);
  },

  jump(page) {
    UI.tab('reader');
    setTimeout(() => PV.go(page), 80);
  },
};

/* ══════════════════════════════════════
   LIBRARY (with tags & filters)
══════════════════════════════════════ */
const Library = {
  async load() {
    S.docs = await DB.pdfs.all();
    this.renderFilters();
    this.renderGrid();
    this.renderSidebar();
  },

  renderFilters() {
    const allTags  = [...new Set(S.docs.flatMap(d => d.tags || []))].sort();
    const allTypes = [...new Set(S.docs.map(d => d.type).filter(Boolean))].sort();
    const allLangs = [...new Set(S.docs.map(d => d.lang).filter(Boolean))].sort();

    let html = `<span class="filter-lbl">Tags:</span>`;
    allTags.forEach(t => {
      const active = S.libFilter.tags.includes(t);
      html += `<span class="tag-chip ${active ? 'active' : ''}" onclick="Library.toggleTag('${escHtml(t)}')">${escHtml(t)}</span>`;
    });

    if (allTypes.length > 1) {
      html += `<span class="filter-lbl" style="margin-left:8px;">Tipo:</span>
        <select class="filter-sel" onchange="Library.setType(this.value)">
          <option value="">Todos</option>
          ${allTypes.map(t => `<option value="${escHtml(t)}" ${S.libFilter.type === t ? 'selected' : ''}>${escHtml(t)}</option>`).join('')}
        </select>`;
    }

    if (allLangs.length > 1) {
      html += `<span class="filter-lbl" style="margin-left:4px;">Idioma:</span>
        <select class="filter-sel" onchange="Library.setLang(this.value)">
          <option value="">Todos</option>
          ${allLangs.map(l => `<option value="${escHtml(l)}" ${S.libFilter.lang === l ? 'selected' : ''}>${escHtml(l)}</option>`).join('')}
        </select>`;
    }

    if (S.libFilter.tags.length || S.libFilter.type || S.libFilter.lang) {
      html += `<button class="btn btn-sm" style="margin-left:6px;border-color:transparent;font-size:11px;" onclick="Library.clearFilters()">× Limpar</button>`;
    }

    document.getElementById('lib-filters').innerHTML = html;
  },

  filteredDocs() {
    let docs = S.docs;
    if (S.libFilter.tags.length)
      docs = docs.filter(d => S.libFilter.tags.every(t => (d.tags || []).includes(t)));
    if (S.libFilter.type)
      docs = docs.filter(d => d.type === S.libFilter.type);
    if (S.libFilter.lang)
      docs = docs.filter(d => d.lang === S.libFilter.lang);
    return docs;
  },

  renderGrid() {
    const docs  = this.filteredDocs();
    const grid  = document.getElementById('doc-grid');
    const empty = document.getElementById('lib-empty');
    if (!docs.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    grid.innerHTML = docs.sort((a, b) => b.addedAt - a.addedAt).map(d =>
      `<div class="doc-card" onclick="Library.openById('${d.id}')">
        <div class="doc-icon">📄</div>
        <div class="doc-title">${escHtml(d.title || d.name)}</div>
        <div class="doc-author">${escHtml(d.author || '—')}${d.year ? ' · ' + escHtml(d.year) : ''}</div>
        ${d.tags?.length ? `<div class="doc-tags">${d.tags.map(t => `<span class="doc-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        <button class="doc-edit" onclick="event.stopPropagation();Library.editMeta('${d.id}')">✏</button>
      </div>`
    ).join('');
  },

  renderSidebar() {
    document.getElementById('doc-list').innerHTML = S.docs
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(d => `<div class="sitem" id="sdoc-${d.id}" onclick="Library.openById('${d.id}')">
        <span class="ico" style="font-size:10px;">▪</span>
        <span class="lbl">${escHtml(d.title || d.name)}</span>
      </div>`).join('');
  },

  toggleTag(tag) {
    const i = S.libFilter.tags.indexOf(tag);
    if (i >= 0) S.libFilter.tags.splice(i, 1); else S.libFilter.tags.push(tag);
    this.renderFilters(); this.renderGrid();
  },
  setType(val) { S.libFilter.type = val; this.renderFilters(); this.renderGrid(); },
  setLang(val) { S.libFilter.lang = val; this.renderFilters(); this.renderGrid(); },
  clearFilters() { S.libFilter = {tags: [], type: '', lang: ''}; this.renderFilters(); this.renderGrid(); },

  async openById(id) {
    const doc = S.docs.find(d => d.id === id);
    if (doc) await this.open(doc);
  },

  async open(doc) {
    S.highlights = await DB.highlights.byPDF(doc.id);
    S.currentDoc = doc;
    UI.nav('reader', false);
    document.querySelectorAll('[id^="sdoc-"]').forEach(e => e.classList.remove('active'));
    document.getElementById(`sdoc-${doc.id}`)?.classList.add('active');
    UI.renderCats(); UI.renderPanelInfo(doc);
    document.getElementById('doc-title-hdr').textContent = doc.title || doc.name;
    await PV.open(doc);
  },

  editMeta(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    const tagsHtml = (d.tags || []).map(t =>
      `<span class="tag-pill">${escHtml(t)}<button onclick="Library._removeTagInModal('${escHtml(t)}')">×</button></span>`
    ).join('');
    Modal.show(`
      <h3>Editar Metadados</h3>
      <div class="fg-row">
        <div class="fg"><label>Título</label><input id="em-title" value="${escHtml(d.title||d.name)}"></div>
      </div>
      <div class="fg-row">
        <div class="fg"><label>Autor(es)</label><input id="em-author" value="${escHtml(d.author||'')}"></div>
        <div class="fg" style="max-width:80px;"><label>Ano</label><input id="em-year" value="${escHtml(d.year||'')}"></div>
      </div>
      <div class="fg-row">
        <div class="fg"><label>Tipo</label>
          <select id="em-type">
            ${['artigo','livro','tese','relatório','capítulo','outro'].map(t =>
              `<option value="${t}" ${(d.type||'').toLowerCase()===t?'selected':''}>${t}</option>`
            ).join('')}
          </select>
        </div>
        <div class="fg" style="max-width:80px;"><label>Idioma</label><input id="em-lang" value="${escHtml(d.lang||'')}"></div>
      </div>
      <div class="fg"><label>DOI</label><input id="em-doi" placeholder="10.xxxx/xxxx" value="${escHtml(d.doi||'')}"></div>
      <div class="fg">
        <label>Tags <small style="font-weight:400;color:var(--text3)">(Enter para adicionar)</small></label>
        <div class="tags-wrap" id="em-tags-wrap" onclick="document.getElementById('em-tag-in').focus()">
          ${tagsHtml}
          <input id="em-tag-in" placeholder="nova tag…" onkeydown="Library._tagKey(event,'${id}')">
        </div>
      </div>
      <div class="mactions">
        <button class="btn btn-d" onclick="Library.del('${id}')" style="margin-right:auto;">Remover</button>
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="Library.saveMeta('${id}')">Salvar</button>
      </div>
    `);
    Library._modalTags = [...(d.tags || [])];
  },

  _modalTags: [],

  _tagKey(e, docId) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().toLowerCase();
      if (val && !this._modalTags.includes(val)) {
        this._modalTags.push(val);
        const wrap = document.getElementById('em-tags-wrap');
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.innerHTML = `${escHtml(val)}<button onclick="Library._removeTagInModal('${escHtml(val)}')">×</button>`;
        wrap.insertBefore(pill, e.target);
      }
      e.target.value = '';
    }
  },

  _removeTagInModal(tag) {
    this._modalTags = this._modalTags.filter(t => t !== tag);
    document.getElementById('em-tags-wrap').querySelectorAll('.tag-pill').forEach(p => {
      if (p.textContent.replace('×', '').trim() === tag) p.remove();
    });
  },

  async saveMeta(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    d.title  = document.getElementById('em-title').value.trim()  || d.name;
    d.author = document.getElementById('em-author').value.trim();
    d.year   = document.getElementById('em-year').value.trim();
    d.type   = document.getElementById('em-type').value;
    d.lang   = document.getElementById('em-lang').value.trim();
    d.doi    = document.getElementById('em-doi').value.trim();
    d.tags   = [...this._modalTags];
    await DB.pdfs.save(d);
    Modal.hide(); this.renderGrid(); this.renderSidebar();
    if (S.currentDoc?.id === id) { S.currentDoc = d; UI.renderPanelInfo(d); }
    toast('Metadados salvos!');
  },

  async del(id) {
    if (!confirm('Remover este documento e todos os seus highlights?')) return;
    await DB.pdfs.del(id);
    Modal.hide();
    S.docs = S.docs.filter(d => d.id !== id);
    if (S.currentDoc?.id === id) { S.currentDoc = null; S.highlights = []; }
    this.renderGrid(); this.renderSidebar();
    UI.nav('library');
    toast('Documento removido.');
  },
};

/* ══════════════════════════════════════
   PROJECTS — rich contenteditable editor
══════════════════════════════════════ */
const Proj = {
  _saveTimer: null,

  async load() {
    const projs = await DB.projects.all();
    const list  = document.getElementById('proj-list');
    const empty = document.getElementById('proj-empty');
    if (!projs.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = projs.sort((a, b) => b.updatedAt - a.updatedAt).map(p =>
      `<div class="proj-card" onclick="Proj.open('${p.id}')">
        <span style="font-size:20px;">📄</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:500;">${escHtml(p.title)}</div>
          <div style="font-size:11px;color:var(--text3);">${new Date(p.updatedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
        </div>
        <button class="btn btn-d btn-sm" onclick="event.stopPropagation();Proj.del('${p.id}')">✕</button>
      </div>`
    ).join('');
  },

  newProj() {
    Modal.show(`
      <h3>Novo Projeto</h3>
      <div class="fg"><label>Título</label><input id="np-t" type="text" autofocus placeholder="Ex: Revisão de Literatura — Capítulo 2"></div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="Proj.create()">Criar</button>
      </div>
    `);
    setTimeout(() => document.getElementById('np-t')?.focus(), 80);
  },

  async create() {
    const title = document.getElementById('np-t')?.value?.trim();
    if (!title) return;
    const p = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title, content: '', createdAt: Date.now(), updatedAt: Date.now()
    };
    await DB.projects.save(p);
    Modal.hide(); this.open(p.id);
  },

  async open(id) {
    const p = typeof id === 'string' ? await DB.projects.get(id) : id;
    if (!p) return;
    S.openProjId = p.id;
    document.getElementById('proj-edit-title').textContent = p.title;

    // Deserialize stored HTML into the editor
    const editor = document.getElementById('proj-content');
    editor.innerHTML = p.content || '';

    // Re-attach click handlers to any embedded att cards
    this._reattachCards(editor);

    const views = ['library-view','reader-view','suco-view','projects-view','proj-editor-view','attachments-view','search-view'];
    views.forEach(v => document.getElementById(v)?.classList.toggle('active', v === 'proj-editor-view'));
    document.getElementById('main-tabs').style.display = 'none';
    document.querySelectorAll('[id^="snav-"]').forEach(e => e.classList.remove('active'));
    document.getElementById('snav-projects').classList.add('active');

    // Add page-break button to editor bar (once)
    const editorBar = document.querySelector('.editor-bar');
    if (editorBar && !editorBar.querySelector('.page-break-btn')) {
      const pbBtn = document.createElement('button');
      pbBtn.className = 'btn btn-sm page-break-btn';
      pbBtn.textContent = '↓ Nova Página';
      pbBtn.title = 'Inserir quebra de página na posição do cursor';
      pbBtn.onclick = () => Proj.insertPageBreak();
      const saveBtn = editorBar.querySelector('.btn-p');
      if (saveBtn) editorBar.insertBefore(pbBtn, saveBtn);
      else editorBar.appendChild(pbBtn);
    }
  },

  _reattachCards(editor) {
    editor.querySelectorAll('.proj-att-card').forEach(card => {
      card.setAttribute('contenteditable', 'false');
      card.onclick = (e) => {
        if (e.target.classList.contains('proj-att-card-del') ||
            e.target.classList.contains('proj-att-card-up')  ||
            e.target.classList.contains('proj-att-card-dn'))  return;
        const pdfId = card.dataset.pdfId;
        const page  = parseInt(card.dataset.page, 10);
        if (pdfId && page) {
          const doc = S.docs.find(d => d.id === pdfId);
          if (doc) Library.open(doc).then(() => setTimeout(() => PV.go(page), 600));
        }
      };
      // Delete
      const delBtn = card.querySelector('.proj-att-card-del');
      if (delBtn) {
        delBtn.onclick = (e) => { e.stopPropagation(); card.remove(); this.scheduleSave(); };
      }
      // Move up
      const upBtn = card.querySelector('.proj-att-card-up');
      if (upBtn) {
        upBtn.onclick = (e) => {
          e.stopPropagation();
          let prev = card.previousElementSibling;
          while (prev && prev.tagName === 'P' && !prev.textContent.trim()) prev = prev.previousElementSibling;
          if (prev) { card.parentNode.insertBefore(card, prev); this.scheduleSave(); }
        };
      }
      // Move down
      const dnBtn = card.querySelector('.proj-att-card-dn');
      if (dnBtn) {
        dnBtn.onclick = (e) => {
          e.stopPropagation();
          let next = card.nextElementSibling;
          while (next && next.tagName === 'P' && !next.textContent.trim()) next = next.nextElementSibling;
          if (next) { card.parentNode.insertBefore(next, card); this.scheduleSave(); }
        };
      }
    });
  },

  buildAttCard(a, c, ref) {
    const isImg = a.type === 'image';
    return `<div class="proj-att-card" contenteditable="false"
      data-pdf-id="${escHtml(a.pdfId)}"
      data-page="${a.page}"
      style="border-left-color:${c.color};">
      ${isImg
        ? `<img class="proj-att-card-img" src="${escHtml(a.imageData||'')}" alt="Imagem p.${a.page}">`
        : `<div class="proj-att-card-text">"${escHtml((a.text||'').substring(0,280))}${(a.text||'').length>280?'…':''}"</div>`
      }
      <div class="proj-att-card-meta">
        <span class="cat-badge" style="background:${c.bg};color:${c.color};">${escHtml(c.name)}</span>
        ${ref ? `<span>${escHtml(ref)}</span>` : ''}
        <span>p. ${a.page}</span>
        <div class="proj-att-card-actions">
          <button class="proj-att-card-up" title="Mover para cima">↑</button>
          <button class="proj-att-card-dn" title="Mover para baixo">↓</button>
          <button class="proj-att-card-del" title="Remover do projeto">✕</button>
        </div>
      </div>
    </div>`;
  },

  onInput() {
    this.scheduleSave();
  },

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveContent(), 800);
  },

  async saveContent() {
    if (!S.openProjId) return;
    const p = await DB.projects.get(S.openProjId);
    if (!p) return;
    const editor = document.getElementById('proj-content');
    p.content = editor ? editor.innerHTML : '';
    p.updatedAt = Date.now();
    await DB.projects.save(p);
  },

  insertPageBreak() {
    const editor = document.getElementById('proj-content');
    if (!editor) return;

    const breaks = editor.querySelectorAll('.page-break-marker');
    const pageNum = breaks.length + 2;

    const sep1 = document.createElement('p');
    sep1.innerHTML = '<br>';

    const marker = document.createElement('div');
    marker.className = 'page-break-marker';
    marker.setAttribute('contenteditable', 'false');
    marker.innerHTML = `<span class="pbm-label">Página ${pageNum}</span>`;

    const sep2 = document.createElement('p');
    sep2.innerHTML = '<br>';

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(sep2);
      range.insertNode(marker);
      range.insertNode(sep1);
    } else {
      editor.appendChild(sep1);
      editor.appendChild(marker);
      editor.appendChild(sep2);
    }

    const newRange = document.createRange();
    newRange.setStartAfter(sep2);
    newRange.collapse(true);
    const sel2 = window.getSelection();
    sel2.removeAllRanges();
    sel2.addRange(newRange);
    editor.focus();
    this.scheduleSave();
    toast('Quebra de página inserida.');
  },

  async del(id) {
    if (!confirm('Remover este projeto?')) return;
    await DB.projects.del(id);
    toast('Projeto removido.');
    this.load();
  },
};

// Auto-save de projetos a cada 30s
setInterval(async () => {
  if (S.openProjId && document.getElementById('proj-editor-view').classList.contains('active')) {
    const p = await DB.projects.get(S.openProjId);
    if (p) {
      const editor = document.getElementById('proj-content');
      p.content = editor ? editor.innerHTML : p.content;
      p.updatedAt = Date.now();
      await DB.projects.save(p);
    }
  }
}, 30000);

/* ══════════════════════════════════════
   ATTACHMENTS VIEW
══════════════════════════════════════ */
const Attachments = {
  async load() {
    const atts = await DB.attachments.all();
    const list  = document.getElementById('att-list');
    const empty = document.getElementById('att-empty');
    if (!atts.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    const sortedAtts = atts.sort((a, b) => b.createdAt - a.createdAt);
    list.innerHTML = sortedAtts.map(a => {
      const c   = getCat(a.catId);
      const ref = [a.reference?.author, a.reference?.year].filter(Boolean).join(', ')
                + (a.reference?.doi ? ` | DOI: ${a.reference.doi}` : '');
      return `<div class="att-item" style="border-left-color:${c.color};" onclick="Attachments.jump('${a.pdfId}',${a.page})">
        ${a.type === 'image'
          ? `<img src="${escHtml(a.imageData||'')}" style="max-width:100%;border-radius:4px;margin-bottom:6px;border:1px solid var(--border2);" alt="Imagem">`
          : `<div class="att-text">"${escHtml(a.text)}"</div>`
        }
        <div class="att-ref">${escHtml(ref)} · p. ${a.page}</div>
        ${a.note ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;font-style:italic;">📝 ${escHtml(a.note)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="event.stopPropagation();Attachments.insertInProject('${a.id}')">📌 Inserir em Projeto</button>
          <button class="btn btn-sm" onclick="event.stopPropagation();Attachments.copyRef('${a.id}')">📋 Copiar Ref.</button>
          <button class="btn btn-d btn-sm" onclick="event.stopPropagation();Attachments.del('${a.id}')">✕</button>
        </div>
      </div>`;
    }).join('');
  },

  async jump(pdfId, page) {
    const doc = S.docs.find(d => d.id === pdfId);
    if (doc) { await Library.open(doc); setTimeout(() => PV.go(page), 600); }
  },

  async insertInProject(attId, prebuiltAtt) {
    // Get all projects so user can pick one
    const projs = await DB.projects.all();
    if (!projs.length) {
      toast('Nenhum projeto criado. Crie um projeto primeiro.');
      return;
    }

    let a = prebuiltAtt;
    if (!a) {
      const atts = await DB.attachments.all();
      a = atts.find(x => x.id === attId);
    }
    if (!a) return;

    if (projs.length === 1) {
      await this._doInsert(a, projs[0]);
      return;
    }

    const sortedProjs = projs.sort((x, y) => y.updatedAt - x.updatedAt);
    Attachments._pendingInsertAtt = a;
    Attachments._allProjs = sortedProjs;

    Modal.show(`
      <h3>Inserir em Projeto</h3>
      <div style="margin-bottom:12px;font-size:13px;color:var(--text2);font-style:italic;">
        "${escHtml((a.text || '').substring(0, 80))}${(a.text||'').length > 80 ? '…' : ''}"
      </div>
      <div class="fg">
        <input id="ins-proj-search" type="text" placeholder="Buscar projeto…"
          oninput="Attachments._filterProjList(this.value)"
          style="margin-bottom:8px;">
        <div id="ins-proj-list" class="ins-proj-list">
          ${sortedProjs.map(p => `
            <div class="ins-proj-item" data-id="${p.id}" onclick="Attachments._pickProj('${p.id}')">
              <span style="font-size:15px;">📄</span>
              <div>
                <div style="font-size:13px;font-weight:500;">${escHtml(p.title)}</div>
                <div style="font-size:11px;color:var(--text3);">${new Date(p.updatedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
      </div>
    `);
    setTimeout(() => document.getElementById('ins-proj-search')?.focus(), 80);
  },

  _pendingInsertAtt: null,
  _allProjs: [],

  _filterProjList(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll('.ins-proj-item').forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  },

  async _pickProj(projId) {
    const proj = this._allProjs.find(p => p.id === projId);
    if (!proj || !this._pendingInsertAtt) { Modal.hide(); return; }
    Modal.hide();
    await this._doInsert(this._pendingInsertAtt, proj);
  },

  async _insertPicked(attId) {
    const selEl = document.getElementById('ins-proj-sel');
    if (!selEl) return;
    const projId = selEl.value;
    const proj = await DB.projects.get(projId);
    if (!proj || !this._pendingInsertAtt) { Modal.hide(); return; }
    await this._doInsert(this._pendingInsertAtt, proj);
    Modal.hide();
  },

  async _doInsert(a, proj) {
    const c    = getCat(a.catId);
    const ref  = [a.reference?.author, a.reference?.year].filter(Boolean).join(', ')
               + (a.reference?.doi ? ` | DOI: ${a.reference.doi}` : '');

    // Build card HTML that will be stored inside the project content
    const card = Proj.buildAttCard(a, c, ref);

    // Open the project editor
    await Proj.open(proj.id);
    UI.nav('proj-editor');

    // Append the card into the contenteditable
    setTimeout(() => {
      const editor = document.getElementById('proj-content');
      if (!editor) return;

      // Insert a paragraph separator then the card
      const sep = document.createElement('p');
      sep.innerHTML = '<br>';
      editor.appendChild(sep);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = card;
      const cardEl = wrapper.firstChild;
      editor.appendChild(cardEl);

      const sep2 = document.createElement('p');
      sep2.innerHTML = '<br>';
      editor.appendChild(sep2);

      // Move cursor after inserted card
      const range = document.createRange();
      range.setStartAfter(sep2);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      editor.scrollTop = editor.scrollHeight;
      Proj._reattachCards(editor);
      Proj.scheduleSave();
      toast(`Anexo inserido em "${proj.title}"`);
    }, 150);
  },

  async copyRef(attId) {
    const atts = await DB.attachments.all();
    const a = atts.find(x => x.id === attId);
    if (!a) return;
    const ref  = [a.reference?.author, a.reference?.year].filter(Boolean).join(', ')
               + (a.reference?.doi ? `. DOI: ${a.reference.doi}` : '');
    const text = `"${a.text}" (${ref})`;
    navigator.clipboard.writeText(text)
      .then(() => toast('Referência copiada!'))
      .catch(() => toast(text, 5000));
  },

  async del(attId) {
    if (!confirm('Remover este anexo?')) return;
    await DB.attachments.del(attId);
    const all = await DB.highlights.all();
    const hl  = all.find(h => 'att_' + h.id === attId);
    if (hl) {
      hl.isAttachment = false;
      await DB.highlights.save(hl);
      const hx = S.highlights.find(h => h.id === hl.id);
      if (hx) hx.isAttachment = false;
    }
    toast('Anexo removido.');
    this.load();
  },
};

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
const Search = {
  async run(q) {
    q = q.trim().toLowerCase();
    const res = document.getElementById('search-results');
    if (q.length < 2) { res.innerHTML = ''; return; }

    const [allHLs, allDocs, allProjs, allAtts] = await Promise.all([
      DB.highlights.all(), DB.pdfs.all(), DB.projects.all(), DB.attachments.all()
    ]);
    const docMap = Object.fromEntries(allDocs.map(d => [d.id, d]));

    const hlHits   = allHLs.filter(h => h.text.toLowerCase().includes(q) || (h.note && h.note.toLowerCase().includes(q)));
    const projHits = allProjs.filter(p => p.title.toLowerCase().includes(q) || (p.content && p.content.toLowerCase().includes(q)));
    const attHits  = allAtts.filter(a => a.text.toLowerCase().includes(q) || (a.note && a.note.toLowerCase().includes(q)));

    if (!hlHits.length && !projHits.length && !attHits.length) {
      res.innerHTML = '<p style="color:var(--text3);font-size:14px;">Nenhum resultado encontrado.</p>';
      return;
    }

    let html = '';
    const sect = (title, cnt) => `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:600;margin:18px 0 10px;">${title} (${cnt})</div>`;

    if (hlHits.length) {
      html += sect('Highlights', hlHits.length);
      html += hlHits.map(h => {
        const c = getCat(h.catId); const d = docMap[h.pdfId];
        return `<div class="suco-item" style="border-left-color:${c.color};margin-bottom:8px;" onclick="Search.jumpHL('${h.pdfId}',${h.page})">
          <div class="suco-text">"${escHtml(h.text.substring(0, 200))}"</div>
          <div class="suco-meta">
            <span class="cat-badge" style="background:${c.bg};color:${c.color};">${escHtml(c.name)}</span>
            <span>${d ? escHtml(d.title||d.name) : '—'}</span>
            <span>p. ${h.page}</span>
          </div>
          ${h.note ? `<div style="font-size:12px;color:var(--text2);font-style:italic;margin-top:4px;">📝 ${escHtml(h.note)}</div>` : ''}
        </div>`;
      }).join('');
    }
    if (attHits.length) {
      html += sect('Anexos', attHits.length);
      html += attHits.map(a => {
        const c = getCat(a.catId);
        const ref = [a.reference?.author, a.reference?.year].filter(Boolean).join(', ');
        return `<div class="att-item" style="border-left-color:${c.color};margin-bottom:8px;" onclick="Search.jumpHL('${a.pdfId}',${a.page})">
          <div class="att-text">"${escHtml(a.text.substring(0, 200))}"</div>
          <div class="att-ref">${escHtml(ref)} · p. ${a.page}</div>
        </div>`;
      }).join('');
    }
    if (projHits.length) {
      html += sect('Projetos', projHits.length);
      html += projHits.map(p =>
        `<div class="proj-card" onclick="Proj.open('${p.id}')">
          <span style="font-size:19px;">📄</span>
          <div style="flex:1;"><div style="font-size:14px;font-weight:500;">${escHtml(p.title)}</div></div>
        </div>`
      ).join('');
    }
    res.innerHTML = html;
  },

  async jumpHL(pdfId, page) {
    const doc = S.docs.find(d => d.id === pdfId);
    if (doc) { await Library.open(doc); setTimeout(() => PV.go(page), 600); }
  },
};

/* ══════════════════════════════════════
   UI CONTROLLER
══════════════════════════════════════ */
const VIEWS = [
  'library-view','reader-view','suco-view',
  'projects-view','proj-editor-view','attachments-view','search-view'
];

const UI = {
  nav(view, updateNav = true) {
    S.view = view;
    const isReader = view === 'reader' || view === 'suco';
    document.getElementById('main-tabs').style.display   = isReader ? 'flex' : 'none';
    document.getElementById('pdf-bar').style.display     = (view === 'reader' && S.pdfDoc) ? 'flex' : 'none';

    VIEWS.forEach(v => {
      const show = (
        (view === 'library'     && v === 'library-view')     ||
        (view === 'reader'      && v === 'reader-view')      ||
        (view === 'suco'        && v === 'suco-view')        ||
        (view === 'projects'    && v === 'projects-view')    ||
        (view === 'proj-editor' && v === 'proj-editor-view') ||
        (view === 'attachments' && v === 'attachments-view') ||
        (view === 'search'      && v === 'search-view')
      );
      document.getElementById(v)?.classList.toggle('active', show);
    });

    if (updateNav) {
      document.querySelectorAll('[id^="snav-"]').forEach(e => e.classList.remove('active'));
      const navMap = {
        library: 'library', reader: 'library', suco: 'library',
        projects: 'projects', attachments: 'attachments', search: 'search'
      };
      const navId = navMap[view];
      if (navId) document.getElementById('snav-' + navId)?.classList.add('active');
    }

    if (view === 'library')     Library.load();
    if (view === 'suco')        Suco.render();
    if (view === 'projects')    Proj.load();
    if (view === 'attachments') Attachments.load();
  },

  tab(t) {
    S.activeTab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + t)?.classList.add('active');
    this.nav(t, false);
  },

  upload() { document.getElementById('file-input').click(); },

  async onUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    toast(`Importando ${files.length} arquivo(s)…`);

    for (const file of files) {
      try {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const docPayload = {
          id, name: file.name.replace(/\.pdf$/i, ''),
          title: file.name.replace(/\.pdf$/i, ''),
          author: '', year: '', type: 'artigo', lang: 'pt', doi: '', tags: [],
          addedAt: Date.now(), size: file.size,
        };
        const savedDoc = await DB.pdfs.upload(file, docPayload);
        const ix = S.docs.findIndex(d => d.id === savedDoc.id);
        if (ix >= 0) S.docs[ix] = savedDoc;
        else S.docs.push(savedDoc);
        toast(`"${savedDoc.title}" adicionado!`);
      } catch(err) {
        console.error(err);
        toast(`Erro ao importar: ${file.name}`);
      }
    }
    Library.renderGrid(); Library.renderSidebar(); Library.renderFilters();
    e.target.value = '';
  },

  renderCats() {
    const el = document.getElementById('panel-cats');
    if (!el) return;
    const counts = {};
    S.highlights.forEach(h => counts[h.catId] = (counts[h.catId] || 0) + 1);
    el.innerHTML = S.cats.map(c =>
      `<div class="cat-row">
        <div class="cat-dot" style="background:${c.color};"></div>
        <span class="cat-name">${escHtml(c.name)}</span>
        <span class="cat-n">${counts[c.id] || 0}</span>
      </div>`
    ).join('');
  },

  renderPanelInfo(doc) {
    document.getElementById('panel-info').innerHTML = `
      <strong style="color:var(--text2);display:block;margin-bottom:5px;font-size:13px;">${escHtml(doc.title||doc.name)}</strong>
      ${doc.author ? `<div>✍ ${escHtml(doc.author)}</div>` : ''}
      ${doc.year   ? `<div>📅 ${escHtml(doc.year)}</div>`   : ''}
      ${doc.doi    ? `<div style="word-break:break-all;">DOI: ${escHtml(doc.doi)}</div>` : ''}
      ${doc.type   ? `<div>📂 ${escHtml(doc.type)}</div>`   : ''}
      ${doc.lang   ? `<div>🌐 ${escHtml(doc.lang)}</div>`   : ''}
      ${doc.tags?.length ? `<div style="margin-top:5px;">${doc.tags.map(t=>`<span class="doc-tag">${escHtml(t)}</span>`).join(' ')}</div>` : ''}
      <div style="margin-top:7px;padding-top:7px;border-top:1px solid var(--border2);font-size:11px;">
        ${S.highlights.length} highlight(s)
      </div>
    `;
  },

  _sidebarCollapsed: false,
  _rpanelCollapsed: false,

  toggleSidebar() {
    this._sidebarCollapsed = !this._sidebarCollapsed;
    const sb  = document.getElementById('sidebar');
    const btn = document.getElementById('toggle-left');
    sb.classList.toggle('collapsed', this._sidebarCollapsed);
    btn.classList.toggle('collapsed', this._sidebarCollapsed);
    btn.textContent = this._sidebarCollapsed ? '›' : '‹';
  },

  toggleRPanel() {
    this._rpanelCollapsed = !this._rpanelCollapsed;
    const rp  = document.getElementById('rpanel');
    const btn = document.getElementById('toggle-right');
    rp.classList.toggle('collapsed', this._rpanelCollapsed);
    btn.classList.toggle('collapsed', this._rpanelCollapsed);
    btn.textContent = this._rpanelCollapsed ? '‹' : '›';
  },

  showSettings() {
    const isDark = document.body.classList.contains('dark-mode');
    Modal.show(`
      <h3>⚙ Configurações</h3>
      <div class="theme-row">
        <span>Modo escuro</span>
        <label class="theme-switch">
          <input type="checkbox" id="dark-toggle" ${isDark ? 'checked' : ''} onchange="UI.toggleDark(this.checked)">
          <span class="theme-slider"></span>
        </label>
      </div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border2);">
        <div class="fg"><label style="margin-bottom:8px;display:block;font-size:12px;color:var(--text2);font-weight:500;">Categorias de Highlights</label>
          <button class="btn btn-sm" style="width:100%;text-align:left;" onclick="Modal.hide();UI.showCatEditor()">⊞ Configurar Categorias</button>
        </div>
      </div>
      <div class="mactions"><button class="btn" onclick="Modal.hide()">Fechar</button></div>
    `);
  },

  showCatEditor() {
    Modal.show(`
      <h3>Configurar Categorias de Highlights</h3>
      <div id="cat-editor-list">
        ${S.cats.map((c, i) =>
          `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <input type="color" value="${c.color}" id="cc-${i}" style="width:30px;height:30px;border:none;border-radius:4px;cursor:pointer;padding:1px;">
            <input type="text" value="${escHtml(c.name)}" id="cn-${i}" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:var(--font-ui);">
            <button class="btn btn-d btn-sm" onclick="UI._removeCat(${i})">✕</button>
          </div>`
        ).join('')}
      </div>
      <button class="btn btn-sm" style="width:100%;margin-bottom:12px;" onclick="UI._addCat()">+ Adicionar Categoria</button>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="UI._saveCats()">Salvar</button>
      </div>
    `);
  },

  _addCat() {
    S.cats.push({id: 'cat' + Date.now(), name: 'Nova Categoria', color: '#888888', bg: 'rgba(136,136,136,.18)'});
    this.showCatEditor();
  },
  _removeCat(i) { S.cats.splice(i, 1); this.showCatEditor(); },
  _saveCats() {
    document.querySelectorAll('[id^="cn-"]').forEach((el, i) => {
      const col = document.getElementById(`cc-${i}`);
      if (S.cats[i]) {
        S.cats[i].name  = el.value.trim() || S.cats[i].name;
        S.cats[i].color = col.value;
        S.cats[i].bg    = hexToRgba(col.value, .18);
      }
    });
    saveCats(); Modal.hide(); this.renderCats(); toast('Categorias salvas!');
  },

  toggleDark(on) {
    document.body.classList.toggle('dark-mode', on);
    DB.settings.patch({darkMode: on}).catch(err => {
      console.warn('Falha ao salvar tema no servidor.', err);
      toast('Não foi possível salvar o tema no servidor.', 2800);
    });
  },
};

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16),
        g = parseInt(hex.slice(3,5),16),
        b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
async function init() {
  try {
    await DB.init();
    await loadCats();
    UI.renderCats();
    ImgCapture.init();
    await Library.load();
    toast('Lumen carregado ✓');
  } catch(err) {
    console.error(err);
    toast('Erro ao inicializar. Verifique o console.');
  }
}

init();
