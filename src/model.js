(() => {
  const GRID_SIZE = 10;

function createEmptyDoc() {
    return { entities: [], layers: [{ name: '0', visible: true }], meta: { units: 'mm', fileName: '' } };
}

  function cloneDoc(doc) {
    return JSON.parse(JSON.stringify(doc));
  }

  function ensureLayers(doc) {
    for (const layer of (doc.layers || [])) layer.visible = true;
    const names = new Set((doc.layers || []).map((l) => l.name));
    if (!names.has('0')) {
      doc.layers.push({ name: '0', visible: true });
      names.add('0');
    }
    for (const e of doc.entities) {
      const layer = e.layer || '0';
      if (!names.has(layer)) {
        doc.layers.push({ name: layer, visible: true });
        names.add(layer);
      }
    }
}

  function defaultEntityName(e, index = 0) {
    if (e.name) return e.name;
    const suffix = index ? ` ${index}` : '';
    if (e.type === 'CIRCLE') return `Furo${suffix}`;
    if (e.type === 'ARC') return `Arco${suffix}`;
    if (e.type === 'LINE') return `Aresta${suffix}`;
    if (e.type === 'POINT') return `Ponto${suffix}`;
    return `Peca${suffix}`;
  }

function getLayer(doc, name) {
    return doc.layers.find((l) => l.name === name) || { name, visible: true };
}

function isEntityEditable(doc, entity) {
  const layer = getLayer(doc, entity.layer || '0');
  return layer.visible;
}

  function boundsFromPoints(points) {
    return {
      minX: Math.min(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxX: Math.max(...points.map((p) => p.x)),
      maxY: Math.max(...points.map((p) => p.y)),
    };
  }

  function mergeBounds(a, b) {
    return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
  }

  function entityBounds(e) {
    if (e.type === 'LINE') return boundsFromPoints([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
    if (e.type === 'CIRCLE' || e.type === 'ARC') return { minX: e.cx - e.r, minY: e.cy - e.r, maxX: e.cx + e.r, maxY: e.cy + e.r };
    if (e.type === 'POINT') return boundsFromPoints([{ x: e.x, y: e.y }]);
    if (e.points?.length) return boundsFromPoints(e.points);
    return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  }

  function docBounds(doc, visibleOnly = true) {
    const relevant = doc.entities.filter((e) => !visibleOnly || getLayer(doc, e.layer || '0').visible);
    if (!relevant.length) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    return relevant.map(entityBounds).reduce(mergeBounds);
  }

  function entityCenter(e) {
    const b = entityBounds(e);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }

  function rotatePoint(p, rad, pivot) {
    const x = p.x - pivot.x;
    const y = p.y - pivot.y;
    return { x: pivot.x + x * Math.cos(rad) - y * Math.sin(rad), y: pivot.y + x * Math.sin(rad) + y * Math.cos(rad) };
  }

  function normalizeAngle(deg) {
    let a = deg % 360;
    if (a < 0) a += 360;
    return a;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function translateEntity(e, dx, dy) {
    if (e.type === 'LINE') { e.x1 += dx; e.y1 += dy; e.x2 += dx; e.y2 += dy; return; }
    if (e.type === 'CIRCLE' || e.type === 'ARC') { e.cx += dx; e.cy += dy; return; }
    if (e.type === 'POINT') { e.x += dx; e.y += dy; return; }
    if (e.points) e.points.forEach((p) => { p.x += dx; p.y += dy; });
  }

  function rotateEntity(e, angleDeg, pivot) {
    const rad = angleDeg * Math.PI / 180;
    const rot = (p) => rotatePoint(p, rad, pivot);
    if (e.type === 'LINE') {
      const a = rot({ x: e.x1, y: e.y1 });
      const b = rot({ x: e.x2, y: e.y2 });
      e.x1 = a.x; e.y1 = a.y; e.x2 = b.x; e.y2 = b.y; return;
    }
    if (e.type === 'CIRCLE' || e.type === 'ARC') {
      const c = rot({ x: e.cx, y: e.cy });
      e.cx = c.x; e.cy = c.y;
      if (e.type === 'ARC') { e.startAngle = normalizeAngle(e.startAngle + angleDeg); e.endAngle = normalizeAngle(e.endAngle + angleDeg); }
      return;
    }
    if (e.type === 'POINT') { const p = rot({ x: e.x, y: e.y }); e.x = p.x; e.y = p.y; return; }
    if (e.points) e.points = e.points.map(rot);
  }

  function scaleEntity(e, factor, pivot) {
    const scl = (p) => ({ x: pivot.x + (p.x - pivot.x) * factor, y: pivot.y + (p.y - pivot.y) * factor });
    if (e.type === 'LINE') {
      const a = scl({ x: e.x1, y: e.y1 });
      const b = scl({ x: e.x2, y: e.y2 });
      e.x1 = a.x; e.y1 = a.y; e.x2 = b.x; e.y2 = b.y; return;
    }
    if (e.type === 'CIRCLE' || e.type === 'ARC') {
      const c = scl({ x: e.cx, y: e.cy }); e.cx = c.x; e.cy = c.y; e.r = Math.max(0.001, Math.abs(e.r * factor)); return;
    }
    if (e.type === 'POINT') { const p = scl({ x: e.x, y: e.y }); e.x = p.x; e.y = p.y; return; }
    if (e.points) e.points = e.points.map(scl);
  }

  function mirrorEntity(e, axis, pivot) {
    const mirror = (p) => axis === 'x' ? { x: p.x, y: pivot.y - (p.y - pivot.y) } : { x: pivot.x - (p.x - pivot.x), y: p.y };
    if (e.type === 'LINE') {
      const a = mirror({ x: e.x1, y: e.y1 });
      const b = mirror({ x: e.x2, y: e.y2 });
      e.x1 = a.x; e.y1 = a.y; e.x2 = b.x; e.y2 = b.y; return;
    }
    if (e.type === 'CIRCLE' || e.type === 'ARC') {
      const c = mirror({ x: e.cx, y: e.cy }); e.cx = c.x; e.cy = c.y;
      if (e.type === 'ARC') {
        if (axis === 'x') { e.startAngle = normalizeAngle(-e.startAngle); e.endAngle = normalizeAngle(-e.endAngle); }
        else { e.startAngle = normalizeAngle(180 - e.startAngle); e.endAngle = normalizeAngle(180 - e.endAngle); }
        const temp = e.startAngle; e.startAngle = e.endAngle; e.endAngle = temp;
      }
      return;
    }
    if (e.type === 'POINT') { const p = mirror({ x: e.x, y: e.y }); e.x = p.x; e.y = p.y; return; }
    if (e.points) e.points = e.points.map(mirror);
  }

function duplicateEntity(e) {
  const copy = JSON.parse(JSON.stringify(e));
  copy.id = `${e.id}_copy_${Math.random().toString(36).slice(2, 7)}`;
  return copy;
}

  function getEntitySnapPoints(e) {
    const pts = [];
    if (e.type === 'LINE') {
      pts.push({ x: e.x1, y: e.y1, kind: 'endpoint' }, { x: e.x2, y: e.y2, kind: 'endpoint' }, { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2, kind: 'midpoint' });
    } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
      pts.push({ x: e.cx, y: e.cy, kind: 'center' });
      pts.push({ x: e.cx + e.r, y: e.cy, kind: 'radius' });
      pts.push({ x: e.cx - e.r, y: e.cy, kind: 'radius' });
      pts.push({ x: e.cx, y: e.cy + e.r, kind: 'radius' });
      pts.push({ x: e.cx, y: e.cy - e.r, kind: 'radius' });
    } else if (e.type === 'POINT') {
      pts.push({ x: e.x, y: e.y, kind: 'point' });
    } else if (e.points) {
      for (const p of e.points) pts.push({ x: p.x, y: p.y, kind: 'vertex' });
    }
    return pts;
  }

  function updateVertex(entity, index, pos) {
    if (entity.type === 'LINE') {
      if (index === 0) { entity.x1 = pos.x; entity.y1 = pos.y; }
      if (index === 1) { entity.x2 = pos.x; entity.y2 = pos.y; }
      return;
    }
    if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      if (index === 'center') { entity.cx = pos.x; entity.cy = pos.y; }
      if (index === 'radius') { entity.r = Math.max(0.001, distance({ x: entity.cx, y: entity.cy }, pos)); }
      return;
    }
    if (entity.type === 'POINT') { entity.x = pos.x; entity.y = pos.y; return; }
    if (entity.points?.[index]) entity.points[index] = { x: pos.x, y: pos.y };
  }

  function deleteSelected(doc, ids) {
    doc.entities = doc.entities.filter((e) => !ids.has(e.id));
  }

  function pointInRect(pt, rect) {
    return pt.x >= rect.minX && pt.x <= rect.maxX && pt.y >= rect.minY && pt.y <= rect.maxY;
  }

  function entityIntersectsRect(entity, rect) {
    const eb = entityBounds(entity);
    if (eb.maxX < rect.minX || eb.minX > rect.maxX || eb.maxY < rect.minY || eb.minY > rect.maxY) return false;
    if (entity.type === 'LINE') return lineIntersectsRect({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }, rect);
    if (entity.type === 'POINT') return pointInRect({ x: entity.x, y: entity.y }, rect);
    if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
      if (pointInRect({ x: entity.cx, y: entity.cy }, rect)) return true;
      return getEntitySnapPoints(entity).some((p) => pointInRect(p, rect));
    }
    if (entity.points?.length) {
      if (entity.points.some((p) => pointInRect(p, rect))) return true;
      for (let i = 0; i < entity.points.length - 1; i++) {
        if (lineIntersectsRect(entity.points[i], entity.points[i + 1], rect)) return true;
      }
      if (entity.closed && entity.points.length > 2) {
        if (lineIntersectsRect(entity.points[entity.points.length - 1], entity.points[0], rect)) return true;
      }
      return false;
    }
    return true;
  }

  function lineIntersectsRect(a, b, rect) {
    if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
    const corners = [
      [{ x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }],
      [{ x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }],
      [{ x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }],
      [{ x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY }],
    ];
    return corners.some(([c, d]) => segmentsIntersect(a, b, c, d));
  }

  function segmentsIntersect(a, b, c, d) {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return false;
  }

  function orient(a, b, c) {
    const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  }

  window.DxfModel = {
    GRID_SIZE,
    createEmptyDoc,
    cloneDoc,
    ensureLayers,
    defaultEntityName,
    getLayer,
    isEntityEditable,
    boundsFromPoints,
    mergeBounds,
    entityBounds,
    docBounds,
    entityCenter,
    rotatePoint,
    normalizeAngle,
    distance,
    translateEntity,
    rotateEntity,
    scaleEntity,
    mirrorEntity,
    duplicateEntity,
    getEntitySnapPoints,
    updateVertex,
    deleteSelected,
    pointInRect,
    entityIntersectsRect,
  };
})();
