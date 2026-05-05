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
