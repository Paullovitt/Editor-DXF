const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida medidas no modo Janela para linha, arco e circulo.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-window');
const tempDxfPath = path.join(tempDir, 'strong-window-input.dxf');
const tempScreenshotPath = path.join(tempDir, 'strong-window-viewport.png');

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
    '10', '-120',
    '20', '40',
    '11', '120',
    '21', '40',
    '0', 'ARC',
    '8', '0',
    '10', '-40',
    '20', '-20',
    '40', '22',
    '50', '15',
    '51', '160',
    '0', 'CIRCLE',
    '8', '0',
    '10', '75',
    '20', '-55',
    '40', '18',
    '0', 'ENDSEC',
    '0', 'EOF',
    '',
  ].join('\n');
  fs.writeFileSync(tempDxfPath, text, 'utf8');
}

async function selectByWindow(page) {
  const canvas = page.locator('#viewport');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Nao foi possivel localizar o canvas do viewport.');

  await page.click('.tool[data-tool="window"]');
  await page.waitForTimeout(80);

  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height * 0.08);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.96, box.y + box.height * 0.92, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(220);
}

async function run() {
  ensureTempDir();
  writeInputDxf();
  removeFileIfExists(tempScreenshotPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
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

    await page.waitForFunction(() => document.querySelectorAll('.measure-label').length >= 3);
    await page.screenshot({ path: tempScreenshotPath, fullPage: true });

    const labels = await page.$$eval('.measure-label', (els) => els.map((el) => (el.textContent || '').trim()));
    if (!labels.length) throw new Error('Nenhuma medida foi desenhada no modo Janela.');

    const hasRadius = labels.some((txt) => /^R\s+\d/.test(txt));
    const hasArcLen = labels.some((txt) => /^A\s+\d/.test(txt));
    const hasDiameter = labels.some((txt) => /^D\s+\d/.test(txt));
    const hasAngle = labels.some((txt) => /^Ang\s+\d/.test(txt));
    const hasCirc = labels.some((txt) => /^C\s+\d/.test(txt));
    const hasLinear = labels.some((txt) => /^\d/.test(txt) && !/^[RADC]/.test(txt));

    if (!hasRadius) throw new Error(`Medida de raio nao encontrada. Labels: ${labels.join(' | ')}`);
    if (!hasArcLen) throw new Error(`Medida de comprimento de arco nao encontrada. Labels: ${labels.join(' | ')}`);
    if (!hasDiameter) throw new Error(`Medida de diametro nao encontrada. Labels: ${labels.join(' | ')}`);
    if (!hasAngle) throw new Error(`Medida angular (graus) nao encontrada. Labels: ${labels.join(' | ')}`);
    if (!hasCirc) throw new Error(`Medida de circunferencia nao encontrada. Labels: ${labels.join(' | ')}`);
    if (!hasLinear) throw new Error(`Medida linear de linha nao encontrada. Labels: ${labels.join(' | ')}`);

    console.log(`OK strong window verify: ${labels.length} labels renderizadas (${labels.join(' | ')}).`);
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
