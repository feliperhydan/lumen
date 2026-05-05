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
