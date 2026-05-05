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
