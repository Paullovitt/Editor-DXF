# Editor_DXF (2D)

Aplicacao web para abrir, visualizar, editar e exportar arquivos DXF 2D em milimetros.

## Objetivo do projeto
- Permitir edicao rapida de geometrias DXF 2D (LINE, CIRCLE, ARC, POINT, LWPOLYLINE e POLYLINE).
- Executar sem backend e sem build: somente HTML, CSS e JavaScript.
- Funcionar por duplo clique no `index.html` (modo `file://`).

## Arquitetura do sistema
- `index.html`
Estrutura da interface e carregamento dos scripts.
- `styles.css`
Estilos da UI.
- `lib/three.min.js`
Biblioteca Three.js local (runtime 3D).
- `lib/OrbitControls.js`
Controle de camera local.
- `src/model.js`
Regras de dominio geometrico (bounds, transformacoes, snap, selecao).
- `src/dxf.js`
Parser e exportador DXF.
- `src/app.js`
Orquestra UI, renderizacao, interacoes e import/export.

## Dependencias necessarias
### Runtime do app
- Navegador moderno com suporte a JavaScript e WebGL.

Nao ha dependencia de Python ou Node para executar o app.

## Instalacao
Sem instalacao de build.

1. Baixe/extraia o projeto.
2. Abra `index.html` com duplo clique.

## Execucao
- Duplo clique em `index.html`.
- Alternativa: abrir manualmente `file:///C:/.../Editor_DXF/index.html`.

## Exemplo de uso
1. Clique em `Abrir DXF`.
2. Selecione um `.dxf`.
3. Arraste no viewport para selecionar por area (estilo click/segura/solta).
4. Pressione `Esc` para limpar a selecao atual.
5. O codigo da peca selecionada aparece no painel `Objeto/Propriedades`.
6. Use `Enquadrar` se necessario e exporte com `Baixar DXF`.

## Principais funcoes
- `parseDxf(text, fileName)` em `src/dxf.js`
Converte texto DXF em estrutura interna de entidades/camadas.
- `exportDxf(doc)` em `src/dxf.js`
Exporta o documento para DXF AC1015 (`INSUNITS=4`).
- `fitView()` em `src/app.js`
Enquadra as entidades na camera.
- `translateEntity/rotateEntity/scaleEntity/mirrorEntity` em `src/model.js`
Transformacoes geometricas reutilizaveis.

## Correcao aplicada (Mar 2026)
Problema corrigido: ao abrir por duplo clique, o DXF nao aparecia na tela.

Causa raiz:
- O app usava `type="module"`, e o navegador bloqueava carregamento de modulo no `file://` por politica CORS.

Solucao:
- Migracao para scripts classicos no browser.
- `model.js` e `dxf.js` expostos via `window` (`DxfModel` e `DxfIO`).
- `app.js` consumindo essas APIs globais.
- Three.js e OrbitControls servidos localmente em `lib/`.

## Ajustes de UX (Mar 2026)
- Remocao dos labels desenhados sobre a geometria para evitar poluicao visual.
- Remocao da opcao de camada `Travar`.
- Remocao da opcao `Visivel` na area de camadas.
- Area de camadas mostra o codigo da peca usando o nome do arquivo DXF (sem `.dxf`).
- Exibicao de codigo/nome da peca no painel lateral (sem desenhar no canvas).
- Painel do objeto/propriedades mostra o tamanho da peca em `X` e `Y` (mm) logo abaixo do codigo.
- Painel `Objeto` foi simplificado para exibir apenas codigo, tamanho X e tamanho Y.
- Selecao por `Janela` em linhas/polilinhas exibe cotas com seta e valor em milimetros no viewport.
- Handles de vertice reduzidos para melhor leitura da geometria.
- Pontos amarelos de vertice ajustados para 3x do tamanho base atual.
- No modo `Vertices`, o painel de propriedades oculta `Codigo da peca`, `Tamanho X/Y` e `Camada`.
- No modo `Selecionar`, o painel `Objeto` mostra apenas a contagem de pecas selecionadas.
- Linhas retas exibem ponto amarelo adicional no ponto medio.
- Circulos/arcos exibem ponto central e quatro pontos amarelos cardeais (N, S, L, O).
- Tolerancia de selecao por mouse ajustada para um raio invisivel pequeno no ponteiro (aprox. 2 px), com adaptacao ao zoom.
- Handles de vertice usam escala visual adaptativa por zoom sem reconstruir geometria a cada scroll, melhorando fluidez/performance.
- `Esc` limpa a selecao.
- Cursor muda para `pointer` quando o mouse se aproxima de geometria selecionavel.
- Arraste de pecas otimizado para movimento mais fluido (commit no modelo ao soltar o mouse).
- Zoom da roda do mouse ancorado no ponteiro (o ponto sob o cursor permanece no foco durante o zoom), com suavizacao por frame.
- Grade estendida para manter o fundo continuo durante navegacao.
- Rotacionar/Escalar/Espelhar agora aplicam no centro do conjunto selecionado.
- Atalhos de rotacao: `E` = 90 graus, `R` = 45 graus.
- Botoes `Undo/Redo` removidos da barra (mantidos atalhos `Ctrl+Z` e `Ctrl+Y`).
- Exportacao usa o mesmo nome do arquivo original (sem sufixo `_editado`).

## Licenca
MIT. Consulte `LICENSE`.

## Autor
- Paulo Augusto
- Ano: 2026
