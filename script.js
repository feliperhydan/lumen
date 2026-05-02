'use strict';

/* ══════════════════════════════════════
   PDF.JS WORKER
══════════════════════════════════════ */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
const DEF_CATS = [
  {id:'def',  name:'Definição',  color:'#1d6fb8', bg:'rgba(29,111,184,.18)'},
  {id:'evid', name:'Evidência',  color:'#1a7a40', bg:'rgba(26,122,64,.18)'},
  {id:'crit', name:'Crítica',    color:'#c0392b', bg:'rgba(192,57,43,.18)'},
  {id:'conc', name:'Conclusão',  color:'#c07a00', bg:'rgba(192,122,0,.18)'},
  {id:'obs',  name:'Observação', color:'#6e6e6a', bg:'rgba(110,110,106,.18)'},
];

const DEF_FOLDER_NAMES = ['Artigos', 'Livros', 'Materiais Estrangeiros'];
const FILE_UPLOAD_TYPES = [
  {
    value: 'artigo',
    label: 'Artigo / Paper científico',
    hint: 'Procura automaticamente o DOI no PDF antes de salvar.',
  },
  {
    value: 'livro',
    label: 'Livro',
    hint: 'Mantém o fluxo normal de importação com tipo de livro.',
  },
  {
    value: 'material-academico',
    label: 'Material Acadêmico',
    hint: 'Prepara metadados próprios para tese, dissertação e TCC.',
  },
  {
    value: 'capitulo-livro',
    label: 'Capítulo de Livro',
    hint: 'Prepara metadados do capítulo e do livro de origem.',
  },
  {
    value: 'relatorio',
    label: 'Relatório',
    hint: 'Prepara metadados próprios para relatórios acadêmicos e técnicos.',
  },
  {
    value: 'outro',
    label: 'Outros',
    hint: "Outros materiais acadêmicos como slides, TC's, estudos dirigidos etc.",
  },
];

const CITATION_STYLE_OPTIONS = [
  { value: 'abnt', label: 'ABNT' },
  { value: 'vancouver', label: 'Vancouver' },
];

const THEMED_LIBRARY_ICONS = {
  folder: {
    light: 'assets/icons/folder-preto.png',
    dark: 'assets/icons/folder-branco.png',
  },
  artigo: {
    light: 'assets/icons/artigo-preto.png',
    dark: 'assets/icons/artigo-branco.png',
  },
  'capitulo-livro': {
    light: 'assets/icons/cap-de-livro-preto.png',
    dark: 'assets/icons/cap-de-livro-branco.png',
  },
  livro: {
    light: 'assets/icons/livro-preto.png',
    dark: 'assets/icons/livro-branco.png',
  },
  'material-academico': {
    light: 'assets/icons/material-academico-preto.png',
    dark: 'assets/icons/material-academico-branco.png',
  },
  outro: {
    light: 'assets/icons/outros-preto.png',
    dark: 'assets/icons/outros-branco.png',
  },
  relatorio: {
    light: 'assets/icons/relatorio-preto.png',
    dark: 'assets/icons/relatorio-branco.png',
  },
};

/* ══════════════════════════════════════
   DATABASE — REST API (Node.js)
══════════════════════════════════════ */
const DB = (() => {
  const API_BASE = '/api';

  async function request(path, options = {}) {
    const res = await fetch(API_BASE + path, options);

    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try {
        const payload = await res.json();
        if (payload?.error) msg = payload.error;
      } catch (_e) {}
      throw new Error(msg);
    }

    if (res.status === 204) return null;

    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('application/json')) return res.json();
    return res.text();
  }

  function put(path, value) {
    return request(path, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(value),
    });
  }

  return {
    init: () => request('/health'),
    settings: {
      get: () => request('/settings'),
      patch: patch => request('/settings', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(patch),
      }),
    },
    pdfs: {
      upload: (file, doc) => {
        const form = new FormData();
        form.append('file', file);
        form.append('doc', JSON.stringify(doc || {}));
        return request('/pdfs/upload', {method: 'POST', body: form});
      },
      save: d => put(`/pdfs/${encodeURIComponent(d.id)}`, d),
      get: id => request(`/pdfs/${encodeURIComponent(id)}`),
      getCitation: async (id, options = {}) => {
        const normalizedStyle = options?.style ? String(options.style).trim().toLowerCase() : '';
        const refresh = Boolean(options?.refresh);

        try {
          return await request(`/pdfs/${encodeURIComponent(id)}/citation`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            cache: 'no-store',
            body: JSON.stringify({
              refresh,
              style: normalizedStyle,
            }),
          });
        } catch (err) {
          if (!String(err?.message || '').includes('404')) throw err;

          const params = new URLSearchParams();
          if (refresh) params.set('refresh', '1');
          if (normalizedStyle) params.set('style', normalizedStyle);
          params.set('_ts', String(Date.now()));

          return request(`/pdfs/${encodeURIComponent(id)}/citation?${params.toString()}`, {
            cache: 'no-store',
          });
        }
      },
      syncDoiMetadata: id => request(`/pdfs/${encodeURIComponent(id)}/sync-doi-metadata`, {method: 'POST'}),
      syncIsbnMetadata: id => request(`/pdfs/${encodeURIComponent(id)}/sync-isbn-metadata`, {method: 'POST'}),
      getBinary: async id => {
        const res = await fetch(`${API_BASE}/pdfs/${encodeURIComponent(id)}/file`);
        if (!res.ok) throw new Error('Falha ao carregar PDF do servidor.');
        return res.arrayBuffer();
      },
      all: () => request('/pdfs'),
      del: id => request(`/pdfs/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    highlights: {
      save: h => put(`/highlights/${encodeURIComponent(h.id)}`, h),
      byPDF: pid => request(`/highlights/by-pdf/${encodeURIComponent(pid)}`),
      all: () => request('/highlights'),
      del: id => request(`/highlights/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    projects: {
      save: pj => put(`/projects/${encodeURIComponent(pj.id)}`, pj),
      all: () => request('/projects'),
      get: id => request(`/projects/${encodeURIComponent(id)}`),
      del: id => request(`/projects/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    attachments: {
      save: a => put(`/attachments/${encodeURIComponent(a.id)}`, a),
      all: () => request('/attachments'),
      del: id => request(`/attachments/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
    suco_notes: {
      save: n => put(`/suco-notes/${encodeURIComponent(n.id)}`, n),
      get: id => request(`/suco-notes/${encodeURIComponent(id)}`),
      byDoc: docId => request(`/suco-notes/by-doc/${encodeURIComponent(docId)}`),
      del: id => request(`/suco-notes/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    },
  };
})();

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

/* ══════════════════════════════════════
   TOAST & MODAL
══════════════════════════════════════ */
let _toastT;
function toast(msg, dur=2400) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(()=>el.classList.remove('on'), dur);
}
const Modal = {
  _onHide: null,
  show(html, options = {}) {
    this._onHide = typeof options.onHide === 'function' ? options.onHide : null;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('moverlay').classList.add('on');
  },
  hide() {
    document.getElementById('moverlay').classList.remove('on');
    const onHide = this._onHide;
    this._onHide = null;
    if (onHide) onHide();
  },
};

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

/* ══════════════════════════════════════
   PDF VIEWER — MOTOR DE RENDERIZAÇÃO CORRIGIDO
   
   Princípios:
   1. Um único viewport por página (page.getViewport({scale}))
   2. Canvas interno: resolução = viewport * devicePixelRatio (nitidez)
   3. Canvas visual (CSS): tamanho = viewport (sem zoom CSS)
   4. textLayer: mesmo tamanho CSS do canvas (alinhamento perfeito)
   5. Zoom: re-renderização completa, nunca CSS transform
══════════════════════════════════════ */
const PV = {
  // Cancellation token: ao abrir novo doc ou mudar zoom, aborta renders anteriores
  _renderToken: 0,
  _citationBusy: false,

  updateReaderActions(doc = S.currentDoc) {
    const copyBtn = document.getElementById('copy-ref-btn');
    if (!copyBtn) return;

    const isScientificPaper = String(doc?.type || '').trim().toLowerCase() === 'artigo';
    const hasDoi = Boolean(String(doc?.doi || '').trim());
    copyBtn.style.display = isScientificPaper && hasDoi ? 'inline-flex' : 'none';
    copyBtn.disabled = this._citationBusy;
    copyBtn.textContent = this._citationBusy ? '⏳ Buscando referência...' : '📋 Copiar Referência';
  },

  promptCitationStyle() {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Modal.show(`
        <h3>Copiar Referência</h3>
        <p class="modal-subtle">Escolha o padrão da referência que será buscada e copiada para a área de transferência.</p>
        <div class="mactions" style="justify-content:flex-start;">
          ${CITATION_STYLE_OPTIONS.map(option => `
            <button class="btn btn-p" onclick="PV.confirmCitationStyle('${option.value}')">${escHtml(option.label)}</button>
          `).join('')}
          <button class="btn" onclick="PV.cancelCitationStyle()">Cancelar</button>
        </div>
      `, {
        onHide: () => finish(null),
      });

      this._finishCitationStylePrompt = finish;
    });
  },

  _finishCitationStylePrompt: null,

  confirmCitationStyle(style) {
    const finish = this._finishCitationStylePrompt;
    this._finishCitationStylePrompt = null;
    if (finish) finish(style);
    Modal.hide();
  },

  cancelCitationStyle() {
    this._finishCitationStylePrompt = null;
    Modal.hide();
  },

  async copyCitation() {
    const doc = S.currentDoc;
    if (!doc) return;
    if (this._citationBusy) return;
    if (String(doc.type || '').trim().toLowerCase() !== 'artigo') {
      toast('A cópia automática de referência está disponível apenas para papers científicos.');
      return;
    }
    if (!String(doc.doi || '').trim()) {
      toast('Este paper ainda não possui DOI salvo.');
      return;
    }

    const selectedStyle = await this.promptCitationStyle();
    if (!selectedStyle) return;

    this._citationBusy = true;
    this.updateReaderActions(doc);

    try {
      const payload = await DB.pdfs.getCitation(doc.id, { style: selectedStyle });
      const citation = String(payload?.citation || '').trim();
      if (!citation) throw new Error('Nenhuma referência foi retornada para este DOI.');

      const style = String(payload?.style || selectedStyle).trim().toLowerCase();
      doc.citationCache = {
        ...(doc.citationCache || {}),
        [style]: {
          citation,
          cachedAt: Number(payload?.cachedAt) || Date.now(),
        },
      };
      if (style === 'apa') {
        doc.citationApa = citation;
        doc.citationCachedAt = Number(payload?.cachedAt) || Date.now();
      }
      const ix = S.docs.findIndex(item => item.id === doc.id);
      if (ix >= 0) S.docs[ix] = doc;

      await navigator.clipboard.writeText(citation);
      const styleLabel = citationStyleLabel(style);
      toast(payload?.cached ? `Referência ${styleLabel} copiada do cache!` : `Referência ${styleLabel} copiada!`);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Falha ao copiar referência.');
    } finally {
      this._citationBusy = false;
      this.updateReaderActions(doc);
    }
  },

  _captureViewState() {
    const scroller = document.getElementById('pdf-scroller');
    if (!scroller || !S.totalPages) {
      return { page: Math.max(1, S.currentPage || 1), centerRatio: 0.5 };
    }

    const mid = scroller.scrollTop + (scroller.clientHeight / 2);
    let page = Math.max(1, S.currentPage || 1);
    let wrap = null;

    for (let i = 1; i <= S.totalPages; i++) {
      const candidate = document.getElementById(`pw-${i}`);
      if (!candidate) continue;
      if (mid >= candidate.offsetTop && mid <= candidate.offsetTop + candidate.offsetHeight) {
        page = i;
        wrap = candidate;
        break;
      }
    }

    if (!wrap) wrap = document.getElementById(`pw-${page}`);
    if (!wrap) {
      return { page, centerRatio: 0.5 };
    }

    const centerRatio = wrap.offsetHeight > 0
      ? (mid - wrap.offsetTop) / wrap.offsetHeight
      : 0.5;

    return {
      page,
      centerRatio: Math.max(0, Math.min(1, centerRatio)),
    };
  },

  _restoreViewState(viewState) {
    const scroller = document.getElementById('pdf-scroller');
    if (!scroller || !viewState?.page) return;

    const wrap = document.getElementById(`pw-${viewState.page}`);
    if (!wrap) return;

    const ratio = Number.isFinite(viewState.centerRatio) ? viewState.centerRatio : 0.5;
    const targetMid = wrap.offsetTop + (wrap.offsetHeight * Math.max(0, Math.min(1, ratio)));
    const nextScrollTop = Math.max(0, targetMid - (scroller.clientHeight / 2));

    scroller.scrollTop = nextScrollTop;
    S.currentPage = viewState.page;
    document.getElementById('pg-in').value = viewState.page;
  },

  _buildZoomPlaceholders(nextScale, previousScale) {
    if (!S.totalPages || !previousScale || previousScale <= 0) return null;

    const ratio = nextScale / previousScale;
    const pages = [];

    for (let pageNum = 1; pageNum <= S.totalPages; pageNum += 1) {
      const wrap = document.getElementById(`pw-${pageNum}`);
      if (!wrap) return null;

      const width = wrap.clientWidth || parseFloat(wrap.style.width) || 0;
      const height = wrap.clientHeight || parseFloat(wrap.style.height) || 0;
      if (!width || !height) return null;

      pages.push({
        pageNum,
        width: width * ratio,
        height: height * ratio,
      });
    }

    return { pages };
  },

  _applyPlaceholders(container, placeholderLayout) {
    if (!container || !placeholderLayout?.pages?.length) return false;

    container.innerHTML = '';
    placeholderLayout.pages.forEach(({ pageNum, width, height }) => {
      const wrap = document.createElement('div');
      wrap.className = 'page-wrap page-wrap-placeholder';
      wrap.id = `pw-${pageNum}`;
      wrap.style.width = `${width}px`;
      wrap.style.height = `${height}px`;
      container.appendChild(wrap);
    });

    return true;
  },

  _renderSequence(totalPages, preferredPage = 1) {
    const total = Math.max(0, Number(totalPages) || 0);
    if (!total) return [];

    const target = Math.max(1, Math.min(total, Number(preferredPage) || 1));
    const order = [target];

    for (let offset = 1; order.length < total; offset += 1) {
      const next = target + offset;
      const prev = target - offset;

      if (next <= total) order.push(next);
      if (prev >= 1 && order.length < total) order.push(prev);
    }

    return order;
  },

  async open(doc, options = {}) {
    const preserveView = Boolean(options?.preserveView);
    const viewState = preserveView ? (options?.viewState || this._captureViewState()) : null;
    const placeholderLayout = preserveView ? options?.placeholderLayout : null;
    S.currentDoc = doc;
    S.currentPage = preserveView ? Math.max(1, viewState?.page || S.currentPage || 1) : 1;
    S.highlights = await DB.highlights.byPDF(doc.id);
    this._citationBusy = false;
    this.updateReaderActions(doc);

    const scroller = document.getElementById('pdf-scroller');
    const reusedPlaceholders = this._applyPlaceholders(scroller, placeholderLayout);
    if (!reusedPlaceholders) {
      scroller.innerHTML = '<div class="loading"><div class="spin"></div>Carregando PDF…</div>';
    }

    // Invalida renders em andamento
    const token = ++this._renderToken;

    if (preserveView && viewState && reusedPlaceholders) {
      this._restoreViewState(viewState);
    }

    try {
      const arr = await DB.pdfs.getBinary(doc.id);
      S.pdfDoc = await pdfjsLib.getDocument({data: arr}).promise;
      S.totalPages = S.pdfDoc.numPages;

      document.getElementById('pg-total').textContent  = S.totalPages;
      document.getElementById('pg-in').max             = S.totalPages;
      document.getElementById('pg-in').value           = S.currentPage;
      document.getElementById('zoom-lbl').textContent  = Math.round(S.scale * 100) + '%';
      document.getElementById('pdf-bar').style.display = 'flex';
      document.getElementById('reader-doc-name').textContent = doc.title || doc.name;

      if (!reusedPlaceholders) scroller.innerHTML = '';

      const renderOrder = preserveView
        ? this._renderSequence(S.totalPages, viewState?.page || S.currentPage)
        : this._renderSequence(S.totalPages, 1);

      for (const i of renderOrder) {
        if (token !== this._renderToken) break; // abortado
        await this._renderPage(i, scroller, token);
      }

      if (token === this._renderToken && preserveView && viewState) {
        requestAnimationFrame(() => this._restoreViewState(viewState));
      }
    } catch(err) {
      console.error(err);
      scroller.innerHTML = `<div class="loading" style="color:#c0392b;">
        Erro ao carregar PDF.<br><small>${escHtml(err.message)}</small>
      </div>`;
    }
  },

  async _renderPage(pageNum, container, token) {
    const page = await S.pdfDoc.getPage(pageNum);
    if (token !== this._renderToken) return;

    // ── 1. Viewport único para canvas E textLayer ──
    const dpr   = window.devicePixelRatio || 1;
    const vp    = page.getViewport({scale: S.scale});

    // Tamanho visual (CSS) da página
    const cssW  = vp.width;
    const cssH  = vp.height;

    // ── 2. Container da página ──
    let wrap = document.getElementById(`pw-${pageNum}`);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = `pw-${pageNum}`;
      container.appendChild(wrap);
    }

    wrap.className = 'page-wrap';
    wrap.style.width  = cssW + 'px';
    wrap.style.height = cssH + 'px';
    wrap.replaceChildren();

    // ── 3. Canvas de alta resolução ──
    const canvas = document.createElement('canvas');
    // Resolução interna = tamanho visual × DPR (nitidez em telas HiDPI)
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // Tamanho visual via CSS (idêntico ao viewport)
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';

    // ── 4. Camada de highlights (abaixo da textLayer para não bloquear seleção) ──
    const hDiv = document.createElement('div');
    hDiv.className = 'hl-layer';
    hDiv.id = `hl-${pageNum}`;

    // ── 5. textLayer — DEVE ser a última camada (z mais alto) para receber eventos ──
    const tDiv = document.createElement('div');
    tDiv.className = 'textLayer';
    tDiv.style.width  = cssW + 'px';
    tDiv.style.height = cssH + 'px';

    // Ordem: canvas → hl-layer → textLayer (textLayer no topo para seleção)
    wrap.appendChild(canvas);
    wrap.appendChild(hDiv);
    wrap.appendChild(tDiv);

    // ── 6. Renderizar canvas com viewport escalado por DPR ──
    const renderVP = page.getViewport({scale: S.scale * dpr});
    const ctx = canvas.getContext('2d');
    await page.render({canvasContext: ctx, viewport: renderVP}).promise;
    if (token !== this._renderToken) return;

    // ── 7. Renderizar textLayer com o viewport VISUAL (scale original, sem DPR) ──
    // Coordenadas dos spans em pixels CSS — alinhamento perfeito com o canvas.
    try {
      const textContent = await page.getTextContent();
      if (token !== this._renderToken) return;

      tDiv.replaceChildren();
      tDiv.style.setProperty('--scale-factor', String(vp.scale || 1));

      let rendered = false;

      // PDF.js 3/4 usa textContentSource. Mantemos fallback para textContent
      // para ambientes que ainda expõem a assinatura antiga.
      if (typeof pdfjsLib.renderTextLayer === 'function') {
        const runRender = async opts => {
          const task = pdfjsLib.renderTextLayer(opts);
          if (task?.promise) await task.promise;
          if (!task?.promise) await new Promise(r => requestAnimationFrame(r));
          return !!tDiv.querySelector('span');
        };

        rendered = await runRender({
          textContentSource: textContent,
          container: tDiv,
          viewport: vp,
          textDivs: [],
        });

        if (!rendered) {
          tDiv.replaceChildren();
          rendered = await runRender({
            textContent,
            container: tDiv,
            viewport: vp,
            textDivs: [],
          });
        }
      }

      // Fallback para builds que expõem TextLayer como classe.
      if (!rendered && typeof pdfjsLib.TextLayer === 'function') {
        tDiv.replaceChildren();
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: tDiv,
          viewport: vp,
        });
        await textLayer.render();
        rendered = !!tDiv.querySelector('span');
      }

      if (!rendered) {
        console.warn(`textLayer p.${pageNum}: nenhuma camada de texto interativa foi criada.`);
      }
    } catch(e) {
      console.warn(`textLayer p.${pageNum}:`, e);
    }

    if (token !== this._renderToken) return;

    this._drawHLs(pageNum, hDiv, cssW, cssH);

    // Seleção de texto: escuta mouseup na textLayer
    tDiv.addEventListener('mouseup', e =>
      setTimeout(() => HL.onSelect(e, pageNum, wrap), 60)
    );

    // Clique em highlight: detectado por coordenadas na wrap (hl-layer está abaixo)
    wrap.addEventListener('click', e => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const wRect = wrap.getBoundingClientRect();
      const rx = (e.clientX - wRect.left) / cssW;
      const ry = (e.clientY - wRect.top)  / cssH;
      const hit = S.highlights.filter(h => h.page === pageNum).find(h =>
        (h.rects || []).some(r => rx >= r.x && rx <= r.x + r.w && ry >= r.y && ry <= r.y + r.h)
      );
      if (hit) RP.showHighlight(hit);
    });
  },

  _drawHLs(pageNum, layer, cssW, cssH) {
    layer.innerHTML = '';
    S.highlights.filter(h => h.page === pageNum).forEach(h => {
      const cat = getCat(h.catId);
      if (h.type === 'image') {
        (h.rects || []).forEach(r => {
          const el = document.createElement('div');
          el.className = 'hl-mark-img';
          el.style.left   = (r.x * cssW) + 'px';
          el.style.top    = (r.y * cssH) + 'px';
          el.style.width  = (r.w * cssW) + 'px';
          el.style.height = (r.h * cssH) + 'px';
          el.style.borderColor = cat.color;
          el.title = `[${cat.name}] Imagem capturada`;
          layer.appendChild(el);
        });
      } else {
        const filtered = (h.rects || []).filter(r => r.w > 0.005 && r.h > 0.003);
        filtered.forEach(r => {
          const el = document.createElement('div');
          el.className = 'hl-mark';
          el.style.left       = (r.x * cssW) + 'px';
          el.style.top        = (r.y * cssH) + 'px';
          el.style.width      = (r.w * cssW) + 'px';
          el.style.height     = (r.h * cssH) + 'px';
          el.style.background = cat.color;
          el.style.opacity    = '0.32';
          el.title = `[${cat.name}] ${h.text.substring(0, 60)}`;
          layer.appendChild(el);
        });
      }
    });
  },

  refreshPage(pageNum) {
    const layer  = document.getElementById(`hl-${pageNum}`);
    const canvas = document.querySelector(`#pw-${pageNum} canvas`);
    if (layer && canvas) {
      // Usa tamanho CSS (não interno) para coordenadas de highlight
      const cssW = parseFloat(canvas.style.width)  || canvas.width;
      const cssH = parseFloat(canvas.style.height) || canvas.height;
      this._drawHLs(pageNum, layer, cssW, cssH);
    }
  },

  prev() { if (S.currentPage > 1) this.go(S.currentPage - 1); },
  next() { if (S.currentPage < S.totalPages) this.go(S.currentPage + 1); },
  go(n) {
    n = Math.max(1, Math.min(n, S.totalPages));
    S.currentPage = n;
    document.getElementById('pg-in').value = n;
    document.getElementById(`pw-${n}`)?.scrollIntoView({behavior: 'smooth', block: 'start'});
  },
  zoomIn() {
    const previousScale = S.scale;
    const nextScale = Math.min(3, S.scale + 0.25);
    if (nextScale === previousScale) return;
    S.scale = nextScale;
    this._reopen(previousScale);
  },
  zoomOut() {
    const previousScale = S.scale;
    const nextScale = Math.max(0.5, S.scale - 0.25);
    if (nextScale === previousScale) return;
    S.scale = nextScale;
    this._reopen(previousScale);
  },
  _reopen(previousScale = S.scale) {
    document.getElementById('zoom-lbl').textContent = Math.round(S.scale * 100) + '%';
    if (!S.currentDoc) return;

    const viewState = this._captureViewState();
    const placeholderLayout = this._buildZoomPlaceholders(S.scale, previousScale);
    this.open(S.currentDoc, { preserveView: true, viewState, placeholderLayout });
  },
};

// Rastreia página atual pelo scroll
document.getElementById('pdf-scroller').addEventListener('scroll', function() {
  if (!S.pdfDoc) return;
  const mid = this.scrollTop + this.clientHeight / 2;
  for (let i = 1; i <= S.totalPages; i++) {
    const pw = document.getElementById(`pw-${i}`);
    if (!pw) continue;
    if (mid >= pw.offsetTop && mid <= pw.offsetTop + pw.offsetHeight) {
      if (S.currentPage !== i) {
        S.currentPage = i;
        document.getElementById('pg-in').value = i;
      }
      break;
    }
  }
});

/* ══════════════════════════════════════
   IMAGE CAPTURE
══════════════════════════════════════ */
const ImgCapture = {
  active: false,
  startX: 0, startY: 0,
  pageWrap: null, pageNum: 0,
  selBox: document.getElementById('img-sel-box'),

  toggle() {
    this.active = !this.active;
    const overlay = document.getElementById('img-overlay');
    const btn     = document.getElementById('img-mode-btn');
    // Usa classe .on — o CSS controla display e pointer-events juntos
    overlay.classList.toggle('on', this.active);
    btn.classList.toggle('on', this.active);
    if (this.active) toast('Modo captura ativo — arraste para selecionar uma região do PDF');
  },

  onDown(e) {
    if (!this.active) return;
    e.preventDefault();
    this.startX = e.clientX; this.startY = e.clientY;
    this.pageWrap = null; this.pageNum = 0;

    for (let i = 1; i <= S.totalPages; i++) {
      const pw = document.getElementById(`pw-${i}`);
      if (!pw) continue;
      const r = pw.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right) {
        this.pageWrap = pw; this.pageNum = i; break;
      }
    }
    if (!this.pageWrap) return;

    this.selBox.style.cssText = `position:fixed;border:2px dashed #2a8ae8;background:rgba(42,138,232,.08);pointer-events:none;z-index:9999;border-radius:2px;display:block;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;`;
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup',   this._onUp);
  },

  _onMove: null, _onUp: null,

  init() {
    this._onMove = e => {
      if (!this.selBox) return;
      const x = Math.min(e.clientX, this.startX), y = Math.min(e.clientY, this.startY);
      const w = Math.abs(e.clientX - this.startX),  h = Math.abs(e.clientY - this.startY);
      this.selBox.style.left  = x + 'px';
      this.selBox.style.top   = y + 'px';
      this.selBox.style.width = w + 'px';
      this.selBox.style.height= h + 'px';
    };

    this._onUp = async e => {
      document.removeEventListener('mousemove', this._onMove);
      document.removeEventListener('mouseup',   this._onUp);
      this.selBox.style.display = 'none';

      if (!this.pageWrap || !S.currentDoc) { this.toggle(); return; }

      const pw     = this.pageWrap;
      const pwRect = pw.getBoundingClientRect();
      const canvas = pw.querySelector('canvas');

      const x1 = Math.min(e.clientX, this.startX), y1 = Math.min(e.clientY, this.startY);
      const x2 = Math.max(e.clientX, this.startX), y2 = Math.max(e.clientY, this.startY);
      const sw = x2 - x1, sh = y2 - y1;
      if (sw < 10 || sh < 10) { this.toggle(); return; }

      // Coordenadas relativas [0,1]
      const relX = Math.max(0, (x1 - pwRect.left) / pwRect.width);
      const relY = Math.max(0, (y1 - pwRect.top)  / pwRect.height);
      const relW = Math.min(sw / pwRect.width,  1 - relX);
      const relH = Math.min(sh / pwRect.height, 1 - relY);

      // Captura da região do canvas (considera DPR internamente)
      const dpr    = window.devicePixelRatio || 1;
      const scaleX = canvas.width  / pwRect.width;   // = DPR (canvas interno / CSS)
      const scaleY = canvas.height / pwRect.height;
      const capX   = Math.max(0, (x1 - pwRect.left) * scaleX);
      const capY   = Math.max(0, (y1 - pwRect.top)  * scaleY);
      const capW   = Math.min(sw * scaleX, canvas.width  - capX);
      const capH   = Math.min(sh * scaleY, canvas.height - capY);

      const off = document.createElement('canvas');
      off.width  = capW;
      off.height = capH;
      off.getContext('2d').drawImage(canvas, capX, capY, capW, capH, 0, 0, capW, capH);
      const imageData = off.toDataURL('image/png');

      const h = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        pdfId: S.currentDoc.id, page: this.pageNum,
        text: `[Imagem capturada — p.${this.pageNum}]`,
        catId: S.cats[0]?.id || 'obs',
        rects: [{x: relX, y: relY, w: relW, h: relH}],
        note: '', type: 'image', imageData,
        attachments: [], isAttachment: false,
        createdAt: Date.now(),
      };

      await DB.highlights.save(h);
      S.highlights.push(h);
      PV.refreshPage(h.page);
      UI.renderCats();
      this.toggle();
      RP.showHighlight(h);
      toast('Imagem capturada com sucesso!');
    };

    const overlay = document.getElementById('img-overlay');
    overlay.addEventListener('mousedown', e => this.onDown(e));
  },
};

/* ══════════════════════════════════════
   HIGHLIGHTS (TEXT)
══════════════════════════════════════ */
const HL = {
  onSelect(e, pageNum, wrap) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { CTX.hide(); return; }
    const text = sel.toString().trim();
    if (text.length < 2) { CTX.hide(); return; }

    const range  = sel.getRangeAt(0);
    const wRect  = wrap.getBoundingClientRect();
    const rects  = Array.from(range.getClientRects())
      .map(r => ({
        x: (r.left - wRect.left) / wRect.width,
        y: (r.top  - wRect.top)  / wRect.height,
        w: r.width  / wRect.width,
        h: r.height / wRect.height,
      }))
      .filter(r => r.w > 0.005 && r.h > 0.003);

    S.pending = {text, page: pageNum, rects};
    CTX.show(e.clientX, e.clientY);
  },

  async save(catId) {
    const sel = S.pending;
    if (!sel || !S.currentDoc) return;
    const h = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pdfId: S.currentDoc.id, page: sel.page,
      text: sel.text, catId, rects: sel.rects,
      note: '', type: 'text', attachments: [],
      isAttachment: false, createdAt: Date.now(),
    };
    await DB.highlights.save(h);
    S.highlights.push(h);
    S.pending = null;
    CTX.hide();
    window.getSelection().removeAllRanges();
    PV.refreshPage(h.page);
    UI.renderCats();
    RP.showHighlight(h);
    toast(`Highlight criado: ${getCat(catId).name}`);
  },
};

/* ══════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════ */
const CTX = {
  show(x, y) {
    document.getElementById('ctx-cats').innerHTML = S.cats.map(c =>
      `<div class="ctx-item" onclick="HL.save('${c.id}')">
        <span class="cdot" style="background:${c.color};"></span>${escHtml(c.name)}
      </div>`
    ).join('');
    const m = document.getElementById('ctx');
    m.style.left = Math.min(x, innerWidth - 210) + 'px';
    m.style.top  = Math.min(y, innerHeight - 260) + 'px';
    m.classList.add('on');
  },
  hide() { document.getElementById('ctx').classList.remove('on'); },
};
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctx')) CTX.hide(); });

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
    if (!options?.skipHistory && (S.view === 'reader' || S.view === 'suco')) {
      if (S.currentDoc && S.currentDoc.id !== doc.id) {
        UI._pushHistory(UI._captureNavState());
      }
    }

    const mode = normalizeWorkspaceMode(options.mode || S.activeTab || 'reader');

    S.highlights = await DB.highlights.byPDF(doc.id);
    S.currentDoc = doc;

    UI.nav('reader', false, {
      skipHistory: Boolean(options?.skipHistory),
      skipTabCapture: true,
    });
    document.querySelectorAll('[id^="sdoc-"]').forEach(e => e.classList.remove('active'));
    document.getElementById(`sdoc-${doc.id}`)?.classList.add('active');
    UI.renderCats();
    UI.renderPanelInfo(doc);
    document.getElementById('doc-title-hdr').textContent = doc.title || doc.name;

    const pvOptions = { ...options };
    delete pvOptions.skipHistory;
    delete pvOptions.skipTabRegister;
    delete pvOptions.skipTabCapture;
    delete pvOptions.mode;
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

/* ══════════════════════════════════════
  PROJECTS — TipTap editor
══════════════════════════════════════ */
const Proj = {
  _saveTimer: null,
  editor: null,
  _toolbarBound: false,
  _editorEventsBound: false,

  async load() {
    const allProjs = await DB.projects.all();
    S.projectItems = allProjs;
    Folders.renderToolbar('projects');
    this.renderGrid();
  },

  renderCurrentFolder() {
    const host = document.getElementById('proj-current-folder');
    if (!host) return;

    const currentId = S.currentFolder.projects || 'root';
    const currentFolder = currentId === 'root' ? null : Folders.find('projects', currentId);
    const stats = Folders.folderStats('projects', currentFolder?.id || null);
    const currentLabel = currentFolder?.name || 'Projetos';
    const crumbHtml = Folders.breadcrumbMarkup('projects', currentId, true);

    host.innerHTML = `
      <div class="lib-current-bar">
        <div class="lib-current-meta">
          <div class="lib-current-title">${escHtml(currentLabel)}</div>
          <div class="lib-breadcrumbs">${crumbHtml}</div>
          <div class="lib-current-sub">${stats.items} projeto(s) e ${stats.folders} subpasta(s) neste nivel.</div>
        </div>
        <div class="lib-current-actions">
          ${currentFolder ? `<button class="btn btn-sm" onclick="Folders.goUp('projects')">← Voltar</button>` : ''}
          <button class="btn btn-sm" onclick="Folders.create('projects','${currentFolder?.id || 'root'}')">+ Pasta aqui</button>
          ${currentFolder ? `<button class="btn btn-sm" onclick="Folders.rename('projects','${currentFolder.id}')">Renomear pasta</button>` : ''}
          ${currentFolder ? `<button class="btn btn-d btn-sm" onclick="Folders.removeSelected('projects')">Excluir pasta</button>` : ''}
          <button class="btn btn-p btn-sm" onclick="Proj.newProj()">+ Novo Projeto</button>
        </div>
      </div>
    `;
  },

  renderGrid() {
    this.renderCurrentFolder();

    const currentFolderId = (S.currentFolder.projects && S.currentFolder.projects !== 'root')
      ? S.currentFolder.projects
      : null;
    const childFolders = Folders._folderChildren('projects', currentFolderId);
    const projs = (S.projectItems || [])
      .filter(p => (p.folderId || null) === currentFolderId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const grid = document.getElementById('proj-grid');
    const empty = document.getElementById('proj-empty');
    const sections = [];

    if (childFolders.length) {
      sections.push(`
        <section class="lib-section">
          <div class="lib-section-head">
            <div class="lib-section-title">Pastas</div>
            <div class="lib-section-note">${childFolders.length} pasta(s) neste nivel</div>
          </div>
          <div class="folder-spot-grid">
            ${childFolders.map(folder => {
              const stats = Folders.folderStats('projects', folder.id);
              const folderPath = Folders.path('projects', folder.id) || folder.name;
              return `
                <article class="folder-spot" draggable="true" onclick="Folders.setCurrent('projects','${folder.id}')" ondragstart="Folders.dragStart(event,'projects','folder','${folder.id}')" ondragend="Folders.dragEnd(event)" ondragover="Folders.dragOver(event,'projects','folder','${folder.id}')" ondragleave="Folders.dragLeave(event)" ondrop="Folders.drop(event,'projects','folder','${folder.id}')" title="${escHtml(folderPath)}">
                  <div class="folder-spot-head">
                    <span class="folder-spot-ico">${folderIconMarkup('folder-spot')}</span>
                    <div style="min-width:0;">
                      <div class="folder-spot-name">${escHtml(folder.name)}</div>
                      <div class="folder-spot-path">${escHtml(folderPath)}</div>
                    </div>
                  </div>
                  <div class="folder-spot-stats">
                    <span class="folder-spot-chip">${stats.items} projeto(s)</span>
                    <span class="folder-spot-chip">${stats.folders} subpasta(s)</span>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </section>
      `);
    }

    if (projs.length) {
      sections.push(`
        <section class="lib-section">
          <div class="lib-section-head">
            <div class="lib-section-title">Projetos</div>
            <div class="lib-section-note">${projs.length} projeto(s) visivel(is)</div>
          </div>
          <div class="doc-grid">
            ${projs.map(p => `
              <div class="proj-card" draggable="true" onclick="Proj.open('${p.id}')" ondragstart="Folders.dragStart(event,'projects','item','${p.id}')" ondragend="Folders.dragEnd(event)">
                <span style="font-size:20px;">📄</span>
                <div style="flex:1;">
                  <div style="font-size:14px;font-weight:500;">${escHtml(p.title)}</div>
                  <div style="font-size:11px;color:var(--text3);">${new Date(p.updatedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
                  <div style="font-size:11px;color:var(--text3);">${escHtml(Folders.path('projects', p.folderId) || 'Sem pasta (raiz)')}</div>
                </div>
                <button class="btn btn-sm" onclick="event.stopPropagation();Proj.move('${p.id}')">📁</button>
                <button class="btn btn-d btn-sm" onclick="event.stopPropagation();Proj.del('${p.id}')">✕</button>
              </div>
            `).join('')}
          </div>
        </section>
      `);
    }

    if (!sections.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      const projectsEmpty = !S.projectItems.length && !Folders.list('projects').length && !currentFolderId;
      empty.innerHTML = `
        <h3>${projectsEmpty ? 'Nenhum projeto ainda' : 'Nada nesta pasta'}</h3>
        <p>${projectsEmpty
          ? 'Crie projetos para organizar suas sinteses.'
          : 'Use as acoes de pasta ou crie novos projetos para preencher este espaco.'}</p>
      `;
      return;
    }

    empty.style.display = 'none';
    empty.innerHTML = `<h3>Nenhum projeto ainda</h3><p>Crie projetos para organizar suas sinteses.</p>`;
    grid.innerHTML = sections.join('');
  },

  newProj() {
    Modal.show(`
      <h3>Novo Projeto</h3>
      <div class="fg"><label>Título</label><input id="np-t" type="text" autofocus placeholder="Ex: Revisão de Literatura — Capítulo 2"></div>
      <div class="fg"><label>Pasta</label><select id="np-folder">${Folders.optionTags('projects', S.currentFolder.projects || 'root', true)}</select></div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="Proj.create()">Criar</button>
      </div>
    `);
    setTimeout(() => document.getElementById('np-t')?.focus(), 80);
  },

  async create() {
    const title = document.getElementById('np-t')?.value?.trim();
    if (!title) return;
    let folderId = document.getElementById('np-folder')?.value || 'root';
    if (folderId === 'root') folderId = null;
    const p = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title, content: '', folderId, createdAt: Date.now(), updatedAt: Date.now()
    };
    await DB.projects.save(p);
    Modal.hide(); this.open(p.id);
  },

  async move(id) {
    const p = await DB.projects.get(id);
    if (!p) return;

    Modal.show(`
      <h3>Mover Projeto</h3>
      <div class="fg"><label>Projeto</label><input value="${escHtml(p.title)}" disabled></div>
      <div class="fg"><label>Pasta</label><select id="pm-folder">${Folders.optionTags('projects', p.folderId || 'root', true)}</select></div>
      <div class="mactions">
        <button class="btn" onclick="Modal.hide()">Cancelar</button>
        <button class="btn btn-p" onclick="Proj._saveMove('${p.id}')">Salvar</button>
      </div>
    `);
  },

  async _saveMove(id) {
    const p = await DB.projects.get(id);
    if (!p) return;
    let folderId = document.getElementById('pm-folder')?.value || 'root';
    if (folderId === 'root') folderId = null;
    p.folderId = folderId;
    p.updatedAt = Date.now();
    await DB.projects.save(p);
    Modal.hide();
    this.load();
    toast('Projeto movido.');
  },

  _getTiptap() {
    return window.Tiptap || null;
  },

  _buildAttachmentCardExtension(t) {
    const { Node, mergeAttributes } = t;
    if (!Node) return null;
    const merge = typeof mergeAttributes === 'function'
      ? mergeAttributes
      : (attrs, more) => Object.assign({}, attrs || {}, more || {});

    return Node.create({
      name: 'attachmentCard',
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      addAttributes() {
        return {
          id: { default: null },
          pdfId: { default: '' },
          page: { default: 0 },
          type: { default: 'text' },
          text: { default: '' },
          imageData: { default: '' },
          note: { default: '' },
          sucoNote: { default: '' },
          catName: { default: '' },
          catColor: { default: '' },
          catBg: { default: '' },
          ref: { default: '' },
        };
      },
      parseHTML() {
        return [
          {
            tag: 'div.proj-att-card',
            getAttrs: el => {
              if (!(el instanceof HTMLElement)) return false;
              const cardId = el.getAttribute('data-att-id') || '';
              const pdfId = el.getAttribute('data-pdf-id') || '';
              const page = parseInt(el.getAttribute('data-page') || '0', 10) || 0;
              const type = el.getAttribute('data-type') || (el.querySelector('img') ? 'image' : 'text');
              const textEl = el.querySelector('.proj-att-card-text');
              const rawText = textEl ? textEl.textContent || '' : '';
              const text = rawText.replace(/^"|"$/g, '').trim();
              const imgEl = el.querySelector('.proj-att-card-img');
              const imageData = el.getAttribute('data-image') || imgEl?.getAttribute('src') || '';
              const note = el.getAttribute('data-note') || '';
              const sucoNote = el.getAttribute('data-suco-note') || '';
              const catName = el.getAttribute('data-cat-name') || el.querySelector('.cat-badge')?.textContent?.trim() || '';
              const catColor = el.getAttribute('data-cat-color') || el.querySelector('.cat-badge')?.style?.color || '';
              const catBg = el.getAttribute('data-cat-bg') || el.querySelector('.cat-badge')?.style?.background || '';
              const ref = el.getAttribute('data-ref') || '';
              let resolvedNote = note;
              let resolvedSuco = sucoNote;
              if (!resolvedNote || !resolvedSuco) {
                const notes = Array.from(el.querySelectorAll('.proj-att-card-note')).map(n => (n.textContent || '').trim());
                if (!resolvedNote) {
                  const n = notes.find(x => x.startsWith('📝')) || '';
                  resolvedNote = n.replace('📝', '').trim();
                }
                if (!resolvedSuco) {
                  const s = notes.find(x => x.startsWith('✍')) || '';
                  resolvedSuco = s.replace('✍', '').trim();
                }
              }
              return {
                id: cardId || null,
                pdfId,
                page,
                type,
                text,
                imageData,
                note: resolvedNote,
                sucoNote: resolvedSuco,
                catName,
                catColor,
                catBg,
                ref,
              };
            },
          },
        ];
      },
      renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes || {};
        const type = attrs.type || 'text';
        const note = (attrs.note || '').trim();
        const sucoNote = (attrs.sucoNote || '').trim();
        const cardAttrs = merge(attrs, {
          class: 'proj-att-card',
          contenteditable: 'false',
          'data-att-id': attrs.id || '',
          'data-pdf-id': attrs.pdfId || '',
          'data-page': attrs.page || 0,
          'data-type': attrs.type || 'text',
          'data-image': attrs.imageData || '',
          'data-note': note,
          'data-suco-note': sucoNote,
          'data-cat-name': attrs.catName || '',
          'data-cat-color': attrs.catColor || '',
          'data-cat-bg': attrs.catBg || '',
          'data-ref': attrs.ref || '',
          style: `border-left-color:${attrs.catColor || '#888'};`,
        });

        const body = type === 'image' && attrs.imageData
          ? ['img', { class: 'proj-att-card-img', src: attrs.imageData, alt: `Imagem p.${attrs.page || 0}` }]
          : ['div', { class: 'proj-att-card-text' }, `"${attrs.text || ''}"`];

        const meta = [
          'div',
          { class: 'proj-att-card-meta' },
          ['span', { class: 'cat-badge', style: `background:${attrs.catBg || 'rgba(0,0,0,.08)'};color:${attrs.catColor || '#555'};` }, attrs.catName || 'Categoria'],
          ...(attrs.ref ? [['span', {}, attrs.ref]] : []),
          ['span', {}, `p. ${attrs.page || 0}`],
          ['div', { class: 'proj-att-card-actions' },
            ['button', { class: 'proj-att-card-up', title: 'Mover para cima' }, '↑'],
            ['button', { class: 'proj-att-card-dn', title: 'Mover para baixo' }, '↓'],
            ['button', { class: 'proj-att-card-del', title: 'Remover do projeto' }, '✕'],
          ],
        ];

        const nodes = [
          body,
          ...(note ? [['div', { class: 'proj-att-card-note' }, `📝 ${note}`]] : []),
          ...(sucoNote ? [['div', { class: 'proj-att-card-note' }, `✍ ${sucoNote}`]] : []),
          meta,
        ];

        return ['div', cardAttrs, ...nodes];
      },
    });
  },

  _buildPageBreakExtension(t) {
    const { Node, mergeAttributes } = t;
    if (!Node) return null;
    const merge = typeof mergeAttributes === 'function'
      ? mergeAttributes
      : (attrs, more) => Object.assign({}, attrs || {}, more || {});

    return Node.create({
      name: 'pageBreak',
      group: 'block',
      atom: true,
      selectable: false,
      addAttributes() {
        return {
          label: { default: 'Pagina' },
        };
      },
      parseHTML() {
        return [
          {
            tag: 'div.page-break-marker',
            getAttrs: el => {
              if (!(el instanceof HTMLElement)) return false;
              const label = el.querySelector('.pbm-label')?.textContent?.trim() || 'Pagina';
              return { label };
            },
          },
        ];
      },
      renderHTML({ HTMLAttributes }) {
        const attrs = HTMLAttributes || {};
        return [
          'div',
          merge(attrs, { class: 'page-break-marker', contenteditable: 'false' }),
          ['span', { class: 'pbm-label' }, attrs.label || 'Pagina'],
        ];
      },
    });
  },

  _buildShortcutExtension(t) {
    if (!t?.Extension) return null;
    return t.Extension.create({
      name: 'lumenShortcuts',
      addKeyboardShortcuts() {
        return {
          'Mod-z': () => this.editor.commands.undo(),
          'Mod-Shift-z': () => this.editor.commands.redo(),
          'Mod-b': () => this.editor.commands.toggleBold(),
          'Mod-i': () => this.editor.commands.toggleItalic(),
          'Mod-u': () => this.editor.commands.toggleUnderline(),
          'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
          'Mod-e': () => this.editor.commands.toggleCode(),
          'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
          'Mod-Shift-9': () => this.editor.commands.toggleBlockquote(),
          'Mod-Shift-8': () => this.editor.commands.toggleBulletList(),
          'Mod-Shift-7': () => this.editor.commands.toggleOrderedList(),
          'Mod-Shift-l': () => this.editor.commands.toggleTaskList(),
          'Mod-k': () => {
            const prevUrl = this.editor.getAttributes('link').href || '';
            const url = prompt('URL do link:', prevUrl);
            if (url === null) return true;
            if (!url.trim()) {
              this.editor.commands.unsetLink();
              return true;
            }
            this.editor.commands.setLink({ href: url.trim() });
            return true;
          },
          'Mod-Shift-h': () => this.editor.commands.toggleHighlight(),
        };
      },
    });
  },

  async _ensureEditor() {
    if (this.editor) return this.editor;
    const t = this._getTiptap();
    if (!t || !t.Editor) return null;

    const host = document.getElementById('proj-content');
    if (!host) return null;

    const AttachmentCard = this._buildAttachmentCardExtension(t);
    const PageBreak = this._buildPageBreakExtension(t);
    const Shortcuts = this._buildShortcutExtension(t);
    const extensions = [
      t.StarterKit,
      t.TextStyle,
      t.FontFamily,
      t.Underline,
      t.Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      t.Highlight,
      t.TextAlign.configure({ types: ['heading', 'paragraph'] }),
      t.Placeholder.configure({
        placeholder: 'Escreva seu projeto aqui...\n\nUse os botoes "Inserir em Projeto" nos Anexos para embutir referencias visuais.',
      }),
      t.TaskList,
      t.TaskItem.configure({ nested: true }),
      t.Table.configure({ resizable: true }),
      t.TableRow,
      t.TableHeader,
      t.TableCell,
      t.Image,
    ];
    if (Shortcuts) extensions.unshift(Shortcuts);
    if (AttachmentCard) extensions.push(AttachmentCard);
    if (PageBreak) extensions.push(PageBreak);

    this.editor = new t.Editor({
      element: host,
      extensions,
      content: '',
      autofocus: false,
      onUpdate: () => this.onInput(),
      onSelectionUpdate: () => this._syncToolbar(),
    });

    this._bindToolbar();
    this._bindEditorInteractions();
    return this.editor;
  },

  _bindToolbar() {
    if (this._toolbarBound) return;
    const toolbar = document.getElementById('proj-editor-toolbar');
    if (!toolbar) return;
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (!btn || !this.editor) return;
      const cmd = btn.getAttribute('data-cmd');
      this._runCommand(cmd);
    });
    toolbar.addEventListener('change', (e) => {
      const select = e.target.closest('select[data-cmd]');
      if (!select || !this.editor) return;
      const cmd = select.getAttribute('data-cmd');
      this._runCommand(cmd, select.value);
    });
    this._toolbarBound = true;
  },

  _syncToolbar() {
    if (!this.editor) return;
    const toolbar = document.getElementById('proj-editor-toolbar');
    if (!toolbar) return;
    const editor = this.editor;
    const toggle = (cmd, active) => {
      const btn = toolbar.querySelector(`button[data-cmd="${cmd}"]`);
      if (!btn) return;
      btn.classList.toggle('is-active', Boolean(active));
    };
    toggle('bold', editor.isActive('bold'));
    toggle('italic', editor.isActive('italic'));
    toggle('underline', editor.isActive('underline'));
    toggle('strike', editor.isActive('strike'));
    toggle('code', editor.isActive('code'));
    toggle('code-block', editor.isActive('codeBlock'));
    toggle('blockquote', editor.isActive('blockquote'));
    toggle('bullet-list', editor.isActive('bulletList'));
    toggle('ordered-list', editor.isActive('orderedList'));
    toggle('task-list', editor.isActive('taskList'));
    toggle('heading-1', editor.isActive('heading', { level: 1 }));
    toggle('heading-2', editor.isActive('heading', { level: 2 }));
    toggle('heading-3', editor.isActive('heading', { level: 3 }));
    toggle('align-left', editor.isActive({ textAlign: 'left' }));
    toggle('align-center', editor.isActive({ textAlign: 'center' }));
    toggle('align-right', editor.isActive({ textAlign: 'right' }));
    toggle('align-justify', editor.isActive({ textAlign: 'justify' }));
    toggle('highlight', editor.isActive('highlight'));

    const fontSelect = toolbar.querySelector('select[data-cmd="font-family"]');
    if (fontSelect) {
      const currentFont = editor.getAttributes('textStyle')?.fontFamily || '';
      if (fontSelect.value !== currentFont) fontSelect.value = currentFont;
    }

    const undoBtn = toolbar.querySelector('button[data-cmd="undo"]');
    const redoBtn = toolbar.querySelector('button[data-cmd="redo"]');
    if (undoBtn) undoBtn.disabled = !editor.can().undo();
    if (redoBtn) redoBtn.disabled = !editor.can().redo();
  },

  _runCommand(cmd, value = '') {
    if (!this.editor) return;
    const editor = this.editor;
    switch (cmd) {
      case 'undo':
        editor.chain().focus().undo().run();
        break;
      case 'redo':
        editor.chain().focus().redo().run();
        break;
      case 'paragraph':
        editor.chain().focus().setParagraph().run();
        break;
      case 'heading-1':
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case 'heading-2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'heading-3':
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'strike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'code':
        editor.chain().focus().toggleCode().run();
        break;
      case 'code-block':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'bullet-list':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'ordered-list':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'task-list':
        editor.chain().focus().toggleTaskList().run();
        break;
      case 'align-left':
        editor.chain().focus().setTextAlign('left').run();
        break;
      case 'align-center':
        editor.chain().focus().setTextAlign('center').run();
        break;
      case 'align-right':
        editor.chain().focus().setTextAlign('right').run();
        break;
      case 'align-justify':
        editor.chain().focus().setTextAlign('justify').run();
        break;
      case 'highlight':
        editor.chain().focus().toggleHighlight().run();
        break;
      case 'font-family':
        if (!value) {
          editor.chain().focus().unsetFontFamily().run();
        } else {
          editor.chain().focus().setFontFamily(value).run();
        }
        break;
      case 'link': {
        const prevUrl = editor.getAttributes('link').href || '';
        const url = prompt('URL do link:', prevUrl);
        if (url === null) return;
        if (!url.trim()) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
        break;
      }
      case 'image': {
        const src = prompt('URL da imagem:');
        if (!src) return;
        editor.chain().focus().setImage({ src: src.trim() }).run();
        break;
      }
      case 'hr':
        editor.chain().focus().setHorizontalRule().run();
        break;
      case 'table':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'add-row':
        editor.chain().focus().addRowAfter().run();
        break;
      case 'add-col':
        editor.chain().focus().addColumnAfter().run();
        break;
      case 'del-row':
        editor.chain().focus().deleteRow().run();
        break;
      case 'del-col':
        editor.chain().focus().deleteColumn().run();
        break;
      case 'del-table':
        editor.chain().focus().deleteTable().run();
        break;
      case 'clear-format':
        editor.chain().focus().unsetAllMarks().clearNodes().run();
        break;
      default:
        break;
    }
    this._syncToolbar();
  },

  _bindEditorInteractions() {
    if (this._editorEventsBound || !this.editor) return;
    const root = this.editor.view.dom;
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.proj-att-card');
      if (!card) return;

      const isDel = e.target.closest('.proj-att-card-del');
      const isUp = e.target.closest('.proj-att-card-up');
      const isDn = e.target.closest('.proj-att-card-dn');
      const cardId = card.getAttribute('data-att-id') || '';

      if (isDel) {
        e.preventDefault();
        this._deleteCard(cardId);
        return;
      }
      if (isUp) {
        e.preventDefault();
        this._moveCard(cardId, 'up');
        return;
      }
      if (isDn) {
        e.preventDefault();
        this._moveCard(cardId, 'down');
        return;
      }

      const pdfId = card.getAttribute('data-pdf-id');
      const page = parseInt(card.getAttribute('data-page') || '0', 10);
      if (pdfId && page) {
        const doc = S.docs.find(d => d.id === pdfId);
        if (doc) Library.open(doc).then(() => setTimeout(() => PV.go(page), 600));
      }
    });
    this._editorEventsBound = true;
  },

  _findCardNode(cardId) {
    if (!this.editor || !cardId) return null;
    let found = null;
    this.editor.state.doc.descendants((node, pos) => {
      if (node.type?.name === 'attachmentCard' && node.attrs?.id === cardId) {
        found = { node, pos };
        return false;
      }
      return true;
    });
    return found;
  },

  _moveCard(cardId, dir) {
    if (!this.editor || !cardId) return;
    const matches = [];
    this.editor.state.doc.descendants((node, pos) => {
      if (node.type?.name === 'attachmentCard') {
        matches.push({ node, pos, id: node.attrs?.id || '' });
      }
      return true;
    });
    const idx = matches.findIndex(item => item.id === cardId);
    if (idx < 0) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= matches.length) return;

    const cur = matches[idx];
    const target = matches[targetIdx];
    const tr = this.editor.state.tr;

    if (dir === 'up') {
      tr.delete(cur.pos, cur.pos + cur.node.nodeSize);
      tr.insert(target.pos, cur.node);
    } else {
      const insertPos = target.pos + target.node.nodeSize;
      tr.delete(cur.pos, cur.pos + cur.node.nodeSize);
      const adjustedPos = insertPos > cur.pos ? insertPos - cur.node.nodeSize : insertPos;
      tr.insert(adjustedPos, cur.node);
    }

    this.editor.view.dispatch(tr.scrollIntoView());
    this.scheduleSave();
  },

  _deleteCard(cardId) {
    if (!this.editor || !cardId) return;
    const hit = this._findCardNode(cardId);
    if (!hit) return;
    const tr = this.editor.state.tr.delete(hit.pos, hit.pos + hit.node.nodeSize);
    this.editor.view.dispatch(tr.scrollIntoView());
    this.scheduleSave();
  },

  buildAttAttrs(a, c, ref) {
    const isImg = a.type === 'image';
    const note = (a.note || '').trim();
    const sucoNote = (a.sucoNote || '').trim();
    const id = String(a.id || `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    return {
      id,
      pdfId: a.pdfId || '',
      page: a.page || 0,
      type: isImg ? 'image' : 'text',
      text: a.text || '',
      imageData: a.imageData || '',
      note,
      sucoNote,
      catName: c?.name || '',
      catColor: c?.color || '',
      catBg: c?.bg || '',
      ref: ref || '',
    };
  },

  buildAttCard(a, c, ref) {
    const attrs = this.buildAttAttrs(a, c, ref);
    const note = attrs.note;
    const sucoNote = attrs.sucoNote;
    return `<div class="proj-att-card" contenteditable="false"
      data-att-id="${escHtml(attrs.id)}"
      data-pdf-id="${escHtml(attrs.pdfId)}"
      data-page="${attrs.page}"
      data-type="${escHtml(attrs.type)}"
      data-image="${escHtml(attrs.imageData)}"
      data-note="${escHtml(note)}"
      data-suco-note="${escHtml(sucoNote)}"
      data-cat-name="${escHtml(attrs.catName)}"
      data-cat-color="${escHtml(attrs.catColor)}"
      data-cat-bg="${escHtml(attrs.catBg)}"
      data-ref="${escHtml(attrs.ref)}"
      style="border-left-color:${attrs.catColor || '#888'};">
      ${attrs.type === 'image'
        ? `<img class="proj-att-card-img" src="${escHtml(attrs.imageData || '')}" alt="Imagem p.${attrs.page}">`
        : `<div class="proj-att-card-text">"${escHtml(attrs.text || '')}"</div>`
      }
      ${note ? `<div class="proj-att-card-note">📝 ${escHtml(note)}</div>` : ''}
      ${sucoNote ? `<div class="proj-att-card-note">✍ ${escHtml(sucoNote)}</div>` : ''}
      <div class="proj-att-card-meta">
        <span class="cat-badge" style="background:${attrs.catBg};color:${attrs.catColor};">${escHtml(attrs.catName)}</span>
        ${attrs.ref ? `<span>${escHtml(attrs.ref)}</span>` : ''}
        <span>p. ${attrs.page}</span>
        <div class="proj-att-card-actions">
          <button class="proj-att-card-up" title="Mover para cima">↑</button>
          <button class="proj-att-card-dn" title="Mover para baixo">↓</button>
          <button class="proj-att-card-del" title="Remover do projeto">✕</button>
        </div>
      </div>
    </div>`;
  },

  async open(id, options = {}) {
    const p = typeof id === 'string' ? await DB.projects.get(id) : id;
    if (!p) return;
    if (!options?.skipTabRegister && typeof Tabs?.openProject === 'function') {
      return Tabs.openProject(p, options);
    }
    return this._openProjectView(p, options);
  },

  async _openProjectView(p, options = {}) {
    UI.nav('proj-editor', true, {
      skipHistory: Boolean(options?.skipHistory),
      skipTabCapture: true,
    });
    S.openProjId = p.id;
    document.getElementById('proj-edit-title').textContent = p.title;

    const editor = await this._ensureEditor();
    if (editor) {
      editor.commands.setContent(p.content || '', false);
      this._syncToolbar();
    } else {
      const fallback = document.getElementById('proj-content');
      if (fallback) {
        fallback.setAttribute('contenteditable', 'true');
        fallback.innerHTML = p.content || '';
        fallback.oninput = () => this.onInput();
      }
    }

    const editorBar = document.querySelector('.editor-bar');
    if (editorBar && !editorBar.querySelector('.page-break-btn')) {
      const pbBtn = document.createElement('button');
      pbBtn.className = 'btn btn-sm page-break-btn';
      pbBtn.textContent = '↓ Nova Pagina';
      pbBtn.title = 'Inserir quebra de pagina na posicao do cursor';
      pbBtn.onclick = () => Proj.insertPageBreak();
      const saveBtn = editorBar.querySelector('.btn-p');
      if (saveBtn) editorBar.insertBefore(pbBtn, saveBtn);
      else editorBar.appendChild(pbBtn);
    }
  },

  onInput() {
    this.scheduleSave();
  },

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveContent(), 800);
  },

  async saveContent() {
    if (!S.openProjId) return;
    const p = await DB.projects.get(S.openProjId);
    if (!p) return;
    if (this.editor) {
      p.content = this.editor.getHTML();
    } else {
      const editor = document.getElementById('proj-content');
      p.content = editor ? editor.innerHTML : '';
    }
    p.updatedAt = Date.now();
    await DB.projects.save(p);
  },

  insertPageBreak() {
    if (this.editor) {
      const breaks = [];
      this.editor.state.doc.descendants((node) => {
        if (node.type?.name === 'pageBreak') breaks.push(node);
        return true;
      });
      const pageNum = breaks.length + 2;
      this.editor.chain().focus().insertContent([
        { type: 'pageBreak', attrs: { label: `Pagina ${pageNum}` } },
        { type: 'paragraph' },
      ]).run();
      this.scheduleSave();
      toast('Quebra de pagina inserida.');
      return;
    }

    const editor = document.getElementById('proj-content');
    if (!editor) return;
    const breaks = editor.querySelectorAll('.page-break-marker');
    const pageNum = breaks.length + 2;
    const sep1 = document.createElement('p');
    sep1.innerHTML = '<br>';
    const marker = document.createElement('div');
    marker.className = 'page-break-marker';
    marker.setAttribute('contenteditable', 'false');
    marker.innerHTML = `<span class="pbm-label">Pagina ${pageNum}</span>`;
    const sep2 = document.createElement('p');
    sep2.innerHTML = '<br>';

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(sep2);
      range.insertNode(marker);
      range.insertNode(sep1);
    } else {
      editor.appendChild(sep1);
      editor.appendChild(marker);
      editor.appendChild(sep2);
    }
    this.scheduleSave();
    toast('Quebra de pagina inserida.');
  },

  async del(id) {
    if (!confirm('Remover este projeto?')) return;
    await DB.projects.del(id);
    toast('Projeto removido.');
    this.load();
  },
};

// Auto-save de projetos a cada 30s
setInterval(async () => {
  if (S.openProjId && document.getElementById('proj-editor-view').classList.contains('active')) {
    const p = await DB.projects.get(S.openProjId);
    if (p) {
      if (Proj.editor) {
        p.content = Proj.editor.getHTML();
      } else {
        const editor = document.getElementById('proj-content');
        p.content = editor ? editor.innerHTML : p.content;
      }
      p.updatedAt = Date.now();
      await DB.projects.save(p);
    }
  }
}, 30000);

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

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
const Search = {
  async load() {
    S.docs = await DB.pdfs.all();
    this.renderExplorer();
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

    const [allHLs, allDocs, allProjs, allAtts] = await Promise.all([
      DB.highlights.all(), DB.pdfs.all(), DB.projects.all(), DB.attachments.all()
    ]);
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

      if (tab.label !== nextLabel) { tab.label = nextLabel; changed = true; }
      if (tab.docType !== nextType) { tab.docType = nextType; changed = true; }
      if (tab.subview !== nextSubview) { tab.subview = nextSubview; changed = true; }
      if (JSON.stringify(tab.viewState || null) !== JSON.stringify(nextViewState || null)) {
        tab.viewState = nextViewState;
        changed = true;
      }
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

    if (!S.workspaceTabs.length) {
      S.activeWorkspaceTabId = null;
      this.save();
      this.render();
      if (S.view === 'reader' || S.view === 'suco' || S.view === 'proj-editor') {
        UI.nav('library', true, { skipHistory: true, skipTabCapture: true });
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
        skipHistory: true,
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
      skipHistory: true,
    });
  },

  render() {
    const bar = document.getElementById('main-tabs');
    const tabsHost = document.getElementById('workspace-tabs');
    const modeHost = document.getElementById('workspace-mode-tabs');
    const titleHost = document.getElementById('doc-title-hdr');
    const active = this.active;
    const visible = this._isVisible(active);

    if (bar) bar.style.display = (S.workspaceTabs.length || visible) ? 'flex' : 'none';

    if (tabsHost) {
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

/* ══════════════════════════════════════
   UI CONTROLLER
══════════════════════════════════════ */
const VIEWS = [
  'library-view','reader-view','suco-view',
  'projects-view','proj-editor-view','attachments-view','search-view'
];

const UI = {
  _uploadPrompt: null,
  _history: [],
  _skipNextHistory: false,

  _stateKey(state) {
    if (!state) return '';
    return [state.view, state.activeTab, state.docId, state.projId].filter(Boolean).join('|');
  },

  _captureNavState() {
    const state = { view: S.view, activeTab: S.activeTab };
    if (S.view === 'reader' || S.view === 'suco') {
      state.docId = S.currentDoc ? S.currentDoc.id : null;
      state.viewState = S.pdfDoc ? PV._captureViewState() : null;
    }
    if (S.view === 'proj-editor') {
      state.projId = S.openProjId || null;
    }
    return state;
  },

  _pushHistory(state) {
    if (!state || !state.view) return;
    const last = this._history[this._history.length - 1];
    if (last && this._stateKey(last) === this._stateKey(state)) return;
    this._history.push(state);
    this._refreshBackButton();
  },

  _refreshBackButton() {
    const btn = document.getElementById('nav-back');
    if (!btn) return;
    btn.style.display = this._history.length ? 'inline-flex' : 'none';
  },

  _setViewClass(view) {
    const body = document.body;
    if (!body) return;
    const views = ['library', 'reader', 'suco', 'projects', 'attachments', 'search', 'proj-editor'];
    views.forEach(v => body.classList.remove(`view-${v}`));
    if (view) body.classList.add(`view-${view}`);
  },

  _maybePushHistory(nextView, options = {}) {
    if (options.skipHistory || this._skipNextHistory) {
      this._skipNextHistory = false;
      return;
    }
    if (nextView === S.view) return;
    this._pushHistory(this._captureNavState());
  },

  async back() {
    const prev = this._history.pop();
    this._refreshBackButton();
    if (!prev) return;
    await this._restoreNavState(prev);
  },

  async _restoreNavState(state) {
    if (!state?.view) return;

    if (state.view === 'reader' || state.view === 'suco') {
      const doc = state.docId ? S.docs.find(d => d.id === state.docId) : null;
      const sameDoc = doc && S.currentDoc && doc.id === S.currentDoc.id && S.pdfDoc;

      if (sameDoc) {
        this._skipNextHistory = true;
        this.tab(state.view);
        if (state.viewState) PV._restoreViewState(state.viewState);
        return;
      }

      if (doc) {
        this._skipNextHistory = true;
        await Library.open(doc, { preserveView: true, viewState: state.viewState, skipHistory: true });
        if (state.view === 'suco') {
          this._skipNextHistory = true;
          this.tab('suco');
        }
        if (state.viewState) PV._restoreViewState(state.viewState);
        return;
      }
    }

    if (state.view === 'proj-editor' && state.projId) {
      this._skipNextHistory = true;
      await Proj.open(state.projId, { skipHistory: true });
      return;
    }

    this._skipNextHistory = true;
    this.nav(state.view, true, { skipHistory: true });
  },

  nav(view, updateNav = true, options = {}) {
    if (!options.skipTabCapture && typeof Tabs?.captureCurrentTabState === 'function') {
      Tabs.captureCurrentTabState();
    }

    this._maybePushHistory(view, options);
    S.view = view;
    this._setViewClass(view);
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

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}
function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (!num) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const value = num / (1024 ** exp);
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}
function isDarkTheme() {
  return document.body.classList.contains('dark-mode');
}
function normalizeDocType(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
  if (type === 'trabalho-academico') return 'material-academico';
  return type || 'outro';
}
function isAcademicWorkType(type) {
  return normalizeDocType(type) === 'material-academico';
}
function themedLibraryIconPath(kind) {
  const normalized = kind === 'folder' ? 'folder' : normalizeDocType(kind);
  const theme = isDarkTheme() ? 'dark' : 'light';
  return THEMED_LIBRARY_ICONS[normalized]?.[theme] || THEMED_LIBRARY_ICONS.outro[theme];
}
function iconImgMarkup(src, alt, variant = 'tree') {
  return `<img class="ui-icon ui-icon-${variant}" src="${src}" alt="${escHtml(alt)}">`;
}
function folderIconMarkup(variant = 'tree') {
  return iconImgMarkup(themedLibraryIconPath('folder'), 'Pasta', variant);
}
function docTypeIconMarkup(doc, variant = 'tree') {
  const normalizedType = normalizeDocType(doc?.type);
  return iconImgMarkup(themedLibraryIconPath(normalizedType), docTypeLabel(normalizedType), variant);
}
function normalizeCitationStyle(style) {
  const normalized = String(style || '').trim().toLowerCase();
  return ['abnt', 'vancouver', 'apa'].includes(normalized) ? normalized : 'abnt';
}
function citationStyleLabel(style) {
  switch (normalizeCitationStyle(style)) {
    case 'vancouver': return 'Vancouver';
    case 'apa': return 'APA';
    default: return 'ABNT';
  }
}
function docTypeLabel(type) {
  switch (normalizeDocType(type)) {
    case 'artigo': return 'Artigo';
    case 'capitulo-livro': return 'Capítulo de livro';
    case 'livro': return 'Livro';
    case 'material-academico': return 'Material acadêmico';
    case 'relatorio': return 'Relatório';
    default: return 'Outro material';
  }
}
function isArticleDoc(doc) {
  return String(doc?.type || '').trim().toLowerCase() === 'artigo';
}
function isBookDoc(doc) {
  return String(doc?.type || '').trim().toLowerCase() === 'livro';
}
function isAcademicWorkDoc(doc) {
  return isAcademicWorkType(doc?.type);
}
function isBookChapterDoc(doc) {
  return String(doc?.type || '').trim().toLowerCase() === 'capitulo-livro';
}
function isReportDoc(doc) {
  return String(doc?.type || '').trim().toLowerCase() === 'relatorio';
}
function isOtherDoc(doc) {
  return String(doc?.type || '').trim().toLowerCase() === 'outro';
}
function normalizeWorkspaceMode(rawMode) {
  const mode = String(rawMode || 'reader').trim().toLowerCase();
  return mode === 'suco' ? 'suco' : 'reader';
}
function workspaceDocTabLabel(doc) {
  return String(doc?.title || doc?.name || 'Documento').trim() || 'Documento';
}
function workspaceProjectTabLabel(project) {
  return String(project?.title || 'Projeto').trim() || 'Projeto';
}
function libraryCardMeta(doc) {
  if (isBookDoc(doc)) {
    const edition = doc.edition ? `${doc.edition} ed.` : null;
    const pages = doc.pageCount ? `${doc.pageCount}p` : null;
    return [
      doc.author || '—',
      doc.year || null,
      edition,
      doc.publisher || null,
      doc.lang || null,
      pages,
    ].filter(Boolean).join(' · ');
  }
  if (isAcademicWorkDoc(doc)) {
    const pages = doc.pageCount ? `${doc.pageCount}p` : null;
    return [
      doc.author || '—',
      doc.year || null,
      doc.academicSubtype || null,
      doc.institution || null,
      doc.program || null,
      pages,
    ].filter(Boolean).join(' · ');
  }
  if (isBookChapterDoc(doc)) {
    return [
      doc.author || '—',
      doc.year || null,
      doc.bookTitle || null,
      doc.publisher || null,
      doc.edition ? `${doc.edition} ed.` : null,
      doc.pageRange || null,
    ].filter(Boolean).join(' · ');
  }
  if (isReportDoc(doc)) {
    return [
      doc.author || '—',
      doc.fullDate || null,
      doc.reportSubtype || null,
      doc.institution || null,
      doc.area || null,
    ].filter(Boolean).join(' · ');
  }
  if (isOtherDoc(doc)) {
    return [
      doc.context || null,
      doc.otherSubtype || null,
      doc.source || null,
      doc.fullDate || null,
    ].filter(Boolean).join(' · ');
  }
  if (isArticleDoc(doc)) {
    return [
      doc.author || '—',
      doc.year || null,
    ].filter(Boolean).join(' · ');
  }
  return [doc.author || '—', doc.year || null].filter(Boolean).join(' · ');
}
function libraryCardMetaParts(doc) {
  const bits = [];
  if (doc.author) bits.push(doc.author);
  if (doc.year) bits.push(String(doc.year));
  if (doc.area) bits.push(doc.area);
  if (doc.reportSubtype) bits.push(doc.reportSubtype);
  if (doc.otherSubtype) bits.push(doc.otherSubtype);
  if (doc.context) bits.push(doc.context);
  if (doc.source) bits.push(doc.source);
  if (doc.fullDate) bits.push(doc.fullDate);
  return [...new Set(bits.filter(Boolean))].slice(0, 4);
}
function cleanDoi(raw) {
  return String(raw || '')
    .replace(/^doi:\s*/i, '')
    .replace(/[)\]}.,;:]+$/g, '')
    .trim();
}
function matchDoi(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';

  const direct = source.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  if (direct?.[0]) return cleanDoi(direct[0]);

  const labelled = source.match(/doi\s*[:\s]\s*(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (labelled?.[1]) return cleanDoi(labelled[1]);

  return '';
}

function normalizeIsbnText(raw) {
  return String(raw || '')
    .replace(/[\u00ad\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidIsbn13(digits) {
  if (!/^[0-9]{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(digits[i]);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]);
}

function isValidIsbn10(value) {
  if (!/^[0-9]{9}[0-9X]$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = value[i];
    const digit = ch === 'X' ? 10 : Number(ch);
    sum += (i + 1) * digit;
  }
  return sum % 11 === 0;
}

function normalizeIsbn13(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length !== 13) return '';
  if (!digits.startsWith('978') && !digits.startsWith('979')) return '';
  if (!isValidIsbn13(digits)) return '';
  return digits;
}

function normalizeIsbn10(raw) {
  const digits = String(raw || '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');
  if (digits.length !== 10) return '';
  if (!isValidIsbn10(digits)) return '';
  return digits;
}

function isbn10To13(isbn10) {
  const base = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(base[i]);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}

function matchIsbn(text) {
  const source = normalizeIsbnText(text);
  if (!source) return '';

  const isbn13Matches = source.match(/\b97[89][0-9\-\s]{10,16}[0-9]\b/g);
  if (isbn13Matches) {
    for (const hit of isbn13Matches) {
      const normalized = normalizeIsbn13(hit);
      if (normalized) return normalized;
    }
  }

  const isbn10Matches = source.match(/\b[0-9][0-9\-\s]{8,12}[0-9X]\b/gi);
  if (isbn10Matches) {
    for (const hit of isbn10Matches) {
      const normalized10 = normalizeIsbn10(hit);
      if (normalized10) return isbn10To13(normalized10);
    }
  }

  return '';
}
async function extractDoiFromPdfFile(file, maxPages = 6) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({data});

  try {
    const pdf = await loadingTask.promise;
    const total = Math.min(pdf.numPages, maxPages);
    let text = '';

    for (let pageNum = 1; pageNum <= total; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      text += ` ${content.items.map(item => item.str || '').join(' ')}`;

      const doi = matchDoi(text);
      if (doi) return doi;
    }
  } catch (err) {
    console.warn('Falha ao extrair DOI automaticamente do PDF.', err);
  } finally {
    if (typeof loadingTask.destroy === 'function') {
      try {
        await loadingTask.destroy();
      } catch (_err) {}
    }
  }

  return '';
}

async function extractIsbnFromPdfFile(file, maxPages = 8) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({data});

  try {
    const pdf = await loadingTask.promise;
    const total = Math.min(pdf.numPages, maxPages);
    let text = '';

    for (let pageNum = 1; pageNum <= total; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      text += ` ${content.items.map(item => item.str || '').join(' ')}`;

      const isbn = matchIsbn(text);
      if (isbn) return isbn;
    }
  } catch (err) {
    console.warn('Falha ao extrair ISBN automaticamente do PDF.', err);
  } finally {
    if (typeof loadingTask.destroy === 'function') {
      try {
        await loadingTask.destroy();
      } catch (_err) {}
    }
  }

  return '';
}
async function syncDocTitleFromDoi(doc, options = {}) {
  if (!doc || !doc.id || !isArticleDoc(doc)) return null;
  if (!String(doc.doi || '').trim()) return null;

  const payload = await DB.pdfs.syncDoiMetadata(doc.id);
  const updatedDoc = payload?.doc;
  if (!updatedDoc) {
    throw new Error('Nao foi possivel atualizar os metadados pelo DOI.');
  }

  Object.assign(doc, updatedDoc);
  const ix = S.docs.findIndex(item => item.id === doc.id);
  if (ix >= 0) S.docs[ix] = doc;
  if (S.currentDoc?.id === doc.id) S.currentDoc = doc;
  if (typeof Tabs?.syncDoc === 'function') Tabs.syncDoc(doc);

  if (options.refreshUi) {
    Library.renderGrid();
    Library.renderSidebar();
    if (S.currentDoc?.id === doc.id) {
      UI.renderPanelInfo(doc);
      document.getElementById('doc-title-hdr').textContent = doc.title || doc.name;
      const readerName = document.getElementById('reader-doc-name');
      if (readerName) readerName.textContent = doc.title || doc.name;
    }
  }

  return { doc, metadata: payload?.metadata || null };
}

async function syncDocMetaFromIsbn(doc, options = {}) {
  if (!doc || !doc.id || !isBookDoc(doc)) return null;
  if (!String(doc.isbn || '').trim()) return null;

  const payload = await DB.pdfs.syncIsbnMetadata(doc.id);
  const updatedDoc = payload?.doc;
  if (!updatedDoc) {
    throw new Error('Nao foi possivel atualizar os metadados pelo ISBN.');
  }

  Object.assign(doc, updatedDoc);
  const ix = S.docs.findIndex(item => item.id === doc.id);
  if (ix >= 0) S.docs[ix] = doc;
  if (S.currentDoc?.id === doc.id) S.currentDoc = doc;
  if (typeof Tabs?.syncDoc === 'function') Tabs.syncDoc(doc);

  if (options.refreshUi) {
    Library.renderGrid();
    Library.renderSidebar();
    if (S.currentDoc?.id === doc.id) {
      UI.renderPanelInfo(doc);
      document.getElementById('doc-title-hdr').textContent = doc.title || doc.name;
      const readerName = document.getElementById('reader-doc-name');
      if (readerName) readerName.textContent = doc.title || doc.name;
    }
  }

  return { doc, metadata: payload?.metadata || null };
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16),
        g = parseInt(hex.slice(3,5),16),
        b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
async function init() {
  try {
    await DB.init();
    await loadCats();
    if (typeof Tabs?.load === 'function') Tabs.load();
    UI.renderCats();
    document.body.classList.add('sidebar-open');
    UI._setViewClass(S.view);
    UI._refreshBackButton();
    ImgCapture.init();
    await Library.load();
    if (typeof Tabs?.restoreActiveWorkspace === 'function') {
      await Tabs.restoreActiveWorkspace();
    }
    toast('Lumen carregado ✓');
  } catch(err) {
    console.error(err);
    toast('Erro ao inicializar. Verifique o console.');
  }
}

init();
