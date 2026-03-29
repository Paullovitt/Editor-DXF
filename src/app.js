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
let currentFileName = 'editado.dxf';
let undoStack = [];
let redoStack = [];
let needsRender = true;
let pendingZoom = null;
let rectangleCommandOpen = false;
const ENTITY_PICK_RADIUS_PX = 2;
const VERTEX_PICK_RADIUS_PX = 14;
const VERTEX_DRAG_DEADZONE_PX = 3;
const VERTEX_DRAG_CLICK_GUARD_PX = 8;
const VERTEX_DRAG_CLICK_GUARD_MS = 180;
// Handles amarelos ampliados para melhorar visibilidade no modo Vertices.
const YELLOW_HANDLE_SCALE = 0.6;
const HANDLE_BASE_RADIUS = 1.25;

function setStatus(msg) { statusbar.textContent = msg; }
function requestRender() { needsRender = true; }
function mm(v) { return `${Number(v || 0).toFixed(2)} mm`; }
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
function rotateSelected(angleDeg) {
  const changed = transformSelection(`rotacionar ${angleDeg}`, (entity, pivot) => rotateEntity(entity, angleDeg, pivot));
  if (!changed) setStatus('Selecione uma peca para rotacionar.');
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
  closeRectCommand({ silent: true });
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
  while (measureRoot.children.length) {
    const c = measureRoot.children.pop();
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
  for (const item of measurementLabels) item.el.remove();
  measurementLabels = [];
  labelsLayer.style.display = 'none';
}

function collectMeasurementSegments() {
  const segments = [];
  const MAX_SEGMENTS = 160;
  for (const id of selectedIds) {
    const e = entityById(id);
    if (!e) continue;
    if (e.type === 'LINE') {
      segments.push([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
    } else if (e.points?.length && e.points.length >= 2) {
      for (let i = 1; i < e.points.length; i += 1) {
        segments.push([e.points[i - 1], e.points[i]]);
      }
      if (e.closed && e.points.length > 2) {
        segments.push([e.points[e.points.length - 1], e.points[0]]);
      }
    }
    if (segments.length >= MAX_SEGMENTS) break;
  }
  return segments.slice(0, MAX_SEGMENTS);
}

function addMeasurementLabel(worldPos, text) {
  const el = document.createElement('div');
  el.className = 'measure-label';
  el.textContent = text;
  labelsLayer.appendChild(el);
  measurementLabels.push({ el, worldPos });
}

function rebuildMeasurements() {
  clearMeasurements();
  if (tool !== 'window' || !selectedIds.size) return;
  const segments = collectMeasurementSegments();
  if (!segments.length) return;
  const points = [];
  const pushSegment = (a, b) => {
    points.push(new THREE.Vector3(a.x, a.y, 2.2), new THREE.Vector3(b.x, b.y, 2.2));
  };

  for (const [start, end] of segments) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;

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
    addMeasurementLabel(labelPos, mm(len));
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
  if (!measurementLabels.length) return;
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
  }
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
}

function setTool(next) {
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
    const endWorld = worldFromClient(clientX, clientY);
    windowSelect(dragState.startWorld, endWorld, Boolean(dragState.additive));
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
  closeRectCommand({ silent: true });
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
  if (hadRectCommandOpen) {
    closeRectCommand({ silent: true });
  }
  const typing = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
  if (typing && !isEscape) return;
  if (isEscape) {
    if (selectedIds.size) {
      selectedIds.clear();
      setHoveredHandle(null);
      setActiveHandle(null);
      rebuildScene();
      refreshUi();
      setStatus('Selecao limpa.');
      updateRectangleDraftPreview();
    } else if (hadRectCommandOpen) {
      setStatus('Opcao 1 encerrada.');
    }
    return;
  }
  if (e.key === 'Delete') {
    if (selectedIds.size) {
      pushUndo('excluir');
      deleteSelected(doc, selectedIds);
      selectedIds.clear();
      setHoveredHandle(null);
      setActiveHandle(null);
      rebuildScene();
      refreshUi();
    }
  }
  if (!e.ctrlKey && !e.metaKey) {
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
animate();
})();
