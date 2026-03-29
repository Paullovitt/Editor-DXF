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
- `src/slots/action-slots.js`
Modulo dedicado aos 32 slots de `Opcoes` (render, disponibilidade por modo e historico de execucoes).

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
7. No painel esquerdo, use os 32 slots de `Opcoes` (grade 4x8) para disparar acoes.
8. Cada clique de slot gera registro no painel direito em `Execucoes` (abaixo de `Propriedades`), com modo ativo e horario.

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
- Selecao por `Janela` exibe cotas no viewport para linhas/polilinhas e tambem medidas adequadas para geometrias curvas: `R` (raio), `D` (diametro), `C` (circunferencia), `Ang` (graus) e `A` (comprimento de arco) em circulos/arcos/cantos.
- No modo `Janela`, etiquetas de medida/raio/diametro/angulo/comprimento de arco podem ser clicadas para edicao direta; ao pressionar `Enter`, a nova medida e aplicada na geometria correspondente.
- Na edicao de medidas lineares no modo `Janela`, a linha mantem o vertice de referencia conectado e estende apenas a outra ponta no sentido do eixo da linha (evita crescimento pelos dois lados).
- No modo `Janela`, clique simples sobre a geometria agora tambem seleciona 1 vertice/linha (sem precisar arrastar retangulo).
- Handles de vertice reduzidos para melhor leitura da geometria.
- Pontos amarelos de vertice ajustados para 2.1x do tamanho base atual.
- Nos modos `Selecionar` e `Vertices`, o painel `Propriedades` nao exibe campos de edicao.
- No modo `Selecionar`, o painel `Objeto` mostra apenas a contagem de pecas selecionadas.
- Linhas retas exibem ponto amarelo adicional no ponto medio.
- Circulos/arcos exibem ponto central e quatro pontos amarelos cardeais (N, S, L, O).
- Tolerancia de selecao por mouse ajustada para um raio invisivel pequeno no ponteiro (aprox. 2 px), com adaptacao ao zoom.
- No modo `Vertices`, as bolinhas de controle (amarelas e verde em circulos/arcos) podem ser selecionadas por proximidade do mouse, inclusive para selecionar rapidamente a peca inteira e arrastar o ponto.
- No modo `Vertices`, quando o mouse se aproxima de uma bolinha, aparece um contorno de foco; ao selecionar a bolinha, ela fica vermelha para indicar o ponto ativo.
- Com bolinha vermelha ativa, o arraste de vertice fica travado para evitar movimento acidental, mas ainda e possivel clicar em outra bolinha amarela para trocar o ponto ativo; para liberar arraste, use `Esc` ou clique fora.
- Arraste de vertices usa zona morta curta no clique (anti-jitter) e deslocamento por delta para evitar salto de posicao/raio em cliques rapidos.
- Clique rapido nas bolinhas de vertices (sem arraste real) agora tem rollback automatico para evitar alteracao acidental de tamanho/posicao em circulos.
- Handles de vertice usam escala visual adaptativa por zoom sem reconstruir geometria a cada scroll, melhorando fluidez/performance.
- `Esc` limpa a selecao.
- Cursor muda para `pointer` quando o mouse se aproxima de geometria selecionavel.
- Arraste de pecas otimizado para movimento mais fluido (commit no modelo ao soltar o mouse).
- Zoom da roda do mouse ancorado no ponteiro (o ponto sob o cursor permanece no foco durante o zoom), com suavizacao por frame.
- Grade estendida para manter o fundo continuo durante navegacao.
- Rotacionar/Escalar/Espelhar agora aplicam no centro do conjunto selecionado.
- Atalhos de rotacao: `E` = 90 graus, `R` = 45 graus.
- Botoes `Undo/Redo` removidos da barra (mantidos atalhos `Ctrl+Z` e `Ctrl+Y`).
- Setas do teclado (`<-`, `->`, `^`, `v`) deslocam a selecao atual em passos de `1 mm`; no modo `Vertices`, com bolinha ativa (vermelha), o passo de `1 mm` e aplicado no vertice ativo.
- Exportacao usa o mesmo nome do arquivo original (sem sufixo `_editado`).
- Novo painel `Opcoes` com 32 slots vazios (4 colunas x 8 linhas), pronto para receber logica de edicao por slot.
- Novo card `Execucoes` abaixo de `Propriedades`, exibindo historico das ultimas execucoes dos slots.
- Logica dos slots foi extraida para `src/slots/action-slots.js`, deixando o `src/app.js` mais enxuto para evolucao das ferramentas de edicao.
- Slot `Opcao 1` agora exibe icone de cubo e aciona criacao de retangulo por medidas: `X (mm)` -> `Enter` -> `Y (mm)` -> `Enter` para criar.
- Durante a digitacao de `X/Y`, um preview do retangulo aparece no viewport para confirmar o tamanho antes de criar.
- O retangulo da `Opcao 1` e gerado como 4 entidades `LINE` (base, direita, topo e esquerda), evitando virar uma unica polilinha e preservando cantos/vertices explicitos.
- Slot `Opcao 2` agora exibe icone de canto e abre painel de cantos com 6 subopcoes (arredondado, quadrado para dentro, linha 45, circulo inverso para dentro, circulo para dentro e circulo para fora), exigindo no minimo 2 linhas selecionadas (vertices) e processando em pares na ordem da selecao.
- A `Opcao 2` usa campo de `Raio/Prof. (mm)` com valor inicial de `10 mm` e gera ligacoes por par de linhas selecionadas (vertices) conforme o tipo escolhido.
- A `Opcao 2` aplica transformacao real no canto: faz `trim` das duas linhas do par no vertice e insere apenas a ligacao correspondente ao tipo escolhido (sem manter a quina original inteira).
- Slot `Opcao 3` agora exibe icone proprio e abre painel com 2 subopcoes: `Circulo` (raio em mm) e `Capsula 90` (raio + distancia ponta a ponta em mm), criando a geometria no centro da vista/selecao.
- Padrao adotado para as proximas geometrias das `Opcoes`: gerar contorno em entidades segmentadas (`LINE`) para manter vertices editaveis e evitar geometria em linha unica.

## Licenca 
MIT. Consulte `LICENSE`.

## Autor
- Paulo Augusto
- Ano: 2026
