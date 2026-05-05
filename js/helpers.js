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
