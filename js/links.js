const Links = {
  mode: null,
  pendingOriginId: null,

  toggleOriginMode() {
    if (this.mode === 'origin') {
      this.cancelMode();
    } else {
      this.cancelMode();
      this.mode = 'origin';
      document.body.style.cursor = 'crosshair';
      document.getElementById('origin-mode-btn').classList.add('on');
      toast('Modo Ponto de Origem: clique em qualquer lugar do PDF para criar um marcador.');
    }
  },

  startEndMode(originId) {
    this.cancelMode();
    this.mode = 'end';
    this.pendingOriginId = originId;
    document.body.style.cursor = 'crosshair';
    document.getElementById('link-mode-banner').style.display = 'flex';
  },

  cancelEndMode() {
    this.cancelMode();
  },

  cancelMode() {
    this.mode = null;
    this.pendingOriginId = null;
    document.body.style.cursor = '';
    const btn = document.getElementById('origin-mode-btn');
    if (btn) btn.classList.remove('on');
    const banner = document.getElementById('link-mode-banner');
    if (banner) banner.style.display = 'none';
  },

  async onClick(e, pageNum, wrap) {
    if (!this.mode) return false;

    const wRect = wrap.getBoundingClientRect();
    const rx = (e.clientX - wRect.left) / wrap.clientWidth;
    const ry = (e.clientY - wRect.top) / wrap.clientHeight;

    const currentMode = this.mode;
    const originId = this.pendingOriginId;
    this.cancelMode();

    if (currentMode === 'origin') {
      await this.createOrigin(pageNum, rx, ry);
    } else if (currentMode === 'end') {
      await this.createEnd(pageNum, rx, ry, originId);
    }
    return true; // handled
  },

  async createOrigin(pageNum, rx, ry) {
    const doc = S.currentDoc;
    if (!doc) return;

    const hl = {
      id: 'hl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pdfId: doc.id,
      page: pageNum,
      type: 'origin',
      catId: 'def',
      rects: [{x: rx - 0.015, y: ry - 0.015, w: 0.03, h: 0.03}], // Center the box
      text: 'Ponto de Origem',
      note: '',
      createdAt: Date.now()
    };

    try {
      await DB.highlights.save(hl);
      S.highlights.push(hl);
      PV.refreshPage(pageNum);
      RP.showHighlight(hl);
      toast('Ponto de origem criado!');
    } catch(err) {
      console.error(err);
      toast('Erro ao criar ponto de origem.');
    }
  },

  async createEnd(pageNum, rx, ry, originId) {
    const doc = S.currentDoc;
    if (!doc) return;

    const catOptions = S.cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    Modal.show(`
      <h3>Novo Destino</h3>
      <div class="fg">
        <label>Nome / Título do Destino</label>
        <input id="link-end-name" value="Ponto de Fim">
      </div>
      <div class="fg">
        <label>Categoria</label>
        <select id="link-end-cat">
          ${catOptions}
        </select>
      </div>
      <div class="fg">
        <label>Nota do Destino</label>
        <textarea id="link-end-note" placeholder="Adicione contexto sobre por que este destino foi vinculado..."></textarea>
      </div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="Links.saveEnd(${pageNum}, ${rx}, ${ry}, '${originId}')">Salvar Destino</button>
      </div>
    `);
  },

  async saveEnd(pageNum, rx, ry, originId) {
    const name = document.getElementById('link-end-name').value.trim() || 'Ponto de Fim';
    const catId = document.getElementById('link-end-cat').value;
    const note = document.getElementById('link-end-note').value;
    Modal.hide();

    const doc = S.currentDoc;
    if (!doc) return;

    const hl = {
      id: 'hl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pdfId: doc.id,
      page: pageNum,
      type: 'end',
      catId: catId,
      rects: [{x: rx - 0.015, y: ry - 0.015, w: 0.03, h: 0.03}],
      originId: originId,
      text: name,
      note: note,
      createdAt: Date.now()
    };

    try {
      await DB.highlights.save(hl);
      S.highlights.push(hl);
      PV.refreshPage(pageNum);
      RP.showHighlight(hl);
      toast('Ponto de fim criado e vinculado!');
    } catch(err) {
      console.error(err);
      toast('Erro ao criar ponto de fim.');
    }
  },

  async navigateToOrigin(originId) {
    try {
      const highlights = await DB.highlights.all();
      const origin = highlights.find(h => h.id === originId);
      if (!origin) throw new Error('Origem não encontrada');
      
      const pdfs = await DB.pdfs.all();
      const doc = pdfs.find(p => p.id === origin.pdfId);
      
      if (!doc) throw new Error('Documento original não encontrado');
      
      await Library.openById(doc.id, {
        preserveView: true,
        viewState: { page: origin.page, centerRatio: origin.rects[0]?.y || 0.5 }
      });
      setTimeout(() => RP.showHighlight(origin), 400);
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  },
  
  async navigateToEnd(endId) {
    try {
      const highlights = await DB.highlights.all();
      const endPt = highlights.find(h => h.id === endId);
      if (!endPt) throw new Error('Destino não encontrado');
      
      const pdfs = await DB.pdfs.all();
      const doc = pdfs.find(p => p.id === endPt.pdfId);
      
      if (!doc) throw new Error('Documento de destino não encontrado');
      
      await Library.openById(doc.id, {
        preserveView: true,
        viewState: { page: endPt.page, centerRatio: endPt.rects[0]?.y || 0.5 }
      });
      setTimeout(() => RP.showHighlight(endPt), 400);
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }
};
