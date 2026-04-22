# Lumen

Lumen é um ambiente acadêmico local para organizar PDFs, highlights, projetos e anexos em um único lugar.

## Funcionalidades

- Importação e leitura de PDFs com suporte a seleção de texto.
- Criação de highlights, notas e categorias.
- Biblioteca com pastas e subpastas.
- Área de Projetos para organizar conteúdos e inserir destaques.
- Anexos para reunir trechos importantes separados por documento.
- Busca global em highlights, notas, projetos e anexos.
- Drag and drop para mover documentos, projetos e pastas.
- Persistência local via servidor Node.js.

## Como executar

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Inicie o servidor:

   ```bash
   npm start
   ```

3. Abra o app em:

   ```
   http://localhost:3000
   ```

## Scripts

- `npm start`: inicia o servidor local.
- `npm run dev`: inicia o servidor com monitoramento de alterações.

## Estrutura principal

- `server.js`: backend local e API REST.
- `script.js`: comportamento da interface e regras do app.
- `style.css`: estilos da aplicação.
- `server-data/`: dados persistidos e arquivos enviados.
