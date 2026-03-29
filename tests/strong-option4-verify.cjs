const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = 'C:/Users/USER/Downloads/CODIGOS/codex_Editor/node_modules/playwright';
// Execucao forte: valida Opcao 4 (ligacao de poligonos) nos modos X/Y e reta solta.
const { chromium } = require(playwrightPath);

const workspaceRoot = path.resolve(__dirname, '..');
const tempDir = path.join(workspaceRoot, '.tmp-strong-option4');
const tempDxfPath = path.join(tempDir, 'strong-option4-input.dxf');
const tempScreenshotPath = path.join(tempDir, 'strong-option4-viewport.png');
const tempExportPath = path.join(tempDir, 'strong-option4-export.dxf');

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
    // Poligono 1
    '0', 'LWPOLYLINE',
    '8', '0',
    '90', '4',
    '70', '1',
    '10', '-260', '20', '-120',
    '10', '-80', '20', '-120',
    '10', '-80', '20', '120',
    '10', '-260', '20', '120',
    // Poligono 2
    '0', 'LWPOLYLINE',
    '8', '0',
    '90', '4',
    '70', '1',
    '10', '80', '20', '-100',
    '10', '260', '20', '-100',
    '10', '260', '20', '100',
    '10', '80', '20', '100',
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

async function clickAtFraction(page, fx, fy) {
  const canvas = page.locator('#viewport');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Nao foi possivel localizar o canvas do viewport.');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(80);
}

async function clickUntilStatus(page, attempts, statusRegex, failMessage) {
  for (const [fx, fy] of attempts) {
    await clickAtFraction(page, fx, fy);
    const status = await page.locator('#statusbar').innerText();
    if (statusRegex.test(status)) return;
  }
  const status = await page.locator('#statusbar').innerText();
  throw new Error(`${failMessage}. Status atual: "${status}"`);
}

function regionAttempts(minFx, maxFx, minFy, maxFy, stepsX = 4, stepsY = 4) {
  const out = [];
  for (let iy = 0; iy <= stepsY; iy += 1) {
    for (let ix = 0; ix <= stepsX; ix += 1) {
      const fx = minFx + (maxFx - minFx) * (ix / Math.max(1, stepsX));
      const fy = minFy + (maxFy - minFy) * (iy / Math.max(1, stepsY));
      out.push([Number(fx.toFixed(4)), Number(fy.toFixed(4))]);
    }
  }
  return out;
}

function isNear(a, b, eps = 0.02) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= eps;
}

function lineLength(line) {
  return Math.hypot((line.x2 || 0) - (line.x1 || 0), (line.y2 || 0) - (line.y1 || 0));
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

    await page.click('.option-slot[data-slot-id="4"]');
    await page.waitForSelector('#linkCommandPanel:not([hidden])');
    await page.waitForFunction(() => {
      const info = document.getElementById('linkSelectionInfo');
      return /alvo\(s\) pronto\(s\)/i.test(info?.textContent || '');
    });

    // Modo X/Y: seleciona dois vertices em alturas diferentes para forcar 2 segmentos ortogonais.
    await clickUntilStatus(page, regionAttempts(0.26, 0.44, 0.26, 0.44), /ponto inicial definido/i, 'Nao conseguiu definir ponto inicial da ligacao X/Y');
    await clickUntilStatus(page, regionAttempts(0.56, 0.74, 0.56, 0.74), /ligacao\(oes\) criada\(s\) no modo Reta X\/Y/i, 'Nao conseguiu concluir ligacao X/Y');

    // Modo solto: limpa inicio para fluxo novo e cria uma diagonal.
    await page.click('#linkClearStartBtn');
    await page.click('.link-type-btn[data-link-mode="free"]');
    await clickUntilStatus(page, regionAttempts(0.26, 0.44, 0.56, 0.74), /ponto inicial definido/i, 'Nao conseguiu definir ponto inicial da ligacao solta');
    await clickUntilStatus(page, regionAttempts(0.56, 0.74, 0.26, 0.44), /ligacao\(oes\) criada\(s\) no modo Reta solta/i, 'Nao conseguiu concluir ligacao solta');

    // Modo linha livre X/Y: origem por clique e aplicacao por Enter nos campos X/Y com Tab.
    await page.click('.link-type-btn[data-link-mode="axisFree"]');
    await clickAtFraction(page, 0.34, 0.34);
    await page.waitForFunction(() => {
      const status = document.getElementById('statusbar');
      return /origem definida/i.test(status?.textContent || '');
    });

    await page.click('#linkAxisXValue');
    await page.fill('#linkAxisXValue', '200');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const status = document.getElementById('statusbar');
      return /linha livre criada no eixo X com 200\.00 mm/i.test(status?.textContent || '');
    });

    await page.click('#linkAxisXValue');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.activeElement?.id === 'linkAxisYValue');
    await page.fill('#linkAxisYValue', '-200');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const status = document.getElementById('statusbar');
      return /linha livre criada no eixo Y com -200\.00 mm/i.test(status?.textContent || '');
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportBtn');
    const download = await downloadPromise;
    await download.saveAs(tempExportPath);
    await page.screenshot({ path: tempScreenshotPath, fullPage: true });

    const exported = fs.readFileSync(tempExportPath, 'utf8');
    const lines = parseLineEntities(exported);
    if (lines.length < 5) {
      throw new Error(`Opcao 4 deveria gerar no minimo 5 linhas de ligacao, mas exportou ${lines.length}.`);
    }

    const orthLines = lines.filter((line) => isNear(line.x1, line.x2) || isNear(line.y1, line.y2));
    if (orthLines.length < 2) {
      throw new Error(`Nao encontrou duas ligacoes ortogonais (X/Y). Linhas: ${JSON.stringify(lines)}`);
    }

    const axisXLine = lines.find((line) => isNear(Math.abs(line.x2 - line.x1), 200, 0.3) && isNear(line.y1, line.y2, 0.02));
    const axisYLine = lines.find((line) => isNear(Math.abs(line.y2 - line.y1), 200, 0.3) && isNear(line.x1, line.x2, 0.02));
    if (!axisXLine) {
      throw new Error(`Nao encontrou linha livre no eixo X com 200 mm. Linhas: ${JSON.stringify(lines)}`);
    }
    if (!axisYLine) {
      throw new Error(`Nao encontrou linha livre no eixo Y com -200 mm (modulo 200). Linhas: ${JSON.stringify(lines)}`);
    }

    const nonAxisLines = lines.filter((line) => (
      !isNear(Math.abs(line.x2 - line.x1), 200, 0.3)
      && !isNear(Math.abs(line.y2 - line.y1), 200, 0.3)
    ));
    if (nonAxisLines.length < 3) {
      throw new Error(`Esperado pelo menos 3 linhas geradas pelos modos X/Y + solta. Obtido ${nonAxisLines.length}. Linhas: ${JSON.stringify(lines)}`);
    }

    console.log(`OK strong option4 verify: ${nonAxisLines.length} linha(s) de ligacao + eixo X=${lineLength(axisXLine).toFixed(2)} e eixo Y=${lineLength(axisYLine).toFixed(2)}.`);
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
