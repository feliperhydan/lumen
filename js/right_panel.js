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

  async showHighlight(h) {
    S.selectedHL = h;
    document.getElementById('rp-default').style.display   = 'none';
    document.getElementById('rp-idle').style.display      = 'none';
    document.getElementById('rp-highlight').style.display = 'flex';
    document.getElementById('rp-hl-content').innerHTML = '<div class="loading" style="padding: 20px;">Carregando...</div>';
    await this.renderHL(h);
  },

  async renderHL(h) {
    if (h.type === 'origin' || h.type === 'end') {
      await this.renderLinkHL(h);
      return;
    }
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

  async renderLinkHL(h) {
    const c = getCat(h.catId);
    let originHl = null;
    let endPoints = [];
    const pdfs = await DB.pdfs.all();
    
    if (h.type === 'end') {
      const highlights = await fetch('/api/highlights').then(r => r.json());
      originHl = highlights.find(x => x.id === h.originId);
    } else if (h.type === 'origin') {
      const highlights = await fetch('/api/highlights').then(r => r.json());
      endPoints = highlights.filter(x => x.type === 'end' && x.originId === h.id);
    }

    const catOpts = S.cats.map(c2 =>
      `<option value="${c2.id}" ${c2.id===h.catId?'selected':''}>${c2.name}</option>`
    ).join('');

    const dateStr = h.createdAt ? new Date(h.createdAt).toLocaleDateString() : '';

    let html = `
      <div class="hl-panel-text" style="font-weight:bold; color:var(--text-main); font-size: 15px; display:flex; align-items:center; gap:6px;">
        ${h.type === 'origin' 
          ? `<img src="assets/icons/icone-ponto-inicial-preto.png" class="ui-icon-theme ui-icon-light"><img src="assets/icons/icone-ponto-inicial-branco.png" class="ui-icon-theme ui-icon-dark"> Ponto de Origem` 
          : `<img src="assets/icons/icone-ponto-final-preto.png" class="ui-icon-theme ui-icon-light"><img src="assets/icons/icone-ponto-final-branco.png" class="ui-icon-theme ui-icon-dark"> ${escHtml(h.text || 'Ponto de Fim')}`}
      </div>
      <div class="hl-panel-sect">
        <div class="hl-panel-lbl">Categoria</div>
        <select class="hl-cat-sel" id="rp-cat-sel" onchange="RP.changeCat('${h.id}',this.value)">${catOpts}</select>
      </div>
    `;

    if (h.type === 'origin') {
      html += `
        <div class="hl-panel-sect">
          <div class="hl-panel-lbl">Nota do Ponto de Origem</div>
          <textarea class="hl-panel-note" id="rp-note" placeholder="Adicione contexto a este ponto…" oninput="RP.noteChange('${h.id}',this.value)">${escHtml(h.note||'')}</textarea>
        </div>
        ${dateStr ? `<div class="hl-panel-sect"><div class="hl-panel-lbl">Data de criação</div><div style="font-size:12px;color:var(--text3);">${dateStr}</div></div>` : ''}
        
        <div class="hl-panel-sect">
          <div class="hl-panel-lbl">Pontos de Fim (Destinos)</div>
          ${endPoints.length === 0 ? '<div style="font-size:12px;color:var(--text3);">Nenhum destino criado ainda.</div>' : ''}
          <div style="display:flex;flex-direction:column;gap:5px;margin-top:5px;">
            ${endPoints.map(ep => {
              const epDoc = pdfs.find(p => p.id === ep.pdfId);
              const docTitle = epDoc ? (epDoc.title || epDoc.name) : 'Doc. desconhecido';
              const epLabel = ep.text && ep.text !== 'Ponto de Fim' ? ep.text : docTitle;
              return `
                <div style="display:flex; gap:5px; align-items:center;">
                  <button class="btn btn-sm" style="flex:1; text-align:left; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; gap:5px;" onclick="Links.navigateToEnd('${ep.id}')" title="${escHtml(docTitle)}">
                    <img src="assets/icons/icone-ponto-final-preto.png" class="ui-icon-theme ui-icon-light">
                    <img src="assets/icons/icone-ponto-final-branco.png" class="ui-icon-theme ui-icon-dark">
                    ${escHtml(epLabel)} (Pág. ${ep.page})
                  </button>
                  <button class="btn btn-d btn-sm" style="padding:4px 8px;" title="Remover este vínculo" onclick="RP.deleteHL('${ep.id}'); setTimeout(() => RP.showHighlight(S.selectedHL), 200);">✖</button>
                </div>
              `;
            }).join('')}
          </div>
          <button class="btn btn-p btn-sm" style="margin-top:10px;width:100%; display:flex; align-items:center; justify-content:center; gap:5px;" onclick="Links.startEndMode('${h.id}')">
            <img src="assets/icons/icone-ponto-final-preto.png" class="ui-icon-theme ui-icon-light" style="margin-right:0;">
            <img src="assets/icons/icone-ponto-final-branco.png" class="ui-icon-theme ui-icon-dark" style="margin-right:0;">
            Adicionar Ponto de Fim
          </button>
        </div>
        
        <div class="hl-actions">
          <button class="btn btn-d btn-sm" style="width:100%;text-align:left;" onclick="RP.deleteOriginHL('${h.id}')">🗑 Apagar Origem e Todos os Destinos</button>
        </div>
      `;
    } else {
      const originNote = originHl ? originHl.note : 'Origem inacessível.';
      const originDoc = originHl ? pdfs.find(p => p.id === originHl.pdfId) : null;
      const originRef = originDoc ? `${escHtml(originDoc.title || originDoc.name)} - Pág. ${originHl.page}` : 'Desconhecida';
      
      html += `
        <div class="hl-panel-sect">
          <div class="hl-panel-lbl">Nota do Destino</div>
          <textarea class="hl-panel-note" id="rp-note" placeholder="Adicione uma nota..." oninput="RP.noteChange('${h.id}',this.value)">${escHtml(h.note||'')}</textarea>
        </div>
        <div class="hl-panel-sect">
          <div class="hl-panel-lbl">Origem do Vínculo</div>
          <div style="font-size:12px;color:var(--text3);">${originRef}</div>
        </div>
        <div class="hl-panel-sect">
          <div class="hl-panel-lbl">Nota da Origem</div>
          <div style="font-size:13px;color:var(--text2);padding:8px;background:rgba(0,0,0,0.1);border-radius:6px;min-height:50px;">${escHtml(originNote||'Sem nota.')}</div>
        </div>
        ${dateStr ? `<div class="hl-panel-sect"><div class="hl-panel-lbl">Data de criação</div><div style="font-size:12px;color:var(--text3);">${dateStr}</div></div>` : ''}
        
        <div class="hl-actions">
          <button class="btn btn-p btn-sm" style="width:100%;text-align:left;" onclick="Links.navigateToOrigin('${h.originId}')">🔙 Ir à Origem</button>
          <button class="btn btn-d btn-sm" style="width:100%;text-align:left;" onclick="RP.deleteHL('${h.id}')">🗑 Apagar Ponto de Fim</button>
        </div>
      `;
    }

    document.getElementById('rp-hl-content').innerHTML = html;
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

  async deleteOriginHL(hlId) {
    if (!confirm('Tem certeza que deseja apagar o Ponto de Origem e TODOS os Pontos de Fim vinculados a ele?')) return;
    
    const h = S.highlights.find(x=>x.id===hlId);
    const page = h ? h.page : 1;
    
    await DB.highlights.del(hlId);
    S.highlights = S.highlights.filter(x=>x.id!==hlId);
    
    const highlights = await fetch('/api/highlights').then(r => r.json());
    const endpoints = highlights.filter(x => x.type === 'end' && x.originId === hlId);
    
    for (const ep of endpoints) {
      await DB.highlights.del(ep.id);
      S.highlights = S.highlights.filter(x => x.id !== ep.id);
    }
    
    this.close();
    PV.refreshPage(page);
    UI.renderCats();
    if (S.view==='suco') Suco.render();
    toast('Origem e seus destinos foram apagados.');
  },
};
