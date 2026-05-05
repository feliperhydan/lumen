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
