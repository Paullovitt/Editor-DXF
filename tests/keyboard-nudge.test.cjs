const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'src', 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');

test('define passo de nudge em 1 mm', () => {
  assert.match(appSource, /const KEYBOARD_NUDGE_MM = 1;/);
});

test('mapeia as quatro setas para deslocamento de 1 mm', () => {
  assert.ok(appSource.includes("if (key === 'ArrowLeft') return { dx: -KEYBOARD_NUDGE_MM, dy: 0 };"));
  assert.ok(appSource.includes("if (key === 'ArrowRight') return { dx: KEYBOARD_NUDGE_MM, dy: 0 };"));
  assert.ok(appSource.includes("if (key === 'ArrowUp') return { dx: 0, dy: KEYBOARD_NUDGE_MM };"));
  assert.ok(appSource.includes("if (key === 'ArrowDown') return { dx: 0, dy: -KEYBOARD_NUDGE_MM };"));
});

test('keydown aplica nudge no vertice ativo antes da selecao', () => {
  assert.match(appSource, /const movedByVertex = nudgeActiveVertex\(arrowDelta\.dx, arrowDelta\.dy\);/);
  assert.match(appSource, /const moved = movedByVertex \|\| nudgeSelectedEntities\(arrowDelta\.dx, arrowDelta\.dy\);/);
});
