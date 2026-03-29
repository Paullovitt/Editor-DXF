const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida edicao de medidas no modo Janela com Enter para aplicar.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-window-edit');
const tempDxfPath = path.join(tempDir, 'strong-window-edit-input.dxf');
const tempScreenshotPath = path.join(tempDir, 'strong-window-edit-viewport.png');
const tempExportPath = path.join(tempDir, 'strong-window-edit-export.dxf');

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
    '11', '90',
    '21', '0',
    '0', 'LINE',
    '8', '0',
    '10', '220',
    '20', '0',
    '11', '220',
    '21', '70',
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

function isNear(a, b, eps = 0.02) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= eps;
}

async function selectByWindow(page) {
  const canvas = page.locator('#viewport');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Nao foi possivel localizar o canvas do viewport.');

  await page.click('.tool[data-tool="window"]');
  await page.waitForTimeout(80);

  await page.mouse.move(box.x + box.width * 0.07, box.y + box.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.93, box.y + box.height * 0.82, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(220);
}

async function clickEditableLabelByRegex(page, regexSource) {
  const clicked = await page.evaluate((source) => {
    const rx = new RegExp(source);
    const labels = [...document.querySelectorAll('.measure-label.measure-label--editable')];
    const target = labels.find((el) => rx.test((el.textContent || '').trim()));
    if (!target) return false;
    target.click();
    return true;
  }, regexSource);
  if (!clicked) throw new Error(`Etiqueta editavel nao encontrada para regex: ${regexSource}`);
}

async function applyInputValue(page, value) {
  await page.waitForSelector('.measure-edit-input');
  const input = page.locator('.measure-edit-input');
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.measure-edit-input'));
}

async function labelsText(page) {
  return page.$$eval('.measure-label', (els) => els.map((el) => (el.textContent || '').trim()));
}

async function run() {
  ensureTempDir();
  writeInputDxf();
  removeFileIfExists(tempScreenshotPath);
  removeFileIfExists(tempExportPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1400, height: 980 },
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

    await selectByWindow(page);
    await page.waitForFunction(() => document.querySelectorAll('.measure-label.measure-label--editable').length >= 2);

    // Linha horizontal: 90 -> 140 mm.
    await clickEditableLabelByRegex(page, '^90\\.00 mm$');
    await applyInputValue(page, 140);
    await page.waitForFunction(() => {
      const status = document.getElementById('statusbar');
      return /Linha ajustada para 140\.00 mm\./i.test(status?.textContent || '');
    });

    // Linha vertical: 70 -> 120 mm.
    await clickEditableLabelByRegex(page, '^70\\.00 mm$');
    await applyInputValue(page, 120);
    await page.waitForFunction(() => {
      const status = document.getElementById('statusbar');
      return /Linha ajustada para 120\.00 mm\./i.test(status?.textContent || '');
    });

    await page.waitForTimeout(160);
    await page.screenshot({ path: tempScreenshotPath, fullPage: true });

    const labels = await labelsText(page);
    const hasEditedHorizontal = labels.some((txt) => txt === '140.00 mm');
    const hasEditedVertical = labels.some((txt) => txt === '120.00 mm');
    if (!hasEditedHorizontal) throw new Error(`Medida horizontal editada nao encontrada. Labels: ${labels.join(' | ')}`);
    if (!hasEditedVertical) throw new Error(`Medida vertical editada nao encontrada. Labels: ${labels.join(' | ')}`);

    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportBtn');
    const download = await downloadPromise;
    await download.saveAs(tempExportPath);

    const exported = fs.readFileSync(tempExportPath, 'utf8');
    const lines = parseLineEntities(exported);
    if (lines.length !== 2) {
      throw new Error(`DXF exportado deveria conter 2 linhas, mas retornou ${lines.length}.`);
    }

    const horizontal = lines.find((line) => isNear(line.y1, 0) && isNear(line.y2, 0));
    const vertical = lines.find((line) => isNear(line.x1, 220) && isNear(line.x2, 220));
    if (!horizontal) throw new Error('Linha horizontal nao encontrada no DXF exportado.');
    if (!vertical) throw new Error('Linha vertical nao encontrada no DXF exportado.');

    const hMinX = Math.min(horizontal.x1, horizontal.x2);
    const hMaxX = Math.max(horizontal.x1, horizontal.x2);
    const vMinY = Math.min(vertical.y1, vertical.y2);
    const vMaxY = Math.max(vertical.y1, vertical.y2);

    if (!isNear(hMinX, 0) || !isNear(hMaxX, 140)) {
      throw new Error(`Linha horizontal nao manteve ancora no vertice esperado (x=0 -> x=140). Obtido: (${horizontal.x1},${horizontal.y1}) -> (${horizontal.x2},${horizontal.y2}).`);
    }
    if (!isNear(vMinY, 0) || !isNear(vMaxY, 120)) {
      throw new Error(`Linha vertical nao manteve ancora no vertice esperado (y=0 -> y=120). Obtido: (${vertical.x1},${vertical.y1}) -> (${vertical.x2},${vertical.y2}).`);
    }

    console.log(`OK strong window edit verify: Enter aplicou medidas com ancora (H: ${hMinX.toFixed(2)} -> ${hMaxX.toFixed(2)}, V: ${vMinY.toFixed(2)} -> ${vMaxY.toFixed(2)}).`);
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
