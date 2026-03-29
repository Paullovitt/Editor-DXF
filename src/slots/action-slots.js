(() => {
  function defaultToolLabel(toolId) {
    if (toolId === 'vertex') return 'Vertices';
    if (toolId === 'window') return 'Janela';
    return 'Selecionar';
  }

  function createDefaultSlots(slotCount) {
    return Array.from({ length: slotCount }, (_, idx) => ({
      id: idx + 1,
      // Slots prontos para receber logica gradualmente.
      allowedTools: ['select', 'vertex', 'window'],
      label: '',
      icon: '',
    }));
  }

  function createController(options = {}) {
    const {
      slotsEl,
      cardEl,
      getToolId = () => 'select',
      getSelectedCount = () => 0,
      setStatus = () => {},
      toolLabelFromId = defaultToolLabel,
      slotCount = 32,
      logLimit = 18,
    } = options;

    const slots = createDefaultSlots(slotCount);
    const handlersBySlot = Object.create(null);
    const executions = [];
    let activeSlotId = null;

    function syncActiveSlotClass() {
      if (!slotsEl) return;
      const buttons = slotsEl.querySelectorAll('.option-slot');
      buttons.forEach((button) => {
        const slotId = Number(button.dataset.slotId || 0);
        button.classList.toggle('is-active', slotId === activeSlotId);
      });
    }

    function renderCard() {
      if (!cardEl) return;
      cardEl.innerHTML = '';
      if (!executions.length) {
        cardEl.innerHTML = '<div class="small">Nenhuma execucao ainda.</div>';
        return;
      }
      const logList = document.createElement('div');
      logList.className = 'action-log';
      for (const item of executions) {
        const row = document.createElement('div');
        row.className = `action-log-item ${item.tone}`;
        row.innerHTML = `
          <div><strong>Opcao ${item.slotId}</strong> - ${item.toolLabel}</div>
          <div>${item.selectionLabel}</div>
          <div>${item.detail}</div>
          <div class="small">${item.executedAt}</div>
        `;
        logList.appendChild(row);
      }
      cardEl.appendChild(logList);
    }

    function registerExecution(slotId, result = {}) {
      const selectedCount = Number.isFinite(result.selectedCount) ? result.selectedCount : getSelectedCount();
      const selectionLabel = selectedCount === 1 ? '1 peca selecionada' : `${selectedCount} pecas selecionadas`;
      executions.unshift({
        slotId,
        toolLabel: toolLabelFromId(getToolId()),
        selectionLabel,
        detail: result.detail || `Opcao ${slotId} executada.`,
        tone: result.ok ? 'ok' : 'warn',
        executedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
      if (executions.length > logLimit) executions.length = logLimit;
      renderCard();
    }

    function updateAvailability() {
      if (!slotsEl) return;
      const activeTool = getToolId();
      const buttons = slotsEl.querySelectorAll('.option-slot');
      buttons.forEach((button) => {
        const slotId = Number(button.dataset.slotId || 0);
        const slot = slots[slotId - 1];
        const enabled = Boolean(slot && slot.allowedTools.includes(activeTool));
        button.disabled = !enabled;
        const friendlyTitle = slot?.label
          ? `Opcao ${slotId}: ${slot.label}`
          : `Opcao ${slotId}`;
        button.title = enabled
          ? friendlyTitle
          : `Opcao ${slotId} indisponivel no modo ${toolLabelFromId(activeTool)}`;
      });
    }

    function renderSlotContent(button, slot) {
      button.innerHTML = '';
      if (slot.icon === 'cube') {
        const cubeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        cubeSvg.setAttribute('viewBox', '0 0 24 24');
        cubeSvg.setAttribute('class', 'option-slot-icon option-slot-icon--svg');
        cubeSvg.setAttribute('width', '28');
        cubeSvg.setAttribute('height', '28');
        cubeSvg.setAttribute('aria-hidden', 'true');

        const topFace = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        topFace.setAttribute('d', 'M12 3.2 4.2 7.6 12 12 19.8 7.6 12 3.2Z');
        topFace.setAttribute('fill', '#facc15');

        const leftFace = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        leftFace.setAttribute('d', 'M4.2 7.6 12 12v8.8L4.2 16.4V7.6Z');
        leftFace.setAttribute('fill', '#22d3ee');

        const rightFace = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        rightFace.setAttribute('d', 'M19.8 7.6 12 12v8.8l7.8-4.4V7.6Z');
        rightFace.setAttribute('fill', '#2563eb');

        const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outline.setAttribute('d', 'M12 3.2 4.2 7.6v8.8L12 20.8l7.8-4.4V7.6L12 3.2Zm0 0v8.8m-7.8-4.4L12 12l7.8-4.4');
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', '#dbeafe');
        outline.setAttribute('stroke-width', '1.2');
        outline.setAttribute('stroke-linejoin', 'round');
        outline.setAttribute('stroke-linecap', 'round');

        cubeSvg.appendChild(topFace);
        cubeSvg.appendChild(leftFace);
        cubeSvg.appendChild(rightFace);
        cubeSvg.appendChild(outline);
        button.appendChild(cubeSvg);
      } else {
        const iconEl = document.createElement('span');
        iconEl.className = 'option-slot-icon option-slot-icon--text';
        iconEl.textContent = slot.icon || '';
        iconEl.setAttribute('aria-hidden', 'true');
        button.appendChild(iconEl);
      }
      if (slot.label) {
        button.setAttribute('aria-label', `Opcao ${slot.id}: ${slot.label}`);
      } else {
        button.setAttribute('aria-label', `Opcao ${slot.id}`);
      }
    }

    function executeSlot(slotId) {
      const slot = slots[slotId - 1];
      if (!slot) return;
      const activeTool = getToolId();
      if (!slot.allowedTools.includes(activeTool)) {
        setStatus(`Opcao ${slotId} indisponivel no modo ${toolLabelFromId(activeTool)}.`);
        return;
      }
      const handler = handlersBySlot[slotId];
      if (!handler) {
        const pendingMessage = `Opcao ${slotId} ainda sem logica definida.`;
        registerExecution(slotId, { ok: false, detail: pendingMessage, selectedCount: getSelectedCount() });
        setStatus(pendingMessage);
        return;
      }
      const result = handler({
        tool: activeTool,
        selectedCount: getSelectedCount(),
      }) || {};
      registerExecution(slotId, result);
      setStatus(result.detail || `Opcao ${slotId} executada.`);
    }

    function renderSlots() {
      if (!slotsEl) return;
      slotsEl.innerHTML = '';
      for (const slot of slots) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'option-slot';
        button.dataset.slotId = String(slot.id);
        renderSlotContent(button, slot);
        button.addEventListener('click', () => executeSlot(slot.id));
        slotsEl.appendChild(button);
      }
      updateAvailability();
      syncActiveSlotClass();
    }

    function registerHandler(slotId, handler) {
      if (typeof handler === 'function') {
        handlersBySlot[slotId] = handler;
        return;
      }
      delete handlersBySlot[slotId];
    }

    function setActiveSlot(slotId = null) {
      const nextSlotId = Number.isFinite(Number(slotId)) ? Number(slotId) : null;
      activeSlotId = nextSlotId && slots[nextSlotId - 1] ? nextSlotId : null;
      syncActiveSlotClass();
    }

    function setSlotMeta(slotId, meta = {}) {
      const targetId = Number(slotId);
      if (!Number.isFinite(targetId) || targetId < 1 || targetId > slots.length) return;
      const slot = slots[targetId - 1];
      if (Array.isArray(meta.allowedTools) && meta.allowedTools.length) {
        slot.allowedTools = [...meta.allowedTools];
      }
      if (typeof meta.label === 'string') slot.label = meta.label.trim();
      if (typeof meta.icon === 'string') slot.icon = meta.icon;
      if (slotsEl) {
        const button = slotsEl.querySelector(`.option-slot[data-slot-id="${targetId}"]`);
        if (button) renderSlotContent(button, slot);
      }
      updateAvailability();
    }

    return {
      renderCard,
      renderSlots,
      updateAvailability,
      executeSlot,
      registerHandler,
      setActiveSlot,
      setSlotMeta,
      getSlots: () => slots.map((slot) => ({ ...slot })),
    };
  }

  window.DxfActionSlots = {
    createController,
    defaultToolLabel,
  };
})();
