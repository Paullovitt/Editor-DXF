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
  assert.match(appSource, /drawLinearDimension\(left, right, `D \$\{mm\(item\.r \* 2\)\}`\);/);
  assert.match(appSource, /drawRadiusLeader\(\{ x: item\.cx, y: item\.cy \}, item\.r, Math\.PI \/ 4, `R \$\{mm\(item\.r\)\}`\);/);
  assert.match(appSource, /drawArcLengthTag\(item\);/);
  assert.match(appSource, /`A \$\{mm\(arcLen\)\}`/);
});
