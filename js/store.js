/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
const S = {
  docs: [], currentDoc: null, pdfDoc: null,
  projectItems: [],
  highlights: [], sucoNotes: {},
  currentPage: 1, totalPages: 0, scale: 1.5,
  view: 'library', activeTab: 'reader',
  cats: [], pending: null, openProjId: null,
  docTags: [],
  selectedHL: null, imgMode: false,
  workspaceTabs: [], activeWorkspaceTabId: null,
  folders: {library: [], projects: []},
  currentFolder: {library: 'root', projects: 'root'},
  libFilter: { tags: [], type: '', lang: '', sort: 'date-desc' },
};

function makeFolderId(scope) {
  const prefix = scope === 'projects' ? 'proj' : 'lib';
  return `${prefix}_fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeFolderList(raw, scope) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .filter(f => f && typeof f === 'object')
    .map(f => {
      const id = String(f.id || '').trim();
      const name = String(f.name || '').trim();
      const parentId = f.parentId ? String(f.parentId).trim() : null;
      if (!id || !name) return null;
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name,
        parentId,
        scope,
        createdAt: Number(f.createdAt) || Date.now(),
        mirrorOf: typeof f.mirrorOf === 'string' && f.mirrorOf.trim() ? f.mirrorOf.trim() : null,
      };
    })
    .filter(Boolean);
}

function buildDefaultFolders(scope) {
  const now = Date.now();
  return DEF_FOLDER_NAMES.map((name, i) => ({
    id: `${scope === 'projects' ? 'proj' : 'lib'}_default_${i + 1}`,
    name,
    parentId: null,
    scope,
    createdAt: now + i,
  }));
}

async function loadCats() {
  try {
    const settings = await DB.settings.get();
    S.cats = Array.isArray(settings?.cats) && settings.cats.length ? settings.cats : DEF_CATS;
    S.docTags = Array.isArray(settings?.tags)
      ? [...new Set(settings.tags.map(t => String(t || '').trim()).filter(Boolean))]
      : [];
    document.body.classList.toggle('dark-mode', Boolean(settings?.darkMode));

    S.folders.library = normalizeFolderList(settings?.libraryFolders, 'library');
    S.folders.projects = normalizeFolderList(settings?.projectFolders, 'projects');

    let shouldSaveFolders = false;
    if (!S.folders.library.length) {
      S.folders.library = buildDefaultFolders('library');
      shouldSaveFolders = true;
    }
    if (!S.folders.projects.length) {
      S.folders.projects = buildDefaultFolders('projects');
      shouldSaveFolders = true;
    }
    if (syncProjectFoldersFromLibrary()) {
      shouldSaveFolders = true;
    }
    if (shouldSaveFolders) {
      await DB.settings.patch({
        libraryFolders: S.folders.library,
        projectFolders: S.folders.projects,
      });
    }
  } catch (err) {
    console.warn('Falha ao carregar configurações do servidor.', err);
    S.cats = DEF_CATS;
    S.docTags = [];
    if (!S.folders.library.length) S.folders.library = buildDefaultFolders('library');
    if (!S.folders.projects.length) S.folders.projects = buildDefaultFolders('projects');
  }
  if (!S.cats.length) S.cats = DEF_CATS;
}
function saveCats() {
  DB.settings.patch({cats: S.cats}).catch(err => {
    console.warn('Falha ao salvar categorias no servidor.', err);
  });
}

function saveTags() {
  DB.settings.patch({tags: S.docTags}).catch(err => {
    console.warn('Falha ao salvar tags no servidor.', err);
  });
}

function saveFolders() {
  return DB.settings.patch({
    libraryFolders: S.folders.library,
    projectFolders: S.folders.projects,
  }).then(() => true).catch(err => {
    console.warn('Falha ao salvar pastas no servidor.', err);
    return false;
  });
}

function syncProjectFoldersFromLibrary() {
  const source = Array.isArray(S.folders.library) ? S.folders.library : [];
  const target = Array.isArray(S.folders.projects) ? S.folders.projects : [];
  if (!source.length || !target.length) return false;

  const sourceById = new Map(source.map(folder => [folder.id, folder]));
  const sourceChildren = new Map();
  source.forEach(folder => {
    const key = folder.parentId || 'root';
    if (!sourceChildren.has(key)) sourceChildren.set(key, []);
    sourceChildren.get(key).push(folder);
  });
  sourceChildren.forEach(children => {
    children.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

  const targetByMirror = new Map();
  const targetByParentName = new Map();
  const processing = new Set();
  target.forEach(folder => {
    if (folder.mirrorOf) targetByMirror.set(folder.mirrorOf, folder);
    const key = `${folder.parentId || 'root'}::${folder.name}`;
    targetByParentName.set(key, folder);
  });

  let changed = false;

  const ensureMirror = (sourceFolder) => {
    if (!sourceFolder) return null;
    if (targetByMirror.has(sourceFolder.id)) return targetByMirror.get(sourceFolder.id);
    if (processing.has(sourceFolder.id)) return targetByMirror.get(sourceFolder.id) || null;

    processing.add(sourceFolder.id);

    const parentMirror = sourceFolder.parentId ? ensureMirror(sourceById.get(sourceFolder.parentId)) : null;
    const parentId = parentMirror ? parentMirror.id : null;
    const targetKey = `${parentId || 'root'}::${sourceFolder.name}`;

    let mirrored = targetByMirror.get(sourceFolder.id) || targetByParentName.get(targetKey) || null;
    if (mirrored) {
      if (mirrored.mirrorOf !== sourceFolder.id) {
        mirrored.mirrorOf = sourceFolder.id;
        changed = true;
      }
      if ((mirrored.parentId || null) !== parentId) {
        mirrored.parentId = parentId;
        changed = true;
      }
      if (mirrored.name !== sourceFolder.name) {
        mirrored.name = sourceFolder.name;
        changed = true;
      }
      if (mirrored.scope !== 'projects') {
        mirrored.scope = 'projects';
        changed = true;
      }
      if (!mirrored.createdAt) {
        mirrored.createdAt = Number(sourceFolder.createdAt) || Date.now();
        changed = true;
      }
    } else {
      mirrored = {
        id: makeFolderId('projects'),
        name: sourceFolder.name,
        parentId,
        scope: 'projects',
        createdAt: Number(sourceFolder.createdAt) || Date.now(),
        mirrorOf: sourceFolder.id,
      };
      target.push(mirrored);
      changed = true;
    }

    targetByMirror.set(sourceFolder.id, mirrored);
    targetByParentName.set(targetKey, mirrored);

    (sourceChildren.get(sourceFolder.id) || []).forEach(ensureMirror);
    processing.delete(sourceFolder.id);
    return mirrored;
  };

  (sourceChildren.get('root') || []).forEach(ensureMirror);

  const sourceIds = new Set(source.map(folder => folder.id));
  const nextTarget = [];
  for (const folder of target) {
    if (folder.mirrorOf && !sourceIds.has(folder.mirrorOf) && !String(folder.id || '').startsWith('proj_default_')) {
      changed = true;
      continue;
    }
    nextTarget.push(folder);
  }
  if (nextTarget.length !== target.length) {
    S.folders.projects = nextTarget;
    changed = true;
  }

  return changed;
}

function getCat(id) { return S.cats.find(c=>c.id===id) || S.cats[0] || {id:'?',name:'?',color:'#888',bg:'rgba(136,136,136,.18)'}; }

const Folders = {
  _drag: null,

  _scopeKey(scope) {
    return scope === 'projects' ? 'projects' : 'library';
  },

  _scopeLabel(scope) {
    return scope === 'projects' ? 'Projetos' : 'Biblioteca';
  },

  list(scope) {
    return S.folders[this._scopeKey(scope)] || [];
  },

  find(scope, id) {
    if (!id || id === 'root') return null;
    return this.list(scope).find(f => f.id === id) || null;
  },

  flatten(scope, parentId = null, depth = 0, out = []) {
    const children = this.list(scope)
      .filter(f => (f.parentId || null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    children.forEach(f => {
      out.push({folder: f, depth});
      this.flatten(scope, f.id, depth + 1, out);
    });

    return out;
  },

  optionTags(scope, selectedId = 'root', includeRoot = true) {
    let html = '';
    if (includeRoot) {
      html += `<option value="root" ${selectedId === 'root' || !selectedId ? 'selected' : ''}>Sem pasta (raiz)</option>`;
    }
    this.flatten(scope).forEach(({folder, depth}) => {
      const prefix = depth ? `${'— '.repeat(depth)}` : '';
      html += `<option value="${folder.id}" ${selectedId === folder.id ? 'selected' : ''}>${escHtml(prefix + folder.name)}</option>`;
    });
    return html;
  },

  path(scope, id) {
    const folder = this.find(scope, id);
    if (!folder) return '';
    const names = [folder.name];
    let cur = folder;
    let guard = 0;

    while (cur?.parentId && guard < 80) {
      const p = this.find(scope, cur.parentId);
      if (!p) break;
      names.unshift(p.name);
      cur = p;
      guard += 1;
    }

    return names.join(' / ');
  },

  breadcrumb(scope, id) {
    const crumbs = [{id: 'root', name: this._scopeLabel(scope)}];
    if (!id || id === 'root') return crumbs;

    let cur = this.find(scope, id);
    const stack = [];
    let guard = 0;
    while (cur && guard < 80) {
      stack.unshift({id: cur.id, name: cur.name});
      cur = cur.parentId ? this.find(scope, cur.parentId) : null;
      guard += 1;
    }
    return crumbs.concat(stack);
  },

  descendants(scope, id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      this.list(scope).forEach(f => {
        if (f.parentId === cur) {
          out.push(f.id);
          stack.push(f.id);
        }
      });
    }
    return out;
  },

  _readDragPayload(ev) {
    const raw = ev?.dataTransfer?.getData('application/json') || ev?.dataTransfer?.getData('text/plain');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.scope && parsed?.kind && parsed?.id) return parsed;
      } catch (_err) {}
    }
    return this._drag;
  },

  _clearDragState() {
    this._drag = null;
    document.querySelectorAll('.dragging, .drop-target').forEach(el => {
      el.classList.remove('dragging');
      el.classList.remove('drop-target');
    });
  },

  dragStart(ev, scope, kind, id) {
    if (!ev?.dataTransfer) return;
    ev.stopPropagation();
    this._drag = {scope, kind, id};
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/json', JSON.stringify(this._drag));
    ev.dataTransfer.setData('text/plain', `${kind}:${id}`);
    ev.currentTarget?.classList.add('dragging');
  },

  dragEnd() {
    this._clearDragState();
  },

  dragOver(ev, scope, targetKind, targetId) {
    const payload = this._readDragPayload(ev);
    if (!payload || payload.scope !== scope || !this._canDrop(payload, scope, targetKind, targetId)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget?.classList.add('drop-target');
  },

  dragLeave(ev) {
    ev.currentTarget?.classList.remove('drop-target');
  },

  async drop(ev, scope, targetKind, targetId) {
    ev.preventDefault();
    ev.stopPropagation();
    const payload = this._readDragPayload(ev);
    this._clearDragState();
    if (!payload || payload.scope !== scope) return;
    await this._applyDrop(payload, scope, targetKind, targetId);
  },

  _canDrop(payload, scope, targetKind, targetId) {
    if (payload.scope !== scope) return false;
    if (payload.kind === 'folder') {
      if (targetKind !== 'folder' && targetKind !== 'root') return false;
      if (targetKind === 'folder') {
        if (payload.id === targetId) return false;
        if (this.descendants(scope, payload.id).includes(targetId)) return false;
      }
    }
    return true;
  },

  async _applyDrop(payload, scope, targetKind, targetId) {
    const folderId = targetKind === 'root' ? null : targetId;
    if (payload.kind === 'folder') return this._moveFolder(scope, payload.id, folderId);
    if (payload.kind === 'item') return this._moveItem(scope, payload.id, folderId);
    return false;
  },

  async _moveItem(scope, id, folderId) {
    if (scope === 'library') {
      const doc = S.docs.find(d => d.id === id);
      if (!doc) return false;
      const nextFolderId = folderId || null;
      const prevFolderId = doc.folderId || null;
      if (prevFolderId === nextFolderId) {
        toast('O documento já está nessa pasta.');
        return false;
      }
      doc.folderId = nextFolderId;
      try {
        await DB.pdfs.save(doc);
        await Library.load();
        toast('Documento movido.');
        return true;
      } catch (err) {
        doc.folderId = prevFolderId;
        console.warn(err);
        toast('Não foi possível mover o documento.');
        return false;
      }
    }

    const proj = S.projectItems.find(p => p.id === id);
    if (!proj) return false;
    const nextFolderId = folderId || null;
    const prevFolderId = proj.folderId || null;
    if (prevFolderId === nextFolderId) {
      toast('O projeto já está nessa pasta.');
      return false;
    }
    proj.folderId = nextFolderId;
    try {
      await DB.projects.save(proj);
      await Proj.load();
      toast('Projeto movido.');
      return true;
    } catch (err) {
      proj.folderId = prevFolderId;
      console.warn(err);
      toast('Não foi possível mover o projeto.');
      return false;
    }
  },

  async _moveFolder(scope, id, parentId) {
    const folder = this.find(scope, id);
    if (!folder) return false;
    const nextParentId = parentId || null;
    const prevParentId = folder.parentId || null;
    if (prevParentId === nextParentId) {
      toast('A pasta já está nesse local.');
      return false;
    }
    if (nextParentId && (nextParentId === id || this.descendants(scope, id).includes(nextParentId))) {
      toast('Não é possível mover uma pasta para dentro dela mesma.');
      return false;
    }

    folder.parentId = nextParentId;
    if (scope === 'library') syncProjectFoldersFromLibrary();
    const saved = await saveFolders();
    if (!saved) {
      folder.parentId = prevParentId;
      toast('Não foi possível salvar a mudança da pasta.');
      return false;
    }

    if (scope === 'projects') await Proj.load();
    else await Library.load();
    toast('Pasta movida.');
    return true;
  },

  items(scope) {
    if (scope === 'projects') {
      return (S.projectItems || []).map(p => ({
        id: p.id,
        name: p.title || 'Projeto sem título',
        folderId: p.folderId || null,
        icon: '📝',
        type: 'project',
      }));
    }

    return (S.docs || []).map(d => ({
      id: d.id,
      name: d.title || d.name || 'Documento',
      folderId: d.folderId || null,
      icon: docTypeIconMarkup(d),
      type: 'doc',
    }));
  },

  _itemsInFolder(scope, folderId) {
    return this.items(scope)
      .filter(i => (i.folderId || null) === (folderId || null))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  _folderChildren(scope, parentId) {
    return this.list(scope)
      .filter(f => (f.parentId || null) === (parentId || null))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  folderStats(scope, folderId) {
    return {
      folders: this._folderChildren(scope, folderId).length,
      items: this._itemsInFolder(scope, folderId).length,
    };
  },

  parentId(scope, id) {
    const folder = this.find(scope, id);
    return folder?.parentId || 'root';
  },

  goUp(scope) {
    const key = this._scopeKey(scope);
    const currentId = S.currentFolder[key] || 'root';
    if (currentId === 'root') return;
    this.setCurrent(scope, this.parentId(scope, currentId));
  },

  breadcrumbMarkup(scope, id, drag = true) {
    const crumbs = this.breadcrumb(scope, id);
    return crumbs.map((crumb, index) => {
      const targetKind = crumb.id === 'root' ? 'root' : 'folder';
      const targetId = crumb.id === 'root' ? 'root' : crumb.id;
      const dndAttrs = drag
        ? `ondragover="Folders.dragOver(event,'${scope}','${targetKind}','${targetId}')"
           ondragleave="Folders.dragLeave(event)"
           ondrop="Folders.drop(event,'${scope}','${targetKind}','${targetId}')"`
        : '';
      return `
        <span class="lib-breadcrumb-drop" ${dndAttrs}>
          <button class="lib-breadcrumb" onclick="Folders.setCurrent('${scope}','${crumb.id}')">${escHtml(crumb.name)}</button>
        </span>
        ${index < crumbs.length - 1 ? '<span>/</span>' : ''}
      `;
    }).join('');
  },

  isVisible(scope, itemFolderId) {
    const key = this._scopeKey(scope);
    const current = S.currentFolder[key] || 'root';

    if (current === 'root') return true;
    if (!itemFolderId) return false;
    if (itemFolderId === current) return true;

    let cur = this.find(scope, itemFolderId);
    let guard = 0;
    while (cur?.parentId && guard < 80) {
      if (cur.parentId === current) return true;
      cur = this.find(scope, cur.parentId);
      guard += 1;
    }
    return false;
  },

  _renderDefaultToolbar(scope) {
    const key = this._scopeKey(scope);
    const currentId = S.currentFolder[key] || 'root';
    const currentPath = currentId === 'root' ? 'Raiz' : (this.path(scope, currentId) || 'Raiz');

    const label = scope === 'projects' ? '' : 'Explorador';
    const labelMarkup = label ? `<span class="folder-toolbar-lbl">${label}</span>` : '';

    return `
      <div class="folder-toolbar-section">
        ${labelMarkup}
        <div class="folder-toolbar-actions">
          <button class="btn btn-sm" onclick="Folders.create('${scope}')">+ Pasta</button>
          <button class="btn btn-sm" onclick="Folders.renameSelected('${scope}')">Renomear</button>
          <button class="btn btn-d btn-sm" onclick="Folders.removeSelected('${scope}')">Excluir</button>
          <span class="folder-chip">Atual: ${escHtml(currentPath)}</span>
        </div>
      </div>
    `;
  },

  _renderLibraryToolbar() {
    const currentId = S.currentFolder.library || 'root';
    const currentPath = currentId === 'root' ? 'Raiz' : (this.path('library', currentId) || 'Raiz');
    const stats = this.folderStats('library', currentId === 'root' ? null : currentId);
    const totalDocs = this.items('library').length;
    const totalFolders = this.list('library').length;

    return `
      <div class="folder-toolbar-section">
        <span class="folder-toolbar-lbl">Explorador da Biblioteca</span>
        <div class="folder-toolbar-actions">
          <span class="folder-chip">Atual: ${escHtml(currentPath)}</span>
          <button class="btn btn-sm" onclick="Folders.setCurrent('library','root')">Raiz</button>
          <button class="btn btn-sm" onclick="Folders.create('library')">+ Pasta</button>
          <button class="btn btn-sm" onclick="Folders.renameSelected('library')">Renomear</button>
          <button class="btn btn-d btn-sm" onclick="Folders.removeSelected('library')">Excluir</button>
        </div>
      </div>
      <div class="folder-toolbar-summary">
        <div class="folder-summary-card">
          <strong>${stats.items}</strong>
          <span>arquivos aqui</span>
        </div>
        <div class="folder-summary-card">
          <strong>${stats.folders}</strong>
          <span>subpastas aqui</span>
        </div>
        <div class="folder-summary-card">
          <strong>${totalDocs}</strong>
          <span>arquivos na biblioteca</span>
        </div>
        <div class="folder-summary-card">
          <strong>${totalFolders}</strong>
          <span>pastas criadas</span>
        </div>
      </div>
    `;
  },

  renderToolbar(scope) {
    const hostId = scope === 'projects' ? 'proj-folder-bar' : 'search-folder-bar';
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = scope === 'library'
      ? this._renderLibraryToolbar()
      : this._renderDefaultToolbar(scope);
  },

  openItem(scope, id) {
    if (!id) return;
    if (scope === 'projects') {
      Proj.open(id);
    } else {
      Library.openById(id);
    }
  },

  setCurrent(scope, id) {
    const key = this._scopeKey(scope);
    S.currentFolder[key] = id || 'root';
    if (scope === 'projects') {
      Proj.load();
    } else {
      Library.renderGrid();
      Search.renderExplorer();
    }
    this.renderToolbar(scope);
  },

  renameSelected(scope) {
    const key = this._scopeKey(scope);
    const cur = S.currentFolder[key] || 'root';
    if (cur === 'root') {
      toast('Selecione uma pasta para renomear.');
      return;
    }
    this.rename(scope, cur);
  },

  removeSelected(scope) {
    const key = this._scopeKey(scope);
    const cur = S.currentFolder[key] || 'root';
    if (cur === 'root') {
      toast('Selecione uma pasta para excluir.');
      return;
    }
    if (scope === 'library') {
      this.confirmRemoveLibraryFolder(cur);
      return;
    }
    this.remove(scope, cur);
  },

  create(scope, preferredParentId = null) {
    const key = this._scopeKey(scope);
    const currentId = S.currentFolder[key] || 'root';
    const selectedParent = preferredParentId || (currentId === 'root' ? 'root' : currentId);

    Folders._pendingScope = scope;
    Modal.show(`
      <h3>Nova Pasta — ${this._scopeLabel(scope)}</h3>
      <div class="fg"><label>Nome da pasta</label><input id="fld-name" placeholder="Ex: Revisões" autofocus></div>
      <div class="fg"><label>Pasta pai</label><select id="fld-parent">${this.optionTags(scope, selectedParent, true)}</select></div>
      <div class="mactions">
        <button class="btn" onclick="Folders.manage('${scope}')">Voltar</button>
        <button class="btn btn-p" onclick="Folders._confirmCreate()">Criar</button>
      </div>
    `);
    setTimeout(() => document.getElementById('fld-name')?.focus(), 60);
  },

  _pendingScope: 'library',

  async _confirmCreate() {
    const scope = this._pendingScope || 'library';
    const name = (document.getElementById('fld-name')?.value || '').trim();
    const parentVal = document.getElementById('fld-parent')?.value || 'root';
    if (!name) return;

    this.list(scope).push({
      id: makeFolderId(scope),
      name,
      parentId: parentVal === 'root' ? null : parentVal,
      createdAt: Date.now(),
      scope,
    });

    if (scope === 'library') syncProjectFoldersFromLibrary();
    await saveFolders();
    toast('Pasta criada.');
    Modal.hide();
    this.renderToolbar(scope);
    if (scope === 'projects') Proj.load(); else {
      Library.renderGrid();
      Search.renderExplorer();
    }
  },

  manage(scope) {
    const rows = this.flatten(scope).map(({folder, depth}) => {
      const parentPath = folder.parentId ? this.path(scope, folder.parentId) : 'Raiz';
      return `
        <div class="folder-man-row" style="padding-left:${10 + depth * 14}px;">
          <div>
            <div class="folder-man-name">📁 ${escHtml(folder.name)}</div>
            <div class="folder-man-path">Pai: ${escHtml(parentPath)}</div>
          </div>
          <div class="folder-man-actions">
            <button class="btn btn-sm" onclick="Folders.create('${scope}','${folder.id}')">+ Sub</button>
            <button class="btn btn-sm" onclick="Folders.rename('${scope}','${folder.id}')">Renomear</button>
            <button class="btn btn-d btn-sm" onclick="Folders.remove('${scope}','${folder.id}')">Excluir</button>
          </div>
        </div>`;
    }).join('');

    Modal.show(`
      <h3>Pastas — ${this._scopeLabel(scope)}</h3>
      <div class="folder-man-list">
        ${rows || '<div class="empty" style="padding:20px 10px;"><p>Nenhuma pasta criada.</p></div>'}
      </div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Fechar</button>
        <button class="btn btn-p" onclick="Folders.create('${scope}','root')">+ Pasta na raiz</button>
      </div>
    `);
  },

  async rename(scope, id) {
    const f = this.find(scope, id);
    if (!f) return;
    const name = prompt('Novo nome da pasta:', f.name);
    if (name === null) return;
    const next = name.trim();
    if (!next) return;
    f.name = next;
    if (scope === 'library') syncProjectFoldersFromLibrary();
    await saveFolders();
    this.renderToolbar(scope);
    if (scope === 'projects') Proj.load(); else {
      Library.renderGrid();
      Search.renderExplorer();
    }
    toast('Pasta renomeada.');
  },

  confirmRemoveLibraryFolder(id) {
    const f = this.find('library', id);
    if (!f) return;
    const nestedIds = new Set([id, ...this.descendants('library', id)]);
    const docsInside = S.docs.filter(d => d.folderId && nestedIds.has(d.folderId)).length;
    Modal.show(`
      <h3>Excluir pasta</h3>
      <div class="modal-subtle">
        A pasta <strong>${escHtml(f.name)}</strong> será removida junto com as subpastas.
        Escolha o destino dos arquivos que estão dentro dela.
      </div>
      <div class="folder-toolbar-summary" style="margin:4px 0 6px;">
        <div class="folder-summary-card">
          <strong>${docsInside}</strong>
          <span>arquivos afetados</span>
        </div>
        <div class="folder-summary-card">
          <strong>${nestedIds.size - 1}</strong>
          <span>subpastas abaixo</span>
        </div>
      </div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn" onclick="Folders.remove('library','${id}',{deleteDocs:false})">Mover arquivos para a raiz</button>
        <button class="btn btn-d" onclick="Folders.remove('library','${id}',{deleteDocs:true})">Excluir arquivos com a pasta</button>
      </div>
    `);
  },

  async remove(scope, id, options = {}) {
    const f = this.find(scope, id);
    if (!f) return;
    const deleteDocs = !!options.deleteDocs;
    if (scope !== 'library' && !confirm(`Excluir a pasta "${f.name}" e suas subpastas? Itens serão movidos para a raiz.`)) return;

    const key = this._scopeKey(scope);
    const removed = new Set([id, ...this.descendants(scope, id)]);
    const nextSelected = f.parentId || 'root';
    S.folders[key] = this.list(scope).filter(x => !removed.has(x.id));

    if (scope === 'library') {
      const touched = S.docs.filter(d => d.folderId && removed.has(d.folderId));
      if (deleteDocs) {
        for (const d of touched) {
          await DB.pdfs.del(d.id);
          S.docs = S.docs.filter(doc => doc.id !== d.id);
          if (S.currentDoc?.id === d.id) {
            S.currentDoc = null;
            S.highlights = [];
          }
        }
      } else {
        for (const d of touched) {
          d.folderId = null;
          await DB.pdfs.save(d);
        }
      }
      if (removed.has(S.currentFolder.library)) S.currentFolder.library = nextSelected;
      Library.renderGrid();
      Library.renderSidebar();
    } else {
      const all = await DB.projects.all();
      for (const p of all) {
        if (p.folderId && removed.has(p.folderId)) {
          p.folderId = null;
          await DB.projects.save(p);
        }
      }
      if (removed.has(S.currentFolder.projects)) S.currentFolder.projects = 'root';
      Proj.load();
    }

    if (scope === 'library') syncProjectFoldersFromLibrary();
    if (!S.folders.projects.some(f => f.id === S.currentFolder.projects)) S.currentFolder.projects = 'root';
    await saveFolders();
    Modal.hide();
    this.renderToolbar(scope);
    if (scope === 'library') Search.renderExplorer();
    toast(deleteDocs ? 'Pasta e arquivos removidos.' : 'Pasta removida.');
  },
};
