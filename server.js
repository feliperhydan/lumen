const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'server-data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  pdfs: [],
  highlights: [],
  projects: [],
  attachments: [],
  suco_notes: [],
  settings: {
    cats: null,
    darkMode: false,
    libraryFolders: [],
    projectFolders: [],
  },
};

let db = clone(DEFAULT_DB);
let writeQueue = Promise.resolve();
const execFileAsync = promisify(execFile);
let curlExecutablePromise = null;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeDoc(input = {}, fallbackName = 'Documento') {
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((x) => typeof x === 'string' && x.trim())
    : [];

  const baseName = normalizeString(input.name, fallbackName).trim() || fallbackName;
  const title = normalizeString(input.title, baseName).trim() || baseName;

  return {
    id: normalizeString(input.id).trim(),
    name: baseName,
    title,
    author: normalizeString(input.author).trim(),
    year: normalizeString(input.year).trim(),
    type: normalizeString(input.type, 'artigo').trim() || 'artigo',
    lang: normalizeString(input.lang, 'pt').trim() || 'pt',
    doi: normalizeString(input.doi).trim(),
    citationApa: normalizeString(input.citationApa).trim(),
    citationCachedAt: Number(input.citationCachedAt) || 0,
    folderId: normalizeString(input.folderId).trim() || null,
    tags,
    size: Number(input.size) || 0,
    addedAt: Number(input.addedAt) || Date.now(),
    fileName: normalizeString(input.fileName).trim(),
  };
}

function normalizeDb(raw) {
  const next = clone(DEFAULT_DB);

  if (raw && typeof raw === 'object') {
    next.pdfs = Array.isArray(raw.pdfs) ? raw.pdfs : [];
    next.highlights = Array.isArray(raw.highlights) ? raw.highlights : [];
    next.projects = Array.isArray(raw.projects) ? raw.projects : [];
    next.attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
    next.suco_notes = Array.isArray(raw.suco_notes) ? raw.suco_notes : [];

    if (raw.settings && typeof raw.settings === 'object') {
      next.settings = {
        cats: Array.isArray(raw.settings.cats) ? raw.settings.cats : null,
        darkMode: Boolean(raw.settings.darkMode),
        libraryFolders: Array.isArray(raw.settings.libraryFolders) ? raw.settings.libraryFolders : [],
        projectFolders: Array.isArray(raw.settings.projectFolders) ? raw.settings.projectFolders : [],
      };
    }
  }

  return next;
}

async function saveDb() {
  writeQueue = writeQueue.then(async () => {
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmpPath, DB_PATH);
  });

  return writeQueue;
}

async function ensureStorage() {
  await fs.mkdir(PDF_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    db = normalizeDb(JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    db = clone(DEFAULT_DB);
    await saveDb();
  }
}

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function upsert(listName, value) {
  const list = db[listName];
  const index = list.findIndex((x) => x.id === value.id);
  if (index >= 0) {
    list[index] = value;
  } else {
    list.push(value);
  }
  return value;
}

function removeById(listName, id) {
  const list = db[listName];
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [removed] = list.splice(index, 1);
  return removed;
}

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function commandExists(command, versionArg = '--version') {
  try {
    await execFileAsync(command, [versionArg], { timeout: 4000, windowsHide: true });
    return true;
  } catch (_err) {
    return false;
  }
}

async function resolveCurlExecutable() {
  if (!curlExecutablePromise) {
    curlExecutablePromise = (async () => {
      const candidates = process.platform === 'win32'
        ? ['curl.exe', 'curl']
        : ['curl'];

      for (const candidate of candidates) {
        if (await commandExists(candidate)) return candidate;
      }

      throw new Error('Curl nao esta disponivel neste sistema. Instale o curl ou adicione-o ao PATH.');
    })();
  }

  return curlExecutablePromise;
}

function citationUrlForDoi(doi) {
  const normalizedDoi = normalizeString(doi).trim();
  return `https://citation.doi.org/format?doi=${normalizedDoi}&style=apa&lang=en-US`;
}

function crossrefUrlForDoi(doi) {
  const normalizedDoi = normalizeString(doi).trim();
  return `https://api.crossref.org/works/${encodeURIComponent(normalizedDoi)}`;
}

async function fetchCitationByCurl(doi) {
  const normalizedDoi = normalizeString(doi).trim();
  if (!normalizedDoi) {
    throw new Error('DOI obrigatorio.');
  }

  const url = citationUrlForDoi(normalizedDoi);
  const curlExecutable = await resolveCurlExecutable();
  const { stdout } = await execFileAsync(curlExecutable, [url], {
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const citation = String(stdout || '').trim();
  if (!citation) {
    throw new Error('Nenhuma referencia foi retornada para este DOI.');
  }
  return citation;
}

async function fetchCitationByDoi(doi) {
  const normalizedDoi = normalizeString(doi).trim();
  if (!normalizedDoi) {
    throw new Error('DOI obrigatorio.');
  }
  return fetchCitationByCurl(normalizedDoi);
}

async function fetchJsonByCurl(url) {
  const curlExecutable = await resolveCurlExecutable();
  const { stdout } = await execFileAsync(curlExecutable, ['-L', '-H', 'Accept: application/json', url], {
    maxBuffer: 1024 * 1024 * 4,
    windowsHide: true,
  });

  let payload = null;
  try {
    payload = JSON.parse(String(stdout || '{}'));
  } catch (_err) {
    payload = null;
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Nao foi possivel interpretar os metadados retornados para este DOI.');
  }

  return payload;
}

function normalizeCrossrefTitle(value) {
  if (Array.isArray(value)) {
    return normalizeString(value.find(item => typeof item === 'string' && item.trim()), '').trim();
  }
  return normalizeString(value).trim();
}

function normalizeCrossrefAuthors(value) {
  if (!Array.isArray(value)) return '';

  return value
    .map((author) => {
      if (!author || typeof author !== 'object') return '';
      const given = normalizeString(author.given).trim();
      const family = normalizeString(author.family).trim();
      const literal = normalizeString(author.literal).trim();
      return [given, family].filter(Boolean).join(' ').trim() || literal;
    })
    .filter(Boolean)
    .join('; ');
}

function normalizeCrossrefYear(message) {
  const dateSources = [
    message?.published?.['date-parts'],
    message?.['published-print']?.['date-parts'],
    message?.['published-online']?.['date-parts'],
    message?.issued?.['date-parts'],
    message?.created?.['date-parts'],
  ];

  for (const dateParts of dateSources) {
    const year = Array.isArray(dateParts) && Array.isArray(dateParts[0]) ? dateParts[0][0] : null;
    if (year) return String(year).trim();
  }

  return '';
}

async function fetchDoiMetadata(doi) {
  const normalizedDoi = normalizeString(doi).trim();
  if (!normalizedDoi) {
    throw new Error('DOI obrigatorio.');
  }

  const payload = await fetchJsonByCurl(crossrefUrlForDoi(normalizedDoi));
  const message = payload && typeof payload.message === 'object' ? payload.message : payload;
  const title = normalizeCrossrefTitle(message?.title);
  if (!title) {
    throw new Error('Nao foi possivel localizar um titulo valido para este DOI.');
  }
  const author = normalizeCrossrefAuthors(message?.author);
  const year = normalizeCrossrefYear(message);

  return {
    doi: normalizedDoi,
    title,
    author,
    year,
    source: 'crossref',
    raw: message,
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 200 },
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(ROOT_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/settings', (_req, res) => {
  res.json(db.settings);
});

app.patch('/api/settings', async (req, res, next) => {
  try {
    const patch = req.body || {};

    if (Object.prototype.hasOwnProperty.call(patch, 'cats')) {
      db.settings.cats = Array.isArray(patch.cats) ? patch.cats : null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'darkMode')) {
      db.settings.darkMode = Boolean(patch.darkMode);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'libraryFolders')) {
      db.settings.libraryFolders = Array.isArray(patch.libraryFolders) ? patch.libraryFolders : [];
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'projectFolders')) {
      db.settings.projectFolders = Array.isArray(patch.projectFolders) ? patch.projectFolders : [];
    }

    await saveDb();
    res.json(db.settings);
  } catch (err) {
    next(err);
  }
});

app.get('/api/pdfs', (_req, res) => {
  res.json(db.pdfs);
});

app.get('/api/pdfs/:id', (req, res) => {
  const doc = byId(db.pdfs, req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Documento nao encontrado.' });
    return;
  }
  res.json(doc);
});

app.get('/api/pdfs/:id/file', async (req, res, next) => {
  try {
    const doc = byId(db.pdfs, req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Documento nao encontrado.' });
      return;
    }

    const fileName = doc.fileName || `${doc.id}.pdf`;
    const fullPath = path.join(PDF_DIR, fileName);
    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

app.get('/api/pdfs/:id/citation', async (req, res, next) => {
  try {
    const doc = byId(db.pdfs, req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Documento nao encontrado.' });
      return;
    }

    if (normalizeString(doc.type).trim().toLowerCase() !== 'artigo') {
      res.status(400).json({ error: 'A referencia automatica esta disponivel apenas para artigos/papers cientificos.' });
      return;
    }

    const doi = normalizeString(doc.doi).trim();
    if (!doi) {
      res.status(400).json({ error: 'Este artigo nao possui DOI salvo.' });
      return;
    }

    const wantsRefresh = String(req.query.refresh || '').trim() === '1';
    if (!wantsRefresh && normalizeString(doc.citationApa).trim()) {
      res.json({
        citation: doc.citationApa,
        doi,
        cached: true,
        cachedAt: Number(doc.citationCachedAt) || 0,
      });
      return;
    }

    const citation = await fetchCitationByDoi(doi);
    const updated = {
      ...doc,
      citationApa: citation,
      citationCachedAt: Date.now(),
    };
    upsert('pdfs', updated);
    await saveDb();

    res.json({
      citation,
      doi,
      cached: false,
      cachedAt: updated.citationCachedAt,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/pdfs/:id/sync-doi-metadata', async (req, res, next) => {
  try {
    const doc = byId(db.pdfs, req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Documento nao encontrado.' });
      return;
    }

    if (normalizeString(doc.type).trim().toLowerCase() !== 'artigo') {
      res.status(400).json({ error: 'A sincronizacao automatica por DOI esta disponivel apenas para artigos/papers cientificos.' });
      return;
    }

    const doi = normalizeString(doc.doi).trim();
    if (!doi) {
      res.status(400).json({ error: 'Este artigo nao possui DOI salvo.' });
      return;
    }

    const metadata = await fetchDoiMetadata(doi);
    const updated = {
      ...doc,
      title: metadata.title,
      author: metadata.author,
      year: metadata.year,
    };

    upsert('pdfs', updated);
    await saveDb();

    res.json({
      doc: updated,
      metadata: {
        doi: metadata.doi,
        title: metadata.title,
        author: metadata.author,
        year: metadata.year,
        source: metadata.source,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/pdfs/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo PDF obrigatorio.' });
      return;
    }

    let clientDoc = {};
    if (req.body && req.body.doc) {
      try {
        clientDoc = JSON.parse(req.body.doc);
      } catch (_err) {
        clientDoc = {};
      }
    }

    const parsedName = normalizeString(req.file.originalname, 'documento.pdf').replace(/\.pdf$/i, '');
    const normalized = normalizeDoc(clientDoc, parsedName || 'Documento');
    const id = normalized.id || makeId('pdf');
    const fileName = `${id}.pdf`;

    await fs.writeFile(path.join(PDF_DIR, fileName), req.file.buffer);

    const savedDoc = {
      ...normalized,
      id,
      fileName,
      size: req.file.size,
      addedAt: Number(normalized.addedAt) || Date.now(),
    };

    const existing = byId(db.pdfs, id);
    if (existing && existing.fileName && existing.fileName !== fileName) {
      await safeUnlink(path.join(PDF_DIR, existing.fileName));
    }

    upsert('pdfs', savedDoc);
    await saveDb();

    res.status(existing ? 200 : 201).json(savedDoc);
  } catch (err) {
    next(err);
  }
});

app.put('/api/pdfs/:id', async (req, res, next) => {
  try {
    const existing = byId(db.pdfs, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Documento nao encontrado.' });
      return;
    }

    const normalized = normalizeDoc({ ...existing, ...(req.body || {}) }, existing.name || existing.title || 'Documento');
    const updated = {
      ...normalized,
      id: existing.id,
      fileName: existing.fileName,
      size: existing.size,
      addedAt: existing.addedAt,
    };

    upsert('pdfs', updated);
    await saveDb();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/pdfs/:id', async (req, res, next) => {
  try {
    const removed = removeById('pdfs', req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Documento nao encontrado.' });
      return;
    }

    db.highlights = db.highlights.filter((h) => h.pdfId !== removed.id);
    db.attachments = db.attachments.filter((a) => a.pdfId !== removed.id);
    db.suco_notes = db.suco_notes.filter((n) => n.docId !== removed.id);

    const fileName = removed.fileName || `${removed.id}.pdf`;
    await safeUnlink(path.join(PDF_DIR, fileName));

    await saveDb();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('/api/highlights', (_req, res) => {
  res.json(db.highlights);
});

app.get('/api/highlights/by-pdf/:pdfId', (req, res) => {
  const list = db.highlights.filter((h) => h.pdfId === req.params.pdfId);
  res.json(list);
});

app.put('/api/highlights/:id', async (req, res, next) => {
  try {
    const item = { ...(req.body || {}), id: req.params.id };
    upsert('highlights', item);
    await saveDb();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/highlights/:id', async (req, res, next) => {
  try {
    const removed = removeById('highlights', req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Highlight nao encontrado.' });
      return;
    }

    db.attachments = db.attachments.filter((a) => a.highlightId !== removed.id);

    await saveDb();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('/api/projects', (_req, res) => {
  res.json(db.projects);
});

app.get('/api/projects/:id', (req, res) => {
  const proj = byId(db.projects, req.params.id);
  if (!proj) {
    res.status(404).json({ error: 'Projeto nao encontrado.' });
    return;
  }
  res.json(proj);
});

app.put('/api/projects/:id', async (req, res, next) => {
  try {
    const item = { ...(req.body || {}), id: req.params.id };
    upsert('projects', item);
    await saveDb();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/projects/:id', async (req, res, next) => {
  try {
    const removed = removeById('projects', req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Projeto nao encontrado.' });
      return;
    }

    await saveDb();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('/api/attachments', (_req, res) => {
  res.json(db.attachments);
});

app.put('/api/attachments/:id', async (req, res, next) => {
  try {
    const item = { ...(req.body || {}), id: req.params.id };
    upsert('attachments', item);
    await saveDb();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/attachments/:id', async (req, res, next) => {
  try {
    const removed = removeById('attachments', req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Anexo nao encontrado.' });
      return;
    }

    await saveDb();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('/api/suco-notes', (_req, res) => {
  res.json(db.suco_notes);
});

app.get('/api/suco-notes/:id', (req, res) => {
  const note = byId(db.suco_notes, req.params.id);
  if (!note) {
    res.status(404).json({ error: 'Nota nao encontrada.' });
    return;
  }
  res.json(note);
});

app.get('/api/suco-notes/by-doc/:docId', (req, res) => {
  const list = db.suco_notes.filter((n) => n.docId === req.params.docId);
  res.json(list);
});

app.put('/api/suco-notes/:id', async (req, res, next) => {
  try {
    const item = { ...(req.body || {}), id: req.params.id };
    upsert('suco_notes', item);
    await saveDb();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/suco-notes/:id', async (req, res, next) => {
  try {
    const removed = removeById('suco_notes', req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Nota nao encontrada.' });
      return;
    }

    await saveDb();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

(async () => {
  await ensureStorage();
  app.listen(PORT, () => {
    console.log(`Lumen server rodando em http://localhost:${PORT}`);
  });
})();
