const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida fluxo real no browser para cada tipo de canto da Opcao 2.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-corner');
const tempDxfPath = path.join(tempDir, 'strong-corner-input.dxf');

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
    if (stat.isFile()) {
      fs.unlinkSync(entryPath);
    }
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
    '11', '200',
    '21', '0',
    '0', 'LINE',
    '8', '0',
    '10', '0',
    '20', '0',
    '11', '0',
    '21', '-200',
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

function parseArcEntities(dxfText) {
  const lines = dxfText.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push({ code: String(lines[i] || '').trim(), value: String(lines[i + 1] || '').trim() });
  }
  const entities = [];
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === '0' && p.value === 'ARC') {
      const e = { type: 'ARC', cx: 0, cy: 0, r: 0, startAngle: 0, endAngle: 0 };
      i += 1;
      while (i < pairs.length && pairs[i].code !== '0') {
        const pair = pairs[i];
        if (pair.code === '10') e.cx = Number(pair.value);
        if (pair.code === '20') e.cy = Number(pair.value);
        if (pair.code === '40') e.r = Number(pair.value);
        if (pair.code === '50') e.startAngle = Number(pair.value);
        if (pair.code === '51') e.endAngle = Number(pair.value);
        i += 1;
      }
      entities.push(e);
      continue;
    }
    i += 1;
  }
  return entities;
}

function isNearZero(value, eps = 1e-6) {
  return Math.abs(Number(value || 0)) <= eps;
}

function normalizeDeg(value) {
  let result = Number(value || 0) % 360;
  if (result < 0) result += 360;
  return result;
}

function positiveSweepDeg(start, end) {
  let sweep = normalizeDeg(end) - normalizeDeg(start);
  if (sweep < 0) sweep += 360;
  return sweep;
}

async function selectLinesForCorner(page) {
  const canvas = page.locator('#viewport');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Nao foi possivel localizar o canvas do viewport.');

  // Primeiro tenta janela de selecao (mais estavel para fluxo real).
  await page.mouse.move(box.x + box.width * 0.03, box.y + box.height * 0.03);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.78, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  let info = await page.locator('#cornerSelectionInfo').innerText();
  const hasTwoOrMore = /\b([2-9]|[1-9]\d+)\s+linha/i.test(info);
  if (hasTwoOrMore) return;

  // Fallback por clique em pontos provaveis das duas linhas.
  const attempts = [
    [0.28, 0.13], // horizontal superior
    [0.11, 0.38], // vertical esquerda
    [0.34, 0.14], // horizontal superior (variacao)
    [0.12, 0.50], // vertical esquerda (variacao)
  ];
  for (const [fx, fy] of attempts) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(60);
    info = await page.locator('#cornerSelectionInfo').innerText();
    if (/\b([2-9]|[1-9]\d+)\s+linha/i.test(info)) return;
  }

  throw new Error(`Selecao de linhas insuficiente para aplicar canto. Info atual: "${info}"`);
}

function validateTrim(lines, scenarioId) {
  const hasOriginalCornerPoint = lines.some((line) => (
    (isNearZero(line.x1) && isNearZero(line.y1)) ||
    (isNearZero(line.x2) && isNearZero(line.y2))
  ));
  if (hasOriginalCornerPoint) {
    throw new Error(`[${scenarioId}] Falha na transformacao: encontrou endpoint (0,0) apos aplicar canto (trim nao aplicado corretamente).`);
  }
}

function validateArcProfile(arcs, scenario) {
  if (!scenario.expectedArcs) return;
  const arc = arcs[0];
  if (!arc) throw new Error(`[${scenario.id}] Falha: arco esperado nao foi encontrado.`);

  const sweep = positiveSweepDeg(arc.startAngle, arc.endAngle);
  if (scenario.expectMajorArc && sweep <= 180) {
    throw new Error(`[${scenario.id}] Falha: esperado arco maior que 180 graus e obtido ${sweep.toFixed(2)}.`);
  }
  if (!scenario.expectMajorArc && sweep > 180) {
    throw new Error(`[${scenario.id}] Falha: esperado arco menor/igual a 180 graus e obtido ${sweep.toFixed(2)}.`);
  }

  if (scenario.centerSide === 'inside') {
    if (!(arc.cx > 0 && arc.cy < 0)) {
      throw new Error(`[${scenario.id}] Falha: centro do arco deveria ficar no lado interno (x>0,y<0). Centro atual: (${arc.cx}, ${arc.cy}).`);
    }
    return;
  }

  if (scenario.centerSide === 'outside') {
    if (!(arc.cx < 0 && arc.cy > 0)) {
      throw new Error(`[${scenario.id}] Falha: centro do arco deveria ficar no lado externo (x<0,y>0). Centro atual: (${arc.cx}, ${arc.cy}).`);
    }
    return;
  }

  if (scenario.centerSide === 'corner') {
    if (!isNearZero(arc.cx) || !isNearZero(arc.cy)) {
      throw new Error(`[${scenario.id}] Falha: centro do arco deveria ficar no vertice (0,0). Centro atual: (${arc.cx}, ${arc.cy}).`);
    }
  }
}

async function runScenario(context, scenario) {
  const page = await context.newPage();
  const screenshotPath = path.join(tempDir, `strong-${scenario.id}.png`);
  const exportPath = path.join(tempDir, `strong-${scenario.id}.dxf`);
  removeFileIfExists(screenshotPath);
  removeFileIfExists(exportPath);

  try {
    const pageUrl = `file:///${workspaceRoot.replace(/\\/g, '/')}/index.html`;
    await page.goto(pageUrl);
    await page.setInputFiles('#fileInput', tempDxfPath);
    await page.waitForSelector('#statusbar');
    await page.waitForFunction(() => {
      const el = document.getElementById('statusbar');
      return Boolean(el && /DXF carregado/i.test(el.textContent || ''));
    });

    await page.click('.option-slot[data-slot-id="2"]');
    await page.waitForSelector('#cornerCommandPanel:not([hidden])');
    await page.click(`.corner-type-btn[data-corner-type="${scenario.typeId}"]`);
    await selectLinesForCorner(page);

    await page.fill('#cornerSize', String(scenario.sizeMm || 10));
    await page.click('#cornerApplyBtn');
    await page.waitForTimeout(180);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportBtn');
    const download = await downloadPromise;
    await download.saveAs(exportPath);

    const exported = fs.readFileSync(exportPath, 'utf8');
    const lines = parseLineEntities(exported);
    const arcs = parseArcEntities(exported);

    if (lines.length !== scenario.expectedLines) {
      throw new Error(`[${scenario.id}] Falha: esperado ${scenario.expectedLines} linhas no DXF exportado, obtido ${lines.length}.`);
    }
    if (arcs.length !== scenario.expectedArcs) {
      throw new Error(`[${scenario.id}] Falha: esperado ${scenario.expectedArcs} arcos no DXF exportado, obtido ${arcs.length}.`);
    }

    validateTrim(lines, scenario.id);
    validateArcProfile(arcs, scenario);

    return {
      id: scenario.id,
      lines: lines.length,
      arcs: arcs.length,
      screenshotPath,
    };
  } finally {
    await page.close();
  }
}

async function run() {
  ensureTempDir();
  writeInputDxf();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1400, height: 1000 },
  });

  const scenarios = [
    {
      id: 'roundOuter',
      typeId: 'roundOuter',
      expectedLines: 2,
      expectedArcs: 1,
      expectMajorArc: false,
      centerSide: 'inside',
    },
    {
      id: 'squareInner',
      typeId: 'squareInner',
      expectedLines: 4,
      expectedArcs: 0,
    },
    {
      id: 'chamfer45',
      typeId: 'chamfer45',
      expectedLines: 3,
      expectedArcs: 0,
    },
    {
      id: 'roundInner',
      typeId: 'roundInner',
      expectedLines: 2,
      expectedArcs: 1,
      expectMajorArc: false,
      centerSide: 'corner',
    },
    {
      id: 'circleInner',
      typeId: 'circleInner',
      expectedLines: 2,
      expectedArcs: 1,
      expectMajorArc: true,
      centerSide: 'inside',
    },
    {
      id: 'circleOuter',
      typeId: 'circleOuter',
      expectedLines: 2,
      expectedArcs: 1,
      expectMajorArc: true,
      centerSide: 'corner',
    },
  ];

  const results = [];
  try {
    for (const scenario of scenarios) {
      const result = await runScenario(context, scenario);
      results.push(result);
    }

    const summary = results
      .map((item) => `${item.id}: ${item.lines} linhas, ${item.arcs} arcos`)
      .join(' | ');
    console.log(`OK strong corner verify: ${summary}.`);
    console.log(`Screenshots temporarios gerados em: ${tempDir}`);
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
