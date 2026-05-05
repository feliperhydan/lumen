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

    let item = prebuiltAtt;
    if (!item) {
      const atts = await DB.attachments.all();
      const att = atts.find(x => x.id === attId);
      if (att) item = {sourceType: 'attachment', attachment: att};
    } else if (!item.sourceType) {
      item = {sourceType: 'attachment', attachment: item};
    }
    if (!item) return;

    const previewSrc = item.sourceType === 'highlight' ? item.highlight : item.attachment;
    const previewText = previewSrc?.text || '';

    if (projs.length === 1) {
      await this._doInsert(item, projs[0]);
      return;
    }

    const sortedProjs = projs.sort((x, y) => y.updatedAt - x.updatedAt);
    Attachments._pendingInsertItem = item;
    Attachments._allProjs = sortedProjs;

    Modal.show(`
      <h3>Inserir em Projeto</h3>
      <div style="margin-bottom:12px;font-size:13px;color:var(--text2);font-style:italic;">
        "${escHtml(previewText.substring(0, 100))}${previewText.length > 100 ? '…' : ''}"
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
                <div style="font-size:11px;color:var(--text3);">${escHtml(Folders.path('projects', p.folderId) || 'Sem pasta (raiz)')}</div>
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

  _pendingInsertItem: null,
  _allProjs: [],

  _filterProjList(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll('.ins-proj-item').forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  },

  async _pickProj(projId) {
    const proj = this._allProjs.find(p => p.id === projId);
    if (!proj || !this._pendingInsertItem) { Modal.hide(); return; }
    Modal.hide();
    await this._doInsert(this._pendingInsertItem, proj);
  },

  async _insertPicked(attId) {
    const selEl = document.getElementById('ins-proj-sel');
    if (!selEl) return;
    const projId = selEl.value;
    const proj = await DB.projects.get(projId);
    if (!proj || !this._pendingInsertItem) { Modal.hide(); return; }
    await this._doInsert(this._pendingInsertItem, proj);
    Modal.hide();
  },

  async _resolveInsertPayload(item) {
    if (!item) return null;

    if (item.sourceType === 'highlight') {
      const h = item.highlight || {};
      return {
        ...h,
        reference: item.reference || h.reference || {},
      };
    }

    const a = item.attachment || item;
    if (!a) return null;

    let h = null;
    if (a.highlightId) {
      const allHL = await DB.highlights.all();
      h = allHL.find(x => x.id === a.highlightId) || null;
    }

    if (h) {
      return {
        ...h,
        type: h.type || a.type,
        imageData: h.imageData || a.imageData || null,
        note: h.note || a.note || '',
        sucoNote: h.sucoNote || '',
        catId: h.catId || a.catId,
        pdfId: h.pdfId || a.pdfId,
        page: h.page || a.page,
        reference: a.reference || h.reference || {},
      };
    }

    return {
      id: a.highlightId || a.id,
      pdfId: a.pdfId,
      page: a.page,
      text: a.text || '',
      type: a.type || 'text',
      imageData: a.imageData || null,
      catId: a.catId || (S.cats[0]?.id || 'obs'),
      note: a.note || '',
      sucoNote: a.sucoNote || '',
      reference: a.reference || {},
    };
  },

  async _doInsert(item, proj) {
    const a = await this._resolveInsertPayload(item);
    if (!a) return;

    const c    = getCat(a.catId);
    const ref  = [a.reference?.author, a.reference?.year].filter(Boolean).join(', ')
               + (a.reference?.doi ? ` | DOI: ${a.reference.doi}` : '');

    const cardAttrs = Proj.buildAttAttrs(a, c, ref);

    // Open the project editor
    await Proj.open(proj.id);

    // Append the card into the editor
    setTimeout(() => {
      if (Proj.editor) {
        Proj.editor.chain().focus().insertContent([
          { type: 'paragraph' },
          { type: 'attachmentCard', attrs: cardAttrs },
          { type: 'paragraph' },
        ]).run();
        Proj.scheduleSave();
        toast(`Highlight inserido em "${proj.title}"`);
        return;
      }

      const editor = document.getElementById('proj-content');
      if (!editor) return;
      const card = Proj.buildAttCard(a, c, ref);

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

      editor.scrollTop = editor.scrollHeight;
      Proj.scheduleSave();
      toast(`Highlight inserido em "${proj.title}"`);
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
