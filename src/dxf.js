(() => {
  const model = window.DxfModel;
  if (!model) throw new Error('DxfModel nao encontrado. Carregue src/model.js antes de src/dxf.js.');

  const { defaultEntityName, docBounds } = model;
  const round = (n) => Number((+n || 0).toFixed(6));

  function parseDxf(text, fileName = '') {
    const lines = text.replace(/\r/g, '').split('\n');
    const pairs = [];
    for (let i = 0; i < lines.length - 1; i += 2) {
      pairs.push({ code: lines[i].trim(), value: (lines[i + 1] ?? '').trim() });
    }

    const entities = [];
    const layers = new Map();
    let inEntities = false;
    let i = 0;
    let lastNameComment = '';

    const ensureLayer = (name = '0') => {
      if (!layers.has(name)) layers.set(name, { name, visible: true });
      return layers.get(name);
    };

    const nextEntityId = (() => { let id = 1; return () => `e${id++}`; })();
    const consumeCommon = (entity, pair) => {
      if (pair.code === '8') entity.layer = pair.value || '0';
      if (pair.code === '62') entity.color = Number(pair.value);
    };
    const applyName = (entity) => {
      entity.name = lastNameComment || defaultEntityName(entity, entities.length + 1);
      lastNameComment = '';
    };
    while (i < pairs.length) {
      const p = pairs[i];
      if (p.code === '999' && p.value.startsWith('NAME:')) {
        lastNameComment = p.value.slice(5).trim();
        i += 1;
        continue;
      }
      if (p.code === '0' && p.value === 'SECTION') {
        const namePair = pairs[i + 1];
        inEntities = namePair?.code === '2' && namePair.value === 'ENTITIES';
        i += 2;
        continue;
      }
      if (p.code === '0' && p.value === 'ENDSEC') { inEntities = false; i += 1; continue; }
      if (!inEntities) { i += 1; continue; }

      if (p.code === '0') {
        const type = p.value;
        if (type === 'LINE') {
          const e = { id: nextEntityId(), type: 'LINE', layer: '0', x1: 0, y1: 0, x2: 0, y2: 0 };
          i += 1;
          while (i < pairs.length && pairs[i].code !== '0' && pairs[i].code !== '999') {
            const pair = pairs[i];
            consumeCommon(e, pair);
            if (pair.code === '10') e.x1 = +pair.value;
            if (pair.code === '20') e.y1 = +pair.value;
            if (pair.code === '11') e.x2 = +pair.value;
            if (pair.code === '21') e.y2 = +pair.value;
            i += 1;
          }
          applyName(e); ensureLayer(e.layer); entities.push(e); continue;
        }
        if (type === 'CIRCLE') {
          const e = { id: nextEntityId(), type: 'CIRCLE', layer: '0', cx: 0, cy: 0, r: 1 };
          i += 1;
          while (i < pairs.length && pairs[i].code !== '0' && pairs[i].code !== '999') {
            const pair = pairs[i];
            consumeCommon(e, pair);
            if (pair.code === '10') e.cx = +pair.value;
            if (pair.code === '20') e.cy = +pair.value;
            if (pair.code === '40') e.r = Math.abs(+pair.value || 1);
            i += 1;
          }
          applyName(e); ensureLayer(e.layer); entities.push(e); continue;
        }
        if (type === 'ARC') {
          const e = { id: nextEntityId(), type: 'ARC', layer: '0', cx: 0, cy: 0, r: 1, startAngle: 0, endAngle: 90 };
          i += 1;
          while (i < pairs.length && pairs[i].code !== '0' && pairs[i].code !== '999') {
            const pair = pairs[i];
            consumeCommon(e, pair);
            if (pair.code === '10') e.cx = +pair.value;
            if (pair.code === '20') e.cy = +pair.value;
            if (pair.code === '40') e.r = Math.abs(+pair.value || 1);
            if (pair.code === '50') e.startAngle = +pair.value;
            if (pair.code === '51') e.endAngle = +pair.value;
            i += 1;
          }
          applyName(e); ensureLayer(e.layer); entities.push(e); continue;
        }
        if (type === 'POINT') {
          const e = { id: nextEntityId(), type: 'POINT', layer: '0', x: 0, y: 0 };
          i += 1;
          while (i < pairs.length && pairs[i].code !== '0' && pairs[i].code !== '999') {
            const pair = pairs[i];
            consumeCommon(e, pair);
            if (pair.code === '10') e.x = +pair.value;
            if (pair.code === '20') e.y = +pair.value;
            i += 1;
          }
          applyName(e); ensureLayer(e.layer); entities.push(e); continue;
        }
        if (type === 'LWPOLYLINE') {
          const e = { id: nextEntityId(), type: 'LWPOLYLINE', layer: '0', closed: false, points: [] };
          let currentX = null;
          i += 1;
          while (i < pairs.length && pairs[i].code !== '0' && pairs[i].code !== '999') {
            const pair = pairs[i];
            consumeCommon(e, pair);
            if (pair.code === '70') e.closed = ((+pair.value || 0) & 1) === 1;
            if (pair.code === '10') currentX = +pair.value;
            if (pair.code === '20' && currentX !== null) { e.points.push({ x: currentX, y: +pair.value }); currentX = null; }
            i += 1;
          }
          applyName(e); ensureLayer(e.layer); if (e.points.length) entities.push(e); continue;
        }
        if (type === 'POLYLINE') {
          const e = { id: nextEntityId(), type: 'POLYLINE', layer: '0', closed: false, points: [] };
          i += 1;
          while (i < pairs.length) {
            const pair = pairs[i];
            if (pair.code === '70') e.closed = ((+pair.value || 0) & 1) === 1;
            consumeCommon(e, pair);
            if (pair.code === '0' && pair.value === 'VERTEX') {
              let vx = 0; let vy = 0; i += 1;
              while (i < pairs.length && pairs[i].code !== '0' && pairs[i].code !== '999') {
                const vp = pairs[i];
                if (vp.code === '10') vx = +vp.value;
                if (vp.code === '20') vy = +vp.value;
                i += 1;
              }
              e.points.push({ x: vx, y: vy });
              continue;
            }
            if (pair.code === '0' && pair.value === 'SEQEND') { i += 1; break; }
            i += 1;
          }
          applyName(e); ensureLayer(e.layer); if (e.points.length) entities.push(e); continue;
        }
      }
      i += 1;
    }

    const doc = { entities, layers: [...layers.values()], meta: { importedAt: new Date().toISOString(), units: 'mm', fileName } };
    return doc;
  }

  function exportDxf(doc) {
    const out = [];
    const push = (code, value) => { out.push(String(code), String(value)); };
    const b = docBounds(doc, false);

    push(0, 'SECTION');
    push(2, 'HEADER');
    push(9, '$ACADVER');
    push(1, 'AC1015');
    push(9, '$INSUNITS');
    push(70, 4);
    push(9, '$MEASUREMENT');
    push(70, 1);
    push(9, '$EXTMIN'); push(10, round(b.minX)); push(20, round(b.minY)); push(30, 0);
    push(9, '$EXTMAX'); push(10, round(b.maxX)); push(20, round(b.maxY)); push(30, 0);
    push(0, 'ENDSEC');

    push(0, 'SECTION');
    push(2, 'TABLES');
    push(0, 'TABLE');
    push(2, 'LAYER');
    push(70, doc.layers.length || 1);
    for (const layer of doc.layers) {
      push(0, 'LAYER');
      push(2, layer.name);
      push(70, 0);
      push(62, layer.visible ? 7 : -7);
      push(6, 'CONTINUOUS');
    }
    push(0, 'ENDTAB');
    push(0, 'ENDSEC');

    push(0, 'SECTION');
    push(2, 'ENTITIES');
    for (const e of doc.entities) {
      push(999, `NAME:${e.name || defaultEntityName(e)}`);
      if (e.type === 'LINE') {
        push(0, 'LINE'); push(8, e.layer || '0');
        push(10, round(e.x1)); push(20, round(e.y1)); push(30, 0);
        push(11, round(e.x2)); push(21, round(e.y2)); push(31, 0);
      } else if (e.type === 'CIRCLE') {
        push(0, 'CIRCLE'); push(8, e.layer || '0');
        push(10, round(e.cx)); push(20, round(e.cy)); push(30, 0); push(40, round(Math.max(0.001, e.r)));
      } else if (e.type === 'ARC') {
        push(0, 'ARC'); push(8, e.layer || '0');
        push(10, round(e.cx)); push(20, round(e.cy)); push(30, 0); push(40, round(Math.max(0.001, e.r)));
        push(50, round(e.startAngle)); push(51, round(e.endAngle));
      } else if (e.type === 'POINT') {
        push(0, 'POINT'); push(8, e.layer || '0');
        push(10, round(e.x)); push(20, round(e.y)); push(30, 0);
      } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        push(0, 'LWPOLYLINE'); push(8, e.layer || '0');
        push(90, e.points.length); push(70, e.closed ? 1 : 0);
        for (const pt of e.points) { push(10, round(pt.x)); push(20, round(pt.y)); }
      }
    }
    push(0, 'ENDSEC');
    push(0, 'EOF');
    return out.join('\n');
  }

  window.DxfIO = { parseDxf, exportDxf };
})();
