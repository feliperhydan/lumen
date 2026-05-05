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
