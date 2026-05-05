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
