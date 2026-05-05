const fs = require('fs');

const lines = fs.readFileSync('script.js', 'utf8').split('\n');
const files = {
  'config.js': [],
  'api.js': [],
  'store.js': [],
  'toast.js': [],
  'right_panel.js': [],
  'pdf_viewer.js': [],
  'image_capture.js': [],
  'highlights.js': [],
  'context_menu.js': [],
  'suco.js': [],
  'library.js': [],
  'projects.js': [],
  'attachments.js': [],
  'search.js': [],
  'ui.js': [],
  'helpers.js': [],
  'init.js': []
};

let currentFile = 'config.js';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Wait, the comment block might start with /* ======, we should switch right at the beginning of the block.
  // Actually, checking if the line contains the text is enough because the text is on the 2nd line of the block.
  // The first line `/* ======...` will go to the previous file, but that's just a comment. 
  // Let's do a lookahead to keep the banner together.
  
  if (line.includes('/* ══════════════════════════════════════')) {
    const nextLine = lines[i+1] || '';
    if (nextLine.includes('DATABASE — REST API')) currentFile = 'api.js';
    else if (nextLine.includes('STATE')) currentFile = 'store.js';
    else if (nextLine.includes('TOAST & MODAL')) currentFile = 'toast.js';
    else if (nextLine.includes('RIGHT PANEL CONTROLLER')) currentFile = 'right_panel.js';
    else if (nextLine.includes('PDF VIEWER')) currentFile = 'pdf_viewer.js';
    else if (nextLine.includes('IMAGE CAPTURE')) currentFile = 'image_capture.js';
    else if (nextLine.includes('HIGHLIGHTS (TEXT)')) currentFile = 'highlights.js';
    else if (nextLine.includes('CONTEXT MENU')) currentFile = 'context_menu.js';
    else if (nextLine.includes('SUCO — Hybrid view')) currentFile = 'suco.js';
    else if (nextLine.includes('LIBRARY (with tags')) currentFile = 'library.js';
    else if (nextLine.includes('PROJECTS — TipTap')) currentFile = 'projects.js';
    else if (nextLine.includes('ATTACHMENTS VIEW')) currentFile = 'attachments.js';
    else if (nextLine.includes('SEARCH')) currentFile = 'search.js';
    else if (nextLine.includes('UI CONTROLLER')) currentFile = 'ui.js';
    else if (nextLine.includes('HELPERS')) currentFile = 'helpers.js';
    else if (nextLine.includes('INIT')) currentFile = 'init.js';
  }

  files[currentFile].push(line);
}

fs.mkdirSync('js', { recursive: true });
const outFiles = [];
for (const [name, content] of Object.entries(files)) {
  if (content.length > 0) {
    fs.writeFileSync(`js/${name}`, content.join('\n'));
    outFiles.push(name);
  }
}

console.log(outFiles.join(', '));
