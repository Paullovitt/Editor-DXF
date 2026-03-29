const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida clique no modo Janela selecionando 1 vertice/linha.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-window-click');
const tempDxfPath = path.join(tempDir, 'strong-window-click-input.dxf');
const tempScreenshotPath = path.join(tempDir, 'strong-window-click-viewport.png');

function ensureTempDir() {
  fs.mkdirSync(tempDir, { recursive: true });
}

function cleanupTempDir() {
  if (!fs.existsSync(tempDir)) return;
  for (const entry of fs.readdirSync(tempDir)) {
    const filePath = path.join(tempDir, entry);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) fs.unlinkSync(filePath);
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
    '10', '-130',
    '20', '-20',
    '11', '-20',
    '21', '-20',
    '0', 'LINE',
    '8', '0',
    '10', '20',
    '20', '-20',
    '11', '130',
    '21', '-20',
    '0', 'ENDSEC',
    '0', 'EOF',
    '',
  ].join('\n');
  fs.writeFileSync(tempDxfPath, text, 'utf8');
}

async function run() {
  ensureTempDir();
  writeInputDxf();

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

    await page.click('.tool[data-tool="window"]');
    await page.waitForTimeout(80);

    const canvas = page.locator('#viewport');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Nao foi possivel localizar o canvas do viewport.');

    // Clique simples em pontos provaveis da linha (sem arrastar).
    const attempts = [
      [0.32, 0.50],
      [0.38, 0.50],
      [0.45, 0.50],
      [0.55, 0.50],
      [0.62, 0.50],
    ];
    let statusText = '';
    for (const [fx, fy] of attempts) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(160);
      statusText = await page.locator('#statusbar').innerText();
      if (/Janela:\s*1\s+vertice\(s\)\/linha\(s\)\s+selecionada\(s\)\s+por clique\./i.test(statusText)) break;
    }
    await page.screenshot({ path: tempScreenshotPath, fullPage: true });

    if (!/Janela:\s*1\s+vertice\(s\)\/linha\(s\)\s+selecionada\(s\)\s+por clique\./i.test(statusText)) {
      throw new Error(`Status inesperado para clique em Janela. Obtido: "${statusText}"`);
    }

    const labelsCount = await page.$$eval('.measure-label', (els) => els.length);
    if (labelsCount < 1) {
      throw new Error('Esperava ao menos 1 medida apos selecionar por clique no modo Janela.');
    }

    console.log(`OK strong window click verify: status e medidas validos (labels: ${labelsCount}).`);
    console.log(`Screenshot temporario gerado em: ${tempScreenshotPath}`);
  } finally {
    await context.close();
    await browser.close();
    cleanupTempDir();
  }
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
