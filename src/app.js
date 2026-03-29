(() => {
const model = window.DxfModel;
const io = window.DxfIO;
if (!model) throw new Error('DxfModel nao encontrado. Carregue src/model.js antes de src/app.js.');
if (!io) throw new Error('DxfIO nao encontrado. Carregue src/dxf.js antes de src/app.js.');

const { parseDxf, exportDxf } = io;
const {
  GRID_SIZE, createEmptyDoc, cloneDoc, ensureLayers, getLayer, isEntityEditable, docBounds,
  translateEntity, rotateEntity, scaleEntity, mirrorEntity, duplicateEntity, getEntitySnapPoints, deleteSelected,
  updateVertex, distance, entityBounds, entityIntersectsRect
} = model;
const OrbitControls = THREE.OrbitControls;

const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput');
const viewport = $('viewport');
const viewportWrap = $('viewportWrap');
const labelsLayer = $('labelsLayer');
labelsLayer.style.display = 'none';
const selectionRectEl = $('selectionRect');
const rectDraftRectEl = $('rectDraftRect');
const rectCommandPanelEl = $('rectCommandPanel');
const rectSizeXEl = $('rectSizeX');
const rectSizeYEl = $('rectSizeY');
const rectCreateBtnEl = $('rectCreateBtn');
const option3CommandPanelEl = $('option3CommandPanel');
const option3RadiusEl = $('option3Radius');
const option3SpanEl = $('option3Span');
const option3SpanWrapEl = $('option3SpanWrap');
const option3ApplyBtnEl = $('option3ApplyBtn');
const option3TypeButtons = [...document.querySelectorAll('.option3-type-btn')];
const linkCommandPanelEl = $('linkCommandPanel');
const linkClearStartBtnEl = $('linkClearStartBtn');
const linkSelectionInfoEl = $('linkSelectionInfo');
const linkTypeButtons = [...document.querySelectorAll('.link-type-btn')];
const linkAxisControlsEl = $('linkAxisControls');
const linkAxisXValueEl = $('linkAxisXValue');
const linkAxisYValueEl = $('linkAxisYValue');
const linkAxisApplyBtnEl = $('linkAxisApplyBtn');
const cornerCommandPanelEl = $('cornerCommandPanel');
const cornerSizeEl = $('cornerSize');
const cornerApplyBtnEl = $('cornerApplyBtn');
const cornerClearBtnEl = $('cornerClearBtn');
const cornerSelectionInfoEl = $('cornerSelectionInfo');
const cornerTypeButtons = [...document.querySelectorAll('.corner-type-btn')];
const dropHint = $('dropHint');
const statusbar = $('statusbar');
const layersEl = $('layers');
const selectionInfoEl = $('selectionInfo');
const propertiesEl = $('properties');
const actionSlotsEl = $('actionSlots');
const actionCardEl = $('actionCard');
const toolButtons = [...document.querySelectorAll('.tool')];
const showGridEl = $('showGrid');
const snapGridEl = $('snapGrid');
const snapPointsEl = $('snapPoints');
const actionSlotsApi = window.DxfActionSlots;
if (!actionSlotsApi) throw new Error('DxfActionSlots nao encontrado. Carregue src/slots/action-slots.js antes de src/app.js.');
const rotationHudEl = document.createElement('div');
rotationHudEl.id = 'rotationHud';
rotationHudEl.className = 'rotation-hud';
rotationHudEl.hidden = true;
rotationHudEl.innerHTML = `
  <svg class="rotation-hud-svg" viewBox="-58 -58 116 116" aria-hidden="true">
    <line class="rotation-hud-base" x1="0" y1="0" x2="38" y2="0"></line>
    <line class="rotation-hud-arm" x1="0" y1="0" x2="38" y2="0"></line>
    <path class="rotation-hud-arc" d="M 38 0"></path>
    <circle class="rotation-hud-center" cx="0" cy="0" r="2"></circle>
  </svg>
  <div class="rotation-hud-value">0.00 deg</div>
`;
viewportWrap.appendChild(rotationHudEl);
const rotationHudArmEl = rotationHudEl.querySelector('.rotation-hud-arm');
const rotationHudArcEl = rotationHudEl.querySelector('.rotation-hud-arc');
const rotationHudValueEl = rotationHudEl.querySelector('.rotation-hud-value');

const renderer = new THREE.WebGLRenderer({ canvas: viewport, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x020617, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1000, 1000);
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.screenSpacePanning = true;
controls.enableZoom = false;
controls.enableDamping = false;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;

const gridRoot = new THREE.Group();
const workRoot = new THREE.Group();
const handlesRoot = new THREE.Group();
const measureRoot = new THREE.Group();
scene.add(gridRoot, workRoot, handlesRoot, measureRoot);

const raycaster = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

let doc = createEmptyDoc();
let selectedIds = new Set();
let hoveredHandle = null;
let activeHandle = null;
let tool = 'select';
let dragState = null;
let meshByEntityId = new Map();
let measurementLabels = [];
let activeMeasurementEditor = null;
let currentFileName = 'editado.dxf';
let undoStack = [];
let redoStack = [];
let needsRender = true;
let pendingZoom = null;
let rectangleCommandOpen = false;
let option3CommandOpen = false;
let linkCommandOpen = false;
let cornerCommandOpen = false;
let option3Type = 'circle';
let linkMode = 'orthXY';
let linkAxis = 'x';
let linkStartPick = null;
let linkAxisAnchor = null;
let cornerType = 'roundOuter';
let rotationHudState = null;
let rotationHudHideTimer = null;
const ENTITY_PICK_RADIUS_PX = 2;
const VERTEX_PICK_RADIUS_PX = 14;
const VERTEX_DRAG_DEADZONE_PX = 3;
const VERTEX_DRAG_CLICK_GUARD_PX = 8;
const VERTEX_DRAG_CLICK_GUARD_MS = 180;
const KEYBOARD_NUDGE_MM = 1;
const KEYBOARD_ROTATE_STEP_DEG = 1;
const OPTION3_DEFAULT_RADIUS_MM = 10;
const OPTION3_DEFAULT_SPAN_MM = 40;
const OPTION3_TYPE_IDS = new Set(['circle', 'capsule90']);
const LINK_MODE_IDS = new Set(['orthXY', 'free', 'axisFree']);
const LINK_AXIS_IDS = new Set(['x', 'y']);
const LINK_AXIS_DEFAULT_MM = 200;
const CORNER_DEFAULT_MM = 10;
const CORNER_MIN_PICK_COUNT = 2;
const LINE_CONNECTION_TOLERANCE_MM = 0.05;
const LINK_PICK_RADIUS_PX = 26;
const ROTATION_HUD_TIMEOUT_MS = 1400;
const ROTATION_HUD_RADIUS_PX = 38;
const ROTATION_HUD_PIVOT_TOL_MM = 0.25;
const CORNER_TYPE_IDS = new Set([
  'roundOuter',
  'squareInner',
  'chamfer45',
  'roundInner',
  'circleInner',
  'circleOuter',
]);
// Handles amarelos ampliados para melhorar visibilidade no modo Vertices.
const YELLOW_HANDLE_SCALE = 0.6;
const HANDLE_BASE_RADIUS = 1.25;

function setStatus(msg) { statusbar.textContent = msg; }
function requestRender() { needsRender = true; }
function mm(v) { return `${Number(v || 0).toFixed(2)} mm`; }
function deg(v) { return `${Number(v || 0).toFixed(2)} deg`; }
function entityById(id) { return doc.entities.find((e) => e.id === id); }
function sameHandleRef(a, b) {
  if (!a || !b) return false;
  return a.entityId === b.entityId && String(a.vertexIndex) === String(b.vertexIndex);
}
function setHoveredHandle(nextHandle) {
  if (sameHandleRef(hoveredHandle, nextHandle)) return;
  hoveredHandle = nextHandle ? { entityId: nextHandle.entityId, vertexIndex: nextHandle.vertexIndex } : null;
  updateHandleVisualScale();
  requestRender();
}
function setActiveHandle(nextHandle) {
  if (sameHandleRef(activeHandle, nextHandle)) return;
  activeHandle = nextHandle ? { entityId: nextHandle.entityId, vertexIndex: nextHandle.vertexIndex } : null;
  updateHandleVisualScale();
  requestRender();
}
function fileCodeFromName(fileName = '') {
  const tail = String(fileName || '').trim().replace(/\\/g, '/').split('/').pop() || '';
  return tail.replace(/\.[^.]+$/, '').trim();
}
function currentPieceCode() {
  return fileCodeFromName(doc?.meta?.pieceCode || doc?.meta?.fileName || currentFileName || '') || 'Sem codigo';
}
function currentPieceSize() {
  const bounds = docBounds(doc, false);
  return {
    x: Math.max(0, bounds.maxX - bounds.minX),
    y: Math.max(0, bounds.maxY - bounds.minY),
  };
}
// Controller dedicado aos slots/execucoes para manter o app.js focado na edicao DXF.
const actionSlotsController = actionSlotsApi.createController({
  slotsEl: actionSlotsEl,
  cardEl: actionCardEl,
  getToolId: () => tool,
  getSelectedCount: () => selectedIds.size,
  setStatus,
});
function updateActionSlotAvailability() {
  actionSlotsController.updateAvailability();
}
function renderActionCard() {
  actionSlotsController.renderCard();
}
function renderActionSlots() {
  actionSlotsController.renderSlots();
}
actionSlotsController.setSlotMeta(1, {
  label: 'Criar retangulo',
  icon: 'cube',
  allowedTools: ['select', 'vertex', 'window'],
});
actionSlotsController.registerHandler(1, () => {
  const opened = openRectCommand();
  return opened
    ? { ok: true, detail: 'Opcao 1 ativa: informe X e Y (mm) para criar retangulo.' }
    : { ok: false, detail: 'Nao foi possivel abrir a Opcao 1.' };
});
actionSlotsController.setSlotMeta(2, {
  label: 'Criar cantos',
  icon: 'corner',
  allowedTools: ['select', 'vertex', 'window'],
});
actionSlotsController.registerHandler(2, () => {
  const opened = openCornerCommand();
  return opened
    ? { ok: true, detail: 'Opcao 2 ativa: selecione linhas (vertices) em pares e aplique o tipo de canto.' }
    : { ok: false, detail: 'Nao foi possivel abrir a Opcao 2.' };
});
actionSlotsController.setSlotMeta(3, {
  label: 'Criar circulos',
  icon: 'circle-shape',
  allowedTools: ['select', 'vertex', 'window'],
});
actionSlotsController.registerHandler(3, () => {
  const opened = openOption3Command();
  return opened
    ? { ok: true, detail: 'Opcao 3 ativa: escolha circulo ou capsula 90 e informe as medidas em mm.' }
    : { ok: false, detail: 'Nao foi possivel abrir a Opcao 3.' };
});
actionSlotsController.setSlotMeta(4, {
  label: 'Ligacao por poligono',
  icon: 'link-line',
  allowedTools: ['select', 'vertex', 'window'],
});
actionSlotsController.registerHandler(4, () => {
  const opened = openLinkCommand();
  return opened
    ? { ok: true, detail: 'Opcao 4 ativa: clique em pontos de linhas/poligonos para criar ligacoes.' }
    : { ok: false, detail: 'Nao foi possivel abrir a Opcao 4.' };
});
function selectionPivot() {
  const entities = [...selectedIds].map((id) => entityById(id)).filter(Boolean);
  if (!entities.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entity of entities) {
    const b = entityBounds(entity);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
function transformSelection(label, fn) {
  const entities = [...selectedIds].map((id) => entityById(id)).filter(Boolean);
  if (!entities.length) return false;
  const pivot = selectionPivot();
  pushUndo(label);
  for (const entity of entities) fn(entity, pivot);
  rebuildScene();
  refreshUi();
  return true;
}
function rotationDirectionLabel(angleDeg) {
  return angleDeg >= 0 ? 'esquerda' : 'direita';
}

function normalizeAccumulatedRotation(angleDeg) {
  let normalized = Number(angleDeg) || 0;
  if (normalized > 360 || normalized < -360) normalized %= 360;
  return normalized;
}

function updateRotationHudPosition() {
  if (!rotationHudState || rotationHudEl.hidden) return;
  const screen = screenFromWorld(rotationHudState.pivot);
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
  rotationHudEl.style.left = `${screen.x}px`;
  rotationHudEl.style.top = `${screen.y}px`;
}

function rotationHudArcPath(angleDeg, radiusPx) {
  const safeRadius = Math.max(1, Number(radiusPx) || 1);
  const safeAngle = Number(angleDeg) || 0;
  if (Math.abs(safeAngle) < 0.001) return `M ${safeRadius.toFixed(2)} 0`;
  const steps = Math.max(10, Math.ceil(Math.abs(safeAngle) / 6));
  let path = `M ${safeRadius.toFixed(2)} 0`;
  for (let i = 1; i <= steps; i += 1) {
    const a = THREE.MathUtils.degToRad(safeAngle * (i / steps));
    const x = Math.cos(a) * safeRadius;
    const y = -Math.sin(a) * safeRadius;
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

function renderRotationHud() {
  if (!rotationHudState) return;
  const angleDeg = Number(rotationHudState.totalDeg) || 0;
  const angleRad = THREE.MathUtils.degToRad(angleDeg);
  const x = Math.cos(angleRad) * ROTATION_HUD_RADIUS_PX;
  const y = -Math.sin(angleRad) * ROTATION_HUD_RADIUS_PX;
  rotationHudArmEl?.setAttribute('x2', x.toFixed(2));
  rotationHudArmEl?.setAttribute('y2', y.toFixed(2));
  rotationHudArcEl?.setAttribute('d', rotationHudArcPath(angleDeg, ROTATION_HUD_RADIUS_PX));
  if (rotationHudValueEl) {
    const direction = angleDeg >= 0 ? 'Esq' : 'Dir';
    rotationHudValueEl.textContent = `${Math.abs(angleDeg).toFixed(2)} deg (${direction})`;
  }
  rotationHudEl.hidden = false;
  updateRotationHudPosition();
}

function hideRotationHud() {
  if (rotationHudHideTimer) {
    clearTimeout(rotationHudHideTimer);
    rotationHudHideTimer = null;
  }
  rotationHudState = null;
  rotationHudEl.hidden = true;
}

function showRotationHud(pivot, deltaDeg) {
  if (!pivot || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return;
  const nowMs = performance.now();
  const previous = rotationHudState;
  const samePivot = Boolean(previous && distance(previous.pivot, pivot) <= ROTATION_HUD_PIVOT_TOL_MM);
  const continuous = Boolean(previous && samePivot && (nowMs - previous.updatedAtMs) <= ROTATION_HUD_TIMEOUT_MS);
  const totalDeg = normalizeAccumulatedRotation((continuous ? previous.totalDeg : 0) + deltaDeg);
  rotationHudState = {
    pivot: { x: pivot.x, y: pivot.y },
    totalDeg,
    updatedAtMs: nowMs,
  };
  renderRotationHud();
  if (rotationHudHideTimer) clearTimeout(rotationHudHideTimer);
  rotationHudHideTimer = setTimeout(() => hideRotationHud(), ROTATION_HUD_TIMEOUT_MS);
}

function rotateSelected(angleDeg) {
  const hasSelection = selectedIds.size > 0;
  if (!hasSelection) {
    setStatus('Selecione uma peca para rotacionar.');
    return false;
  }
  const pivot = selectionPivot();
  const changed = transformSelection(`rotacionar ${angleDeg}`, (entity, center) => rotateEntity(entity, angleDeg, center));
  if (!changed) {
    setStatus('Selecione uma peca para rotacionar.');
    return false;
  }
  showRotationHud(pivot, angleDeg);
  setStatus(`Rotacao aplicada: ${Math.abs(angleDeg).toFixed(2)} deg para ${rotationDirectionLabel(angleDeg)}.`);
  return true;
}

// Converte seta do teclado em deslocamento fixo (1 mm por toque).
function arrowDeltaFromKey(key) {
  if (key === 'ArrowLeft') return { dx: -KEYBOARD_NUDGE_MM, dy: 0 };
  if (key === 'ArrowRight') return { dx: KEYBOARD_NUDGE_MM, dy: 0 };
  if (key === 'ArrowUp') return { dx: 0, dy: KEYBOARD_NUDGE_MM };
  if (key === 'ArrowDown') return { dx: 0, dy: -KEYBOARD_NUDGE_MM };
  return null;
}

// No modo Vertices, prioriza o ponto ativo para ajuste fino por teclado.
function nudgeActiveVertex(dx, dy) {
  if (tool !== 'vertex' || !activeHandle) return false;
  const entity = entityById(activeHandle.entityId);
  if (!entity) return false;
  const current = getVertexPosition(entity, activeHandle.vertexIndex);
  if (!current) return false;

  pushUndo('mover vertice (1 mm)');
  updateVertex(entity, activeHandle.vertexIndex, {
    x: current.x + dx,
    y: current.y + dy,
  });
  updateEntityObject(entity.id);
  buildHandles();
  rebuildMeasurements();
  updateLabelPositions();
  refreshSelectionInfo();
  updateRectangleDraftPreview();
  requestRender();
  return true;
}

// Sem ponto ativo, desloca a selecao de entidades no mesmo passo.
function nudgeSelectedEntities(dx, dy) {
  const entities = [...selectedIds].map((id) => entityById(id)).filter(Boolean);
  if (!entities.length) return false;

  pushUndo('mover selecao (1 mm)');
  for (const entity of entities) translateEntity(entity, dx, dy);
  rebuildScene();
  refreshUi();
  updateRectangleDraftPreview();
  return true;
}

function pushUndo(label = 'alteracao') {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
  setStatus(`Historico: ${label}.`);
}

function restoreFrom(serialized) {
  doc = JSON.parse(serialized);
  ensureLayers(doc);
  selectedIds.clear();
  hoveredHandle = null;
  activeHandle = null;
  hideRotationHud();
  closeRectCommand({ silent: true });
  closeOption3Command({ silent: true });
  closeLinkCommand({ silent: true });
  closeCornerCommand({ silent: true });
  rebuildScene();
  refreshUi();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(doc));
  restoreFrom(undoStack.pop());
  setStatus('Undo.');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(doc));
  restoreFrom(redoStack.pop());
  setStatus('Redo.');
}

function resize() {
  const width = viewport.clientWidth || viewportWrap.clientWidth;
  const height = viewport.clientHeight || viewportWrap.clientHeight;
  renderer.setSize(width, height, false);
  const aspect = Math.max(1e-6, width / Math.max(1, height));
  const halfH = 100 / camera.zoom;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  requestRender();
}

function worldFromClient(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  camera.updateMatrixWorld();
  raycaster.setFromCamera(mouseNdc, camera);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, point);
  return { x: point.x, y: point.y };
}

function zoomAtClient(clientX, clientY, deltaY) {
  const before = worldFromClient(clientX, clientY);
  const zoomFactor = Math.exp(-deltaY * 0.0012);
  const nextZoom = THREE.MathUtils.clamp(camera.zoom * zoomFactor, 0.05, 500);
  if (nextZoom === camera.zoom) return;
  camera.zoom = nextZoom;
  camera.updateProjectionMatrix();
  const after = worldFromClient(clientX, clientY);
  const dx = before.x - after.x;
  const dy = before.y - after.y;
  camera.position.x += dx;
  camera.position.y += dy;
  controls.target.x += dx;
  controls.target.y += dy;
  updateHandleVisualScale();
  rebuildGrid();
  updateLabelPositions();
  updateRectangleDraftPreview();
  requestRender();
}

function normalizeWheelDelta(event) {
  let delta = event.deltaY;
  if (event.deltaMode === 1) delta *= 16;
  if (event.deltaMode === 2) delta *= viewport.clientHeight || 800;
  return THREE.MathUtils.clamp(delta, -320, 320);
}

function queueZoomAtClient(clientX, clientY, deltaY) {
  if (!pendingZoom) pendingZoom = { clientX, clientY, deltaY: 0, rafId: 0 };
  pendingZoom.clientX = clientX;
  pendingZoom.clientY = clientY;
  pendingZoom.deltaY += deltaY;
  if (pendingZoom.rafId) return;
  pendingZoom.rafId = requestAnimationFrame(() => {
    const zoom = pendingZoom;
    pendingZoom = null;
    zoomAtClient(zoom.clientX, zoom.clientY, zoom.deltaY);
  });
}

function worldPerPixel() {
  const viewHeight = Math.max(1e-6, (camera.top - camera.bottom) / Math.max(0.1, camera.zoom));
  return viewHeight / Math.max(1, viewport.clientHeight || viewportWrap.clientHeight || 1);
}

function pickRadiusWorld(px = 5) {
  return Math.max(0.1, worldPerPixel() * px);
}

function updateRaycastThreshold() {
  raycaster.params.Line.threshold = Math.max(0.15, worldPerPixel() * ENTITY_PICK_RADIUS_PX);
}

function intersectObjects(clientX, clientY, includeHandles = true) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  updateRaycastThreshold();
  camera.updateMatrixWorld();
  raycaster.setFromCamera(mouseNdc, camera);
  if (includeHandles) {
    const handleHits = raycaster.intersectObjects(handlesRoot.children, false);
    if (handleHits.length) return { type: 'handle', object: handleHits[0].object };
  }
  const objectHits = raycaster.intersectObjects(workRoot.children, false);
  if (objectHits.length) return { type: 'entity', object: objectHits[0].object };
  return null;
}

function clientToLocal(clientX, clientY) {
  const rect = viewportWrap.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function screenFromWorld(pos) {
  const v = new THREE.Vector3(pos.x, pos.y, 0).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height };
}

function parsePositiveMm(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function createRuntimeEntityId(prefix = 'e') {
  let id = '';
  do {
    id = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  } while (doc.entities.some((entity) => entity.id === id));
  return id;
}

function createLineLoopEntities(points, options = {}) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const layer = options.layer || '0';
  const namePrefix = options.namePrefix || 'Forma';
  const edges = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    edges.push({
      id: createRuntimeEntityId('shape'),
      type: 'LINE',
      layer,
      x1: current.x,
      y1: current.y,
      x2: next.x,
      y2: next.y,
      name: `${namePrefix} - Segmento ${i + 1}`,
    });
  }
  return edges;
}

function createLineEntity(start, end, layer = '0', name = 'Segmento') {
  return {
    id: createRuntimeEntityId('corner'),
    type: 'LINE',
    layer,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    name,
  };
}

function createLinkLineEntity(start, end, layer = '0', name = 'Ligacao') {
  return {
    id: createRuntimeEntityId('link'),
    type: 'LINE',
    layer,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    name,
  };
}

function normalizeVector(vec) {
  const len = Math.hypot(vec.x, vec.y);
  if (len < 1e-9) return null;
  return { x: vec.x / len, y: vec.y / len };
}

function normalizeRad(rad) {
  const turn = Math.PI * 2;
  let normalized = rad % turn;
  if (normalized < 0) normalized += turn;
  return normalized;
}

function normalizeDeg(deg) {
  let normalized = deg % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function cornerTypeLabel(typeId) {
  if (typeId === 'squareInner') return 'Quadrado para dentro';
  if (typeId === 'chamfer45') return 'Linha 45';
  if (typeId === 'roundInner') return 'Circulo inverso';
  if (typeId === 'circleInner') return 'Circulo para dentro';
  if (typeId === 'circleOuter') return 'Circulo para fora';
  return 'Arredondado';
}

function cornerBaseName(typeId) {
  if (typeId === 'squareInner') return 'Canto quadrado interno';
  if (typeId === 'chamfer45') return 'Canto chanfro 45';
  if (typeId === 'roundInner') return 'Canto circulo inverso';
  if (typeId === 'circleInner') return 'Canto circulo para dentro';
  if (typeId === 'circleOuter') return 'Canto circulo para fora';
  return 'Canto arredondado';
}

function createCornerArcEntity(options = {}) {
  const {
    startPoint,
    endPoint,
    bulgeNormal,
    sagitta,
    useMajorArc = false,
    layer = '0',
    name = 'Arco',
  } = options;
  if (!startPoint || !endPoint) return null;
  const chord = distance(startPoint, endPoint);
  if (chord < 1e-6) return null;

  const safeSagitta = Math.max(0.001, Math.abs(sagitta || CORNER_DEFAULT_MM));
  const radius = (chord * chord) / (8 * safeSagitta) + safeSagitta / 2;
  const normal = normalizeVector(bulgeNormal || { x: 0, y: 1 }) || { x: 0, y: 1 };
  const mid = { x: (startPoint.x + endPoint.x) / 2, y: (startPoint.y + endPoint.y) / 2 };
  const centerDistance = Math.max(0, radius - safeSagitta);
  const center = {
    x: mid.x + normal.x * centerDistance,
    y: mid.y + normal.y * centerDistance,
  };

  const angleA = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
  const angleB = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
  let startAngle = angleA;
  let endAngle = angleB;
  let delta = normalizeRad(endAngle - startAngle);
  // Fillet usa arco menor; modos de circulo usam arco maior (efeito "bolha").
  const shouldSwap = useMajorArc ? delta < Math.PI : delta > Math.PI;
  if (shouldSwap) {
    startAngle = angleB;
    endAngle = angleA;
    delta = normalizeRad(endAngle - startAngle);
  }

  return {
    id: createRuntimeEntityId('corner'),
    type: 'ARC',
    layer,
    cx: center.x,
    cy: center.y,
    r: radius,
    startAngle: normalizeDeg(THREE.MathUtils.radToDeg(startAngle)),
    endAngle: normalizeDeg(THREE.MathUtils.radToDeg(endAngle)),
    name,
  };
}

function updateCornerTypeButtons() {
  for (const button of cornerTypeButtons) {
    const isActive = button.dataset.cornerType === cornerType;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

function setCornerType(typeId) {
  if (!CORNER_TYPE_IDS.has(typeId)) return;
  cornerType = typeId;
  updateCornerTypeButtons();
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCornerSelectedLines() {
  const lines = [];
  for (const id of selectedIds) {
    const entity = entityById(id);
    if (!entity || entity.type !== 'LINE') continue;
    const layer = getLayer(doc, entity.layer || '0');
    if (!layer.visible) continue;
    lines.push(entity);
  }
  return lines;
}

function intersectInfiniteLines(a1, a2, b1, b2) {
  const denominator = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(denominator) < 1e-9) return null;
  const detA = a1.x * a2.y - a1.y * a2.x;
  const detB = b1.x * b2.y - b1.y * b2.x;
  const x = (detA * (b1.x - b2.x) - (a1.x - a2.x) * detB) / denominator;
  const y = (detA * (b1.y - b2.y) - (a1.y - a2.y) * detB) / denominator;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function nearestLineEndpoints(lineA, lineB) {
  const endpointsA = [{ x: lineA.x1, y: lineA.y1 }, { x: lineA.x2, y: lineA.y2 }];
  const endpointsB = [{ x: lineB.x1, y: lineB.y1 }, { x: lineB.x2, y: lineB.y2 }];
  let best = null;
  for (let i = 0; i < endpointsA.length; i += 1) {
    for (let j = 0; j < endpointsB.length; j += 1) {
      const d = distance(endpointsA[i], endpointsB[j]);
      if (!best || d < best.d) {
        best = { aPoint: endpointsA[i], bPoint: endpointsB[j], aIndex: i, bIndex: j, d };
      }
    }
  }
  return best;
}

function lineDirectionFromCorner(line, corner) {
  const endpoints = [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }];
  const d1 = distance(corner, endpoints[0]);
  const d2 = distance(corner, endpoints[1]);
  const target = d1 >= d2 ? endpoints[0] : endpoints[1];
  const dir = normalizeVector({ x: target.x - corner.x, y: target.y - corner.y });
  if (dir) return dir;
  return normalizeVector({ x: line.x2 - line.x1, y: line.y2 - line.y1 });
}

function getLineEndpoints(line) {
  return [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }];
}

function setLineEndpoint(line, endpointIndex, point) {
  if (endpointIndex === 0) {
    line.x1 = point.x;
    line.y1 = point.y;
    return;
  }
  line.x2 = point.x;
  line.y2 = point.y;
}

function buildCornerPairContext(lineA, lineB, options = {}) {
  const sizeMm = Math.max(0.001, options.sizeMm || CORNER_DEFAULT_MM);
  const endpointsA = getLineEndpoints(lineA);
  const endpointsB = getLineEndpoints(lineB);
  const nearest = nearestLineEndpoints(lineA, lineB);
  if (!nearest) return null;

  const intersection = intersectInfiniteLines(endpointsA[0], endpointsA[1], endpointsB[0], endpointsB[1]);
  const cornerIndexA = intersection
    ? (distance(endpointsA[0], intersection) <= distance(endpointsA[1], intersection) ? 0 : 1)
    : nearest.aIndex;
  const cornerIndexB = intersection
    ? (distance(endpointsB[0], intersection) <= distance(endpointsB[1], intersection) ? 0 : 1)
    : nearest.bIndex;

  const cornerA = endpointsA[cornerIndexA];
  const cornerB = endpointsB[cornerIndexB];
  const corner = intersection || { x: (cornerA.x + cornerB.x) / 2, y: (cornerA.y + cornerB.y) / 2 };

  const farA = endpointsA[1 - cornerIndexA];
  const farB = endpointsB[1 - cornerIndexB];
  const dirA = lineDirectionFromCorner(lineA, corner);
  const dirB = lineDirectionFromCorner(lineB, corner);
  if (!dirA || !dirB) return null;

  const lenA = distance(corner, farA);
  const lenB = distance(corner, farB);
  if (lenA <= 1e-6 || lenB <= 1e-6) return null;

  const dot = clampValue(dirA.x * dirB.x + dirA.y * dirB.y, -0.999999, 0.999999);
  const angle = Math.acos(dot);
  if (angle <= 1e-3 || Math.abs(Math.PI - angle) <= 1e-3) return null;

  const tanHalf = Math.tan(angle / 2);
  if (Math.abs(tanHalf) <= 1e-6) return null;

  const maxOffset = Math.max(0.001, Math.min(lenA, lenB) - 0.01);
  if (maxOffset <= 0) return null;

  const isRoundType = options.typeId === 'roundOuter'
    || options.typeId === 'roundInner'
    || options.typeId === 'circleInner'
    || options.typeId === 'circleOuter';
  const offsetRaw = isRoundType ? sizeMm / tanHalf : sizeMm;
  const offset = clampValue(offsetRaw, 0.001, maxOffset);

  const trimPointA = { x: corner.x + dirA.x * offset, y: corner.y + dirA.y * offset };
  const trimPointB = { x: corner.x + dirB.x * offset, y: corner.y + dirB.y * offset };
  const bisector = normalizeVector({ x: dirA.x + dirB.x, y: dirA.y + dirB.y });
  if (!bisector) return null;

  return {
    lineA,
    lineB,
    cornerIndexA,
    cornerIndexB,
    corner,
    dirA,
    dirB,
    angle,
    offset,
    trimPointA,
    trimPointB,
    bisector,
    layer: lineA.layer || lineB.layer || '0',
  };
}

function buildCornerBridgeEntities(context, options = {}) {
  const { typeId = 'roundOuter', pairIndex = 0 } = options;
  const pairLabel = `Par ${pairIndex + 1}`;
  const baseName = cornerBaseName(typeId);

  if (typeId === 'chamfer45') {
    return [createLineEntity(context.trimPointA, context.trimPointB, context.layer, `${baseName} - ${pairLabel}`)];
  }

  if (typeId === 'squareInner') {
    const notch = {
      x: context.corner.x + (context.dirA.x + context.dirB.x) * context.offset,
      y: context.corner.y + (context.dirA.y + context.dirB.y) * context.offset,
    };
    return [
      createLineEntity(context.trimPointA, notch, context.layer, `${baseName} - ${pairLabel} A`),
      createLineEntity(notch, context.trimPointB, context.layer, `${baseName} - ${pairLabel} B`),
    ];
  }

  const chord = distance(context.trimPointA, context.trimPointB);
  let radius = context.offset * Math.tan(context.angle / 2);
  radius = Math.max(radius, chord / 2 + 0.001);
  const sagitta = radius - Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4));
  const useMajorArc = typeId === 'circleInner' || typeId === 'circleOuter';
  // Arredondado/circulo para dentro usam a bissetriz interna.
  // Inverso/circulo para fora usam a direcao oposta.
  const useInternalNormal = typeId === 'roundOuter' || typeId === 'circleInner';
  const normal = useInternalNormal
    ? context.bisector
    : { x: -context.bisector.x, y: -context.bisector.y };
  const arc = createCornerArcEntity({
    startPoint: context.trimPointA,
    endPoint: context.trimPointB,
    bulgeNormal: normal,
    sagitta,
    useMajorArc,
    layer: context.layer,
    name: `${baseName} - ${pairLabel}`,
  });
  return arc ? [arc] : [];
}

function updateCornerSelectionInfo() {
  if (!cornerSelectionInfoEl) return;
  const lines = getCornerSelectedLines();
  const total = lines.length;
  const pairCount = Math.floor(total / 2);
  const hasOdd = total % 2 === 1;
  let text = `${total} linha(s)/vertice(s) selecionada(s). ${pairCount} par(es) pronto(s).`;
  if (hasOdd) text += ' A ultima linha ficou sem par.';
  if (total < CORNER_MIN_PICK_COUNT) text += ` Selecione pelo menos ${CORNER_MIN_PICK_COUNT}.`;
  cornerSelectionInfoEl.textContent = text;
}

function clearCornerSelection() {
  if (!selectedIds.size) return;
  selectedIds.clear();
  hideRotationHud();
  setHoveredHandle(null);
  setActiveHandle(null);
  rebuildScene();
  refreshUi();
  setStatus('Opcao 2: selecao de linhas limpa.');
}

function option3TypeLabel(typeId) {
  if (typeId === 'capsule90') return 'Capsula 90';
  return 'Circulo';
}

function updateOption3TypeButtons() {
  for (const button of option3TypeButtons) {
    const isActive = button.dataset.option3Type === option3Type;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
  if (option3SpanWrapEl) {
    option3SpanWrapEl.hidden = option3Type !== 'capsule90';
  }
}

function setOption3Type(typeId) {
  if (!OPTION3_TYPE_IDS.has(typeId)) return;
  option3Type = typeId;
  updateOption3TypeButtons();
}

function createArcEntity(center, radius, startAngleDeg, endAngleDeg, layer = '0', name = 'Arco') {
  return {
    id: createRuntimeEntityId('shape3'),
    type: 'ARC',
    layer,
    cx: center.x,
    cy: center.y,
    r: radius,
    startAngle: normalizeDeg(startAngleDeg),
    endAngle: normalizeDeg(endAngleDeg),
    name,
  };
}

function createCircleEntity(center, radius, layer = '0', name = 'Circulo') {
  return {
    id: createRuntimeEntityId('shape3'),
    type: 'CIRCLE',
    layer,
    cx: center.x,
    cy: center.y,
    r: radius,
    name,
  };
}

function createCapsule90Entities(center, radius, tipToTipDistance, layer = '0') {
  const safeRadius = Math.max(0.001, radius);
  const totalDistance = Math.max(safeRadius * 2, tipToTipDistance);
  const centerGap = totalDistance - safeRadius * 2;
  // Se a distancia ponta-a-ponta for igual ao diametro, a capsula degenera em circulo.
  if (centerGap <= 1e-6) {
    return [createCircleEntity(center, safeRadius, layer, `Capsula 90 (degenerada) R${safeRadius.toFixed(2)}`)];
  }

  const halfGap = centerGap / 2;
  const leftCenter = { x: center.x - halfGap, y: center.y };
  const rightCenter = { x: center.x + halfGap, y: center.y };
  const yTop = center.y + safeRadius;
  const yBottom = center.y - safeRadius;

  return [
    createLineEntity(
      { x: leftCenter.x, y: yTop },
      { x: rightCenter.x, y: yTop },
      layer,
      `Capsula 90 topo ${totalDistance.toFixed(2)}`
    ),
    createArcEntity(rightCenter, safeRadius, 270, 90, layer, 'Capsula 90 arco direito'),
    createLineEntity(
      { x: rightCenter.x, y: yBottom },
      { x: leftCenter.x, y: yBottom },
      layer,
      `Capsula 90 base ${totalDistance.toFixed(2)}`
    ),
    createArcEntity(leftCenter, safeRadius, 90, 270, layer, 'Capsula 90 arco esquerdo'),
  ];
}

function closeOption3Command(options = {}) {
  const { silent = false } = options;
  option3CommandOpen = false;
  if (option3CommandPanelEl) option3CommandPanelEl.hidden = true;
  actionSlotsController.setActiveSlot(null);
  if (!silent) setStatus('Opcao 3 encerrada.');
}

function applyOption3Command() {
  if (!option3CommandOpen) return false;
  const radiusMm = parsePositiveMm(option3RadiusEl?.value);
  if (!radiusMm) {
    setStatus('Opcao 3: informe raio (mm) maior que zero.');
    option3RadiusEl?.focus();
    option3RadiusEl?.select();
    return false;
  }

  let entities = [];
  const anchor = rectangleAnchorWorld();
  if (option3Type === 'circle') {
    entities = [createCircleEntity(anchor, radiusMm, '0', `Circulo R${radiusMm.toFixed(2)}`)];
  } else {
    const spanMm = parsePositiveMm(option3SpanEl?.value);
    if (!spanMm) {
      setStatus('Opcao 3: informe distancia ponta a ponta (mm) maior que zero.');
      option3SpanEl?.focus();
      option3SpanEl?.select();
      return false;
    }
    entities = createCapsule90Entities(anchor, radiusMm, spanMm, '0');
  }
  if (!entities.length) {
    setStatus('Opcao 3: nao foi possivel gerar a geometria.');
    return false;
  }

  pushUndo(`opcao 3 - ${option3TypeLabel(option3Type).toLowerCase()}`);
  doc.entities.push(...entities);
  ensureLayers(doc);
  selectedIds = new Set(entities.map((item) => item.id));
  setHoveredHandle(null);
  setActiveHandle(null);
  closeOption3Command({ silent: true });
  rebuildScene();
  refreshUi();
  requestRender();

  const statusSuffix = option3Type === 'capsule90'
    ? `raio ${radiusMm.toFixed(2)} mm, distancia ${(parsePositiveMm(option3SpanEl?.value) || 0).toFixed(2)} mm`
    : `raio ${radiusMm.toFixed(2)} mm`;
  setStatus(`Opcao 3: ${option3TypeLabel(option3Type)} criado (${statusSuffix}).`);
  return true;
}

function openOption3Command() {
  if (!option3CommandPanelEl || !option3RadiusEl || !option3SpanEl) return false;
  closeRectCommand({ silent: true });
  closeLinkCommand({ silent: true });
  closeCornerCommand({ silent: true });
  option3CommandOpen = true;
  option3CommandPanelEl.hidden = false;
  actionSlotsController.setActiveSlot(3);
  if (!parsePositiveMm(option3RadiusEl.value)) option3RadiusEl.value = String(OPTION3_DEFAULT_RADIUS_MM);
  if (!parsePositiveMm(option3SpanEl.value)) option3SpanEl.value = String(OPTION3_DEFAULT_SPAN_MM);
  setOption3Type(option3Type);
  if (tool !== 'select') setTool('select');
  option3RadiusEl.focus();
  option3RadiusEl.select();
  setStatus('Opcao 3: escolha o tipo, informe medidas em mm e clique em Criar.');
  return true;
}

function isPolygonEntity(entity) {
  return Boolean(entity && Array.isArray(entity.points) && entity.points.length >= 2);
}

function isLinkTargetEntity(entity) {
  if (!entity) return false;
  if (entity.type === 'LINE') return true;
  return isPolygonEntity(entity);
}

function linkModeLabel(modeId) {
  if (modeId === 'axisFree') return 'Linha livre X/Y';
  if (modeId === 'free') return 'Reta solta';
  return 'Reta X/Y';
}

function updateLinkTypeButtons() {
  for (const button of linkTypeButtons) {
    const isActive = button.dataset.linkMode === linkMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
  if (linkAxisControlsEl) {
    linkAxisControlsEl.hidden = linkMode !== 'axisFree';
  }
}

function linkAxisInputEl(axisId) {
  return axisId === 'y' ? linkAxisYValueEl : linkAxisXValueEl;
}

function updateLinkAxisInputs() {
  if (linkAxisXValueEl) linkAxisXValueEl.classList.toggle('is-active', linkAxis === 'x');
  if (linkAxisYValueEl) linkAxisYValueEl.classList.toggle('is-active', linkAxis === 'y');
}

function setLinkAxis(axisId, options = {}) {
  const { focusInput = false } = options;
  if (!LINK_AXIS_IDS.has(axisId)) return;
  linkAxis = axisId;
  updateLinkAxisInputs();
  if (focusInput) {
    const inputEl = linkAxisInputEl(axisId);
    inputEl?.focus();
    inputEl?.select();
  }
  updateLinkSelectionInfo();
}

function setLinkMode(modeId) {
  if (!LINK_MODE_IDS.has(modeId)) return;
  const changed = linkMode !== modeId;
  linkMode = modeId;
  if (changed) {
    linkStartPick = null;
    linkAxisAnchor = null;
    setActiveHandle(null);
  }
  updateLinkTypeButtons();
  updateLinkSelectionInfo();
}

function getVisiblePolygonEntities() {
  return doc.entities.filter((entity) => {
    if (!isLinkTargetEntity(entity)) return false;
    const layer = getLayer(doc, entity.layer || '0');
    return layer.visible && isEntityEditable(doc, entity);
  });
}

function collectLinkPickPoints(entity) {
  if (!entity) return [];
  if (entity.type === 'LINE') {
    return [
      { vertexIndex: 0, point: { x: Number(entity.x1) || 0, y: Number(entity.y1) || 0 } },
      { vertexIndex: 1, point: { x: Number(entity.x2) || 0, y: Number(entity.y2) || 0 } },
    ];
  }
  if (entity.points?.length) {
    return entity.points.map((p, index) => ({
      vertexIndex: index,
      point: { x: Number(p.x) || 0, y: Number(p.y) || 0 },
    }));
  }
  return [];
}

function collectLinkPickSegments(entity) {
  if (!entity) return [];
  if (entity.type === 'LINE') {
    return [{
      segmentIndex: 0,
      start: { x: Number(entity.x1) || 0, y: Number(entity.y1) || 0 },
      end: { x: Number(entity.x2) || 0, y: Number(entity.y2) || 0 },
    }];
  }
  if (entity.points?.length >= 2) {
    const segments = [];
    for (let i = 1; i < entity.points.length; i += 1) {
      segments.push({
        segmentIndex: i - 1,
        start: { x: Number(entity.points[i - 1].x) || 0, y: Number(entity.points[i - 1].y) || 0 },
        end: { x: Number(entity.points[i].x) || 0, y: Number(entity.points[i].y) || 0 },
      });
    }
    if (entity.closed && entity.points.length > 2) {
      segments.push({
        segmentIndex: entity.points.length - 1,
        start: { x: Number(entity.points[entity.points.length - 1].x) || 0, y: Number(entity.points[entity.points.length - 1].y) || 0 },
        end: { x: Number(entity.points[0].x) || 0, y: Number(entity.points[0].y) || 0 },
      });
    }
    return segments;
  }
  return [];
}

function projectPointOnSegment(point, start, end) {
  const sx = Number(start?.x) || 0;
  const sy = Number(start?.y) || 0;
  const ex = Number(end?.x) || 0;
  const ey = Number(end?.y) || 0;
  const dx = ex - sx;
  const dy = ey - sy;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) {
    const projectedPoint = { x: sx, y: sy };
    return { point: projectedPoint, t: 0, d: distance(point, projectedPoint) };
  }
  const t = clampValue((((point.x - sx) * dx) + ((point.y - sy) * dy)) / lenSq, 0, 1);
  const projectedPoint = { x: sx + (dx * t), y: sy + (dy * t) };
  return { point: projectedPoint, t, d: distance(point, projectedPoint) };
}

function syncLinkPolygonSelection(options = {}) {
  const { keepStart = false } = options;
  const targets = getVisiblePolygonEntities();
  selectedIds = new Set(targets.map((entity) => entity.id));
  setHoveredHandle(null);
  setActiveHandle(null);
  if (!keepStart) {
    linkStartPick = null;
    linkAxisAnchor = null;
  }
  rebuildScene();
  refreshUi();
}

function updateLinkSelectionInfo() {
  if (!linkSelectionInfoEl) return;
  const targetCount = getVisiblePolygonEntities().length;
  if (linkMode === 'axisFree') {
    const axisText = linkAxis === 'x' ? 'X' : 'Y';
    const xValue = Number(linkAxisXValueEl?.value || 0).toFixed(2);
    const yValue = Number(linkAxisYValueEl?.value || 0).toFixed(2);
    const anchorText = linkAxisAnchor
      ? `Origem: (${linkAxisAnchor.x.toFixed(2)}, ${linkAxisAnchor.y.toFixed(2)})`
      : 'Origem: clique no canvas';
    linkSelectionInfoEl.textContent = `Modo ${linkModeLabel(linkMode)}. Eixo ativo ${axisText}. X ${xValue} mm, Y ${yValue} mm. ${anchorText}.`;
    return;
  }

  if (!targetCount) {
    linkSelectionInfoEl.textContent = 'Nenhuma linha/poligono visivel para ligacao.';
    return;
  }

  const startText = linkStartPick
    ? `Inicio: (${linkStartPick.point.x.toFixed(2)}, ${linkStartPick.point.y.toFixed(2)}) ${linkStartPick.sourceType === 'vertex' ? `(vertice ${Number(linkStartPick.vertexIndex) + 1})` : '(segmento da linha)'}.`
    : 'Inicio: nao definido.';
  linkSelectionInfoEl.textContent = `${targetCount} alvo(s) pronto(s). Modo ${linkModeLabel(linkMode)}. ${startText}`;
}

function resetLinkStart(options = {}) {
  const { silent = false } = options;
  linkStartPick = null;
  linkAxisAnchor = null;
  setActiveHandle(null);
  updateLinkSelectionInfo();
  if (!silent) setStatus('Opcao 4: origem limpa. Defina novamente.');
}

function findLinkPointPick(clientX, clientY) {
  // Respeita o mesmo snap global (grade/pontos) usado nas outras ferramentas.
  const world = snapWorld(worldFromClient(clientX, clientY));
  const threshold = pickRadiusWorld(LINK_PICK_RADIUS_PX);
  let best = null;

  // Prioriza vertice quando o clique estiver perto de vertice e segmento ao mesmo tempo.
  function evaluateCandidate(entity, layerName, candidatePoint, sourceType, extra = {}) {
    const d = distance(world, candidatePoint);
    if (d > threshold) return;
    const priority = sourceType === 'vertex' ? 0 : 1;
    if (!best || priority < best.priority || (priority === best.priority && d < best.d)) {
      best = {
        entityId: entity.id,
        layer: layerName,
        point: { x: candidatePoint.x, y: candidatePoint.y },
        sourceType,
        vertexIndex: sourceType === 'vertex' ? Number(extra.vertexIndex) : null,
        segmentIndex: sourceType === 'segment' ? Number(extra.segmentIndex) : null,
        d,
        priority,
      };
    }
  }

  for (const entity of getVisiblePolygonEntities()) {
    const layerName = entity.layer || '0';
    const vertexCandidates = collectLinkPickPoints(entity);
    for (const candidate of vertexCandidates) {
      evaluateCandidate(entity, layerName, candidate.point, 'vertex', { vertexIndex: candidate.vertexIndex });
    }

    const segmentCandidates = collectLinkPickSegments(entity);
    for (const segment of segmentCandidates) {
      const minX = Math.min(segment.start.x, segment.end.x) - threshold;
      const maxX = Math.max(segment.start.x, segment.end.x) + threshold;
      const minY = Math.min(segment.start.y, segment.end.y) - threshold;
      const maxY = Math.max(segment.start.y, segment.end.y) + threshold;
      if (world.x < minX || world.x > maxX || world.y < minY || world.y > maxY) continue;
      const projected = projectPointOnSegment(world, segment.start, segment.end);
      evaluateCandidate(entity, layerName, projected.point, 'segment', { segmentIndex: segment.segmentIndex });
    }
  }
  return best;
}

function buildLinkEntitiesFromPicks(startPick, endPick, modeId) {
  if (!startPick || !endPick) return [];
  const layer = startPick.layer || endPick.layer || '0';
  const start = startPick.point;
  const end = endPick.point;
  if (modeId === 'free') {
    if (distance(start, end) <= 1e-6) return [];
    return [createLinkLineEntity(start, end, layer, 'Ligacao solta')];
  }

  const segments = [];
  const middle = { x: end.x, y: start.y };
  if (distance(start, middle) > 1e-6) {
    segments.push(createLinkLineEntity(start, middle, layer, 'Ligacao X'));
  }
  if (distance(middle, end) > 1e-6) {
    segments.push(createLinkLineEntity(middle, end, layer, 'Ligacao Y'));
  }
  return segments;
}

function applyLinkAxisLine() {
  const axisId = LINK_AXIS_IDS.has(linkAxis) ? linkAxis : 'x';
  const axisLabel = axisId.toUpperCase();
  const axisInputEl = linkAxisInputEl(axisId);
  if (!linkAxisAnchor) {
    setStatus('Opcao 4: clique em um ponto do canvas/peca para definir a origem da linha livre.');
    return false;
  }
  const valueMm = Number(String(axisInputEl?.value ?? '').replace(',', '.'));
  if (!Number.isFinite(valueMm) || Math.abs(valueMm) <= 1e-9) {
    setStatus(`Opcao 4: informe um valor valido no eixo ${axisLabel} (positivo ou negativo, exceto zero).`);
    axisInputEl?.focus();
    axisInputEl?.select();
    return false;
  }
  const start = { x: linkAxisAnchor.x, y: linkAxisAnchor.y };
  const end = {
    x: start.x + (axisId === 'x' ? valueMm : 0),
    y: start.y + (axisId === 'y' ? valueMm : 0),
  };
  const line = createLinkLineEntity(start, end, '0', `Linha livre ${axisLabel} ${valueMm.toFixed(2)}mm`);
  pushUndo('opcao 4 - linha livre x/y');
  doc.entities.push(line);
  ensureLayers(doc);
  selectedIds.add(line.id);
  // Mantem fluxo encadeado: o proximo Enter continua da ponta da linha recem-criada.
  linkAxisAnchor = { x: end.x, y: end.y };
  rebuildScene();
  refreshUi();
  updateLinkSelectionInfo();
  requestRender();
  setStatus(`Opcao 4: linha livre criada no eixo ${axisLabel} com ${valueMm.toFixed(2)} mm (continua da ultima ponta).`);
  return true;
}

function applyLinkFromPick(endPick) {
  if (!linkStartPick) return false;
  const segments = buildLinkEntitiesFromPicks(linkStartPick, endPick, linkMode);
  if (!segments.length) {
    setStatus('Opcao 4: pontos coincidentes ou invalidos para ligacao.');
    return false;
  }

  pushUndo(`opcao 4 - ${linkMode === 'free' ? 'reta solta' : 'reta x/y'}`);
  doc.entities.push(...segments);
  ensureLayers(doc);
  syncLinkPolygonSelection({ keepStart: true });
  linkStartPick = endPick;
  if (endPick.sourceType === 'vertex' && Number.isInteger(endPick.vertexIndex)) {
    setActiveHandle({ entityId: endPick.entityId, vertexIndex: endPick.vertexIndex });
  } else {
    setActiveHandle(null);
  }
  updateLinkSelectionInfo();
  requestRender();
  setStatus(`Opcao 4: ${segments.length} ligacao(oes) criada(s) no modo ${linkModeLabel(linkMode)}.`);
  return true;
}

function handleLinkCanvasPick(clientX, clientY) {
  if (!linkCommandOpen) return false;
  if (linkMode === 'axisFree') {
    const pick = findLinkPointPick(clientX, clientY);
    const anchor = pick ? pick.point : snapWorld(worldFromClient(clientX, clientY));
    linkAxisAnchor = { x: anchor.x, y: anchor.y };
    if (pick?.sourceType === 'vertex' && Number.isInteger(pick.vertexIndex)) {
      setActiveHandle({ entityId: pick.entityId, vertexIndex: pick.vertexIndex });
    } else {
      setActiveHandle(null);
    }
    setHoveredHandle(null);
    updateLinkSelectionInfo();
    setStatus(`Opcao 4: origem definida em (${anchor.x.toFixed(2)}, ${anchor.y.toFixed(2)}). Digite X ou Y e pressione Enter.`);
    return true;
  }
  const pick = findLinkPointPick(clientX, clientY);
  if (!pick) {
    setStatus('Opcao 4: clique em um ponto de linha/poligono.');
    return true;
  }

  if (!linkStartPick) {
    linkStartPick = pick;
    if (pick.sourceType === 'vertex' && Number.isInteger(pick.vertexIndex)) {
      setActiveHandle({ entityId: pick.entityId, vertexIndex: pick.vertexIndex });
    } else {
      setActiveHandle(null);
    }
    updateLinkSelectionInfo();
    setStatus('Opcao 4: ponto inicial definido. Selecione o destino.');
    return true;
  }

  if (distance(pick.point, linkStartPick.point) <= 1e-6) {
    setStatus('Opcao 4: selecione um ponto diferente para concluir a ligacao.');
    return true;
  }
  applyLinkFromPick(pick);
  return true;
}

function closeLinkCommand(options = {}) {
  const { silent = false } = options;
  linkCommandOpen = false;
  linkStartPick = null;
  linkAxisAnchor = null;
  if (linkCommandPanelEl) linkCommandPanelEl.hidden = true;
  actionSlotsController.setActiveSlot(null);
  if (!silent) setStatus('Opcao 4 encerrada.');
}

function openLinkCommand() {
  if (!linkCommandPanelEl) return false;
  closeRectCommand({ silent: true });
  closeOption3Command({ silent: true });
  closeCornerCommand({ silent: true });
  linkCommandOpen = true;
  linkStartPick = null;
  linkAxisAnchor = null;
  linkCommandPanelEl.hidden = false;
  actionSlotsController.setActiveSlot(4);
  if (!Number.isFinite(Number(linkAxisXValueEl?.value))) {
    if (linkAxisXValueEl) linkAxisXValueEl.value = String(LINK_AXIS_DEFAULT_MM);
  }
  if (!Number.isFinite(Number(linkAxisYValueEl?.value))) {
    if (linkAxisYValueEl) linkAxisYValueEl.value = String(LINK_AXIS_DEFAULT_MM);
  }
  setLinkMode(linkMode);
  setLinkAxis(linkAxis);
  if (tool !== 'vertex') setTool('vertex');
  syncLinkPolygonSelection({ keepStart: false });
  updateLinkSelectionInfo();
  setStatus('Opcao 4: escolha modo e clique para ligar. Na Linha livre X/Y, Enter aplica no eixo ativo.');
  return true;
}

function closeCornerCommand(options = {}) {
  const { silent = false } = options;
  cornerCommandOpen = false;
  if (cornerCommandPanelEl) cornerCommandPanelEl.hidden = true;
  actionSlotsController.setActiveSlot(null);
  updateCornerSelectionInfo();
  if (!silent) setStatus('Opcao 2 encerrada.');
}

function applyCornerCommand() {
  if (!cornerCommandOpen) return false;
  const sizeMm = parsePositiveMm(cornerSizeEl?.value);
  if (!sizeMm) {
    setStatus('Opcao 2: informe raio/profundidade (mm) maior que zero.');
    cornerSizeEl?.focus();
    cornerSizeEl?.select();
    return false;
  }

  const selectedLines = getCornerSelectedLines();
  if (selectedLines.length < CORNER_MIN_PICK_COUNT) {
    setStatus('Opcao 2: selecione no minimo 2 linhas (vertices).');
    return false;
  }

  const pairCount = Math.floor(selectedLines.length / 2);
  const oddLineCount = selectedLines.length % 2;
  const createdEntities = [];
  const changedLineIds = new Set();
  let createdPairs = 0;
  for (let i = 0; i < pairCount; i += 1) {
    const lineA = selectedLines[i * 2];
    const lineB = selectedLines[i * 2 + 1];
    const context = buildCornerPairContext(lineA, lineB, {
      typeId: cornerType,
      sizeMm,
      pairIndex: i,
    });
    if (!context) continue;
    const generated = buildCornerBridgeEntities(context, {
      typeId: cornerType,
      pairIndex: i,
    });
    if (!generated.length) continue;

    // Aplica trim nas linhas originais para realmente transformar o canto existente.
    setLineEndpoint(context.lineA, context.cornerIndexA, context.trimPointA);
    setLineEndpoint(context.lineB, context.cornerIndexB, context.trimPointB);
    changedLineIds.add(context.lineA.id);
    changedLineIds.add(context.lineB.id);
    createdPairs += 1;
    createdEntities.push(...generated);
  }

  if (!createdPairs || !createdEntities.length || !changedLineIds.size) {
    setStatus('Opcao 2: nao foi possivel gerar cantos para as linhas selecionadas.');
    return false;
  }

  pushUndo(`opcao 2 - ${cornerTypeLabel(cornerType).toLowerCase()}`);
  doc.entities.push(...createdEntities);
  ensureLayers(doc);
  selectedIds = new Set([...changedLineIds, ...createdEntities.map((item) => item.id)]);
  setHoveredHandle(null);
  setActiveHandle(null);
  rebuildScene();
  refreshUi();
  requestRender();

  let statusMessage = `Opcao 2: ${createdPairs} par(es) transformado(s), ${createdEntities.length} ligacao(oes) criada(s).`;
  if (oddLineCount) statusMessage += ' 1 linha sem par foi ignorada.';
  setStatus(statusMessage);
  return true;
}

function openCornerCommand() {
  if (!cornerCommandPanelEl || !cornerSizeEl) return false;
  closeRectCommand({ silent: true });
  closeOption3Command({ silent: true });
  closeLinkCommand({ silent: true });
  cornerCommandOpen = true;
  cornerCommandPanelEl.hidden = false;
  actionSlotsController.setActiveSlot(2);
  if (!parsePositiveMm(cornerSizeEl.value)) cornerSizeEl.value = String(CORNER_DEFAULT_MM);
  setCornerType(cornerType);
  if (tool !== 'select') setTool('select');
  updateCornerSelectionInfo();
  cornerSizeEl.focus();
  cornerSizeEl.select();
  setStatus('Opcao 2: selecione linhas (vertices) em pares e clique em Aplicar.');
  return true;
}

function rectangleAnchorWorld() {
  if (selectedIds.size) return selectionPivot();
  return { x: controls.target.x, y: controls.target.y };
}

function hideRectangleDraftPreview() {
  if (!rectDraftRectEl) return;
  rectDraftRectEl.style.display = 'none';
}

function updateRectangleDraftPreview() {
  if (!rectangleCommandOpen || !rectDraftRectEl) {
    hideRectangleDraftPreview();
    return;
  }
  const sizeX = parsePositiveMm(rectSizeXEl?.value);
  const sizeY = parsePositiveMm(rectSizeYEl?.value);
  if (!sizeX || !sizeY) {
    hideRectangleDraftPreview();
    return;
  }
  const anchor = rectangleAnchorWorld();
  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const a = screenFromWorld({ x: anchor.x - halfX, y: anchor.y - halfY });
  const b = screenFromWorld({ x: anchor.x + halfX, y: anchor.y + halfY });
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) {
    hideRectangleDraftPreview();
    return;
  }
  rectDraftRectEl.style.display = 'block';
  rectDraftRectEl.style.left = `${Math.min(a.x, b.x)}px`;
  rectDraftRectEl.style.top = `${Math.min(a.y, b.y)}px`;
  rectDraftRectEl.style.width = `${Math.abs(b.x - a.x)}px`;
  rectDraftRectEl.style.height = `${Math.abs(b.y - a.y)}px`;
}

function closeRectCommand(options = {}) {
  const { silent = false } = options;
  rectangleCommandOpen = false;
  if (rectCommandPanelEl) rectCommandPanelEl.hidden = true;
  hideRectangleDraftPreview();
  actionSlotsController.setActiveSlot(null);
  if (!silent) setStatus('Opcao 1 encerrada.');
}

function createRectangleFromInput() {
  const sizeX = parsePositiveMm(rectSizeXEl?.value);
  if (!sizeX) {
    setStatus('Informe X (mm) maior que zero.');
    rectSizeXEl?.focus();
    rectSizeXEl?.select();
    return false;
  }
  const sizeY = parsePositiveMm(rectSizeYEl?.value);
  if (!sizeY) {
    setStatus('Informe Y (mm) maior que zero.');
    rectSizeYEl?.focus();
    rectSizeYEl?.select();
    return false;
  }

  const anchor = rectangleAnchorWorld();
  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const xMin = anchor.x - halfX;
  const xMax = anchor.x + halfX;
  const yMin = anchor.y - halfY;
  const yMax = anchor.y + halfY;

  // Opcao 1 segue o mesmo padrao que sera usado para outras geometrias:
  // contorno convertido em multiplas entidades LINE (nao polilinha unica).
  const rectPoints = [
    { x: xMin, y: yMin },
    { x: xMax, y: yMin },
    { x: xMax, y: yMax },
    { x: xMin, y: yMax },
  ];
  const rectEdges = createLineLoopEntities(rectPoints, {
    layer: '0',
    namePrefix: `Retangulo ${sizeX.toFixed(2)}x${sizeY.toFixed(2)}`,
  });

  pushUndo('criar retangulo');
  doc.entities.push(...rectEdges);
  ensureLayers(doc);
  selectedIds = new Set(rectEdges.map((edge) => edge.id));
  setHoveredHandle(null);
  setActiveHandle(null);
  closeRectCommand({ silent: true });
  rebuildScene();
  refreshUi();
  requestRender();
  setStatus(`Retangulo criado: ${sizeX.toFixed(2)} x ${sizeY.toFixed(2)} mm.`);
  return true;
}

function openRectCommand() {
  if (!rectCommandPanelEl || !rectSizeXEl || !rectSizeYEl) return false;
  closeOption3Command({ silent: true });
  closeLinkCommand({ silent: true });
  closeCornerCommand({ silent: true });
  rectangleCommandOpen = true;
  rectCommandPanelEl.hidden = false;
  actionSlotsController.setActiveSlot(1);
  if (!parsePositiveMm(rectSizeXEl.value)) rectSizeXEl.value = '100';
  if (!parsePositiveMm(rectSizeYEl.value)) rectSizeYEl.value = '100';
  rectSizeXEl.focus();
  rectSizeXEl.select();
  updateRectangleDraftPreview();
  setStatus('Opcao 1: digite X (mm), Enter, depois Y (mm) e Enter para criar.');
  return true;
}

function getVisibleBounds() {
  const width = viewport.clientWidth || viewportWrap.clientWidth;
  const height = viewport.clientHeight || viewportWrap.clientHeight;
  const aspect = Math.max(1e-6, width / Math.max(1, height));
  const halfH = (camera.top - camera.bottom) / 2;
  const halfW = halfH * aspect;
  return { minX: camera.position.x - halfW, maxX: camera.position.x + halfW, minY: camera.position.y - halfH, maxY: camera.position.y + halfH };
}

function rebuildGrid() {
  while (gridRoot.children.length) {
    const c = gridRoot.children.pop();
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
  if (!showGridEl.checked) return;
  const bounds = getVisibleBounds();
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const minor = GRID_SIZE;
  const major = GRID_SIZE * 10;
  const extra = span * 3;
  const minX = Math.floor((bounds.minX - extra) / minor) * minor;
  const maxX = Math.ceil((bounds.maxX + extra) / minor) * minor;
  const minY = Math.floor((bounds.minY - extra) / minor) * minor;
  const maxY = Math.ceil((bounds.maxY + extra) / minor) * minor;
  const minorPts = [];
  const majorPts = [];
  for (let x = minX; x <= maxX; x += minor) {
    const target = Math.round(x / major) * major === x ? majorPts : minorPts;
    target.push(new THREE.Vector3(x, minY, -1), new THREE.Vector3(x, maxY, -1));
  }
  for (let y = minY; y <= maxY; y += minor) {
    const target = Math.round(y / major) * major === y ? majorPts : minorPts;
    target.push(new THREE.Vector3(minX, y, -1), new THREE.Vector3(maxX, y, -1));
  }
  const minorObj = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(minorPts), new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.8 }));
  const majorObj = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(majorPts), new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.95 }));
  gridRoot.add(minorObj, majorObj);
}

function snapWorld(pos, excludeEntityId = null) {
  let snapped = { ...pos, kind: 'free' };
  if (snapGridEl.checked) {
    snapped.x = Math.round(snapped.x / GRID_SIZE) * GRID_SIZE;
    snapped.y = Math.round(snapped.y / GRID_SIZE) * GRID_SIZE;
    snapped.kind = 'grid';
  }
  if (snapPointsEl.checked) {
    let best = null;
    const threshold = 8 / camera.zoom;
    for (const e of doc.entities) {
      if (e.id === excludeEntityId) continue;
      const layer = getLayer(doc, e.layer || '0');
      if (!layer.visible) continue;
      for (const pt of getEntitySnapPoints(e)) {
        const d = distance(pos, pt);
        if (d <= threshold && (!best || d < best.d)) best = { ...pt, d };
      }
    }
    if (best) snapped = { x: best.x, y: best.y, kind: best.kind };
  }
  return snapped;
}

function makeHandle(pos, color = 0xfbbf24, meta = {}, sizeScale = 1) {
  const geom = new THREE.CircleGeometry(HANDLE_BASE_RADIUS, 20);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  const ringGeom = new THREE.RingGeometry(HANDLE_BASE_RADIUS * 1.12, HANDLE_BASE_RADIUS * 1.38, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.z = -0.02;
  mesh.add(ring);
  mesh.position.set(pos.x, pos.y, 3);
  mesh.userData = {
    handle: true,
    handleSizeScale: sizeScale,
    baseColor: color,
    fillMaterial: mat,
    ringMaterial: ringMat,
    ...meta,
  };
  const zoomScale = 1 / Math.max(0.1, camera.zoom);
  mesh.scale.setScalar(sizeScale * zoomScale);
  return mesh;
}

function updateHandleVisualScale() {
  const zoomScale = 1 / Math.max(0.1, camera.zoom);
  for (const handle of handlesRoot.children) {
    const isHovered = sameHandleRef(handle.userData, hoveredHandle);
    const isActive = sameHandleRef(handle.userData, activeHandle);
    const hoverBoost = isActive ? 1.18 : (isHovered ? 1.08 : 1);
    const scale = (handle.userData?.handleSizeScale || 1) * zoomScale * hoverBoost;
    handle.scale.setScalar(scale);
    const fillMat = handle.userData?.fillMaterial;
    const ringMat = handle.userData?.ringMaterial;
    if (fillMat) {
      fillMat.color.setHex(isActive ? 0xef4444 : (handle.userData?.baseColor || 0xfbbf24));
    }
    if (ringMat) {
      if (isActive) {
        ringMat.color.setHex(0xef4444);
        ringMat.opacity = 0.95;
      } else if (isHovered) {
        ringMat.color.setHex(0x38bdf8);
        ringMat.opacity = 0.9;
      } else {
        ringMat.opacity = 0;
      }
    }
  }
}

function disposeObject(object3d) {
  if (!object3d) return;
  for (const child of [...(object3d.children || [])]) {
    disposeObject(child);
  }
  const material = object3d.material;
  if (Array.isArray(material)) {
    material.forEach((item) => item?.dispose?.());
  } else {
    material?.dispose?.();
  }
  object3d.geometry?.dispose?.();
  object3d.parent?.remove(object3d);
}

function entityToObject(entity) {
  const layer = getLayer(doc, entity.layer || '0');
  const selected = selectedIds.has(entity.id);
  const color = selected ? 0x38bdf8 : 0xe5e7eb;
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: layer.visible ? 1 : 0.08 });
  let obj = null;
  if (entity.type === 'LINE') {
    obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(entity.x1, entity.y1, 0),
      new THREE.Vector3(entity.x2, entity.y2, 0),
    ]), material);
  } else if (entity.type === 'POINT') {
    const s = 3 / Math.max(0.1, camera.zoom);
    obj = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(entity.x - s, entity.y, 0), new THREE.Vector3(entity.x + s, entity.y, 0),
      new THREE.Vector3(entity.x, entity.y - s, 0), new THREE.Vector3(entity.x, entity.y + s, 0),
    ]), material);
  } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    const start = entity.type === 'ARC' ? THREE.MathUtils.degToRad(entity.startAngle) : 0;
    let end = entity.type === 'ARC' ? THREE.MathUtils.degToRad(entity.endAngle) : Math.PI * 2;
    if (entity.type === 'ARC' && end <= start) end += Math.PI * 2;
    const curve = new THREE.EllipseCurve(entity.cx, entity.cy, entity.r, entity.r, start, end, false, 0);
    const pts = curve.getPoints(Math.max(40, Math.ceil(entity.r * 0.75)));
    obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0))), material);
  } else if (entity.points?.length) {
    const pts = entity.points.map((p) => new THREE.Vector3(p.x, p.y, 0));
    if (entity.closed && entity.points.length > 2) pts.push(new THREE.Vector3(entity.points[0].x, entity.points[0].y, 0));
    obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
  }
  obj.userData.entityId = entity.id;
  obj.visible = layer.visible;
  return obj;
}

function buildHandles() {
  while (handlesRoot.children.length) disposeObject(handlesRoot.children[0]);
  if (tool !== 'vertex') return;
  for (const id of selectedIds) {
    const e = entityById(id);
    if (!e) continue;
    if (e.type === 'LINE') {
      handlesRoot.add(makeHandle({ x: e.x1, y: e.y1 }, 0xfbbf24, { entityId: e.id, vertexIndex: 0 }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.x2, y: e.y2 }, 0xfbbf24, { entityId: e.id, vertexIndex: 1 }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }, 0xfbbf24, { entityId: e.id, vertexIndex: 'midpoint' }, YELLOW_HANDLE_SCALE));
    } else if (e.type === 'POINT') {
      handlesRoot.add(makeHandle({ x: e.x, y: e.y }, 0xfbbf24, { entityId: e.id, vertexIndex: 'point' }, YELLOW_HANDLE_SCALE));
    } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
      // Centro com a mesma escala dos handles amarelos para manter leitura visual consistente (auto-sync F3).
      handlesRoot.add(makeHandle({ x: e.cx, y: e.cy }, 0x22c55e, { entityId: e.id, vertexIndex: 'center' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx + e.r, y: e.cy }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusE' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx, y: e.cy + e.r }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusN' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx - e.r, y: e.cy }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusW' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx, y: e.cy - e.r }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusS' }, YELLOW_HANDLE_SCALE));
    } else if (e.points?.length) {
      e.points.forEach((p, i) => handlesRoot.add(makeHandle(p, 0xfbbf24, { entityId: e.id, vertexIndex: i }, YELLOW_HANDLE_SCALE)));
    }
  }
  updateHandleVisualScale();
}

function updateEntityObject(entityId) {
  const old = meshByEntityId.get(entityId);
  if (!old) return;
  const entity = entityById(entityId);
  const replacement = entityToObject(entity);
  workRoot.add(replacement);
  workRoot.remove(old);
  old.geometry?.dispose?.();
  old.material?.dispose?.();
  meshByEntityId.set(entityId, replacement);
}

function rebuildScene() {
  for (const child of [...workRoot.children, ...handlesRoot.children]) disposeObject(child);
  meshByEntityId = new Map();
  for (const entity of doc.entities) {
    const obj = entityToObject(entity);
    workRoot.add(obj);
    meshByEntityId.set(entity.id, obj);
  }
  buildHandles();
  rebuildGrid();
  rebuildMeasurements();
  requestRender();
}

function clearMeasurements() {
  closeMeasurementEditor({ apply: false, silent: true });
  while (measureRoot.children.length) {
    const c = measureRoot.children.pop();
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
  for (const item of measurementLabels) item.el.remove();
  measurementLabels = [];
  labelsLayer.style.display = 'none';
}

function collectMeasurementItems() {
  const items = [];
  const MAX_ITEMS = 220;
  for (const id of selectedIds) {
    const e = entityById(id);
    if (!e) continue;
    if (e.type === 'LINE') {
      items.push({
        kind: 'segment',
        entityId: e.id,
        entityType: e.type,
        start: { x: e.x1, y: e.y1 },
        end: { x: e.x2, y: e.y2 },
      });
    } else if (e.type === 'CIRCLE') {
      if (Math.abs(Number(e.r) || 0) > 1e-6) {
        items.push({
          kind: 'circle',
          entityId: e.id,
          entityType: e.type,
          cx: Number(e.cx) || 0,
          cy: Number(e.cy) || 0,
          r: Math.abs(Number(e.r) || 0),
        });
      }
    } else if (e.type === 'ARC') {
      if (Math.abs(Number(e.r) || 0) > 1e-6) {
        items.push({
          kind: 'arc',
          entityId: e.id,
          entityType: e.type,
          cx: Number(e.cx) || 0,
          cy: Number(e.cy) || 0,
          r: Math.abs(Number(e.r) || 0),
          startAngle: Number(e.startAngle) || 0,
          endAngle: Number(e.endAngle) || 0,
        });
      }
    } else if (e.points?.length && e.points.length >= 2) {
      for (let i = 1; i < e.points.length; i += 1) {
        items.push({
          kind: 'segment',
          entityId: e.id,
          entityType: 'POLY',
          start: e.points[i - 1],
          end: e.points[i],
        });
        if (items.length >= MAX_ITEMS) break;
      }
      if (e.closed && e.points.length > 2 && items.length < MAX_ITEMS) {
        items.push({
          kind: 'segment',
          entityId: e.id,
          entityType: 'POLY',
          start: e.points[e.points.length - 1],
          end: e.points[0],
        });
      }
    }
    if (items.length >= MAX_ITEMS) break;
  }
  return items.slice(0, MAX_ITEMS);
}

function addMeasurementLabel(worldPos, text, kind = 'linear', edit = null) {
  const el = document.createElement('div');
  el.className = `measure-label measure-label--${kind}`;
  el.textContent = text;
  labelsLayer.appendChild(el);
  const item = { el, worldPos, edit };
  measurementLabels.push(item);

  if (edit) {
    el.classList.add('measure-label--editable');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.title = 'Clique para editar. Enter aplica.';
    const openEditor = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMeasurementEditor(item);
    };
    el.addEventListener('click', openEditor);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openEditor(event);
    });
  }
}

function countLineConnectionAtPoint(entityId, point) {
  let count = 0;
  for (const entity of doc.entities) {
    if (!entity || entity.id === entityId) continue;
    const points = [];
    if (entity.type === 'LINE') {
      points.push(
        { x: Number(entity.x1) || 0, y: Number(entity.y1) || 0 },
        { x: Number(entity.x2) || 0, y: Number(entity.y2) || 0 }
      );
    } else if (entity.type === 'ARC') {
      const radius = Math.abs(Number(entity.r) || 0);
      if (radius > 1e-9) {
        const start = THREE.MathUtils.degToRad(Number(entity.startAngle) || 0);
        const end = THREE.MathUtils.degToRad(Number(entity.endAngle) || 0);
        const cx = Number(entity.cx) || 0;
        const cy = Number(entity.cy) || 0;
        points.push(
          { x: cx + Math.cos(start) * radius, y: cy + Math.sin(start) * radius },
          { x: cx + Math.cos(end) * radius, y: cy + Math.sin(end) * radius }
        );
      }
    } else if (entity.points?.length) {
      for (const p of entity.points) {
        points.push({ x: Number(p.x) || 0, y: Number(p.y) || 0 });
      }
    } else if (entity.type === 'POINT') {
      points.push({ x: Number(entity.x) || 0, y: Number(entity.y) || 0 });
    }
    if (points.some((candidate) => distance(candidate, point) <= LINE_CONNECTION_TOLERANCE_MM)) {
      count += 1;
    }
  }
  return count;
}

function pickLineLengthAnchorEndpoint(line) {
  const p1 = { x: Number(line.x1) || 0, y: Number(line.y1) || 0 };
  const p2 = { x: Number(line.x2) || 0, y: Number(line.y2) || 0 };
  const c1 = countLineConnectionAtPoint(line.id, p1);
  const c2 = countLineConnectionAtPoint(line.id, p2);
  if (c1 !== c2) return c1 > c2 ? 0 : 1;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Empate: em linhas no eixo X, ancora o menor X para crescer para frente no X.
    return p1.x <= p2.x ? 0 : 1;
  }
  // Empate: em linhas no eixo Y, ancora o menor Y para crescer para frente no Y.
  return p1.y <= p2.y ? 0 : 1;
}

function setLineLengthFromAnchor(line, targetLength, anchorEndpointIndex) {
  const safeLength = Math.max(0.001, targetLength);
  const anchorIsStart = anchorEndpointIndex === 0;
  const anchor = anchorIsStart
    ? { x: Number(line.x1) || 0, y: Number(line.y1) || 0 }
    : { x: Number(line.x2) || 0, y: Number(line.y2) || 0 };
  const moving = anchorIsStart
    ? { x: Number(line.x2) || 0, y: Number(line.y2) || 0 }
    : { x: Number(line.x1) || 0, y: Number(line.y1) || 0 };
  let dx = moving.x - anchor.x;
  let dy = moving.y - anchor.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 1;
    dy = 0;
    len = 1;
  }
  const ux = dx / len;
  const uy = dy / len;
  const newMoving = {
    x: anchor.x + ux * safeLength,
    y: anchor.y + uy * safeLength,
  };
  if (anchorIsStart) {
    line.x2 = newMoving.x;
    line.y2 = newMoving.y;
    return;
  }
  line.x1 = newMoving.x;
  line.y1 = newMoving.y;
}

function arcSweepDeg(entity) {
  const start = Number(entity.startAngle) || 0;
  const end = Number(entity.endAngle) || 0;
  return normalizeDeg(end - start);
}

function applyMeasurementLineLength(entityId, valueMm) {
  const entity = entityById(entityId);
  if (!entity || entity.type !== 'LINE') return false;
  pushUndo('editar medida linear');
  const anchorIndex = pickLineLengthAnchorEndpoint(entity);
  setLineLengthFromAnchor(entity, valueMm, anchorIndex);
  return true;
}

function applyMeasurementCircleRadius(entityId, valueMm) {
  const entity = entityById(entityId);
  if (!entity || entity.type !== 'CIRCLE') return false;
  pushUndo('editar raio do circulo');
  entity.r = Math.max(0.001, valueMm);
  return true;
}

function applyMeasurementArcRadius(entityId, valueMm) {
  const entity = entityById(entityId);
  if (!entity || entity.type !== 'ARC') return false;
  pushUndo('editar raio do arco');
  entity.r = Math.max(0.001, valueMm);
  return true;
}

function applyMeasurementArcSweep(entityId, valueDeg) {
  const entity = entityById(entityId);
  if (!entity || entity.type !== 'ARC') return false;
  const safeDeg = clampValue(valueDeg, 0.1, 359.999);
  pushUndo('editar angulo do arco');
  const start = Number(entity.startAngle) || 0;
  entity.endAngle = normalizeDeg(start + safeDeg);
  return true;
}

function applyMeasurementArcLength(entityId, valueMm) {
  const entity = entityById(entityId);
  if (!entity || entity.type !== 'ARC') return false;
  if ((Number(entity.r) || 0) <= 1e-6) return false;
  const sweepDeg = THREE.MathUtils.radToDeg(valueMm / entity.r);
  return applyMeasurementArcSweep(entityId, sweepDeg);
}

function closeMeasurementEditor(options = {}) {
  const { apply = false, silent = false } = options;
  if (!activeMeasurementEditor) return false;
  const { input, labelItem } = activeMeasurementEditor;
  activeMeasurementEditor = null;

  let applied = false;
  if (apply && labelItem?.edit?.applyValue) {
    const raw = String(input.value ?? '').trim();
    const value = parsePositiveMm(raw);
    if (!value) {
      if (!silent) setStatus('Medida invalida. Informe valor maior que zero.');
    } else if (labelItem.edit.applyValue(value)) {
      applied = true;
      if (!silent) {
        setStatus(labelItem.edit.successMessage
          ? labelItem.edit.successMessage(value)
          : `Medida aplicada: ${value.toFixed(2)} ${labelItem.edit.unit || 'mm'}.`);
      }
    } else if (!silent) {
      setStatus('Nao foi possivel aplicar a medida nesta geometria.');
    }
  }

  if (labelItem?.el && labelItem.el.isConnected) labelItem.el.style.visibility = '';
  input?.remove?.();

  if (applied) {
    rebuildScene();
    refreshUi();
    updateRectangleDraftPreview();
    requestRender();
  }
  return applied;
}

function openMeasurementEditor(labelItem) {
  if (!labelItem?.edit) return;
  closeMeasurementEditor({ apply: false, silent: true });
  if (!labelItem.el || !labelItem.el.isConnected) return;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0.001';
  input.step = labelItem.edit.step || '0.01';
  input.className = 'measure-edit-input';
  const currentValue = Number(labelItem.edit.currentValue?.());
  input.value = Number.isFinite(currentValue) ? currentValue.toFixed(2) : '';
  input.style.left = labelItem.el.style.left;
  input.style.top = labelItem.el.style.top;
  labelsLayer.appendChild(input);
  labelItem.el.style.visibility = 'hidden';

  activeMeasurementEditor = { input, labelItem };
  input.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      closeMeasurementEditor({ apply: true });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMeasurementEditor({ apply: false, silent: true });
    }
  });
  input.addEventListener('blur', () => {
    closeMeasurementEditor({ apply: false, silent: true });
  });
  input.focus();
  input.select();
}

function rebuildMeasurements() {
  clearMeasurements();
  if (tool !== 'window' || !selectedIds.size) return;
  const items = collectMeasurementItems();
  if (!items.length) return;
  const points = [];
  const pushSegment = (a, b) => {
    points.push(new THREE.Vector3(a.x, a.y, 2.2), new THREE.Vector3(b.x, b.y, 2.2));
  };

  const drawLinearDimension = (start, end, labelText = null, labelKind = 'linear', editConfig = null) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const offset = Math.max(8 / camera.zoom, 1.4);
    const a = { x: start.x + nx * offset, y: start.y + ny * offset };
    const b = { x: end.x + nx * offset, y: end.y + ny * offset };

    const arrowLenRaw = Math.max(4 / camera.zoom, 0.9);
    const arrowLen = Math.min(len * 0.35, arrowLenRaw);
    const arrowHalf = arrowLen * 0.55;

    const aLeft = { x: a.x + ux * arrowLen + nx * arrowHalf, y: a.y + uy * arrowLen + ny * arrowHalf };
    const aRight = { x: a.x + ux * arrowLen - nx * arrowHalf, y: a.y + uy * arrowLen - ny * arrowHalf };
    const bLeft = { x: b.x - ux * arrowLen + nx * arrowHalf, y: b.y - uy * arrowLen + ny * arrowHalf };
    const bRight = { x: b.x - ux * arrowLen - nx * arrowHalf, y: b.y - uy * arrowLen - ny * arrowHalf };

    pushSegment(start, a);
    pushSegment(end, b);
    pushSegment(a, b);
    pushSegment(a, aLeft);
    pushSegment(a, aRight);
    pushSegment(b, bLeft);
    pushSegment(b, bRight);

    const labelPos = { x: (a.x + b.x) / 2 + nx * (4 / camera.zoom), y: (a.y + b.y) / 2 + ny * (4 / camera.zoom) };
    addMeasurementLabel(labelPos, labelText || mm(len), labelKind, editConfig);
  };

  const drawRadiusLeader = (center, radius, angleRad, labelText, labelKind = 'radius', editConfig = null) => {
    if (radius < 1e-6) return;
    const ux = Math.cos(angleRad);
    const uy = Math.sin(angleRad);
    const anchor = { x: center.x + ux * radius, y: center.y + uy * radius };
    const ext = Math.max(10 / camera.zoom, radius * 0.18);
    const leader = { x: anchor.x + ux * ext, y: anchor.y + uy * ext };

    pushSegment(center, anchor);
    pushSegment(anchor, leader);

    const tick = Math.max(3 / camera.zoom, 0.7);
    const nx = -uy;
    const ny = ux;
    const tickA = { x: anchor.x + nx * tick, y: anchor.y + ny * tick };
    const tickB = { x: anchor.x - nx * tick, y: anchor.y - ny * tick };
    pushSegment(tickA, tickB);

    addMeasurementLabel({ x: leader.x + ux * (3 / camera.zoom), y: leader.y + uy * (3 / camera.zoom) }, labelText, labelKind, editConfig);
  };

  const drawArcLengthTag = (arcItem, editConfig = null) => {
    const startRad = THREE.MathUtils.degToRad(arcItem.startAngle);
    const endRad = THREE.MathUtils.degToRad(arcItem.endAngle);
    const sweep = normalizeRad(endRad - startRad);
    if (sweep < 1e-6) return;

    const mid = startRad + sweep / 2;
    const ux = Math.cos(mid);
    const uy = Math.sin(mid);
    const anchor = { x: arcItem.cx + ux * arcItem.r, y: arcItem.cy + uy * arcItem.r };
    const ext = Math.max(10 / camera.zoom, arcItem.r * 0.22);
    const guide = { x: anchor.x + ux * ext, y: anchor.y + uy * ext };
    pushSegment(anchor, guide);

    const arcLen = arcItem.r * sweep;
    addMeasurementLabel({ x: guide.x + ux * (3 / camera.zoom), y: guide.y + uy * (3 / camera.zoom) }, `A ${mm(arcLen)}`, 'arc', editConfig);
  };

  const drawArcAngleTag = (arcItem, editConfig = null) => {
    const startRad = THREE.MathUtils.degToRad(arcItem.startAngle);
    const endRad = THREE.MathUtils.degToRad(arcItem.endAngle);
    const sweep = normalizeRad(endRad - startRad);
    if (sweep < 1e-6) return;

    const mid = startRad + sweep / 2;
    const ux = Math.cos(mid);
    const uy = Math.sin(mid);
    const anchor = { x: arcItem.cx + ux * Math.max(arcItem.r * 0.55, 2), y: arcItem.cy + uy * Math.max(arcItem.r * 0.55, 2) };
    addMeasurementLabel(anchor, `Ang ${deg(THREE.MathUtils.radToDeg(sweep))}`, 'angle', editConfig);
  };

  const drawCircleCircumferenceTag = (circleItem, editConfig = null) => {
    const uy = -1;
    const anchor = { x: circleItem.cx, y: circleItem.cy + uy * circleItem.r };
    const ext = Math.max(10 / camera.zoom, circleItem.r * 0.2);
    const guide = { x: anchor.x, y: anchor.y + uy * ext };
    pushSegment(anchor, guide);
    addMeasurementLabel({ x: guide.x, y: guide.y + uy * (3 / camera.zoom) }, `C ${mm(Math.PI * 2 * circleItem.r)}`, 'circ', editConfig);
  };

  for (const item of items) {
    if (item.kind === 'segment') {
      const segmentLen = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
      const editConfig = item.entityType === 'LINE'
        ? {
          unit: 'mm',
          step: '0.01',
          currentValue: () => {
            const line = entityById(item.entityId);
            if (!line || line.type !== 'LINE') return segmentLen;
            return Math.hypot((line.x2 - line.x1), (line.y2 - line.y1));
          },
          applyValue: (value) => applyMeasurementLineLength(item.entityId, value),
          successMessage: (value) => `Linha ajustada para ${value.toFixed(2)} mm.`,
        }
        : null;
      drawLinearDimension(item.start, item.end, null, 'linear', editConfig);
      continue;
    }
    if (item.kind === 'circle') {
      const left = { x: item.cx - item.r, y: item.cy };
      const right = { x: item.cx + item.r, y: item.cy };
      drawLinearDimension(left, right, `D ${mm(item.r * 2)}`, 'diameter', {
        unit: 'mm',
        step: '0.01',
        currentValue: () => {
          const circle = entityById(item.entityId);
          return circle && circle.type === 'CIRCLE' ? (circle.r * 2) : (item.r * 2);
        },
        applyValue: (value) => applyMeasurementCircleRadius(item.entityId, value / 2),
        successMessage: (value) => `Diametro ajustado para ${value.toFixed(2)} mm.`,
      });
      drawRadiusLeader({ x: item.cx, y: item.cy }, item.r, Math.PI / 4, `R ${mm(item.r)}`, 'radius', {
        unit: 'mm',
        step: '0.01',
        currentValue: () => {
          const circle = entityById(item.entityId);
          return circle && circle.type === 'CIRCLE' ? circle.r : item.r;
        },
        applyValue: (value) => applyMeasurementCircleRadius(item.entityId, value),
        successMessage: (value) => `Raio do circulo ajustado para ${value.toFixed(2)} mm.`,
      });
      addMeasurementLabel({ x: item.cx + item.r * 0.2, y: item.cy }, `Ang ${deg(360)}`, 'angle');
      drawCircleCircumferenceTag(item, {
        unit: 'mm',
        step: '0.01',
        currentValue: () => {
          const circle = entityById(item.entityId);
          const r = circle && circle.type === 'CIRCLE' ? circle.r : item.r;
          return Math.PI * 2 * r;
        },
        applyValue: (value) => applyMeasurementCircleRadius(item.entityId, value / (Math.PI * 2)),
        successMessage: (value) => `Circunferencia ajustada para ${value.toFixed(2)} mm.`,
      });
      continue;
    }
    if (item.kind === 'arc') {
      const startRad = THREE.MathUtils.degToRad(item.startAngle);
      const endRad = THREE.MathUtils.degToRad(item.endAngle);
      const sweep = normalizeRad(endRad - startRad);
      const mid = startRad + sweep / 2;
      drawRadiusLeader({ x: item.cx, y: item.cy }, item.r, mid, `R ${mm(item.r)}`, 'radius', {
        unit: 'mm',
        step: '0.01',
        currentValue: () => {
          const arc = entityById(item.entityId);
          return arc && arc.type === 'ARC' ? arc.r : item.r;
        },
        applyValue: (value) => applyMeasurementArcRadius(item.entityId, value),
        successMessage: (value) => `Raio do arco ajustado para ${value.toFixed(2)} mm.`,
      });
      drawArcAngleTag(item, {
        unit: 'deg',
        step: '0.1',
        currentValue: () => {
          const arc = entityById(item.entityId);
          return arc && arc.type === 'ARC' ? arcSweepDeg(arc) : THREE.MathUtils.radToDeg(sweep);
        },
        applyValue: (value) => applyMeasurementArcSweep(item.entityId, value),
        successMessage: (value) => `Angulo do arco ajustado para ${value.toFixed(2)} deg.`,
      });
      drawArcLengthTag(item, {
        unit: 'mm',
        step: '0.01',
        currentValue: () => {
          const arc = entityById(item.entityId);
          if (!arc || arc.type !== 'ARC') return item.r * sweep;
          const arcSweep = THREE.MathUtils.degToRad(arcSweepDeg(arc));
          return arc.r * arcSweep;
        },
        applyValue: (value) => applyMeasurementArcLength(item.entityId, value),
        successMessage: (value) => `Comprimento do arco ajustado para ${value.toFixed(2)} mm.`,
      });
    }
  }

  if (!points.length) return;
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.95 });
  const lines = new THREE.LineSegments(geom, mat);
  measureRoot.add(lines);
  labelsLayer.style.display = 'block';
  updateLabelPositions();
}

function rebuildLabels() {
  clearMeasurements();
}

function updateLabelPositions() {
  if (!measurementLabels.length) {
    updateRotationHudPosition();
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  for (const item of measurementLabels) {
    const v = new THREE.Vector3(item.worldPos.x, item.worldPos.y, 0).project(camera);
    if (v.z < -1 || v.z > 1) {
      item.el.style.display = 'none';
      continue;
    }
    item.el.style.display = 'block';
    item.el.style.left = `${(v.x * 0.5 + 0.5) * rect.width}px`;
    item.el.style.top = `${(-v.y * 0.5 + 0.5) * rect.height}px`;
    if (activeMeasurementEditor?.labelItem === item && activeMeasurementEditor?.input) {
      activeMeasurementEditor.input.style.left = item.el.style.left;
      activeMeasurementEditor.input.style.top = item.el.style.top;
    }
  }
  updateRotationHudPosition();
}

function fitView() {
  const b = docBounds(doc, true);
  const width = Math.max(10, b.maxX - b.minX);
  const height = Math.max(10, b.maxY - b.minY);
  const rect = viewportWrap.getBoundingClientRect();
  const aspect = rect.width / Math.max(1, rect.height);
  const halfH = Math.max(height * 0.65, width / aspect * 0.65);
  const halfW = halfH * aspect;
  camera.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 100);
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.target.set(camera.position.x, camera.position.y, 0);
  controls.update();
  updateHandleVisualScale();
  rebuildGrid();
  updateLabelPositions();
  requestRender();
}

function refreshLayers() {
  layersEl.innerHTML = '';
  const countByLayer = new Map();
  for (const entity of doc.entities) {
    const layerName = entity.layer || '0';
    countByLayer.set(layerName, (countByLayer.get(layerName) || 0) + 1);
  }
  const pieceCode = currentPieceCode();
  for (const layer of doc.layers) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    const name = document.createElement('div');
    name.textContent = layer.name;
    const codeEl = document.createElement('div');
    codeEl.className = 'layer-code';
    const count = countByLayer.get(layer.name) || 0;
    if (!count) {
      codeEl.textContent = 'Sem codigo';
    } else {
      codeEl.textContent = pieceCode;
    }
    row.append(name, codeEl);
    layersEl.appendChild(row);
  }
}

function refreshSelectionInfo() {
  const pieceCode = currentPieceCode();
  const pieceSize = currentPieceSize();
  if (!selectedIds.size) {
    selectionInfoEl.innerHTML = `
      <div class="metric"><strong>${pieceCode}</strong></div>
      <div class="metric">Tamanho X: ${mm(pieceSize.x)}</div>
      <div class="metric">Tamanho Y: ${mm(pieceSize.y)}</div>
      <div class="small">Nenhum objeto selecionado.</div>
    `;
    return;
  }
  if (tool === 'select') {
    selectionInfoEl.innerHTML = `
      <div class="small">${selectedIds.size === 1 ? '1 peca selecionada.' : `${selectedIds.size} pecas selecionadas.`}</div>
    `;
    return;
  }
  if (selectedIds.size > 1) {
    selectionInfoEl.innerHTML = `
      <div class="metric"><span class="badge">${selectedIds.size}</span> pecas selecionadas</div>
      <div class="small">Codigo da peca: ${pieceCode}</div>
      <div class="metric">Tamanho X: ${mm(pieceSize.x)}</div>
      <div class="metric">Tamanho Y: ${mm(pieceSize.y)}</div>
    `;
    return;
  }
  if (!entityById([...selectedIds][0])) return;
  selectionInfoEl.innerHTML = `
    <div class="metric"><strong>${pieceCode}</strong></div>
    <div class="metric">Tamanho X: ${mm(pieceSize.x)}</div>
    <div class="metric">Tamanho Y: ${mm(pieceSize.y)}</div>
    <div class="small">1 peca selecionada.</div>
  `;
}

function makeInputRow(label, value, onChange, type = 'text', step = '0.01') {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.step = step;
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  row.append(l, input);
  return row;
}

function refreshProperties() {
  propertiesEl.innerHTML = '';
  if (tool === 'select' || tool === 'vertex') return;
  if (selectedIds.size !== 1) return;
  const e = entityById([...selectedIds][0]);
  if (!e) return;
  propertiesEl.appendChild(makeInputRow('Camada', e.layer || '0', (v) => { e.layer = v || '0'; ensureLayers(doc); rebuildScene(); refreshUi(); }, 'text', '1'));
  if (e.type === 'LINE') {
    [['X1', e.x1], ['Y1', e.y1], ['X2', e.x2], ['Y2', e.y2]].forEach(([k, v]) => {
      propertiesEl.appendChild(makeInputRow(`${k} (mm)`, v, (val) => { e[k.toLowerCase()] = Number(val) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
    });
  } else if (e.type === 'POINT') {
    propertiesEl.appendChild(makeInputRow('X (mm)', e.x, (v) => { e.x = Number(v) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
    propertiesEl.appendChild(makeInputRow('Y (mm)', e.y, (v) => { e.y = Number(v) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
  } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
    propertiesEl.appendChild(makeInputRow('CX (mm)', e.cx, (v) => { e.cx = Number(v) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
    propertiesEl.appendChild(makeInputRow('CY (mm)', e.cy, (v) => { e.cy = Number(v) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
    propertiesEl.appendChild(makeInputRow('Raio (mm)', e.r, (v) => { e.r = Math.max(0.001, Number(v) || 0.001); updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
    if (e.type === 'ARC') {
      propertiesEl.appendChild(makeInputRow('Angulo ini', e.startAngle, (v) => { e.startAngle = Number(v) || 0; updateEntityObject(e.id); requestRender(); }));
      propertiesEl.appendChild(makeInputRow('Angulo fim', e.endAngle, (v) => { e.endAngle = Number(v) || 0; updateEntityObject(e.id); requestRender(); }));
    }
  } else if (e.points?.length) {
    propertiesEl.appendChild(makeInputRow('Fechada', e.closed ? 'sim' : 'nao', (v) => { e.closed = String(v).toLowerCase().startsWith('s'); updateEntityObject(e.id); updateLabelPositions(); requestRender(); }, 'text', '1'));
    e.points.slice(0, 8).forEach((p, i) => {
      propertiesEl.appendChild(makeInputRow(`P${i + 1} X`, p.x, (v) => { e.points[i].x = Number(v) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
      propertiesEl.appendChild(makeInputRow(`P${i + 1} Y`, p.y, (v) => { e.points[i].y = Number(v) || 0; updateEntityObject(e.id); buildHandles(); updateLabelPositions(); refreshSelectionInfo(); requestRender(); }));
    });
  }
}

function refreshUi() {
  refreshLayers();
  refreshSelectionInfo();
  refreshProperties();
  updateCornerSelectionInfo();
  updateLinkSelectionInfo();
}

function setTool(next) {
  if (linkCommandOpen && next !== 'vertex') {
    closeLinkCommand({ silent: true });
  }
  if (option3CommandOpen && next === 'vertex') {
    closeOption3Command({ silent: true });
  }
  if (cornerCommandOpen && next === 'vertex') {
    closeCornerCommand({ silent: true });
  }
  tool = next;
  if (next !== 'vertex') {
    setHoveredHandle(null);
    setActiveHandle(null);
  }
  toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === next));
  controls.enabled = next !== 'window';
  buildHandles();
  rebuildMeasurements();
  updateActionSlotAvailability();
  refreshUi();
  updateRectangleDraftPreview();
  requestRender();
}

function selectSingle(id) {
  setHoveredHandle(null);
  setActiveHandle(null);
  selectedIds = new Set(id ? [id] : []);
  rebuildScene();
  refreshUi();
  updateRectangleDraftPreview();
}

function updateSelectionRect(start, end) {
  selectionRectEl.style.display = 'block';
  selectionRectEl.style.left = `${Math.min(start.x, end.x)}px`;
  selectionRectEl.style.top = `${Math.min(start.y, end.y)}px`;
  selectionRectEl.style.width = `${Math.abs(end.x - start.x)}px`;
  selectionRectEl.style.height = `${Math.abs(end.y - start.y)}px`;
}

function hideSelectionRect() { selectionRectEl.style.display = 'none'; }

function windowSelect(startWorld, endWorld, additive = false) {
  const rect = {
    minX: Math.min(startWorld.x, endWorld.x),
    maxX: Math.max(startWorld.x, endWorld.x),
    minY: Math.min(startWorld.y, endWorld.y),
    maxY: Math.max(startWorld.y, endWorld.y),
  };
  const ids = doc.entities.filter((e) => getLayer(doc, e.layer || '0').visible && entityIntersectsRect(e, rect)).map((e) => e.id);
  if (additive) {
    for (const id of ids) selectedIds.add(id);
  } else {
    selectedIds = new Set(ids);
  }
  setHoveredHandle(null);
  setActiveHandle(null);
  rebuildScene();
  refreshUi();
  updateRectangleDraftPreview();
  setStatus(`${ids.length} peca(s) selecionada(s) por janela.`);
}

function windowPickSelect(clientX, clientY, additive = false) {
  const hit = intersectObjects(clientX, clientY, false);
  const entityId = hit?.type === 'entity' ? hit.object.userData.entityId : null;
  if (!entityId) {
    if (!additive) selectedIds.clear();
    setHoveredHandle(null);
    setActiveHandle(null);
    rebuildScene();
    refreshUi();
    updateRectangleDraftPreview();
    setStatus('Janela: nenhum vertice/linha encontrado no clique.');
    return;
  }
  const entity = entityById(entityId);
  if (!isEntityEditable(doc, entity)) return;

  if (additive) {
    if (selectedIds.has(entityId)) selectedIds.delete(entityId);
    else selectedIds.add(entityId);
  } else {
    selectedIds = new Set([entityId]);
  }
  setHoveredHandle(null);
  setActiveHandle(null);
  rebuildScene();
  refreshUi();
  updateRectangleDraftPreview();
  setStatus(`Janela: ${selectedIds.size} vertice(s)/linha(s) selecionada(s) por clique.`);
}

function collectVertexCandidates(entity) {
  const pts = [];
  if (entity.type === 'LINE') {
    pts.push(
      { idx: 0, p: { x: entity.x1, y: entity.y1 } },
      { idx: 1, p: { x: entity.x2, y: entity.y2 } },
      { idx: 'midpoint', p: { x: (entity.x1 + entity.x2) / 2, y: (entity.y1 + entity.y2) / 2 } },
    );
  } else if (entity.type === 'POINT') {
    pts.push({ idx: 'point', p: { x: entity.x, y: entity.y } });
  } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
    pts.push(
      { idx: 'center', p: { x: entity.cx, y: entity.cy } },
      { idx: 'radiusE', p: { x: entity.cx + entity.r, y: entity.cy } },
      { idx: 'radiusN', p: { x: entity.cx, y: entity.cy + entity.r } },
      { idx: 'radiusW', p: { x: entity.cx - entity.r, y: entity.cy } },
      { idx: 'radiusS', p: { x: entity.cx, y: entity.cy - entity.r } },
    );
  } else if (entity.points) {
    entity.points.forEach((p, i) => pts.push({ idx: i, p }));
  }
  return pts;
}

function getVertexPosition(entity, vertexIndex) {
  const candidate = collectVertexCandidates(entity).find((item) => item.idx === vertexIndex);
  return candidate?.p || null;
}

function hoverHandleNear(clientX, clientY, options = {}) {
  if (tool !== 'vertex') return null;
  const includeAllVisible = Boolean(options.includeAllVisible);
  const selectedIdsSet = new Set(selectedIds);
  const candidateIds = includeAllVisible
    ? doc.entities
      .filter((entity) => {
        const layer = getLayer(doc, entity.layer || '0');
        return layer.visible && isEntityEditable(doc, entity);
      })
      .map((entity) => entity.id)
    : [...selectedIds];
  if (!candidateIds.length) return null;
  const world = worldFromClient(clientX, clientY);
  let best = null;
  const threshold = pickRadiusWorld(VERTEX_PICK_RADIUS_PX);
  for (const eId of candidateIds) {
    const e = entityById(eId);
    if (!e) continue;
    const priority = selectedIdsSet.has(e.id) ? 0 : 1;
    const pts = collectVertexCandidates(e);
    for (const item of pts) {
      const d = distance(world, item.p);
      if (d >= threshold) continue;
      if (!best || priority < best.priority || (priority === best.priority && d < best.d)) {
        best = { entityId: e.id, vertexIndex: item.idx, d, priority };
      }
    }
  }
  if (!best) return null;
  return { entityId: best.entityId, vertexIndex: best.vertexIndex, d: best.d };
}

function startDrag(clientX, clientY, additive = false) {
  const hit = intersectObjects(clientX, clientY, tool === 'vertex');
  const world = worldFromClient(clientX, clientY);
  if (linkCommandOpen) {
    handleLinkCanvasPick(clientX, clientY);
    return;
  }
  if (tool === 'window') {
    dragState = { type: 'window', startWorld: world, startClient: clientToLocal(clientX, clientY), additive };
    updateSelectionRect(dragState.startClient, dragState.startClient);
    return;
  }
  if (tool === 'vertex') {
    const hover = hoverHandleNear(clientX, clientY, { includeAllVisible: true });
    if (hover) {
      // Com ponto ativo (vermelho), bloqueia arraste, mas permite trocar o ponto ativo.
      if (activeHandle) {
        const sameActive = sameHandleRef(activeHandle, hover);
        if (!sameActive) {
          if (selectedIds.size !== 1 || !selectedIds.has(hover.entityId)) {
            selectSingle(hover.entityId);
          }
          setActiveHandle(hover);
          setStatus('Ponto ativo alterado. Arraste bloqueado ate limpar selecao com Esc ou clique fora.');
          return;
        }
        setStatus('Ponto ativo travado. Pressione Esc ou clique fora para deselecionar antes de mover.');
        return;
      }
      if (selectedIds.size !== 1 || !selectedIds.has(hover.entityId)) {
        selectSingle(hover.entityId);
      }
      const hoverEntity = entityById(hover.entityId);
      const startVertexPos = hoverEntity ? getVertexPosition(hoverEntity, hover.vertexIndex) : null;
      if (!startVertexPos) {
        setStatus('Nao foi possivel selecionar este vertice.');
        return;
      }
      setActiveHandle(hover);
      dragState = {
        type: 'vertex',
        ...hover,
        undoPushed: false,
        started: false,
        changed: false,
        movedPx: 0,
        startTimeMs: performance.now(),
        startClient: { x: clientX, y: clientY },
        startWorld: { x: world.x, y: world.y },
        startVertexPos: { x: startVertexPos.x, y: startVertexPos.y },
        startEntitySnapshot: JSON.parse(JSON.stringify(hoverEntity)),
      };
      setStatus('Vertice selecionado. Arraste para editar.');
      return;
    }
    setActiveHandle(null);
  }
  if (hit?.type === 'entity') {
    const entityId = hit.object.userData.entityId;
    const entity = entityById(entityId);
    if (!isEntityEditable(doc, entity)) return;
    if (cornerCommandOpen) {
      if (selectedIds.has(entityId)) {
        selectedIds.delete(entityId);
      } else {
        selectedIds.add(entityId);
      }
      setHoveredHandle(null);
      setActiveHandle(null);
      rebuildScene();
      refreshUi();
      const lineCount = getCornerSelectedLines().length;
      const pairCount = Math.floor(lineCount / 2);
      setStatus(`Opcao 2: ${lineCount} linha(s)/vertice(s) selecionada(s), ${pairCount} par(es).`);
      return;
    }
    if (!selectedIds.has(entityId)) selectSingle(entityId);
    const moveStart = snapWorld(world);
    const entityIds = [...selectedIds];
    dragState = {
      type: 'move',
      entityIds,
      last: moveStart,
      totalDx: 0,
      totalDy: 0,
      undoPushed: false,
      objects: entityIds.map((id) => meshByEntityId.get(id)).filter(Boolean),
    };
    return;
  }
  if (tool === 'select' || tool === 'vertex') {
    dragState = { type: 'window', startWorld: world, startClient: clientToLocal(clientX, clientY), additive };
    updateSelectionRect(dragState.startClient, dragState.startClient);
  }
}

function moveDrag(clientX, clientY) {
  if (!dragState) return;
  const worldRaw = worldFromClient(clientX, clientY);
  if (dragState.type === 'window') {
    updateSelectionRect(dragState.startClient, clientToLocal(clientX, clientY));
    return;
  }
  if (dragState.type === 'vertex') {
    const entity = entityById(dragState.entityId);
    if (!entity) return;
    const dragPx = Math.hypot(clientX - dragState.startClient.x, clientY - dragState.startClient.y);
    dragState.movedPx = Math.max(dragState.movedPx || 0, dragPx);

    if (!dragState.started) {
      if (dragPx < VERTEX_DRAG_DEADZONE_PX) return;
      dragState.started = true;
    }

    const deltaX = worldRaw.x - dragState.startWorld.x;
    const deltaY = worldRaw.y - dragState.startWorld.y;
    const targetWorld = snapWorld({
      x: dragState.startVertexPos.x + deltaX,
      y: dragState.startVertexPos.y + deltaY,
    }, entity.id);

    const currentPos = getVertexPosition(entity, dragState.vertexIndex);
    if (!currentPos || distance(currentPos, targetWorld) <= 1e-6) return;
    if (!dragState.undoPushed) {
      pushUndo('editar vertice');
      dragState.undoPushed = true;
    }
    updateVertex(entity, dragState.vertexIndex, targetWorld);
    dragState.changed = true;
    updateEntityObject(entity.id);
    buildHandles();
    updateLabelPositions();
    refreshSelectionInfo();
    requestRender();
    return;
  }
  if (dragState.type === 'move') {
    const world = snapWorld(worldRaw);
    const dx = world.x - dragState.last.x;
    const dy = world.y - dragState.last.y;
    if (dx === 0 && dy === 0) return;
    if (!dragState.undoPushed) {
      pushUndo('mover pecas');
      dragState.undoPushed = true;
    }
    dragState.last = world;
    dragState.totalDx += dx;
    dragState.totalDy += dy;
    for (const obj of dragState.objects) {
      obj.position.x += dx;
      obj.position.y += dy;
    }
    requestRender();
  }
}

function endDrag(clientX, clientY) {
  if (!dragState) return;
  if (dragState.type === 'window') {
    const start = dragState.startClient;
    const end = clientToLocal(clientX, clientY);
    const dragPx = Math.hypot(end.x - start.x, end.y - start.y);
    if (dragPx <= 6) {
      windowPickSelect(clientX, clientY, Boolean(dragState.additive));
    } else {
      const endWorld = worldFromClient(clientX, clientY);
      windowSelect(dragState.startWorld, endWorld, Boolean(dragState.additive));
    }
    hideSelectionRect();
  } else if (dragState.type === 'move') {
    if (dragState.totalDx !== 0 || dragState.totalDy !== 0) {
      for (const id of dragState.entityIds) {
        const e = entityById(id);
        if (!e) continue;
        translateEntity(e, dragState.totalDx, dragState.totalDy);
      }
      rebuildScene();
      refreshUi();
    }
  } else if (dragState.type === 'vertex') {
    const entity = entityById(dragState.entityId);
    const elapsedMs = performance.now() - (dragState.startTimeMs || 0);
    const accidentalClick = Boolean(
      dragState.changed
      && (dragState.movedPx || 0) <= VERTEX_DRAG_CLICK_GUARD_PX
      && elapsedMs <= VERTEX_DRAG_CLICK_GUARD_MS
    );
    if (accidentalClick && entity && dragState.startEntitySnapshot) {
      const idx = doc.entities.findIndex((item) => item.id === entity.id);
      if (idx >= 0) {
        doc.entities[idx] = dragState.startEntitySnapshot;
        if (dragState.undoPushed && undoStack.length) undoStack.pop();
        updateEntityObject(entity.id);
        buildHandles();
        updateLabelPositions();
        refreshSelectionInfo();
        requestRender();
        setStatus('Clique rapido detectado: geometria preservada (anti-jitter).');
      }
    } else if (dragState.changed) {
      setStatus('Ajuste de vertice aplicado.');
    }
  }
  dragState = null;
}

function exportCurrentDxf() {
  const text = exportDxf(doc);
  const blob = new Blob([text], { type: 'application/dxf;charset=utf-8' });
  const a = document.createElement('a');
  const originalName = (currentFileName || 'editado.dxf').trim();
  a.href = URL.createObjectURL(blob);
  a.download = /\.dxf$/i.test(originalName) ? originalName : `${originalName}.dxf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus('DXF exportado no padrao AC1015, unidade em milimetros.');
}

function importFromText(text, fileName = 'editado.dxf') {
  doc = parseDxf(text, fileName);
  ensureLayers(doc);
  currentFileName = fileName;
  if (!doc.meta) doc.meta = {};
  doc.meta.fileName = fileName;
  doc.meta.pieceCode = fileCodeFromName(fileName);
  selectedIds.clear();
  hoveredHandle = null;
  activeHandle = null;
  hideRotationHud();
  closeRectCommand({ silent: true });
  closeOption3Command({ silent: true });
  closeLinkCommand({ silent: true });
  closeCornerCommand({ silent: true });
  undoStack = [];
  redoStack = [];
  rebuildLabels();
  rebuildScene();
  fitView();
  refreshUi();
  setStatus(`DXF carregado: ${fileName}. Unidade: milimetros.`);
}

function onFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importFromText(String(reader.result || ''), file.name || 'arquivo.dxf');
  reader.readAsText(file);
}

fileInput.addEventListener('change', (e) => onFile(e.target.files?.[0]));
$('exportBtn').addEventListener('click', exportCurrentDxf);
$('fitBtn').addEventListener('click', fitView);
$('duplicateBtn').addEventListener('click', () => {
  if (!selectedIds.size) return;
  pushUndo('duplicar');
  const created = [];
  for (const id of selectedIds) {
    const copy = duplicateEntity(entityById(id));
    translateEntity(copy, GRID_SIZE * 2, GRID_SIZE * 2);
    doc.entities.push(copy);
    created.push(copy.id);
  }
  selectedIds = new Set(created);
  rebuildScene(); refreshUi();
});
$('deleteBtn').addEventListener('click', () => {
  if (!selectedIds.size) return;
  pushUndo('excluir');
  deleteSelected(doc, selectedIds);
  selectedIds.clear();
  hideRotationHud();
  updateCornerSelectionInfo();
  setHoveredHandle(null);
  setActiveHandle(null);
  rebuildScene(); refreshUi();
});
$('rotateBtn').addEventListener('click', () => {
  rotateSelected(90);
});
$('scaleBtn').addEventListener('click', () => {
  transformSelection('escalar', (entity, pivot) => scaleEntity(entity, 1.1, pivot));
});
$('mirrorXBtn').addEventListener('click', () => {
  transformSelection('espelhar x', (entity, pivot) => mirrorEntity(entity, 'x', pivot));
});
$('mirrorYBtn').addEventListener('click', () => {
  transformSelection('espelhar y', (entity, pivot) => mirrorEntity(entity, 'y', pivot));
});
const undoBtn = $('undoBtn');
const redoBtn = $('redoBtn');
if (undoBtn) undoBtn.addEventListener('click', undo);
if (redoBtn) redoBtn.addEventListener('click', redo);
showGridEl.addEventListener('change', () => { rebuildGrid(); requestRender(); });
['snapGrid', 'snapPoints'].forEach((id) => $(id).addEventListener('change', requestRender));

toolButtons.forEach((btn) => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

if (rectCommandPanelEl) {
  rectCommandPanelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
}
if (rectSizeXEl) {
  rectSizeXEl.addEventListener('input', updateRectangleDraftPreview);
  rectSizeXEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      rectSizeYEl?.focus();
      rectSizeYEl?.select();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeRectCommand();
    }
  });
}
if (rectSizeYEl) {
  rectSizeYEl.addEventListener('input', updateRectangleDraftPreview);
  rectSizeYEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createRectangleFromInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeRectCommand();
    }
  });
}
if (rectCreateBtnEl) {
  rectCreateBtnEl.addEventListener('click', () => createRectangleFromInput());
}
if (option3CommandPanelEl) {
  option3CommandPanelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
}
for (const button of option3TypeButtons) {
  button.addEventListener('click', () => {
    setOption3Type(button.dataset.option3Type || 'circle');
    setStatus(`Opcao 3: tipo selecionado - ${option3TypeLabel(option3Type)}.`);
  });
}
if (option3RadiusEl) {
  option3RadiusEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (option3Type === 'capsule90') {
        option3SpanEl?.focus();
        option3SpanEl?.select();
      } else {
        applyOption3Command();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeOption3Command();
    }
  });
}
if (option3SpanEl) {
  option3SpanEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyOption3Command();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeOption3Command();
    }
  });
}
if (option3ApplyBtnEl) {
  option3ApplyBtnEl.addEventListener('click', () => applyOption3Command());
}
if (linkCommandPanelEl) {
  linkCommandPanelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
}
for (const button of linkTypeButtons) {
  button.addEventListener('click', () => {
    setLinkMode(button.dataset.linkMode || 'orthXY');
    setStatus(`Opcao 4: modo selecionado - ${linkModeLabel(linkMode)}.`);
  });
}
if (linkClearStartBtnEl) {
  linkClearStartBtnEl.addEventListener('click', () => resetLinkStart());
}
if (linkAxisXValueEl) {
  linkAxisXValueEl.addEventListener('focus', () => setLinkAxis('x'));
  linkAxisXValueEl.addEventListener('pointerdown', () => setLinkAxis('x'));
  linkAxisXValueEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setLinkAxis('x');
      applyLinkAxisLine();
    }
  });
}
if (linkAxisYValueEl) {
  linkAxisYValueEl.addEventListener('focus', () => setLinkAxis('y'));
  linkAxisYValueEl.addEventListener('pointerdown', () => setLinkAxis('y'));
  linkAxisYValueEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setLinkAxis('y');
      applyLinkAxisLine();
    }
  });
}
if (linkAxisApplyBtnEl) {
  linkAxisApplyBtnEl.addEventListener('click', () => applyLinkAxisLine());
}
if (cornerCommandPanelEl) {
  cornerCommandPanelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
}
for (const button of cornerTypeButtons) {
  button.addEventListener('click', () => {
    setCornerType(button.dataset.cornerType || 'roundOuter');
    setStatus(`Opcao 2: tipo selecionado - ${cornerTypeLabel(cornerType)}.`);
  });
}
if (cornerSizeEl) {
  cornerSizeEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCornerCommand();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCornerCommand();
    }
  });
}
if (cornerApplyBtnEl) {
  cornerApplyBtnEl.addEventListener('click', () => applyCornerCommand());
}
if (cornerClearBtnEl) {
  cornerClearBtnEl.addEventListener('click', () => clearCornerSelection());
}

viewportWrap.addEventListener('dragenter', (e) => { e.preventDefault(); dropHint.style.display = 'block'; });
viewportWrap.addEventListener('dragover', (e) => { e.preventDefault(); dropHint.style.display = 'block'; });
viewportWrap.addEventListener('dragleave', (e) => { if (e.target === viewportWrap) dropHint.style.display = 'none'; });
viewportWrap.addEventListener('drop', (e) => { e.preventDefault(); dropHint.style.display = 'none'; onFile(e.dataTransfer?.files?.[0]); });

viewport.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  viewport.setPointerCapture(e.pointerId);
  if (tool === 'select' || tool === 'vertex' || tool === 'window') {
    controls.enabled = false;
    startDrag(e.clientX, e.clientY, e.shiftKey);
  }
});
viewport.addEventListener('pointermove', (e) => {
  if (dragState) {
    moveDrag(e.clientX, e.clientY);
    return;
  }
  if (linkCommandOpen) {
    const pick = findLinkPointPick(e.clientX, e.clientY);
    if (pick?.sourceType === 'vertex' && Number.isInteger(pick.vertexIndex)) {
      setHoveredHandle({ entityId: pick.entityId, vertexIndex: pick.vertexIndex });
    } else {
      setHoveredHandle(null);
    }
    viewport.style.cursor = pick ? 'pointer' : 'crosshair';
    return;
  }
  if (tool === 'vertex') {
    const hover = hoverHandleNear(e.clientX, e.clientY, { includeAllVisible: true });
    setHoveredHandle(hover);
    if (hover) {
      viewport.style.cursor = 'pointer';
      return;
    }
  } else {
    setHoveredHandle(null);
  }
  const hit = intersectObjects(e.clientX, e.clientY, false);
  const entityId = hit?.type === 'entity' ? hit.object.userData.entityId : null;
  const entity = entityId ? entityById(entityId) : null;
  const canSelect = Boolean(entity && isEntityEditable(doc, entity));
  viewport.style.cursor = tool === 'window' ? 'crosshair' : (canSelect ? 'pointer' : 'default');
});
viewport.addEventListener('pointerup', (e) => {
  endDrag(e.clientX, e.clientY);
  controls.enabled = tool !== 'window';
});
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  queueZoomAtClient(e.clientX, e.clientY, normalizeWheelDelta(e));
}, { passive: false });

window.addEventListener('resize', () => {
  resize();
  updateHandleVisualScale();
  rebuildGrid();
  updateLabelPositions();
  updateRectangleDraftPreview();
});
window.addEventListener('keydown', (e) => {
  const target = e.target;
  const isEscape = e.key === 'Escape';
  const hadRectCommandOpen = isEscape && rectangleCommandOpen;
  const hadOption3CommandOpen = isEscape && option3CommandOpen;
  const hadLinkCommandOpen = isEscape && linkCommandOpen;
  const hadCornerCommandOpen = isEscape && cornerCommandOpen;
  if (hadRectCommandOpen) {
    closeRectCommand({ silent: true });
  }
  if (hadOption3CommandOpen) {
    closeOption3Command({ silent: true });
  }
  if (hadLinkCommandOpen) {
    closeLinkCommand({ silent: true });
  }
  if (hadCornerCommandOpen) {
    closeCornerCommand({ silent: true });
  }
  const typing = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
  if (typing && !isEscape) return;
  if (isEscape) {
    if (hadLinkCommandOpen) {
      setStatus('Opcao 4 encerrada.');
      return;
    }
    if (selectedIds.size) {
      selectedIds.clear();
      hideRotationHud();
      updateCornerSelectionInfo();
      setHoveredHandle(null);
      setActiveHandle(null);
      rebuildScene();
      refreshUi();
      setStatus('Selecao limpa.');
      updateRectangleDraftPreview();
    } else if (hadRectCommandOpen) {
      setStatus('Opcao 1 encerrada.');
    } else if (hadOption3CommandOpen) {
      setStatus('Opcao 3 encerrada.');
    } else if (hadLinkCommandOpen) {
      setStatus('Opcao 4 encerrada.');
    } else if (hadCornerCommandOpen) {
      setStatus('Opcao 2 encerrada.');
    }
    return;
  }
  if (e.key === 'Delete') {
    if (selectedIds.size) {
      pushUndo('excluir');
      deleteSelected(doc, selectedIds);
      selectedIds.clear();
      hideRotationHud();
      updateCornerSelectionInfo();
      setHoveredHandle(null);
      setActiveHandle(null);
      rebuildScene();
      refreshUi();
    }
  }
  if (!e.ctrlKey && !e.metaKey) {
    const arrowDelta = arrowDeltaFromKey(e.key);
    if (arrowDelta) {
      e.preventDefault();
      const movedByVertex = nudgeActiveVertex(arrowDelta.dx, arrowDelta.dy);
      const moved = movedByVertex || nudgeSelectedEntities(arrowDelta.dx, arrowDelta.dy);
      if (moved) {
        setStatus(`Deslocamento aplicado: ${KEYBOARD_NUDGE_MM} mm por toque.`);
      }
      return;
    }
    const key = String(e.key || '').toLowerCase();
    if (key === 'e') {
      e.preventDefault();
      rotateSelected(90);
      return;
    }
    if (key === 'r') {
      e.preventDefault();
      rotateSelected(45);
      return;
    }
    if (key === 't') {
      e.preventDefault();
      rotateSelected(KEYBOARD_ROTATE_STEP_DEG);
      return;
    }
    if (key === 'y') {
      e.preventDefault();
      rotateSelected(-KEYBOARD_ROTATE_STEP_DEG);
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
});
controls.addEventListener('change', () => {
  rebuildGrid();
  updateLabelPositions();
  updateRectangleDraftPreview();
  requestRender();
});

function animate() {
  requestAnimationFrame(animate);
  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}

resize();
rebuildScene();
refreshUi();
renderActionSlots();
renderActionCard();
updateOption3TypeButtons();
updateLinkTypeButtons();
updateLinkAxisInputs();
updateCornerTypeButtons();
updateCornerSelectionInfo();
updateLinkSelectionInfo();
animate();
})();
