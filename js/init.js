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
    UI._refreshHomeButton();
    ImgCapture.init();
    await Library.load();
    if (typeof Tabs?.restoreActiveWorkspace === 'function') {
      await Tabs.restoreActiveWorkspace();
    }
    toast('Síntese carregado ✓');
  } catch(err) {
    console.error(err);
    toast('Erro ao inicializar. Verifique o console.');
  }
}

init();
