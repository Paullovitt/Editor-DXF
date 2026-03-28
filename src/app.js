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
const dropHint = $('dropHint');
const statusbar = $('statusbar');
const layersEl = $('layers');
const selectionInfoEl = $('selectionInfo');
const propertiesEl = $('properties');
const toolButtons = [...document.querySelectorAll('.tool')];
const showGridEl = $('showGrid');
const snapGridEl = $('snapGrid');
const snapPointsEl = $('snapPoints');

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
let tool = 'select';
let dragState = null;
let meshByEntityId = new Map();
let measurementLabels = [];
let currentFileName = 'editado.dxf';
let undoStack = [];
let redoStack = [];
let needsRender = true;
let pendingZoom = null;
const ENTITY_PICK_RADIUS_PX = 2;
const VERTEX_PICK_RADIUS_PX = 10;
const YELLOW_HANDLE_SCALE = 3;
const HANDLE_BASE_RADIUS = 1.25;

function setStatus(msg) { statusbar.textContent = msg; }
function requestRender() { needsRender = true; }
function mm(v) { return `${Number(v || 0).toFixed(2)} mm`; }
function entityById(id) { return doc.entities.find((e) => e.id === id); }
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
  buildHandles();
  rebuildGrid();
  updateLabelPositions();
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
  const size = (HANDLE_BASE_RADIUS * sizeScale) / Math.max(0.1, camera.zoom);
  const geom = new THREE.CircleGeometry(size, 18);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(pos.x, pos.y, 3);
  mesh.userData = { handle: true, ...meta };
  return mesh;
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
  while (handlesRoot.children.length) {
    const c = handlesRoot.children.pop();
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
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
      handlesRoot.add(makeHandle({ x: e.cx, y: e.cy }, 0x22c55e, { entityId: e.id, vertexIndex: 'center' }));
      handlesRoot.add(makeHandle({ x: e.cx + e.r, y: e.cy }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusE' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx, y: e.cy + e.r }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusN' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx - e.r, y: e.cy }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusW' }, YELLOW_HANDLE_SCALE));
      handlesRoot.add(makeHandle({ x: e.cx, y: e.cy - e.r }, 0xfbbf24, { entityId: e.id, vertexIndex: 'radiusS' }, YELLOW_HANDLE_SCALE));
    } else if (e.points?.length) {
      e.points.forEach((p, i) => handlesRoot.add(makeHandle(p, 0xfbbf24, { entityId: e.id, vertexIndex: i }, YELLOW_HANDLE_SCALE)));
    }
  }
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
  for (const child of [...workRoot.children, ...handlesRoot.children]) {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
    child.parent?.remove(child);
  }
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
  buildHandles();
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
  toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === next));
  controls.enabled = next !== 'window';
  buildHandles();
  rebuildMeasurements();
  refreshUi();
  requestRender();
}

function selectSingle(id) {
  selectedIds = new Set(id ? [id] : []);
  rebuildScene();
  refreshUi();
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
  rebuildScene();
  refreshUi();
  setStatus(`${ids.length} peca(s) selecionada(s) por janela.`);
}

function hoverHandleNear(clientX, clientY) {
  if (tool !== 'vertex' || !selectedIds.size) return null;
  const world = worldFromClient(clientX, clientY);
  let best = null;
  const threshold = pickRadiusWorld(VERTEX_PICK_RADIUS_PX);
  for (const eId of selectedIds) {
    const e = entityById(eId);
    if (!e) continue;
    const pts = [];
    if (e.type === 'LINE') pts.push(
      { idx: 0, p: { x: e.x1, y: e.y1 } },
      { idx: 1, p: { x: e.x2, y: e.y2 } },
      { idx: 'midpoint', p: { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 } }
    );
    else if (e.type === 'POINT') pts.push({ idx: 'point', p: { x: e.x, y: e.y } });
    else if (e.type === 'CIRCLE' || e.type === 'ARC') pts.push(
      { idx: 'center', p: { x: e.cx, y: e.cy } },
      { idx: 'radiusE', p: { x: e.cx + e.r, y: e.cy } },
      { idx: 'radiusN', p: { x: e.cx, y: e.cy + e.r } },
      { idx: 'radiusW', p: { x: e.cx - e.r, y: e.cy } },
      { idx: 'radiusS', p: { x: e.cx, y: e.cy - e.r } }
    );
    else if (e.points) e.points.forEach((p, i) => pts.push({ idx: i, p }));
    for (const item of pts) {
      const d = distance(world, item.p);
      if (d < threshold && (!best || d < best.d)) best = { entityId: e.id, vertexIndex: item.idx, d };
    }
  }
  return best;
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
    const hover = hoverHandleNear(clientX, clientY);
    if (hover) {
      pushUndo('editar vertice');
      dragState = { type: 'vertex', ...hover };
      return;
    }
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
    const world = snapWorld(worldRaw, entity.id);
    updateVertex(entity, dragState.vertexIndex, world);
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
    const hover = hoverHandleNear(e.clientX, e.clientY);
    hoveredHandle = hover;
    if (hover) {
      viewport.style.cursor = 'pointer';
      return;
    }
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

window.addEventListener('resize', () => { resize(); buildHandles(); rebuildGrid(); updateLabelPositions(); });
window.addEventListener('keydown', (e) => {
  const target = e.target;
  const typing = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
  if (typing) return;
  if (e.key === 'Escape') {
    if (selectedIds.size) {
      selectedIds.clear();
      rebuildScene();
      refreshUi();
      setStatus('Selecao limpa.');
    }
    return;
  }
  if (e.key === 'Delete') {
    if (selectedIds.size) {
      pushUndo('excluir'); deleteSelected(doc, selectedIds); selectedIds.clear(); rebuildScene(); refreshUi();
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
controls.addEventListener('change', () => { rebuildGrid(); updateLabelPositions(); requestRender(); });

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
animate();
})();
