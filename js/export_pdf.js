/* ══════════════════════════════════════
   EXPORT PDF — Exporta o projeto atual como PDF
   via window.print() em janela isolada.
   Inclui: conteúdo Tiptap + cards de anexos estilizados.
══════════════════════════════════════ */
const ExportPDF = {

  async exportCurrentProject() {
    if (!S.openProjId) {
      toast('Nenhum projeto aberto para exportar.');
      return;
    }

    const proj = await DB.projects.get(S.openProjId);
    if (!proj) {
      toast('Projeto não encontrado.');
      return;
    }

    // Garante que o conteúdo do editor está salvo antes de exportar
    if (Proj.editor) {
      proj.content = Proj.editor.getHTML();
    } else {
      const editorEl = document.getElementById('proj-content');
      if (editorEl) proj.content = editorEl.innerHTML;
    }

    toast('Preparando exportação…');

    try {
      const html = this._buildPrintDocument(proj);
      this._openPrintWindow(html, proj.title || 'Projeto');
    } catch (err) {
      console.error('ExportPDF error:', err);
      toast('Erro ao gerar o PDF.');
    }
  },

  // ── Monta o HTML completo do documento de impressão ──
  _buildPrintDocument(proj) {
    const title = proj.title || 'Projeto sem título';
    const date  = new Date(proj.updatedAt || Date.now())
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    const bodyContent = this._processContent(proj.content || '');
    const googleFonts = this._fontImports();

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${this._esc(title)}</title>
  ${googleFonts}
  <style>
    ${this._commonStyles()}

    @page {
      size: A4;
      margin: 25mm 20mm 25mm 22mm;
    }

    body {
      font-family: var(--font-read);
      font-size: 11pt;
      line-height: 1.75;
      color: var(--text);
      background: #fff;
    }

    /* ── Capa / cabeçalho ── */
    .doc-cover {
      margin-bottom: 36pt;
      padding-bottom: 18pt;
      border-bottom: 2px solid var(--accent);
    }
    .doc-cover-kicker {
      font-family: var(--font-ui);
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: var(--text3);
      margin-bottom: 6pt;
    }
    .doc-cover-title {
      font-family: var(--font-ui);
      font-size: 22pt;
      font-weight: 700;
      color: var(--text);
      line-height: 1.25;
      margin-bottom: 10pt;
    }
    .doc-cover-meta {
      font-family: var(--font-ui);
      font-size: 9pt;
      color: var(--text3);
    }

    /* ── Conteúdo do editor (ProseMirror) ── */
    .editor-body { }

    .editor-body h1 {
      font-family: var(--font-ui);
      font-size: 17pt;
      font-weight: 700;
      margin: 24pt 0 10pt;
      color: var(--text);
      line-height: 1.3;
    }
    .editor-body h2 {
      font-family: var(--font-ui);
      font-size: 14pt;
      font-weight: 600;
      margin: 20pt 0 8pt;
      color: var(--text);
    }
    .editor-body h3 {
      font-family: var(--font-ui);
      font-size: 12pt;
      font-weight: 600;
      margin: 16pt 0 6pt;
      color: var(--text);
    }
    .editor-body p {
      margin: 0 0 9pt;
      text-align: justify;
    }
    .editor-body strong { font-weight: 700; }
    .editor-body em { font-style: italic; }
    .editor-body u { text-decoration: underline; }
    .editor-body s { text-decoration: line-through; }
    .editor-body code {
      font-family: 'Fira Code', 'Courier New', monospace;
      font-size: 9.5pt;
      background: rgba(0,0,0,.07);
      padding: 1px 5px;
      border-radius: 3px;
    }
    .editor-body pre {
      font-family: 'Fira Code', 'Courier New', monospace;
      font-size: 9.5pt;
      background: rgba(0,0,0,.06);
      padding: 10pt 12pt;
      border-radius: 6pt;
      margin: 10pt 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .editor-body blockquote {
      margin: 10pt 0 10pt 4pt;
      padding-left: 12pt;
      border-left: 3pt solid var(--accent);
      color: var(--text2);
      font-style: italic;
    }
    .editor-body ul,
    .editor-body ol {
      margin: 6pt 0 10pt 18pt;
    }
    .editor-body li { margin-bottom: 4pt; }
    .editor-body hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 16pt 0;
    }
    .editor-body a {
      color: var(--accent);
      text-decoration: underline;
    }

    /* Task list */
    .editor-body ul[data-type="taskList"] {
      list-style: none;
      margin-left: 0;
      padding-left: 0;
    }
    .editor-body ul[data-type="taskList"] li {
      display: flex;
      align-items: flex-start;
      gap: 6pt;
      margin-bottom: 4pt;
    }
    .editor-body ul[data-type="taskList"] li input[type="checkbox"] {
      margin-top: 3pt;
      flex-shrink: 0;
      accent-color: var(--accent);
    }

    /* Text alignment */
    .editor-body [style*="text-align: center"] { text-align: center; }
    .editor-body [style*="text-align: right"]  { text-align: right; }
    .editor-body [style*="text-align: justify"] { text-align: justify; }

    /* Tables */
    .editor-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-family: var(--font-ui);
      font-size: 10pt;
    }
    .editor-body th,
    .editor-body td {
      border: 1px solid var(--border);
      padding: 5pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    .editor-body th {
      background: var(--bg2);
      font-weight: 600;
    }

    /* Highlight mark */
    .editor-body mark {
      background: rgba(255, 212, 0, 0.35);
      border-radius: 2px;
      padding: 0 2px;
    }

    /* Page break marker */
    .page-break-marker {
      display: block;
      page-break-after: always;
      break-after: page;
      border: none;
      height: 0;
      margin: 0;
      visibility: hidden;
    }
    .pbm-label { display: none; }

    .proj-att-card {
      display: block;
      background: var(--surface);
      border: 1px solid var(--border2);
      border-left: 4pt solid;
      border-radius: var(--r);
      padding: 7pt 10pt;
      margin: 7pt 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .proj-att-card-text {
      font-family: var(--font-read);
      font-size: 9.5pt;
      line-height: 1.55;
      font-style: italic;
      color: var(--text);
      margin-bottom: 5pt;
    }
    .proj-att-card-img {
      max-width: 72%;
      max-height: 160pt;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 3pt;
      margin-bottom: 5pt;
      border: 1px solid var(--border2);
      display: block;
    }
    .proj-att-card-note {
      font-size: 9.5pt;
      color: var(--text2);
      font-style: italic;
      margin: 6pt 0;
      padding: 5pt 8pt;
      border-radius: 4pt;
      background: var(--bg2);
      border-left: 2pt solid var(--accent);
      font-family: var(--font-ui);
    }
    .proj-att-card-meta {
      font-family: var(--font-ui);
      font-size: 9pt;
      color: var(--text3);
      display: flex;
      align-items: center;
      gap: 8pt;
      flex-wrap: wrap;
      margin-top: 6pt;
    }
    /* Ocultar botões de ação no PDF */
    .proj-att-card-actions { display: none !important; }

    .cat-badge {
      display: inline-flex;
      align-items: center;
      font-size: 8.5pt;
      padding: 2pt 7pt;
      border-radius: 10pt;
      font-weight: 600;
      font-family: var(--font-ui);
    }

    /* ── Rodapé de impressão ── */
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Capa -->
  <div class="doc-cover">
    <div class="doc-cover-kicker">Síntese · Projeto Acadêmico</div>
    <div class="doc-cover-title">${this._esc(title)}</div>
    <div class="doc-cover-meta">Exportado em ${date}</div>
  </div>

  <!-- Conteúdo do editor -->
  <div class="editor-body">
    ${bodyContent}
  </div>

</body>
</html>`;
  },

  // ── Processa o HTML do Tiptap para impressão ──
  _processContent(rawHtml) {
    if (!rawHtml || !rawHtml.trim()) {
      return '<p style="color:#aaa;font-style:italic;">Projeto sem conteúdo.</p>';
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="root">${rawHtml}</div>`, 'text/html');
    const root = doc.getElementById('root');

    // Remove botões de ação dos cards — ficam ocultos via CSS mas vamos limpar o DOM também
    root.querySelectorAll('.proj-att-card-actions').forEach(el => el.remove());

    // Converte page-break-marker em quebra de página real para impressão
    root.querySelectorAll('.page-break-marker').forEach(el => {
      el.style.pageBreakAfter = 'always';
      el.style.breakAfter     = 'page';
    });

    return root.innerHTML;
  },

  // ── Abre a janela de impressão com o HTML gerado ──
  _openPrintWindow(html, title) {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      toast('Bloqueador de pop-up impediu a janela de exportação. Libere pop-ups para este site.');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    // Aguarda fontes e imagens carregarem antes de disparar a impressão
    win.addEventListener('load', () => {
      // Pequena espera extra para fontes Google Fonts (assíncronas)
      setTimeout(() => {
        win.focus();
        win.print();
        // Fecha automaticamente depois de alguns segundos
        // (usuário pode cancelar a impressão — não fechamos imediatamente)
        const closeTimer = setTimeout(() => win.close(), 12000);
        win.onafterprint = () => { clearTimeout(closeTimer); win.close(); };
      }, 600);
    });
  },

  // ── Import das fontes Google usadas no editor ──
  _fontImports() {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&family=Fira+Code:wght@400&display=swap">`;
  },

  // ── Escapa HTML para uso em atributos e texto ──
  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // ══════════════════════════════════════
  //  SUCO EXPORT
  // ══════════════════════════════════════

  async exportSuco() {
    const doc = S.currentDoc;
    if (!doc) {
      toast('Nenhum documento aberto. Abra um PDF no Leitor primeiro.');
      return;
    }
    if (!S.highlights || !S.highlights.length) {
      toast('Este documento não possui highlights para exportar.');
      return;
    }

    toast('Preparando exportação do Suco…');

    try {
      // Recarrega notas de página para garantir dados frescos
      const snotes = await DB.suco_notes.byDoc(doc.id);
      const sucoNotes = {};
      snotes.forEach(n => { sucoNotes[n.page] = n.content; });

      // Exclui pontos de Wormhole (origin/end) — são marcadores de navegação, não conteúdo
      const exportable = S.highlights.filter(h => h.type !== 'origin' && h.type !== 'end');

      if (!exportable.length) {
        toast('Nenhum highlight de texto ou imagem para exportar.');
        return;
      }

      const html = this._buildSucoDocument(doc, exportable, sucoNotes);
      const safeTitle = (doc.title || doc.name || 'Suco').replace(/[^a-zA-Z0-9À-ÿ\s\-_.]/g, '');
      this._openPrintWindow(html, `${safeTitle} — Suco`);
    } catch (err) {
      console.error('ExportPDF.exportSuco error:', err);
      toast('Erro ao gerar o PDF do Suco.');
    }
  },



  _buildSucoDocument(doc, highlights, sucoNotes) {
    const title   = doc.title || doc.name || 'Documento';
    const author  = doc.author || '';
    const year    = doc.year   || '';
    const doi     = doc.doi    || '';
    const date    = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    const refStr  = [author, year].filter(Boolean).join(', ') + (doi ? ` | DOI: ${doi}` : '');

    // Agrupa por página em ordem crescente
    const byPage = {};
    highlights.forEach(h => {
      if (!byPage[h.page]) byPage[h.page] = [];
      byPage[h.page].push(h);
    });
    const pages = Object.keys(byPage).map(Number).sort((a, b) => a - b);

    const pagesHtml = pages.map(pg => {
      const hls      = byPage[pg];
      const pageNote = (sucoNotes[pg] || '').trim();

      const hlsHtml = hls.map(h => this._sucoItemHtml(h, refStr)).join('');

      const pageNoteHtml = pageNote
        ? `<div class="suco-page-note">
             <div class="suco-page-note-lbl">Notas da Página ${pg}</div>
             <div class="suco-page-note-body editor-body">${pageNote}</div>
           </div>`
        : '';

      return `<div class="page-group">
        <div class="page-lbl">Página ${pg}</div>
        ${hlsHtml}
        ${pageNoteHtml}
      </div>`;
    }).join('');

    const totalHL = highlights.length;
    const googleFonts = this._fontImports();

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${this._esc(title)} — Suco</title>
  ${googleFonts}
  <style>
    ${this._commonStyles()}

    @page {
      size: A4;
      margin: 22mm 20mm 24mm 22mm;
    }

    body {
      font-family: var(--font-read);
      font-size: 10.5pt;
      line-height: 1.72;
      color: var(--text);
      background: #fff;
    }

    /* ── Capa ── */
    .doc-cover {
      margin-bottom: 32pt;
      padding-bottom: 16pt;
      border-bottom: 2.5px solid var(--accent);
    }
    .doc-cover-kicker {
      font-family: var(--font-ui);
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--text3);
      margin-bottom: 5pt;
    }
    .doc-cover-title {
      font-family: var(--font-ui);
      font-size: 20pt;
      font-weight: 700;
      color: var(--text);
      line-height: 1.28;
      margin-bottom: 8pt;
    }
    .doc-cover-ref {
      font-family: var(--font-ui);
      font-size: 9pt;
      color: var(--text2);
      margin-bottom: 4pt;
    }
    .doc-cover-meta {
      font-family: var(--font-ui);
      font-size: 8.5pt;
      color: var(--text3);
    }

    /* ── Grupos de página ── */
    .page-group { margin-bottom: 28pt; }
    .page-lbl {
      font-family: var(--font-ui);
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: var(--text3);
      font-weight: 700;
      padding-bottom: 5pt;
      margin-bottom: 8pt;
      border-bottom: 1px solid var(--border2);
    }

    /* ── Item de highlight ── */
    .suco-item {
      padding: 9pt 11pt;
      border-radius: var(--r);
      margin-bottom: 8pt;
      background: var(--surface);
      border: 1px solid var(--border2);
      border-left: 3pt solid;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .suco-text {
      font-family: var(--font-read);
      font-size: 11pt;
      line-height: 1.68;
      font-style: italic;
      color: var(--text);
      margin-bottom: 6pt;
    }
    .suco-img-thumb {
      max-width: 72%;
      max-height: 160pt;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 3pt;
      margin-bottom: 6pt;
      border: 1px solid var(--border2);
      display: block;
    }
    .suco-meta {
      font-family: var(--font-ui);
      font-size: 8.5pt;
      color: var(--text3);
      display: flex;
      align-items: center;
      gap: 8pt;
      flex-wrap: wrap;
    }
    .cat-badge {
      display: inline-flex;
      align-items: center;
      font-size: 8pt;
      padding: 2pt 7pt;
      border-radius: 10pt;
      font-weight: 600;
      font-family: var(--font-ui);
    }
    .suco-ref {
      font-style: italic;
    }

    /* ── Nota do highlight ── */
    .suco-hl-note {
      font-family: var(--font-ui);
      font-size: 9.5pt;
      color: var(--text2);
      font-style: italic;
      margin: 6pt 0 0;
      padding: 5pt 8pt;
      border-radius: 4pt;
      background: var(--bg2);
      border-left: 2pt solid var(--accent);
    }

    /* ── Elaboração / sucoNote ── */
    .suco-hl-freetext {
      margin-top: 7pt;
      padding: 7pt 9pt;
      border-radius: 5pt;
      background: rgba(0,0,0,.015);
      border: 1px dashed var(--border);
    }
    .suco-hl-freetext-lbl {
      font-family: var(--font-ui);
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: .09em;
      color: var(--text3);
      font-weight: 700;
      margin-bottom: 3pt;
    }
    .suco-hl-freetext-body {
      font-family: var(--font-read);
      font-size: 10.5pt;
      line-height: 1.65;
      color: var(--text);
      white-space: pre-wrap;
    }

    /* ── Nota geral de página ── */
    .suco-page-note {
      margin-top: 8pt;
      padding: 10pt 12pt;
      border-radius: var(--r);
      border: 1.5px dashed var(--border);
      background: rgba(0,0,0,.012);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .suco-page-note-lbl {
      font-family: var(--font-ui);
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: .09em;
      color: var(--text3);
      font-weight: 700;
      margin-bottom: 5pt;
    }
    .suco-page-note-body {
      font-family: var(--font-read);
      font-size: 10.5pt;
      line-height: 1.7;
      color: var(--text);
      white-space: pre-wrap;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Capa -->
  <div class="doc-cover">
    <div class="doc-cover-kicker">Síntese · Suco</div>
    <div class="doc-cover-title">${this._esc(title)}</div>
    ${refStr ? `<div class="doc-cover-ref">${this._esc(refStr)}</div>` : ''}
    <div class="doc-cover-meta">${totalHL} highlight${totalHL !== 1 ? 's' : ''} · Exportado em ${date}</div>
  </div>

  <!-- Highlights por página -->
  ${pagesHtml}

</body>
</html>`;
  },

  _sucoItemHtml(h, refStr) {
    const color    = h._catColor  || '#888';
    const catBg    = h._catBg     || 'rgba(136,136,136,.15)';
    const catName  = h._catName   || '';
    const note     = (h.note     || '').trim();
    const sucoNote = (h.sucoNote || '').trim();

    // Resolve categoria do estado global se disponível
    if (typeof getCat === 'function') {
      const cat = getCat(h.catId);
      if (cat) {
        h._catColor = cat.color;
        h._catBg    = cat.bg;
        h._catName  = cat.name;
      }
    }
    const resolvedColor   = h._catColor  || color;
    const resolvedBg      = h._catBg     || catBg;
    const resolvedCatName = h._catName   || catName;

    const bodyHtml = h.type === 'image' && h.imageData
      ? `<img class="suco-img-thumb" src="${this._esc(h.imageData)}" alt="Imagem p.${h.page}">`
      : `<div class="suco-text">"${this._esc(h.text || '')}"</div>`;

    const noteHtml = note
      ? `<div class="suco-hl-note">📝 ${this._esc(note)}</div>`
      : '';

    const sucoNoteHtml = sucoNote
      ? `<div class="suco-hl-freetext">
           <div class="suco-hl-freetext-lbl">Elaboração</div>
           <div class="suco-hl-freetext-body editor-body">${sucoNote}</div>
         </div>`
      : '';

    return `<div class="suco-item" style="border-left-color:${resolvedColor};">
      ${bodyHtml}
      <div class="suco-meta">
        <span class="cat-badge" style="background:${resolvedBg};color:${resolvedColor};">${this._esc(resolvedCatName)}</span>
        <span>p. ${h.page}</span>
        ${h.isAttachment ? '<span>📎</span>' : ''}
        ${refStr ? `<span class="suco-ref">(${this._esc(refStr)})</span>` : ''}
      </div>
      ${noteHtml}
      ${sucoNoteHtml}
    </div>`;
  },

  _commonStyles() {
    return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --accent:    #2a5c8a;
      --text:      #1c1814;
      --text2:     #5c5650;
      --text3:     #9c9690;
      --border:    rgba(0,0,0,.14);
      --border2:   rgba(0,0,0,.08);
      --surface:   #faf8f5;
      --bg2:       #f0ece5;
      --font-read: Georgia, 'Times New Roman', serif;
      --font-ui:   'Inter', -apple-system, sans-serif;
      --r: 8px;
    }

    /* ── Typography & Editor Styles ── */
    .editor-body { line-height: 1.75; }
    .editor-body h1, .editor-body h2, .editor-body h3 { font-family: var(--font-ui); color: var(--text); }
    .editor-body strong { font-weight: 700; }
    .editor-body em { font-style: italic; }
    .editor-body u { text-decoration: underline; }
    .editor-body p { margin: 0 0 9pt; }
    .editor-body ul, .editor-body ol { margin: 6pt 0 10pt 18pt; }
    .editor-body li { margin-bottom: 4pt; }
    .editor-body blockquote {
      margin: 10pt 0 10pt 4pt;
      padding-left: 12pt;
      border-left: 3pt solid var(--accent);
      color: var(--text2);
      font-style: italic;
    }
    .editor-body mark {
      background: rgba(255, 212, 0, 0.35);
      border-radius: 2px;
      padding: 0 2px;
    }
    `;
  }
};

