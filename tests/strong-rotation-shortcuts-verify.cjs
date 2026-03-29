const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida atalhos T/Y (1 grau) e indicador visual de angulo na tela.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-rotation');
const tempDxfPath = path.join(tempDir, 'strong-rotation-input.dxf');
const tempScreenshotPath = path.join(tempDir, 'strong-rotation-viewport.png');
const exportAfterYPath = path.join(tempDir, 'strong-rotation-after-y.dxf');
const exportAfterTPath = path.join(tempDir, 'strong-rotation-after-t.dxf');

function ensureTempDir() {
  fs.mkdirSync(tempDir, { recursive: true });
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function cleanupTempDir() {
  if (!fs.existsSync(tempDir)) return;
  for (const entry of fs.readdirSync(tempDir)) {
    const entryPath = path.join(tempDir, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isFile()) fs.unlinkSync(entryPath);
  }
  const rest = fs.readdirSync(tempDir);
  if (!rest.length) fs.rmdirSync(tempDir);
}

function writeInputDxf() {
  const text = [
    '0', 'SECTION',
    '2', 'ENTITIES',
    '0', 'LINE',
    '8', '0',
    '10', '0',
    '20', '0',
    '11', '120',
    '21', '0',
    '0', 'ENDSEC',
    '0', 'EOF',
    '',
  ].join('\n');
  fs.writeFileSync(tempDxfPath, text, 'utf8');
}

function parseLineEntities(dxfText) {
  const lines = dxfText.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push({ code: String(lines[i] || '').trim(), value: String(lines[i + 1] || '').trim() });
  }
  const entities = [];
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === '0' && p.value === 'LINE') {
      const e = { type: 'LINE', x1: 0, y1: 0, x2: 0, y2: 0 };
      i += 1;
      while (i < pairs.length && pairs[i].code !== '0') {
        const pair = pairs[i];
        if (pair.code === '10') e.x1 = Number(pair.value);
        if (pair.code === '20') e.y1 = Number(pair.value);
        if (pair.code === '11') e.x2 = Number(pair.value);
        if (pair.code === '21') e.y2 = Number(pair.value);
        i += 1;
      }
      entities.push(e);
      continue;
    }
    i += 1;
  }
  return entities;
}

function lineSignedAngleDeg(line) {
  const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180 / Math.PI;
  let signed = angle;
  while (signed <= -180) signed += 360;
  while (signed > 180) signed -= 360;
  return signed;
}

function assertNear(value, expected, tolerance, message) {
  if (Math.abs(value - expected) > tolerance) {
    throw new Error(`${message}. Esperado ${expected} +/- ${tolerance}, obtido ${value}.`);
  }
}

async function selectSingleLine(page) {
  const canvas = page.locator('#viewport');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Nao foi possivel localizar o canvas do viewport.');

  await page.click('.tool[data-tool="select"]');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForFunction(() => {
    const info = document.getElementById('selectionInfo');
    return /1 peca selecionada\./i.test(info?.textContent || '');
  });
}

async function exportCurrent(page, outputPath) {
  removeFileIfExists(outputPath);
  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportBtn');
  const download = await downloadPromise;
  await download.saveAs(outputPath);
}

async function run() {
  ensureTempDir();
  writeInputDxf();
  removeFileIfExists(tempScreenshotPath);
  removeFileIfExists(exportAfterYPath);
  removeFileIfExists(exportAfterTPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1360, height: 900 },
  });
  const page = await context.newPage();

  try {
    const pageUrl = `file:///${workspaceRoot.replace(/\\/g, '/')}/index.html`;
    await page.goto(pageUrl);
    await page.setInputFiles('#fileInput', tempDxfPath);
    await page.waitForFunction(() => {
      const el = document.getElementById('statusbar');
      return Boolean(el && /DXF carregado/i.test(el.textContent || ''));
    });

    await selectSingleLine(page);

    await page.keyboard.press('y');
    await page.waitForFunction(() => {
      const el = document.getElementById('statusbar');
      return /Rotacao aplicada: 1\.00 deg para direita\./i.test(el?.textContent || '');
    });
    await page.waitForSelector('#rotationHud:not([hidden])');
    await page.waitForFunction(() => {
      const value = document.querySelector('#rotationHud .rotation-hud-value');
      return /1\.00 deg \(Dir\)/i.test(value?.textContent || '');
    });

    await exportCurrent(page, exportAfterYPath);
    const exportedAfterY = fs.readFileSync(exportAfterYPath, 'utf8');
    const linesAfterY = parseLineEntities(exportedAfterY);
    if (linesAfterY.length !== 1) throw new Error(`Export apos Y deveria ter 1 linha e retornou ${linesAfterY.length}.`);
    const angleAfterY = lineSignedAngleDeg(linesAfterY[0]);
    assertNear(angleAfterY, -1, 0.15, 'Atalho Y nao rotacionou 1 grau para direita');

    await page.keyboard.press('t');
    await page.waitForFunction(() => {
      const el = document.getElementById('statusbar');
      return /Rotacao aplicada: 1\.00 deg para esquerda\./i.test(el?.textContent || '');
    });
    await exportCurrent(page, exportAfterTPath);
    const exportedAfterT = fs.readFileSync(exportAfterTPath, 'utf8');
    const linesAfterT = parseLineEntities(exportedAfterT);
    if (linesAfterT.length !== 1) throw new Error(`Export apos T deveria ter 1 linha e retornou ${linesAfterT.length}.`);
    const angleAfterT = lineSignedAngleDeg(linesAfterT[0]);
    assertNear(angleAfterT, 0, 0.15, 'Atalho T nao retornou 1 grau para esquerda');

    await page.screenshot({ path: tempScreenshotPath, fullPage: true });
    console.log(`OK strong rotation verify: Y=-1 deg, T=+1 deg, HUD visivel com angulo.`);
    console.log(`Screenshot temporario gerado em: ${tempScreenshotPath}`);
  } finally {
    await context.close();
    await browser.close();
    // Regra da execucao forte: apagar PNGs temporarios apos validacao visual.
    cleanupTempDir();
  }
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
