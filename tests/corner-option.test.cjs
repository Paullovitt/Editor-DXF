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

test('opcao 2 usa minimo de 2 vertices e valor padrao de 10 mm', () => {
  assert.match(appSource, /const CORNER_DEFAULT_MM = 10;/);
  assert.match(appSource, /const CORNER_MIN_PICK_COUNT = 2;/);
  assert.match(appSource, /if \(selectedLines\.length < CORNER_MIN_PICK_COUNT\)/);
});

test('opcao 2 registra slot com icone e handler', () => {
  assert.match(appSource, /actionSlotsController\.setSlotMeta\(2,\s*\{/);
  assert.match(appSource, /icon: 'corner'/);
  assert.match(appSource, /actionSlotsController\.registerHandler\(2,\s*\(\) => \{/);
});

test('painel da opcao 2 possui os seis tipos de canto', () => {
  assert.ok(htmlSource.includes('data-corner-type="roundOuter"'));
  assert.ok(htmlSource.includes('data-corner-type="squareInner"'));
  assert.ok(htmlSource.includes('data-corner-type="chamfer45"'));
  assert.ok(htmlSource.includes('data-corner-type="roundInner"'));
  assert.ok(htmlSource.includes('data-corner-type="circleInner"'));
  assert.ok(htmlSource.includes('data-corner-type="circleOuter"'));
});

test('modulo de slots renderiza icone corner', () => {
  assert.match(slotsSource, /else if \(slot\.icon === 'corner'\)/);
});

test('opcao 2 usa linhas selecionadas como base', () => {
  assert.match(appSource, /function getCornerSelectedLines\(\)/);
  assert.match(appSource, /if \(tool !== 'select'\) setTool\('select'\);/);
  assert.match(appSource, /selecione linhas \(vertices\) em pares/i);
});

test('opcao 2 transforma canto com trim nas linhas originais', () => {
  assert.match(appSource, /function buildCornerPairContext\(/);
  assert.match(appSource, /function buildCornerBridgeEntities\(/);
  assert.match(appSource, /setLineEndpoint\(context\.lineA, context\.cornerIndexA, context\.trimPointA\);/);
  assert.match(appSource, /setLineEndpoint\(context\.lineB, context\.cornerIndexB, context\.trimPointB\);/);
});

test('arredondado usa bissetriz interna no arco', () => {
  assert.match(appSource, /const useInternalNormal = typeId === 'roundOuter' \|\| typeId === 'circleInner';/);
  assert.match(appSource, /const normal = useInternalNormal/);
  assert.match(appSource, /\? context\.bisector/);
});

test('arredondado prioriza arco menor para evitar circulo externo', () => {
  assert.match(appSource, /const shouldSwap = useMajorArc \? delta < Math\.PI : delta > Math\.PI;/);
  assert.match(appSource, /if \(shouldSwap\) \{/);
  assert.match(appSource, /startAngle = angleB;/);
  assert.match(appSource, /endAngle = angleA;/);
});

test('novos modos de circulo estao habilitados no tipo de canto', () => {
  assert.match(appSource, /'circleInner'/);
  assert.match(appSource, /'circleOuter'/);
  assert.match(appSource, /const useMajorArc = typeId === 'circleInner' \|\| typeId === 'circleOuter';/);
});
