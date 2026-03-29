const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida a Opcao 3 (circulo e capsula 90) com fluxo real no browser.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-option3');

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

function parseEntities(dxfText) {
  const lines = dxfText.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push({ code: String(lines[i] || '').trim(), value: String(lines[i + 1] || '').trim() });
  }
  const entities = [];
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === '0' && ['LINE', 'ARC', 'CIRCLE'].includes(p.value)) {
      const e = { type: p.value };
      i += 1;
      while (i < pairs.length && pairs[i].code !== '0') {
        const pair = pairs[i];
        if (pair.code === '10') e.x1 = Number(pair.value);
        if (pair.code === '20') e.y1 = Number(pair.value);
        if (pair.code === '11') e.x2 = Number(pair.value);
        if (pair.code === '21') e.y2 = Number(pair.value);
        if (pair.code === '40') e.r = Number(pair.value);
        if (pair.code === '50') e.start = Number(pair.value);
        if (pair.code === '51') e.end = Number(pair.value);
        i += 1;
      }
      entities.push(e);
      continue;
    }
    i += 1;
  }
  return entities;
}

function near(a, b, eps = 1e-6) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= eps;
}

async function exportCurrentDxf(page, filePath) {
  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportBtn');
  const download = await downloadPromise;
  await download.saveAs(filePath);
  return fs.readFileSync(filePath, 'utf8');
}

async function runScenario(context, scenario) {
  const page = await context.newPage();
  const screenshotPath = path.join(tempDir, `strong-option3-${scenario.id}.png`);
  const exportPath = path.join(tempDir, `strong-option3-${scenario.id}.dxf`);

  try {
    const pageUrl = `file:///${workspaceRoot.replace(/\\/g, '/')}/index.html`;
    await page.goto(pageUrl);
    await page.waitForSelector('#statusbar');

    await page.click('.option-slot[data-slot-id="3"]');
    await page.waitForSelector('#option3CommandPanel:not([hidden])');
    await page.click(`.option3-type-btn[data-option3-type="${scenario.typeId}"]`);
    await page.fill('#option3Radius', String(scenario.radius));
    if (scenario.typeId === 'capsule90') {
      await page.fill('#option3Span', String(scenario.span));
    }
    await page.click('#option3ApplyBtn');
    await page.waitForTimeout(140);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const exported = await exportCurrentDxf(page, exportPath);
    const entities = parseEntities(exported);
    const lines = entities.filter((e) => e.type === 'LINE');
    const arcs = entities.filter((e) => e.type === 'ARC');
    const circles = entities.filter((e) => e.type === 'CIRCLE');

    if (scenario.typeId === 'circle') {
      if (circles.length !== 1 || lines.length || arcs.length) {
        throw new Error(`[${scenario.id}] Esperado 1 CIRCLE e nenhuma LINE/ARC. Obtido CIRCLE=${circles.length}, LINE=${lines.length}, ARC=${arcs.length}.`);
      }
      if (!near(circles[0].r, scenario.radius, 0.02)) {
        throw new Error(`[${scenario.id}] Raio exportado diferente. Esperado ${scenario.radius}, obtido ${circles[0].r}.`);
      }
    } else {
      if (lines.length !== 2 || arcs.length !== 2 || circles.length !== 0) {
        throw new Error(`[${scenario.id}] Esperado 2 LINE + 2 ARC e 0 CIRCLE. Obtido LINE=${lines.length}, ARC=${arcs.length}, CIRCLE=${circles.length}.`);
      }
      const horizontalCount = lines.filter((ln) => near(ln.y1, ln.y2, 0.01)).length;
      if (horizontalCount !== 2) {
        throw new Error(`[${scenario.id}] Capsula 90 deveria ter 2 linhas horizontais. Obtido ${horizontalCount}.`);
      }
      const invalidArcRadius = arcs.some((a) => !near(a.r, scenario.radius, 0.02));
      if (invalidArcRadius) {
        throw new Error(`[${scenario.id}] Arco da capsula com raio diferente de ${scenario.radius}.`);
      }
    }

    return `${scenario.id}: OK`;
  } finally {
    await page.close();
  }
}

async function run() {
  ensureTempDir();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1400, height: 980 },
  });

  const scenarios = [
    { id: 'circle', typeId: 'circle', radius: 14 },
    { id: 'capsule90', typeId: 'capsule90', radius: 10, span: 48 },
  ];

  try {
    const results = [];
    for (const scenario of scenarios) {
      results.push(await runScenario(context, scenario));
    }
    console.log(`OK strong option3 verify: ${results.join(' | ')}.`);
    console.log(`Screenshots temporarios gerados em: ${tempDir}`);
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
