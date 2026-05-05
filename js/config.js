'use strict';

/* ══════════════════════════════════════
   PDF.JS WORKER
══════════════════════════════════════ */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
const DEF_CATS = [
  {id:'def',  name:'Definição',  color:'#1d6fb8', bg:'rgba(29,111,184,.18)'},
  {id:'evid', name:'Evidência',  color:'#1a7a40', bg:'rgba(26,122,64,.18)'},
  {id:'crit', name:'Crítica',    color:'#c0392b', bg:'rgba(192,57,43,.18)'},
  {id:'conc', name:'Conclusão',  color:'#c07a00', bg:'rgba(192,122,0,.18)'},
  {id:'obs',  name:'Observação', color:'#6e6e6a', bg:'rgba(110,110,106,.18)'},
];

const DEF_FOLDER_NAMES = ['Artigos', 'Livros', 'Materiais Estrangeiros'];
const FILE_UPLOAD_TYPES = [
  {
    value: 'artigo',
    label: 'Artigo / Paper científico',
    hint: 'Procura automaticamente o DOI no PDF antes de salvar.',
  },
  {
    value: 'livro',
    label: 'Livro',
    hint: 'Mantém o fluxo normal de importação com tipo de livro.',
  },
  {
    value: 'material-academico',
    label: 'Material Acadêmico',
    hint: 'Prepara metadados próprios para tese, dissertação e TCC.',
  },
  {
    value: 'capitulo-livro',
    label: 'Capítulo de Livro',
    hint: 'Prepara metadados do capítulo e do livro de origem.',
  },
  {
    value: 'relatorio',
    label: 'Relatório',
    hint: 'Prepara metadados próprios para relatórios acadêmicos e técnicos.',
  },
  {
    value: 'outro',
    label: 'Outros',
    hint: "Outros materiais acadêmicos como slides, TC's, estudos dirigidos etc.",
  },
];

const CITATION_STYLE_OPTIONS = [
  { value: 'abnt', label: 'ABNT' },
  { value: 'vancouver', label: 'Vancouver' },
];

const THEMED_LIBRARY_ICONS = {
  folder: {
    light: 'assets/icons/folder-preto.png',
    dark: 'assets/icons/folder-branco.png',
  },
  artigo: {
    light: 'assets/icons/artigo-preto.png',
    dark: 'assets/icons/artigo-branco.png',
  },
  'capitulo-livro': {
    light: 'assets/icons/cap-de-livro-preto.png',
    dark: 'assets/icons/cap-de-livro-branco.png',
  },
  livro: {
    light: 'assets/icons/livro-preto.png',
    dark: 'assets/icons/livro-branco.png',
  },
  'material-academico': {
    light: 'assets/icons/material-academico-preto.png',
    dark: 'assets/icons/material-academico-branco.png',
  },
  outro: {
    light: 'assets/icons/outros-preto.png',
    dark: 'assets/icons/outros-branco.png',
  },
  relatorio: {
    light: 'assets/icons/relatorio-preto.png',
    dark: 'assets/icons/relatorio-branco.png',
  },
};
