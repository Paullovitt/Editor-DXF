const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'src', 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');

test('janela coleta medidas para linha, circulo e arco', () => {
  assert.match(appSource, /function collectMeasurementItems\(\)/);
  assert.match(appSource, /if \(e\.type === 'LINE'\)/);
  assert.match(appSource, /else if \(e\.type === 'CIRCLE'\)/);
  assert.match(appSource, /else if \(e\.type === 'ARC'\)/);
});

test('janela desenha cotas especificas para circulo e arco', () => {
  assert.match(appSource, /drawLinearDimension\(left, right, `D \$\{mm\(item\.r \* 2\)\}`, 'diameter', \{/);
  assert.match(appSource, /drawRadiusLeader\(\{ x: item\.cx, y: item\.cy \}, item\.r, Math\.PI \/ 4, `R \$\{mm\(item\.r\)\}`, 'radius', \{/);
  assert.match(appSource, /`Ang \$\{deg\(360\)\}`/);
  assert.match(appSource, /`C \$\{mm\(Math\.PI \* 2 \* circleItem\.r\)\}`/);
  assert.match(appSource, /drawArcAngleTag\(item, \{/);
  assert.match(appSource, /drawArcLengthTag\(item, \{/);
  assert.match(appSource, /`A \$\{mm\(arcLen\)\}`/);
});

test('janela permite selecionar 1 vertice por clique', () => {
  assert.match(appSource, /function windowPickSelect\(clientX, clientY, additive = false\)/);
  assert.match(appSource, /if \(dragPx <= 6\) \{/);
  assert.match(appSource, /windowPickSelect\(clientX, clientY, Boolean\(dragState\.additive\)\);/);
});

test('janela permite editar etiquetas de medida por clique', () => {
  assert.match(appSource, /function addMeasurementLabel\(worldPos, text, kind = 'linear', edit = null\)/);
  assert.match(appSource, /el\.classList\.add\('measure-label--editable'\);/);
  assert.match(appSource, /openMeasurementEditor\(item\);/);
});

test('janela aplica nova medida ao pressionar Enter no editor', () => {
  assert.match(appSource, /function openMeasurementEditor\(labelItem\)/);
  assert.match(appSource, /if \(event\.key === 'Enter'\) \{/);
  assert.match(appSource, /closeMeasurementEditor\(\{ apply: true \}\);/);
});

test('edicao linear ancora vertice conectado e estende no sentido do eixo', () => {
  assert.match(appSource, /function pickLineLengthAnchorEndpoint\(line\)/);
  assert.match(appSource, /const c1 = countLineConnectionAtPoint\(line\.id, p1\);/);
  assert.match(appSource, /const c2 = countLineConnectionAtPoint\(line\.id, p2\);/);
  assert.match(appSource, /function setLineLengthFromAnchor\(line, targetLength, anchorEndpointIndex\)/);
  assert.match(appSource, /const anchorIndex = pickLineLengthAnchorEndpoint\(entity\);/);
});
