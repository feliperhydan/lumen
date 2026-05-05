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
    const doc = S.currentDoc;
    const ref = {
      title: doc.title || doc.name,
      author: doc.author || '',
      year: doc.year || '',
      doi: doc.doi || '',
    };
    await Attachments.insertInProject(h.id, {
      sourceType: 'highlight',
      highlight: {...h},
      reference: ref,
    });
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
