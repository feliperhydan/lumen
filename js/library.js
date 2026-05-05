/* ══════════════════════════════════════
   LIBRARY (with tags & filters)
══════════════════════════════════════ */
const Library = {
  async load() {
    S.docs = await DB.pdfs.all();
    Folders.renderToolbar('library');
    this.renderFilters();
    this.renderGrid();
    this.renderSidebar();
  },

  renderFilters() {
    const allTags  = (S.docTags && S.docTags.length)
      ? [...S.docTags].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      : [...new Set(S.docs.flatMap(d => d.tags || []))].sort();
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

    html += `<span class="filter-lbl" style="width:100%;margin-top:6px;">Ordenar por:</span>
      <select class="filter-sel" onchange="Library.setSort(this.value)">
        <option value="title-asc" ${S.libFilter.sort === 'title-asc' ? 'selected' : ''}>A-Z</option>
        <option value="title-desc" ${S.libFilter.sort === 'title-desc' ? 'selected' : ''}>Z-A</option>
        <option value="year-asc" ${S.libFilter.sort === 'year-asc' ? 'selected' : ''}>Ano (crescente)</option>
        <option value="year-desc" ${S.libFilter.sort === 'year-desc' ? 'selected' : ''}>Ano (decrescente)</option>
        <option value="date-asc" ${S.libFilter.sort === 'date-asc' ? 'selected' : ''}>Antigo → Novo</option>
        <option value="date-desc" ${S.libFilter.sort === 'date-desc' ? 'selected' : ''}>Novo → Antigo</option>
      </select>`;

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
    const currentFolderId = (S.currentFolder.library && S.currentFolder.library !== 'root')
      ? S.currentFolder.library
      : null;
    docs = docs.filter(d => (d.folderId || null) === currentFolderId);
    if (S.libFilter.tags.length)
      docs = docs.filter(d => S.libFilter.tags.every(t => (d.tags || []).includes(t)));
    if (S.libFilter.type)
      docs = docs.filter(d => d.type === S.libFilter.type);
    if (S.libFilter.lang)
      docs = docs.filter(d => d.lang === S.libFilter.lang);

    const sorted = [...docs];
    const byTitle = (a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '', 'pt-BR');
    const byDate = (a, b) => (Number(a.addedAt) || 0) - (Number(b.addedAt) || 0);
    const yearVal = d => {
      const y = parseInt(String(d.year || '').trim(), 10);
      return Number.isFinite(y) ? y : 0;
    };
    const byYear = (a, b) => yearVal(a) - yearVal(b);

    switch (S.libFilter.sort) {
      case 'title-asc':
        sorted.sort(byTitle);
        break;
      case 'title-desc':
        sorted.sort((a, b) => -byTitle(a, b));
        break;
      case 'year-asc':
        sorted.sort(byYear);
        break;
      case 'year-desc':
        sorted.sort((a, b) => -byYear(a, b));
        break;
      case 'date-asc':
        sorted.sort(byDate);
        break;
      case 'date-desc':
      default:
        sorted.sort((a, b) => -byDate(a, b));
        break;
    }
    return sorted;
  },

  renderCurrentFolder() {
    const host = document.getElementById('lib-current-folder');
    if (!host) return;

    const currentId = S.currentFolder.library || 'root';
    const currentFolder = currentId === 'root' ? null : Folders.find('library', currentId);
    const stats = Folders.folderStats('library', currentFolder?.id || null);
    const currentLabel = currentFolder?.name || 'Biblioteca';
    const crumbHtml = Folders.breadcrumbMarkup('library', currentId, true);

    host.innerHTML = `
      <div class="lib-current-bar">
        <div class="lib-current-meta">
          <div class="lib-current-title">${escHtml(currentLabel)}</div>
          <div class="lib-breadcrumbs">${crumbHtml}</div>
          <div class="lib-current-sub">${stats.items} arquivo(s) e ${stats.folders} subpasta(s) neste nível.</div>
        </div>
        <div class="lib-current-actions">
          ${currentFolder ? `<button class="btn btn-sm" onclick="Folders.goUp('library')">← Voltar</button>` : ''}
          <button class="btn btn-sm" onclick="Folders.create('library','${currentFolder?.id || 'root'}')">+ Pasta aqui</button>
          ${currentFolder ? `<button class="btn btn-sm" onclick="Folders.rename('library','${currentFolder.id}')">Renomear pasta</button>` : ''}
          ${currentFolder ? `<button class="btn btn-d btn-sm" onclick="Folders.removeSelected('library')">Excluir pasta</button>` : ''}
          <button class="btn btn-sm" onclick="UI.nav('search')">Abrir Explorador</button>
        </div>
      </div>
    `;
  },

  renderGrid() {
    this.renderCurrentFolder();

    const docs = this.filteredDocs();
    const currentFolderId = (S.currentFolder.library && S.currentFolder.library !== 'root')
      ? S.currentFolder.library
      : null;
    const childFolders = Folders._folderChildren('library', currentFolderId);
    const grid = document.getElementById('doc-grid');
    const empty = document.getElementById('lib-empty');

    const sections = [];

    if (childFolders.length) {
      sections.push(`
        <section class="lib-section">
          <div class="lib-section-head">
            <div class="lib-section-title">Pastas</div>
            <div class="lib-section-note">${childFolders.length} pasta(s) neste nível</div>
          </div>
          <div class="folder-spot-grid">
            ${childFolders.map(folder => {
              const stats = Folders.folderStats('library', folder.id);
              const folderPath = Folders.path('library', folder.id) || folder.name;
              return `
                <article class="folder-spot" draggable="true" onclick="Folders.setCurrent('library','${folder.id}')" ondragstart="Folders.dragStart(event,'library','folder','${folder.id}')" ondragend="Folders.dragEnd(event)" ondragover="Folders.dragOver(event,'library','folder','${folder.id}')" ondragleave="Folders.dragLeave(event)" ondrop="Folders.drop(event,'library','folder','${folder.id}')" title="${escHtml(folderPath)}">
                  <div class="folder-spot-head">
                    <span class="folder-spot-ico">${folderIconMarkup('folder-spot')}</span>
                    <div style="min-width:0;">
                      <div class="folder-spot-name">${escHtml(folder.name)}</div>
                      <div class="folder-spot-path">${escHtml(folderPath)}</div>
                    </div>
                  </div>
                  <div class="folder-spot-stats">
                    <span class="folder-spot-chip">${stats.items} arquivo(s)</span>
                    <span class="folder-spot-chip">${stats.folders} subpasta(s)</span>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </section>
      `);
    }

    if (docs.length) {
      sections.push(`
        <section class="lib-section">
          <div class="lib-section-head">
            <div class="lib-section-title">Arquivos</div>
            <div class="lib-section-note">${docs.length} arquivo(s) visível(is)</div>
          </div>
          <div class="doc-grid">
            ${docs.map(d => {
              const metaBits = libraryCardMetaParts(d);
              const folderPath = Folders.path('library', d.folderId) || 'Raiz';
              return `
                <article class="doc-card" draggable="true" onclick="Library.openById('${d.id}')" ondragstart="Folders.dragStart(event,'library','item','${d.id}')" ondragend="Folders.dragEnd(event)">
                  <div class="doc-head">
                    <div class="doc-icon">${docTypeIconMarkup(d, 'card')}</div>
                    <div class="doc-head-main">
                      <div class="doc-title">${escHtml(d.title || d.name)}</div>
                      <div class="doc-author">${escHtml(libraryCardMeta(d) || 'Sem metadados principais')}</div>
                    </div>
                  </div>
                  ${d.tags?.length ? `<div class="doc-tags">${d.tags.map(t => `<span class="doc-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
                  <button class="doc-edit" onclick="event.stopPropagation();Library.editMeta('${d.id}')">✏</button>
                </article>
              `;
            }).join('')}
          </div>
        </section>
      `);
    }

    if (!sections.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      const libraryIsEmpty = !S.docs.length && !Folders.list('library').length && !currentFolderId;
      empty.innerHTML = `
        <h3>${libraryIsEmpty ? 'Nenhum documento ainda' : 'Nada nesta pasta'}</h3>
        <p>${libraryIsEmpty
          ? 'Clique em "Adicionar PDF" para importar seus primeiros documentos.'
          : 'Use as ações de pasta para organizar a Biblioteca ou adicione novos PDFs para preencher este espaço.'}</p>
      `;
      return;
    }

    empty.style.display = 'none';
    empty.innerHTML = `
      <h3>Nenhum documento ainda</h3>
      <p>Clique em "Adicionar PDF" para importar seus primeiros documentos.</p>
    `;
    grid.innerHTML = sections.join('');
  },

  renderSidebar() {
    const listEl = document.getElementById('doc-list');
    if (!listEl) return;
    listEl.innerHTML = S.docs
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
  setSort(val) { S.libFilter.sort = val; this.renderGrid(); },
  clearFilters() { S.libFilter = {tags: [], type: '', lang: '', sort: S.libFilter.sort || 'date-desc'}; this.renderFilters(); this.renderGrid(); },

  async openById(id) {
    const doc = S.docs.find(d => d.id === id);
    if (doc) await this.open(doc);
  },

  async open(doc, options = {}) {
    if (!options?.skipTabRegister && typeof Tabs?.openDoc === 'function') {
      return Tabs.openDoc(doc, options);
    }
    return this._openDocView(doc, options);
  },

  async _openDocView(doc, options = {}) {
    const mode = normalizeWorkspaceMode(options.mode || S.activeTab || 'reader');
    const shouldPreserveView = Boolean(options?.preserveView || options?.viewState);

    S.highlights = await DB.highlights.byPDF(doc.id);
    S.currentDoc = doc;

    UI.nav('reader', false, { skipTabCapture: true });
    document.querySelectorAll('[id^="sdoc-"]').forEach(e => e.classList.remove('active'));
    document.getElementById(`sdoc-${doc.id}`)?.classList.add('active');
    UI.renderCats();
    UI.renderPanelInfo(doc);
    document.getElementById('doc-title-hdr').textContent = doc.title || doc.name;

    const pvOptions = { ...options };
    delete pvOptions.skipTabRegister;
    delete pvOptions.skipTabCapture;
    delete pvOptions.mode;
    pvOptions.preserveView = shouldPreserveView;
    await PV.open(doc, pvOptions);

    UI.tab(mode);
  },

  editMeta(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    const isArticle = isArticleDoc(d);
    const isBook = isBookDoc(d);
    const isAcademicWork = isAcademicWorkDoc(d);
    const isBookChapter = isBookChapterDoc(d);
    const isReport = isReportDoc(d);
    const isOther = isOtherDoc(d);
    const tagsHtml = (d.tags || []).filter(t => S.docTags.includes(t)).map(t =>
      `<span class="tag-pill">${escHtml(t)}<button onclick="Library._removeTagInModal('${escHtml(t)}')">×</button></span>`
    ).join('');
    const tagOptions = S.docTags.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
    Modal.show(`
      <h3>Editar Metadados</h3>
      <div class="fg-row">
        <div class="fg"><label>Título</label><input id="em-title" value="${escHtml(d.title||d.name)}"></div>
      </div>
      <div class="fg-row">
        <div class="fg" id="em-author-wrap" style="${isOther ? 'display:none;' : ''}"><label>Autor(es)</label><input id="em-author" value="${escHtml(d.author||'')}"></div>
        <div class="fg" id="em-year-wrap" style="max-width:80px;${(isReport || isOther) ? 'display:none;' : ''}"><label>Ano</label><input id="em-year" value="${escHtml(d.year||'')}"></div>
      </div>
      <div class="fg-row">
        <div class="fg"><label>Tipo</label>
          <select id="em-type">
            ${[
              ['artigo', 'Artigo'],
              ['livro', 'Livro'],
              ['outro', 'Outros'],
            ].map(([value, label]) =>
              `<option value="${value}" ${(d.type||'').toLowerCase()===value?'selected':''}>${label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="fg" id="em-lang-wrap" style="max-width:80px;${(isReport || isOther) ? 'display:none;' : ''}"><label>Idioma</label><input id="em-lang" value="${escHtml(d.lang||'')}"></div>
      </div>
      <div class="fg"><label>Pasta</label>
        <select id="em-folder">${Folders.optionTags('library', d.folderId || 'root', true)}</select>
      </div>
      <div class="fg" id="em-doi-wrap" style="${isBook ? 'display:none;' : ''}"><label>DOI</label><input id="em-doi" placeholder="10.xxxx/xxxx" value="${escHtml(d.doi||'')}"></div>
      <div class="fg" id="em-isbn-wrap" style="${isBook ? '' : 'display:none;'}"><label>ISBN</label><input id="em-isbn" placeholder="978-xx-xxxx-xxxx-x" value="${escHtml(d.isbn||'')}"></div>
      <div id="em-book-fields" style="${isBook ? '' : 'display:none;'}">
        <div class="fg"><label>Editora</label><input id="em-publisher" value="${escHtml(d.publisher||'')}"></div>
        <div class="fg-row">
          <div class="fg"><label>Edição</label><input id="em-edition" value="${escHtml(d.edition||'')}"></div>
          <div class="fg" style="max-width:140px;"><label>Número de páginas</label><input id="em-page-count" inputmode="numeric" value="${escHtml(d.pageCount||'')}"></div>
        </div>
      </div>
      <div id="em-academic-fields" style="${isAcademicWork ? '' : 'display:none;'}">
        <div class="fg"><label>Subtipo</label>
          <select id="em-academic-subtype">
            ${['Tese','Dissertação','TCC'].map(option =>
              `<option value="${option}" ${String(d.academicSubtype||'').trim()===option?'selected':''}>${option}</option>`
            ).join('')}
          </select>
        </div>
        <div class="fg"><label>Instituição</label><input id="em-institution" value="${escHtml(d.institution||'')}"></div>
        <div class="fg"><label>Programa/Curso</label><input id="em-program" value="${escHtml(d.program||'')}"></div>
        <div class="fg-row">
          <div class="fg"><label>Orientador</label><input id="em-advisor" value="${escHtml(d.advisor||'')}"></div>
          <div class="fg"><label>Coorientador</label><input id="em-coadvisor" value="${escHtml(d.coadvisor||'')}"></div>
        </div>
        <div class="fg" style="max-width:160px;"><label>Número de páginas</label><input id="em-academic-page-count" inputmode="numeric" value="${escHtml(d.pageCount||'')}"></div>
      </div>
      <div id="em-book-chapter-fields" style="${isBookChapter ? '' : 'display:none;'}">
        <div class="fg"><label>Título do Livro</label><input id="em-book-title" value="${escHtml(d.bookTitle||'')}"></div>
        <div class="fg-row">
          <div class="fg"><label>ISBN</label><input id="em-chapter-isbn" placeholder="978-xx-xxxx-xxxx-x" value="${escHtml(d.isbn||'')}"></div>
          <div class="fg"><label>Editora</label><input id="em-chapter-publisher" value="${escHtml(d.publisher||'')}"></div>
        </div>
        <div class="fg-row">
          <div class="fg"><label>Edição</label><input id="em-chapter-edition" value="${escHtml(d.edition||'')}"></div>
          <div class="fg"><label>Páginas (intervalo)</label><input id="em-page-range" placeholder="p. 25-48" value="${escHtml(d.pageRange||'')}"></div>
        </div>
      </div>
      <div id="em-report-fields" style="${isReport ? '' : 'display:none;'}">
        <div class="fg"><label>Subtipo</label>
          <select id="em-report-subtype">
            ${['Experimental','Técnico','Projeto','Laboratório'].map(option =>
              `<option value="${option}" ${String(d.reportSubtype||'').trim()===option?'selected':''}>${option}</option>`
            ).join('')}
          </select>
        </div>
        <div class="fg-row">
          <div class="fg"><label>Instituição/Laboratório</label><input id="em-report-institution" value="${escHtml(d.institution||'')}"></div>
          <div class="fg"><label>Responsável</label><input id="em-responsible" value="${escHtml(d.responsible||'')}"></div>
        </div>
        <div class="fg-row">
          <div class="fg" style="max-width:180px;"><label>Data</label><input id="em-full-date" placeholder="dd/mm/aaaa" value="${escHtml(d.fullDate||'')}"></div>
          <div class="fg"><label>Área/Disciplina</label><input id="em-area" value="${escHtml(d.area||'')}"></div>
        </div>
        <div class="fg"><label>Metodologia</label><textarea id="em-methodology" rows="4">${escHtml(d.methodology||'')}</textarea></div>
        <div class="fg"><label>Resultados</label><textarea id="em-results" rows="4">${escHtml(d.results||'')}</textarea></div>
      </div>
      <div id="em-other-fields" style="${isOther ? '' : 'display:none;'}">
        <div class="fg"><label>Subtipo</label>
          <select id="em-other-subtype">
            ${['Slide','Apostila','Documento Interno','Manual de Prática','TC','Material do curso'].map(option =>
              `<option value="${option}" ${String(d.otherSubtype||'').trim()===option?'selected':''}>${option}</option>`
            ).join('')}
          </select>
        </div>
        <div class="fg"><label>Fonte</label><input id="em-source" value="${escHtml(d.source||'')}"></div>
        <div class="fg"><label>Contexto</label><input id="em-context" value="${escHtml(d.context||'')}"></div>
        <div class="fg" style="max-width:180px;"><label>Data</label><input id="em-other-date" placeholder="dd/mm/aaaa" value="${escHtml(d.fullDate||'')}"></div>
        <div class="fg"><label>Descrição</label><textarea id="em-description" rows="4">${escHtml(d.description||'')}</textarea></div>
      </div>
      ${isArticle ? `
        <div class="meta-doi-tools">
          <button class="btn btn-sm" id="em-sync-title-btn" onclick="Library.syncTitleFromDoi('${id}')">Atualizar dados pelo DOI</button>
          <span class="meta-doi-tip">Usa os dados do DOI para preencher tí­tulo, autor(es) e ano automaticamente.</span>
        </div>
      ` : ''}
      ${isBook ? `
        <div class="meta-doi-tools meta-isbn-tools">
          <button class="btn btn-sm" id="em-sync-isbn-btn" onclick="Library.syncMetaFromIsbn('${id}')">Atualizar dados pelo ISBN</button>
          <span class="meta-doi-tip">Usa os dados do ISBN para preencher tí­tulo, autor(es), ano, editora, edição e páginas.</span>
        </div>
      ` : ''}
      <div class="fg">
        <label>Tags</label>
        <div class="tags-wrap" id="em-tags-wrap">
          ${tagsHtml || '<span style="font-size:11px;color:var(--text3);">Nenhuma tag selecionada.</span>'}
        </div>
        <div class="tags-toolbar">
          <select id="em-tag-sel" ${S.docTags.length ? '' : 'disabled'}>
            ${S.docTags.length ? tagOptions : '<option value="">Nenhuma tag disponível</option>'}
          </select>
          <button class="btn btn-sm" type="button" onclick="Library._addTagInModal()" ${S.docTags.length ? '' : 'disabled'}>+ Adicionar</button>
        </div>
      </div>
      <div class="mactions">
        <button class="btn btn-d" onclick="Library.del('${id}')" style="margin-right:auto;">Remover</button>
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="Library.saveMeta('${id}')">Salvar</button>
      </div>
    `);
    const typeSelect = document.getElementById('em-type');
    if (typeSelect && !typeSelect.querySelector('option[value="material-academico"]')) {
      const opt = document.createElement('option');
      opt.value = 'material-academico';
      opt.textContent = 'Material Acadêmico';
      typeSelect.insertBefore(opt, typeSelect.querySelector('option[value="outro"]'));
    }
    if (typeSelect && !typeSelect.querySelector('option[value="capitulo-livro"]')) {
      const opt = document.createElement('option');
      opt.value = 'capitulo-livro';
      opt.textContent = 'Capítulo de Livro';
      typeSelect.insertBefore(opt, typeSelect.querySelector('option[value="outro"]'));
    }
    if (typeSelect && !typeSelect.querySelector('option[value="relatorio"]')) {
      const opt = document.createElement('option');
      opt.value = 'relatorio';
      opt.textContent = 'Relatório';
      typeSelect.insertBefore(opt, typeSelect.querySelector('option[value="outro"]'));
    }
    if (typeSelect && isAcademicWorkDoc(d)) {
      typeSelect.value = 'material-academico';
    }
    if (typeSelect && String(d.type || '').trim().toLowerCase() === 'capitulo-livro') {
      typeSelect.value = 'capitulo-livro';
    }
    if (typeSelect && String(d.type || '').trim().toLowerCase() === 'relatorio') {
      typeSelect.value = 'relatorio';
    }
    document.getElementById('em-type')?.addEventListener('change', () => this.updateMetaTypeFields());
    this.updateMetaTypeFields();
    Library._modalTags = [...(d.tags || [])].filter(t => S.docTags.includes(t));
  },

  _modalTags: [],

  _addTagInModal() {
    const sel = document.getElementById('em-tag-sel');
    const val = String(sel?.value || '').trim();
    if (!val || !S.docTags.includes(val)) return;
    if (this._modalTags.includes(val)) return;
    this._modalTags.push(val);

    const wrap = document.getElementById('em-tags-wrap');
    if (!wrap) return;
    const empty = wrap.querySelector('span');
    if (empty && empty.textContent.includes('Nenhuma tag')) empty.remove();
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${escHtml(val)}<button onclick="Library._removeTagInModal('${escHtml(val)}')">×</button>`;
    wrap.appendChild(pill);
  },

  _removeTagInModal(tag) {
    this._modalTags = this._modalTags.filter(t => t !== tag);
    document.getElementById('em-tags-wrap').querySelectorAll('.tag-pill').forEach(p => {
      if (p.textContent.replace('×', '').trim() === tag) p.remove();
    });
    const wrap = document.getElementById('em-tags-wrap');
    if (wrap && !wrap.querySelector('.tag-pill')) {
      wrap.innerHTML = '<span style="font-size:11px;color:var(--text3);">Nenhuma tag selecionada.</span>';
    }
  },

  updateMetaTypeFields() {
    const type = String(document.getElementById('em-type')?.value || '').trim().toLowerCase();
    const isArticle = type === 'artigo';
    const isBook = type === 'livro';
    const isAcademicWork = isAcademicWorkType(type);
    const isBookChapter = type === 'capitulo-livro';
    const isReport = type === 'relatorio';

    const doiWrap = document.getElementById('em-doi-wrap');
    const authorWrap = document.getElementById('em-author-wrap');
    const yearWrap = document.getElementById('em-year-wrap');
    const langWrap = document.getElementById('em-lang-wrap');
    const isbnWrap = document.getElementById('em-isbn-wrap');
    const bookFields = document.getElementById('em-book-fields');
    const academicFields = document.getElementById('em-academic-fields');
    const bookChapterFields = document.getElementById('em-book-chapter-fields');
    const reportFields = document.getElementById('em-report-fields');
    const otherFields = document.getElementById('em-other-fields');
    const doiTools = document.querySelector('.meta-doi-tools');
    const isbnTools = document.querySelector('.meta-isbn-tools');
    const isOther = type === 'outro';

    if (authorWrap) authorWrap.style.display = isOther ? 'none' : '';
    if (yearWrap) yearWrap.style.display = isReport ? 'none' : '';
    if (langWrap) langWrap.style.display = isReport ? 'none' : '';
    if (yearWrap) yearWrap.style.display = (isReport || isOther) ? 'none' : '';
    if (langWrap) langWrap.style.display = (isReport || isOther) ? 'none' : '';
    if (doiWrap) doiWrap.style.display = (isBook || isAcademicWork || isBookChapter || isReport || isOther) ? 'none' : '';
    if (isbnWrap) isbnWrap.style.display = isBook ? '' : 'none';
    if (bookFields) bookFields.style.display = isBook ? '' : 'none';
    if (academicFields) academicFields.style.display = isAcademicWork ? '' : 'none';
    if (bookChapterFields) bookChapterFields.style.display = isBookChapter ? '' : 'none';
    if (reportFields) reportFields.style.display = isReport ? '' : 'none';
    if (otherFields) otherFields.style.display = isOther ? '' : 'none';
    if (doiTools) doiTools.style.display = isArticle ? '' : 'none';
    if (isbnTools) isbnTools.style.display = isBook ? '' : 'none';
  },

  async syncTitleFromDoi(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    if (!isArticleDoc(d)) {
      toast('A atualizacao automatica por DOI esta disponivel apenas para artigos.');
      return;
    }

    const doiInput = document.getElementById('em-doi');
    const doi = String(doiInput?.value || '').trim();
    if (!doi) {
      toast('Informe um DOI antes de tentar preencher o titulo.');
      return;
    }

    d.doi = doi;
    const btn = document.getElementById('em-sync-title-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Buscando titulo...';
    }

    try {
      await DB.pdfs.save(d);
      const result = await syncDocTitleFromDoi(d, { refreshUi: true });
      document.getElementById('em-title').value = d.title || d.name;
      document.getElementById('em-author').value = d.author || '';
      document.getElementById('em-year').value = d.year || '';
      toast(result?.metadata?.title ? 'Titulo, autores e ano atualizados automaticamente pelo DOI.' : 'Metadados sincronizados pelo DOI.');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Falha ao buscar metadados pelo DOI.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Atualizar dados pelo DOI';
      }
    }
  },

  async syncMetaFromIsbn(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    if (!isBookDoc(d)) {
      toast('A atualizacao automatica por ISBN esta disponivel apenas para livros.');
      return;
    }

    const isbnInput = document.getElementById('em-isbn');
    const isbn = String(isbnInput?.value || '').trim();
    if (!isbn) {
      toast('Informe um ISBN antes de tentar preencher os metadados.');
      return;
    }

    d.isbn = isbn;
    const btn = document.getElementById('em-sync-isbn-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Buscando dados...';
    }

    try {
      await DB.pdfs.save(d);
      const result = await syncDocMetaFromIsbn(d, { refreshUi: true });
      document.getElementById('em-title').value = d.title || d.name;
      document.getElementById('em-author').value = d.author || '';
      document.getElementById('em-year').value = d.year || '';
      document.getElementById('em-isbn').value = d.isbn || '';
      document.getElementById('em-publisher').value = d.publisher || '';
      document.getElementById('em-edition').value = d.edition || '';
      document.getElementById('em-page-count').value = d.pageCount || '';
      toast(result?.metadata?.title || result?.metadata?.author
        ? 'Metadados do livro atualizados automaticamente pelo ISBN.'
        : 'Metadados sincronizados pelo ISBN.');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Falha ao buscar metadados pelo ISBN.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Atualizar dados pelo ISBN';
      }
    }
  },

  async saveMeta(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    d.title  = document.getElementById('em-title').value.trim()  || d.name;
    d.author = document.getElementById('em-author').value.trim();
    d.year   = document.getElementById('em-year').value.trim();
    d.type   = normalizeDocType(document.getElementById('em-type').value);
    d.lang   = document.getElementById('em-lang').value.trim();
    d.folderId = (document.getElementById('em-folder').value || 'root');
    if (d.folderId === 'root') d.folderId = null;
    if (String(d.type || '').trim().toLowerCase() === 'livro') {
      d.doi       = '';
      d.isbn      = document.getElementById('em-isbn')?.value.trim() || '';
      d.publisher = document.getElementById('em-publisher')?.value.trim() || '';
      d.edition   = document.getElementById('em-edition')?.value.trim() || '';
      d.pageCount = document.getElementById('em-page-count')?.value.trim() || '';
      d.academicSubtype = '';
      d.institution = '';
      d.program = '';
      d.advisor = '';
      d.coadvisor = '';
      d.bookTitle = '';
      d.pageRange = '';
      d.reportSubtype = '';
      d.responsible = '';
      d.fullDate = '';
      d.methodology = '';
      d.results = '';
      d.area = '';
      d.otherSubtype = '';
      d.source = '';
      d.context = '';
      d.description = '';
    } else if (isAcademicWorkDoc(d)) {
      d.doi       = '';
      d.isbn      = '';
      d.publisher = '';
      d.edition   = '';
      d.pageCount = document.getElementById('em-academic-page-count')?.value.trim() || '';
      d.academicSubtype = document.getElementById('em-academic-subtype')?.value.trim() || 'Tese';
      d.institution = document.getElementById('em-institution')?.value.trim() || '';
      d.program = document.getElementById('em-program')?.value.trim() || '';
      d.advisor = document.getElementById('em-advisor')?.value.trim() || '';
      d.coadvisor = document.getElementById('em-coadvisor')?.value.trim() || '';
      d.bookTitle = '';
      d.pageRange = '';
      d.reportSubtype = '';
      d.responsible = '';
      d.fullDate = '';
      d.methodology = '';
      d.results = '';
      d.area = '';
      d.otherSubtype = '';
      d.source = '';
      d.context = '';
      d.description = '';
    } else if (String(d.type || '').trim().toLowerCase() === 'capitulo-livro') {
      d.doi       = '';
      d.isbn      = document.getElementById('em-chapter-isbn')?.value.trim() || '';
      d.publisher = document.getElementById('em-chapter-publisher')?.value.trim() || '';
      d.edition   = document.getElementById('em-chapter-edition')?.value.trim() || '';
      d.pageCount = '';
      d.academicSubtype = '';
      d.institution = '';
      d.program = '';
      d.advisor = '';
      d.coadvisor = '';
      d.bookTitle = document.getElementById('em-book-title')?.value.trim() || '';
      d.pageRange = document.getElementById('em-page-range')?.value.trim() || '';
      d.reportSubtype = '';
      d.responsible = '';
      d.fullDate = '';
      d.methodology = '';
      d.results = '';
      d.area = '';
      d.otherSubtype = '';
      d.source = '';
      d.context = '';
      d.description = '';
    } else if (String(d.type || '').trim().toLowerCase() === 'relatorio') {
      d.doi       = '';
      d.isbn      = '';
      d.publisher = '';
      d.edition   = '';
      d.pageCount = '';
      d.year = '';
      d.lang = '';
      d.academicSubtype = '';
      d.program = '';
      d.advisor = '';
      d.coadvisor = '';
      d.bookTitle = '';
      d.pageRange = '';
      d.reportSubtype = document.getElementById('em-report-subtype')?.value.trim() || 'Experimental';
      d.institution = document.getElementById('em-report-institution')?.value.trim() || '';
      d.responsible = document.getElementById('em-responsible')?.value.trim() || '';
      d.fullDate = document.getElementById('em-full-date')?.value.trim() || '';
      d.methodology = document.getElementById('em-methodology')?.value.trim() || '';
      d.results = document.getElementById('em-results')?.value.trim() || '';
      d.area = document.getElementById('em-area')?.value.trim() || '';
      d.otherSubtype = '';
      d.source = '';
      d.context = '';
      d.description = '';
    } else if (String(d.type || '').trim().toLowerCase() === 'outro') {
      d.author = '';
      d.year = '';
      d.lang = '';
      d.doi = '';
      d.isbn = '';
      d.publisher = '';
      d.edition = '';
      d.pageCount = '';
      d.academicSubtype = '';
      d.institution = '';
      d.program = '';
      d.advisor = '';
      d.coadvisor = '';
      d.bookTitle = '';
      d.pageRange = '';
      d.reportSubtype = '';
      d.responsible = '';
      d.fullDate = document.getElementById('em-other-date')?.value.trim() || '';
      d.methodology = '';
      d.results = '';
      d.area = '';
      d.otherSubtype = document.getElementById('em-other-subtype')?.value.trim() || 'Slide';
      d.source = document.getElementById('em-source')?.value.trim() || '';
      d.context = document.getElementById('em-context')?.value.trim() || '';
      d.description = document.getElementById('em-description')?.value.trim() || '';
    } else {
      d.doi       = document.getElementById('em-doi')?.value.trim() || '';
      d.isbn      = '';
      d.publisher = '';
      d.edition   = '';
      d.pageCount = '';
      d.academicSubtype = '';
      d.institution = '';
      d.program = '';
      d.advisor = '';
      d.coadvisor = '';
      d.bookTitle = '';
      d.pageRange = '';
      d.reportSubtype = '';
      d.responsible = '';
      d.fullDate = '';
      d.methodology = '';
      d.results = '';
      d.area = '';
      d.otherSubtype = '';
      d.source = '';
      d.context = '';
      d.description = '';
    }
    d.tags   = [...this._modalTags].filter(t => S.docTags.includes(t));
    await DB.pdfs.save(d);
    if (typeof Tabs?.syncDoc === 'function') Tabs.syncDoc(d);
    Modal.hide(); this.renderGrid(); this.renderSidebar();
    if (S.currentDoc?.id === id) {
      S.currentDoc = d;
      UI.renderPanelInfo(d);
      document.getElementById('doc-title-hdr').textContent = d.title || d.name;
      const readerName = document.getElementById('reader-doc-name');
      if (readerName) readerName.textContent = d.title || d.name;
      PV.updateReaderActions(d);
    }
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
