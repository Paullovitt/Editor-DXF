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

test('opcao 3 registra slot e handler', () => {
  assert.match(appSource, /actionSlotsController\.setSlotMeta\(3,\s*\{/);
  assert.match(appSource, /icon: 'circle-shape'/);
  assert.match(appSource, /actionSlotsController\.registerHandler\(3,\s*\(\) => \{/);
});

test('painel da opcao 3 contem circulo e capsula 90', () => {
  assert.ok(htmlSource.includes('id="option3CommandPanel"'));
  assert.ok(htmlSource.includes('data-option3-type="circle"'));
  assert.ok(htmlSource.includes('data-option3-type="capsule90"'));
  assert.ok(htmlSource.includes('id="option3Radius"'));
  assert.ok(htmlSource.includes('id="option3Span"'));
});

test('opcao 3 cria geometria de circulo e capsula com raio + distancia', () => {
  assert.match(appSource, /function createCircleEntity\(/);
  assert.match(appSource, /function createCapsule90Entities\(/);
  assert.match(appSource, /function applyOption3Command\(/);
  assert.match(appSource, /const radiusMm = parsePositiveMm\(option3RadiusEl\?\.value\);/);
  assert.match(appSource, /const spanMm = parsePositiveMm\(option3SpanEl\?\.value\);/);
});

test('modulo de slots renderiza icone da opcao 3', () => {
  assert.match(slotsSource, /else if \(slot\.icon === 'circle-shape'\)/);
});
