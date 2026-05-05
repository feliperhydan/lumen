/* ══════════════════════════════════════
   UI CONTROLLER
══════════════════════════════════════ */
const VIEWS = [
  'library-view','reader-view','suco-view',
  'projects-view','proj-editor-view','attachments-view','search-view'
];

const UI = {
  _uploadPrompt: null,

  _refreshHomeButton() {
    const btn = document.getElementById('nav-back');
    if (!btn) return;
    btn.style.display = 'inline-flex';
    btn.disabled = S.view === 'library';
  },

  _setViewClass(view) {
    const body = document.body;
    if (!body) return;
    const views = ['library', 'reader', 'suco', 'projects', 'attachments', 'search', 'proj-editor'];
    views.forEach(v => body.classList.remove(`view-${v}`));
    if (view) body.classList.add(`view-${view}`);
  },

  goHome() {
    if (S.view === 'library') return;
    this.nav('library');
  },

  nav(view, updateNav = true, options = {}) {
    if (!options.skipTabCapture && typeof Tabs?.captureCurrentTabState === 'function') {
      Tabs.captureCurrentTabState();
    }

    S.view = view;
    this._setViewClass(view);
    this._refreshHomeButton();
    if (typeof Tabs?.render === 'function') Tabs.render();
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
        projects: 'projects', 'proj-editor': 'projects', attachments: 'attachments', search: 'search'
      };
      const navId = navMap[view];
      if (navId) document.getElementById('snav-' + navId)?.classList.add('active');
    }

    if (view === 'library')     Library.load();
    if (view === 'suco')        Suco.render();
    if (view === 'projects')    Proj.load();
    if (view === 'attachments') Attachments.load();
    if (view === 'search')      Search.load();
  },

  tab(t) {
    if (typeof Tabs?.captureCurrentTabState === 'function') {
      Tabs.captureCurrentTabState();
    }
    S.activeTab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + t)?.classList.add('active');
    if (typeof Tabs?.setActiveSubview === 'function') {
      Tabs.setActiveSubview(t);
    }
    this.nav(t, false, { skipTabCapture: true });
  },

  upload() { document.getElementById('file-input').click(); },

  promptUploadTypes(files) {
    const rows = files.map((file, i) => `
      <div class="upload-kind-row">
        <div class="upload-kind-meta">
          <div class="upload-kind-name">${escHtml(file.name)}</div>
          <div class="upload-kind-size">${formatBytes(file.size)}</div>
        </div>
        <div class="fg" style="margin-bottom:0;">
          <label for="upload-kind-${i}">Tipo do arquivo</label>
          <select id="upload-kind-${i}" class="upload-kind-select">
            ${FILE_UPLOAD_TYPES.map(type => `
              <option value="${type.value}" ${type.value === 'artigo' ? 'selected' : ''}>${escHtml(type.label)}</option>
            `).join('')}
          </select>
        </div>
      </div>
    `).join('');

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      this._uploadPrompt = { files, finish };
      Modal.show(`
        <h3>Classificar arquivos</h3>
        <p class="modal-subtle">
          Escolha como cada PDF deve entrar na biblioteca. Para arquivos marcados como
          <strong>artigo / paper científico</strong>, o Lumen tenta localizar o DOI automaticamente.
        </p>
        <div class="upload-kind-list">${rows}</div>
        <div class="upload-kind-legend">
          ${FILE_UPLOAD_TYPES.map(type => `
            <div class="upload-kind-legend-item">
              <strong>${escHtml(type.label)}</strong>
              <span>${escHtml(type.hint)}</span>
            </div>
          `).join('')}
        </div>
        <div class="mactions">
          <button class="btn" onclick="UI.cancelUploadKinds()">Cancelar</button>
          <button class="btn btn-p" onclick="UI.confirmUploadKinds()">Continuar</button>
        </div>
      `, {
        onHide: () => {
          this._uploadPrompt = null;
          finish(null);
        },
      });
    });
  },

  confirmUploadKinds() {
    if (!this._uploadPrompt) return;
    const selectedTypes = this._uploadPrompt.files.map((_file, i) => {
      return document.getElementById(`upload-kind-${i}`)?.value || 'outro';
    });
    const finish = this._uploadPrompt.finish;
    this._uploadPrompt = null;
    finish(selectedTypes);
    Modal.hide();
  },

  cancelUploadKinds() {
    Modal.hide();
  },

  async onUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const selectedTypes = await this.promptUploadTypes(files);
    if (!selectedTypes) {
      e.target.value = '';
      return;
    }
    toast(`Importando ${files.length} arquivo(s)…`);

    for (const [i, file] of files.entries()) {
      try {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const currentFolderId = (S.currentFolder.library && S.currentFolder.library !== 'root')
          ? S.currentFolder.library
          : null;
        const fileType = selectedTypes[i] || 'outro';
        let detectedDoi = '';
        let detectedIsbn = '';

        if (fileType === 'artigo') {
          detectedDoi = await extractDoiFromPdfFile(file);
        }
        if (fileType === 'livro') {
          detectedIsbn = await extractIsbnFromPdfFile(file);
        }

        const docPayload = {
          id, name: file.name.replace(/\.pdf$/i, ''),
          title: file.name.replace(/\.pdf$/i, ''),
          author: '', year: '', type: fileType, lang: 'pt', doi: detectedDoi, isbn: detectedIsbn, publisher: '', edition: '', pageCount: '', academicSubtype: '', institution: '', program: '', advisor: '', coadvisor: '', bookTitle: '', pageRange: '', reportSubtype: '', responsible: '', fullDate: '', methodology: '', results: '', area: '', otherSubtype: '', source: '', context: '', description: '', tags: [],
          folderId: currentFolderId,
          addedAt: Date.now(), size: file.size,
        };
        const savedDoc = await DB.pdfs.upload(file, docPayload);
        const ix = S.docs.findIndex(d => d.id === savedDoc.id);
        if (ix >= 0) S.docs[ix] = savedDoc;
        else S.docs.push(savedDoc);
        if (fileType === 'artigo' && detectedDoi) {
          try {
            const result = await syncDocTitleFromDoi(savedDoc);
            if (result?.metadata?.title) toast(`"${savedDoc.title}" adicionado com DOI, tí­tulo, autores e ano identificados.`);
            else toast(`"${savedDoc.title}" adicionado com DOI identificado.`);
          } catch (metaErr) {
            console.warn('Falha ao sincronizar titulo automatico pelo DOI.', metaErr);
            toast(`"${savedDoc.title}" adicionado com DOI identificado.`);
          }
        }
        else if (fileType === 'livro' && detectedIsbn) {
          try {
            const result = await syncDocMetaFromIsbn(savedDoc);
            if (result?.metadata?.title || result?.metadata?.author) {
              toast(`"${savedDoc.title}" adicionado com ISBN e metadados do livro.`);
            } else {
              toast(`"${savedDoc.title}" adicionado com ISBN identificado.`);
            }
          } catch (metaErr) {
            console.warn('Falha ao sincronizar metadados pelo ISBN.', metaErr);
            toast(`"${savedDoc.title}" adicionado com ISBN identificado.`);
          }
        }
        else if (fileType === 'artigo') toast(`"${savedDoc.title}" adicionado. DOI não encontrado automaticamente.`);
        else if (fileType === 'livro') toast(`"${savedDoc.title}" adicionado. ISBN não encontrado automaticamente.`);
        else toast(`"${savedDoc.title}" adicionado!`);
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
      ${doc.isbn   ? `<div style="word-break:break-all;">ISBN: ${escHtml(doc.isbn)}</div>` : ''}
      ${doc.bookTitle ? `<div>Livro: ${escHtml(doc.bookTitle)}</div>` : ''}
      ${doc.publisher ? `<div>Editora: ${escHtml(doc.publisher)}</div>` : ''}
      ${doc.edition ? `<div>Edição: ${escHtml(doc.edition)}</div>` : ''}
      ${doc.academicSubtype ? `<div>Subtipo: ${escHtml(doc.academicSubtype)}</div>` : ''}
      ${doc.reportSubtype ? `<div>Subtipo: ${escHtml(doc.reportSubtype)}</div>` : ''}
      ${doc.otherSubtype ? `<div>Subtipo: ${escHtml(doc.otherSubtype)}</div>` : ''}
      ${doc.institution ? `<div>Instituição: ${escHtml(doc.institution)}</div>` : ''}
      ${doc.program ? `<div>Programa/Curso: ${escHtml(doc.program)}</div>` : ''}
      ${doc.source ? `<div>Fonte: ${escHtml(doc.source)}</div>` : ''}
      ${doc.context ? `<div>Contexto: ${escHtml(doc.context)}</div>` : ''}
      ${doc.responsible ? `<div>Responsável: ${escHtml(doc.responsible)}</div>` : ''}
      ${doc.fullDate ? `<div>Data: ${escHtml(doc.fullDate)}</div>` : ''}
      ${doc.area ? `<div>Área/Disciplina: ${escHtml(doc.area)}</div>` : ''}
      ${doc.advisor ? `<div>Orientador: ${escHtml(doc.advisor)}</div>` : ''}
      ${doc.coadvisor ? `<div>Coorientador: ${escHtml(doc.coadvisor)}</div>` : ''}
      ${doc.methodology ? `<div>Metodologia: ${escHtml(doc.methodology)}</div>` : ''}
      ${doc.results ? `<div>Resultados: ${escHtml(doc.results)}</div>` : ''}
      ${doc.description ? `<div>Descrição: ${escHtml(doc.description)}</div>` : ''}
      ${doc.pageCount ? `<div>Páginas: ${escHtml(doc.pageCount)}</div>` : ''}
      ${doc.pageRange ? `<div>Páginas: ${escHtml(doc.pageRange)}</div>` : ''}
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
    document.body.classList.toggle('sidebar-collapsed', this._sidebarCollapsed);
    document.body.classList.toggle('sidebar-open', !this._sidebarCollapsed);
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
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border2);">
        <div class="fg"><label style="margin-bottom:8px;display:block;font-size:12px;color:var(--text2);font-weight:500;">Tags dos Arquivos</label>
          <button class="btn btn-sm" style="width:100%;text-align:left;" onclick="Modal.hide();UI.showTagEditor()">⊞ Configurar Tags</button>
        </div>
      </div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border2);">
        <div class="fg"><label style="margin-bottom:8px;display:block;font-size:12px;color:var(--text2);font-weight:500;">Backup local</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="UI.downloadBackup()">⬇️ Baixar backup</button>
            <button class="btn btn-sm" onclick="UI.promptBackupImport()">⬆️ Importar backup</button>
          </div>
          <input type="file" id="backup-file" accept=".zip" style="display:none;" onchange="UI.onBackupImport(event)">
          <div class="meta-doi-tip" style="margin-top:8px;">Exporta e restaura todos os dados locais do Lumen (PDFs e metadados).</div>
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

  showTagEditor() {
    Modal.show(`
      <h3>Configurar Tags dos Arquivos</h3>
      <div id="tag-editor-list">
        ${S.docTags.map((t, i) =>
          `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <input type="text" value="${escHtml(t)}" id="tn-${i}" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:var(--font-ui);">
            <button class="btn btn-d btn-sm" onclick="UI._removeTag(${i})">✕</button>
          </div>`
        ).join('')}
      </div>
      <button class="btn btn-sm" style="width:100%;margin-bottom:12px;" onclick="UI._addTag()">+ Adicionar Tag</button>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="UI._saveTags()">Salvar</button>
      </div>
    `);
  },

  downloadBackup() {
    window.location.href = '/api/backup/export';
  },

  promptBackupImport() {
    document.getElementById('backup-file')?.click();
  },

  async onBackupImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Importar backup vai substituir os dados locais atuais. Deseja continuar?')) {
      e.target.value = '';
      return;
    }

    const form = new FormData();
    form.append('backup', file);
    toast('Importando backup...');

    try {
      const res = await fetch('/api/backup/import', { method: 'POST', body: form });
      if (!res.ok) {
        let msg = `Erro ${res.status}`;
        try {
          const payload = await res.json();
          if (payload?.error) msg = payload.error;
        } catch (_err) {}
        throw new Error(msg);
      }
      toast('Backup importado com sucesso. Recarregando...');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Falha ao importar backup.');
    } finally {
      e.target.value = '';
    }
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

  _addTag() {
    S.docTags.push('Nova tag');
    this.showTagEditor();
  },
  _removeTag(i) { S.docTags.splice(i, 1); this.showTagEditor(); },
  _saveTags() {
    const next = [];
    document.querySelectorAll('[id^="tn-"]').forEach((el) => {
      const val = String(el.value || '').trim();
      if (val) next.push(val);
    });
    S.docTags = [...new Set(next)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    S.libFilter.tags = S.libFilter.tags.filter(t => S.docTags.includes(t));
    saveTags();
    Modal.hide();
    Library.renderFilters();
    Library.renderGrid();
    toast('Tags salvas!');
  },

  toggleDark(on) {
    document.body.classList.toggle('dark-mode', on);
    Library.renderGrid();
    Folders.renderToolbar('library');
    DB.settings.patch({darkMode: on}).catch(err => {
      console.warn('Falha ao salvar tema no servidor.', err);
      toast('Não foi possível salvar o tema no servidor.', 2800);
    });
  },
};
