const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'src', 'app.js');
const slotsPath = path.join(__dirname, '..', 'src', 'slots', 'action-slots.js');
const htmlPath = path.join(__dirname, '..', 'index.html');

const appSource = fs.readFileSync(appPath, 'utf8');
const slotsSource = fs.readFileSync(slotsPath, 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

test('opcao 4 registra slot e handler', () => {
  assert.match(appSource, /actionSlotsController\.setSlotMeta\(4,\s*\{/);
  assert.match(appSource, /icon: 'link-line'/);
  assert.match(appSource, /actionSlotsController\.registerHandler\(4,\s*\(\) => \{/);
  assert.match(appSource, /const opened = openLinkCommand\(\);/);
});

test('painel da opcao 4 contem os dois modos de ligacao', () => {
  assert.ok(htmlSource.includes('id="linkCommandPanel"'));
  assert.ok(htmlSource.includes('data-link-mode="orthXY"'));
  assert.ok(htmlSource.includes('data-link-mode="free"'));
  assert.ok(htmlSource.includes('data-link-mode="axisFree"'));
  assert.ok(htmlSource.includes('id="linkAxisValue"'));
  assert.ok(htmlSource.includes('id="linkAxisXBtn"'));
  assert.ok(htmlSource.includes('id="linkAxisYBtn"'));
  assert.ok(htmlSource.includes('id="linkAxisApplyBtn"'));
  assert.ok(htmlSource.includes('id="linkClearStartBtn"'));
});

test('opcao 4 limita clique a vertices de poligonos', () => {
  assert.match(appSource, /function isPolygonEntity\(entity\)/);
  assert.match(appSource, /function isLinkTargetEntity\(entity\)/);
  assert.match(appSource, /function findPolygonVertexPick\(clientX, clientY\)/);
  assert.match(appSource, /function buildLinkEntitiesFromPicks\(startPick, endPick, modeId\)/);
  assert.match(appSource, /function handleLinkCanvasPick\(clientX, clientY\)/);
  assert.match(appSource, /function applyLinkAxisLine\(\)/);
});

test('modulo de slots renderiza icone da opcao 4', () => {
  assert.match(slotsSource, /else if \(slot\.icon === 'link-line'\)/);
});
