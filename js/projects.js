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
    UI.nav('proj-editor', true, { skipTabCapture: true });
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
