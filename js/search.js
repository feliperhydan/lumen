/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
const Search = {
  _timer: null,
  _index: null,
  
  onInput(q) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.run(q), 300);
  },
  
  async load() {
    S.docs = await DB.pdfs.all();
    this.renderExplorer();
    
    // Create an in-memory cache for search to prevent excessive network requests
    this._index = {
      docs: S.docs,
      highlights: await DB.highlights.all(),
      projects: await DB.projects.all(),
      attachments: await DB.attachments.all(),
      timestamp: Date.now()
    };

    const input = document.getElementById('search-input');
    if (input?.value?.trim()) {
      await this.run(input.value);
    } else {
      const res = document.getElementById('search-results');
      if (res) res.innerHTML = '';
    }
  },

  renderExplorer() {
    const currentId = S.currentFolder.library || 'root';
    const currentFolder = currentId === 'root' ? null : Folders.find('library', currentId);
    const stats = Folders.folderStats('library', currentFolder?.id || null);
    const host = document.getElementById('search-folder-current');
    if (host) {
      host.innerHTML = `
        <div class="lib-current-bar">
          <div class="lib-current-meta">
            <div class="lib-breadcrumbs">${Folders.breadcrumbMarkup('library', currentId, true)}</div>
            <div class="lib-current-title">${escHtml(currentFolder?.name || 'Explorador da Biblioteca')}</div>
            <div class="lib-current-sub">${stats.items} arquivo(s) e ${stats.folders} subpasta(s) neste nível.</div>
          </div>
          <div class="lib-current-actions">
            ${currentFolder ? `<button class="btn btn-sm" onclick="Folders.goUp('library')">← Voltar</button>` : ''}
            <button class="btn btn-sm" onclick="Folders.setCurrent('library','root')">Raiz</button>
            <button class="btn btn-sm" onclick="Folders.create('library','${currentFolder?.id || 'root'}')">+ Pasta aqui</button>
            ${currentFolder ? `<button class="btn btn-sm" onclick="Folders.rename('library','${currentFolder.id}')">Renomear</button>` : ''}
            ${currentFolder ? `<button class="btn btn-d btn-sm" onclick="Folders.removeSelected('library')">Excluir</button>` : ''}
          </div>
        </div>
      `;
    }
    Folders.renderToolbar('library');
  },

  async run(q) {
    q = q.trim().toLowerCase();
    const res = document.getElementById('search-results');
    if (q.length < 2) { res.innerHTML = ''; return; }

    // Use cached index instead of fetching from server if available
    // Reload if cache is missing or older than 30 seconds
    if (!this._index || Date.now() - this._index.timestamp > 30000) {
      this._index = {
        docs: await DB.pdfs.all(),
        highlights: await DB.highlights.all(),
        projects: await DB.projects.all(),
        attachments: await DB.attachments.all(),
        timestamp: Date.now()
      };
    }

    const allHLs = this._index.highlights;
    const allDocs = this._index.docs;
    const allProjs = this._index.projects;
    const allAtts = this._index.attachments;

    const docMap = Object.fromEntries(allDocs.map(d => [d.id, d]));

    const hlHits   = allHLs.filter(h =>
      (h.text && h.text.toLowerCase().includes(q)) ||
      (h.note && h.note.toLowerCase().includes(q)) ||
      (h.sucoNote && h.sucoNote.toLowerCase().includes(q))
    );
    const projHits = allProjs.filter(p =>
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.content && p.content.toLowerCase().includes(q))
    );
    const attHits  = allAtts.filter(a =>
      (a.text && a.text.toLowerCase().includes(q)) ||
      (a.note && a.note.toLowerCase().includes(q))
    );
    const docHits = allDocs.filter(d => {
      const tags = Array.isArray(d.tags) ? d.tags.join(' ') : '';
      const hay = [
        d.title, d.name, d.author, d.year, d.type, d.lang,
        d.doi, d.isbn, d.publisher, d.edition, d.pageCount,
        d.academicSubtype, d.institution, d.program, d.advisor, d.coadvisor,
        d.bookTitle, d.pageRange, d.reportSubtype, d.responsible, d.fullDate,
        d.methodology, d.results, d.area, d.otherSubtype, d.source, d.context,
        d.description, tags,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    const folderHits = {
      library: (S.folders.library || []).filter(f => {
        const path = Folders.path('library', f.id) || f.name || '';
        return `${f.name} ${path}`.toLowerCase().includes(q);
      }),
      projects: (S.folders.projects || []).filter(f => {
        const path = Folders.path('projects', f.id) || f.name || '';
        return `${f.name} ${path}`.toLowerCase().includes(q);
      }),
    };

    if (!hlHits.length && !projHits.length && !attHits.length && !docHits.length && !folderHits.library.length && !folderHits.projects.length) {
      res.innerHTML = '<p style="color:var(--text3);font-size:14px;">Nenhum resultado encontrado.</p>';
      return;
    }

    let html = '';
    const sect = (title, cnt) => `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:600;margin:18px 0 10px;">${title} (${cnt})</div>`;

    if (docHits.length) {
      html += sect('Documentos', docHits.length);
      html += `<div class="doc-grid">
        ${docHits.map(d => {
          const meta = libraryCardMeta(d) || 'Sem metadados principais';
          return `
            <article class="doc-card" draggable="true" onclick="Library.openById('${d.id}')" ondragstart="Folders.dragStart(event,'library','item','${d.id}')" ondragend="Folders.dragEnd(event)">
              <div class="doc-head">
                <div class="doc-icon">${docTypeIconMarkup(d, 'card')}</div>
                <div class="doc-head-main">
                  <div class="doc-title">${escHtml(d.title || d.name)}</div>
                  <div class="doc-author">${escHtml(meta)}</div>
                </div>
              </div>
              ${d.tags?.length ? `<div class="doc-tags">${d.tags.map(t => `<span class="doc-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
              <button class="doc-edit" onclick="event.stopPropagation();Library.editMeta('${d.id}')">✏</button>
            </article>
          `;
        }).join('')}
      </div>`;
    }

    if (folderHits.library.length || folderHits.projects.length) {
      const total = folderHits.library.length + folderHits.projects.length;
      html += sect('Pastas', total);
      html += `<div class="folder-spot-grid">`;
      html += folderHits.library.map(folder => {
        const stats = Folders.folderStats('library', folder.id);
        const path = Folders.path('library', folder.id) || folder.name;
        return `
          <article class="folder-spot" onclick="Search.openFolder('library','${folder.id}')" title="${escHtml(path)}">
            <div class="folder-spot-head">
              <span class="folder-spot-ico">${folderIconMarkup('folder-spot')}</span>
              <div style="min-width:0;">
                <div class="folder-spot-name">${escHtml(folder.name)}</div>
                <div class="folder-spot-path">Biblioteca · ${escHtml(path)}</div>
              </div>
            </div>
            <div class="folder-spot-stats">
              <span class="folder-spot-chip">${stats.items} arquivo(s)</span>
              <span class="folder-spot-chip">${stats.folders} subpasta(s)</span>
            </div>
          </article>
        `;
      }).join('');
      html += folderHits.projects.map(folder => {
        const stats = Folders.folderStats('projects', folder.id);
        const path = Folders.path('projects', folder.id) || folder.name;
        return `
          <article class="folder-spot" onclick="Search.openFolder('projects','${folder.id}')" title="${escHtml(path)}">
            <div class="folder-spot-head">
              <span class="folder-spot-ico">${folderIconMarkup('folder-spot')}</span>
              <div style="min-width:0;">
                <div class="folder-spot-name">${escHtml(folder.name)}</div>
                <div class="folder-spot-path">Projetos · ${escHtml(path)}</div>
              </div>
            </div>
            <div class="folder-spot-stats">
              <span class="folder-spot-chip">${stats.items} projeto(s)</span>
              <span class="folder-spot-chip">${stats.folders} subpasta(s)</span>
            </div>
          </article>
        `;
      }).join('');
      html += `</div>`;
    }

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
        `<div class="proj-card" draggable="true" onclick="Proj.open('${p.id}')" ondragstart="Folders.dragStart(event,'projects','item','${p.id}')" ondragend="Folders.dragEnd(event)">
          <span style="font-size:19px;">📄</span>
          <div style="flex:1;"><div style="font-size:14px;font-weight:500;">${escHtml(p.title)}</div></div>
        </div>`
      ).join('');
    }
    res.innerHTML = html;
  },

  openFolder(scope, id) {
    if (!id) return;
    Folders.setCurrent(scope, id);
    if (scope === 'projects') UI.nav('projects');
    else UI.nav('library');
  },

  async jumpHL(pdfId, page) {
    const doc = S.docs.find(d => d.id === pdfId);
    if (doc) { await Library.open(doc); setTimeout(() => PV.go(page), 600); }
  },
};

const Tabs = {
  storageKey: 'lumen.workspace-tabs.v1',
  _placeholderCache: new Map(),

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        S.workspaceTabs = [];
        S.activeWorkspaceTabId = null;
        this.render();
        return;
      }

      const parsed = JSON.parse(raw);
      const rawTabs = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tabs) ? parsed.tabs : []);
      S.workspaceTabs = rawTabs.map(tab => this._normalizeTab(tab)).filter(Boolean);

      const storedActiveId = Array.isArray(parsed)
        ? null
        : String(parsed?.activeId || parsed?.activeWorkspaceTabId || '').trim() || null;

      if (storedActiveId && S.workspaceTabs.some(tab => tab.id === storedActiveId)) {
        S.activeWorkspaceTabId = storedActiveId;
      } else {
        const lastUsed = S.workspaceTabs.reduce((winner, tab) => {
          if (!winner) return tab;
          return (Number(tab.lastUsedAt) || 0) > (Number(winner.lastUsedAt) || 0) ? tab : winner;
        }, null);
        S.activeWorkspaceTabId = lastUsed?.id || null;
      }
    } catch (err) {
      console.warn('Falha ao restaurar abas abertas.', err);
      S.workspaceTabs = [];
      S.activeWorkspaceTabId = null;
    }

    this.render();
  },

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        tabs: S.workspaceTabs,
        activeId: S.activeWorkspaceTabId,
      }));
    } catch (err) {
      console.warn('Falha ao salvar abas abertas.', err);
    }
  },

  get active() {
    return S.workspaceTabs.find(tab => tab.id === S.activeWorkspaceTabId) || null;
  },

  find(tabId) {
    return S.workspaceTabs.find(tab => tab.id === tabId) || null;
  },

  findDocTab(docId) {
    return this.find(`doc:${docId}`);
  },

  findProjectTab(projId) {
    return this.find(`proj:${projId}`);
  },

  _getPlaceholderLayout(tabId) {
    if (!tabId) return null;
    return this._placeholderCache.get(tabId) || null;
  },

  _setPlaceholderLayout(tabId, layout) {
    if (!tabId) return;
    if (layout?.pages?.length) {
      this._placeholderCache.set(tabId, layout);
      return;
    }
    this._placeholderCache.delete(tabId);
  },

  _normalizeTab(tab) {
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) return null;

    const kind = tab.kind === 'project' ? 'project' : 'doc';
    const resourceId = String(tab.resourceId || '').trim();
    if (!resourceId) return null;

    const id = String(tab.id || `${kind}:${resourceId}`).trim();
    const createdAt = Number(tab.createdAt) || Date.now();
    const updatedAt = Number(tab.updatedAt) || createdAt;
    const lastUsedAt = Number(tab.lastUsedAt) || updatedAt;

    if (kind === 'doc') {
      return {
        id,
        kind,
        resourceId,
        label: String(tab.label || '').trim() || 'Documento',
        docType: String(tab.docType || '').trim() || 'outro',
        subview: normalizeWorkspaceMode(tab.subview || 'reader'),
        viewState: this._normalizeViewState(tab.viewState),
        createdAt,
        updatedAt,
        lastUsedAt,
      };
    }

    return {
      id,
      kind,
      resourceId,
      label: String(tab.label || '').trim() || 'Projeto',
      createdAt,
      updatedAt,
      lastUsedAt,
    };
  },

  _normalizeViewState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    const page = Math.max(1, Number(state.page) || 1);
    const centerRatioValue = Number(state.centerRatio);
    return {
      page,
      centerRatio: Number.isFinite(centerRatioValue) ? Math.max(0, Math.min(1, centerRatioValue)) : 0.5,
    };
  },

  _workspaceLabel(tab) {
    if (!tab) return '';
    if (tab.kind === 'project') {
      const proj = S.projectItems.find(item => item.id === tab.resourceId) || null;
      return workspaceProjectTabLabel(proj || { title: tab.label });
    }

    const doc = S.docs.find(item => item.id === tab.resourceId) || null;
    return workspaceDocTabLabel(doc || { title: tab.label, name: tab.label });
  },

  _workspaceKindLabel(tab) {
    if (!tab) return '';
    if (tab.kind === 'project') return 'Projeto';
    const doc = S.docs.find(item => item.id === tab.resourceId) || null;
    return docTypeLabel(normalizeDocType(doc?.type || tab.docType || 'outro'));
  },

  _isVisible(tab) {
    if (!tab) return false;
    if (tab.kind === 'doc') {
      return Boolean(S.currentDoc && S.currentDoc.id === tab.resourceId && (S.view === 'reader' || S.view === 'suco'));
    }
    return Boolean(S.openProjId && S.openProjId === tab.resourceId && S.view === 'proj-editor');
  },

  captureCurrentTabState() {
    const tab = this.active;
    if (!tab) return null;

    const now = Date.now();
    let changed = false;

    if (tab.kind === 'doc' && S.currentDoc && S.currentDoc.id === tab.resourceId && (S.view === 'reader' || S.view === 'suco')) {
      const nextLabel = workspaceDocTabLabel(S.currentDoc);
      const nextType = normalizeDocType(S.currentDoc.type);
      const nextSubview = normalizeWorkspaceMode(S.view);
      const nextViewState = S.pdfDoc && typeof PV._captureViewState === 'function'
        ? this._normalizeViewState(PV._captureViewState())
        : tab.viewState || null;
      const nextPlaceholderLayout = S.pdfDoc && typeof PV._capturePlaceholderLayout === 'function'
        ? PV._capturePlaceholderLayout()
        : null;

      if (tab.label !== nextLabel) { tab.label = nextLabel; changed = true; }
      if (tab.docType !== nextType) { tab.docType = nextType; changed = true; }
      if (tab.subview !== nextSubview) { tab.subview = nextSubview; changed = true; }
      if (JSON.stringify(tab.viewState || null) !== JSON.stringify(nextViewState || null)) {
        tab.viewState = nextViewState;
        changed = true;
      }
      this._setPlaceholderLayout(tab.id, nextPlaceholderLayout);
      tab.updatedAt = now;
      tab.lastUsedAt = now;
    }

    if (tab.kind === 'project' && S.openProjId && S.openProjId === tab.resourceId && S.view === 'proj-editor') {
      const proj = S.projectItems.find(item => item.id === tab.resourceId) || null;
      const nextLabel = workspaceProjectTabLabel(proj || { title: tab.label });
      if (tab.label !== nextLabel) { tab.label = nextLabel; changed = true; }
      tab.updatedAt = now;
      tab.lastUsedAt = now;
    }

    if (changed) this.save();
    return tab;
  },

  setActiveSubview(subview) {
    const tab = this.active;
    if (!tab || tab.kind !== 'doc') return null;
    const nextSubview = normalizeWorkspaceMode(subview);
    if (tab.subview !== nextSubview) {
      tab.subview = nextSubview;
      tab.updatedAt = Date.now();
      tab.lastUsedAt = Date.now();
      this.save();
    }
    this.render();
    return tab;
  },

  _upsertDocTab(doc, options = {}) {
    const id = `doc:${doc.id}`;
    const now = Date.now();
    let tab = this.find(id);
    const nextSubview = normalizeWorkspaceMode(options.mode || tab?.subview || S.activeTab || 'reader');

    if (!tab) {
      tab = {
        id,
        kind: 'doc',
        resourceId: doc.id,
        label: workspaceDocTabLabel(doc),
        docType: normalizeDocType(doc.type),
        subview: nextSubview,
        viewState: this._normalizeViewState(options.viewState),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      };
      S.workspaceTabs.push(tab);
      return tab;
    }

    tab.label = workspaceDocTabLabel(doc);
    tab.docType = normalizeDocType(doc.type);
    tab.subview = nextSubview;
    if (options.viewState) {
      tab.viewState = this._normalizeViewState(options.viewState);
    }
    tab.updatedAt = now;
    tab.lastUsedAt = now;
    return tab;
  },

  _upsertProjectTab(project) {
    const id = `proj:${project.id}`;
    const now = Date.now();
    let tab = this.find(id);

    if (!tab) {
      tab = {
        id,
        kind: 'project',
        resourceId: project.id,
        label: workspaceProjectTabLabel(project),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      };
      S.workspaceTabs.push(tab);
      return tab;
    }

    tab.label = workspaceProjectTabLabel(project);
    tab.updatedAt = now;
    tab.lastUsedAt = now;
    return tab;
  },

  async openDoc(doc, options = {}) {
    if (!doc || !doc.id) return null;
    if (!options.skipCapture) this.captureCurrentTabState();

    const tab = this._upsertDocTab(doc, options);
    S.activeWorkspaceTabId = tab.id;
    tab.lastUsedAt = Date.now();
    this.save();
    this.render();

    const mode = normalizeWorkspaceMode(options.mode || tab.subview || 'reader');
    await Library._openDocView(doc, {
      ...options,
      skipTabRegister: true,
      skipCapture: true,
      skipTabCapture: true,
      mode,
      viewState: tab.viewState,
      placeholderLayout: options.placeholderLayout || this._getPlaceholderLayout(tab.id),
    });
    this.render();
    return tab;
  },

  async openProject(project, options = {}) {
    if (!project || !project.id) return null;
    if (!options.skipCapture) this.captureCurrentTabState();

    const tab = this._upsertProjectTab(project, options);
    S.activeWorkspaceTabId = tab.id;
    tab.lastUsedAt = Date.now();
    this.save();
    this.render();

    await Proj._openProjectView(project, {
      ...options,
      skipTabRegister: true,
      skipCapture: true,
      skipTabCapture: true,
    });
    this.render();
    return tab;
  },

  async activate(tabId, options = {}) {
    const tab = this.find(tabId);
    if (!tab) return null;

    const alreadyVisible = this._isVisible(tab);
    if (alreadyVisible && !options.force) {
      S.activeWorkspaceTabId = tab.id;
      tab.lastUsedAt = Date.now();
      this.save();
      this.render();
      return tab;
    }

    if (!options.skipCapture) this.captureCurrentTabState();

    S.activeWorkspaceTabId = tab.id;
    tab.lastUsedAt = Date.now();
    this.save();
    this.render();

    if (tab.kind === 'doc') {
      const doc = S.docs.find(item => item.id === tab.resourceId);
      if (!doc) return tab;
      return this.openDoc(doc, {
        ...options,
        skipCapture: true,
        skipTabRegister: true,
        skipTabCapture: true,
        mode: normalizeWorkspaceMode(tab.subview || 'reader'),
        viewState: tab.viewState,
        placeholderLayout: options.placeholderLayout || this._getPlaceholderLayout(tab.id),
      });
    }

    const project = S.projectItems.find(item => item.id === tab.resourceId) || await DB.projects.get(tab.resourceId);
    if (!project) return tab;
    return this.openProject(project, {
      ...options,
      skipCapture: true,
      skipTabRegister: true,
      skipTabCapture: true,
    });
  },

  async close(tabId) {
    const index = S.workspaceTabs.findIndex(tab => tab.id === tabId);
    if (index < 0) return;

    const closingActive = S.activeWorkspaceTabId === tabId;
    if (closingActive) this.captureCurrentTabState();

    S.workspaceTabs.splice(index, 1);
    this._placeholderCache.delete(tabId);

    if (!S.workspaceTabs.length) {
      S.activeWorkspaceTabId = null;
      this.save();
      this.render();
      if (S.view === 'reader' || S.view === 'suco' || S.view === 'proj-editor') {
        UI.nav('library', true, { skipTabCapture: true });
      }
      return;
    }

    const nextTab = S.workspaceTabs[index] || S.workspaceTabs[index - 1] || S.workspaceTabs[S.workspaceTabs.length - 1];
    S.activeWorkspaceTabId = nextTab.id;
    this.save();
    this.render();

    if (closingActive) {
      await this.activate(nextTab.id, {
        force: true,
        skipCapture: true,
      });
    }
  },

  syncDoc(doc) {
    if (!doc || !doc.id) return;
    const tab = this.findDocTab(doc.id);
    if (!tab) return;

    tab.label = workspaceDocTabLabel(doc);
    tab.docType = normalizeDocType(doc.type);
    if (S.currentDoc && S.currentDoc.id === doc.id && (S.view === 'reader' || S.view === 'suco')) {
      tab.subview = normalizeWorkspaceMode(S.view);
      if (S.pdfDoc && typeof PV._captureViewState === 'function') {
        tab.viewState = this._normalizeViewState(PV._captureViewState());
      }
    }
    tab.updatedAt = Date.now();
    this.save();
    this.render();
  },

  syncProject(project) {
    if (!project || !project.id) return;
    const tab = this.findProjectTab(project.id);
    if (!tab) return;
    tab.label = workspaceProjectTabLabel(project);
    tab.updatedAt = Date.now();
    this.save();
    this.render();
  },

  restoreActiveWorkspace() {
    const activeTabId = S.activeWorkspaceTabId || S.workspaceTabs[S.workspaceTabs.length - 1]?.id || null;
    if (!activeTabId) {
      this.render();
      return;
    }

    return this.activate(activeTabId, {
      force: true,
      skipCapture: true,
    });
  },

  render() {
    const bar = document.getElementById('main-tabs');
    const tabsHost = document.getElementById('workspace-tabs');
    const modeHost = document.getElementById('workspace-mode-tabs');
    const titleHost = document.getElementById('doc-title-hdr');
    const active = this.active;
    const visible = this._isVisible(active);

    if (bar) bar.style.display = 'flex';

    if (tabsHost) {
      if (S.workspaceTabs.length) {
        tabsHost.innerHTML = S.workspaceTabs.map(tab => {
          const isActive = tab.id === S.activeWorkspaceTabId;
          const kindLabel = this._workspaceKindLabel(tab);
          const title = this._workspaceLabel(tab);
          return `
            <div class="workspace-tab ${isActive ? 'active' : ''}" data-tab-id="${escHtml(tab.id)}" onclick="Tabs.activate('${escHtml(tab.id)}')">
              <span class="workspace-tab-kind">${escHtml(kindLabel)}</span>
              <span class="workspace-tab-title">${escHtml(title)}</span>
              <button class="workspace-tab-close" onclick="event.stopPropagation();Tabs.close('${escHtml(tab.id)}')" title="Fechar aba">×</button>
            </div>
          `;
        }).join('');
      } else {
        tabsHost.innerHTML = '<div class="workspace-empty">Biblioteca pronta para abrir documentos e projetos.</div>';
      }
    }

    if (titleHost) {
      titleHost.textContent = active ? this._workspaceLabel(active) : '';
    }

    if (modeHost) {
      const showModes = active?.kind === 'doc' && (S.view === 'reader' || S.view === 'suco');
      modeHost.style.display = showModes ? 'flex' : 'none';
    }

    const readerTab = document.getElementById('tab-reader');
    const sucoTab = document.getElementById('tab-suco');
    if (readerTab) readerTab.classList.toggle('active', S.view === 'reader');
    if (sucoTab) sucoTab.classList.toggle('active', S.view === 'suco');
  },
};
