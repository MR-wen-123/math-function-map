/**
 * 应用主逻辑：UI、对比、拖拽、增减快慢探针
 */
(() => {
  const els = {
    funcType: document.getElementById("funcType"),
    funcType2: document.getElementById("funcType2"),
    coeffInputs: document.getElementById("coeffInputs"),
    coeffInputs2: document.getElementById("coeffInputs2"),
    coeffSection: document.getElementById("coeffSection"),
    coeffSection2: document.getElementById("coeffSection2"),
    customSection: document.getElementById("customSection"),
    customSection2: document.getElementById("customSection2"),
    customExpr: document.getElementById("customExpr"),
    customExpr2: document.getElementById("customExpr2"),
    compareEnabled: document.getElementById("compareEnabled"),
    comparePanel: document.getElementById("comparePanel"),
    compareAnalysis: document.getElementById("compareAnalysis"),
    compareMonotoneSection: document.getElementById("compareMonotoneSection"),
    compareRateSection: document.getElementById("compareRateSection"),
    xMin: document.getElementById("xMin"),
    xMax: document.getElementById("xMax"),
    yMin: document.getElementById("yMin"),
    yMax: document.getElementById("yMax"),
    showDerivative: document.getElementById("showDerivative"),
    showMonotone: document.getElementById("showMonotone"),
    showRate: document.getElementById("showRate"),
    graph: document.getElementById("graph"),
    graphWrap: document.getElementById("graphWrap"),
    graphArea: document.getElementById("graphArea"),
    graphBody: document.getElementById("graphBody"),
    graphCollapseBtn: document.getElementById("graphCollapseBtn"),
    splitterLeft: document.getElementById("splitterLeft"),
    splitterRight: document.getElementById("splitterRight"),
    resizeBarV: document.getElementById("resizeBarV"),
    mainLayout: document.getElementById("mainLayout"),
    formulaDisplay: document.getElementById("formulaDisplay"),
    formulaDisplay2: document.getElementById("formulaDisplay2"),
    derivativeDisplay: document.getElementById("derivativeDisplay"),
    derivativeDisplay2: document.getElementById("derivativeDisplay2"),
    monotoneDisplay: document.getElementById("monotoneDisplay"),
    monotoneDisplay2: document.getElementById("monotoneDisplay2"),
    rateDisplay: document.getElementById("rateDisplay"),
    compareRateDisplay: document.getElementById("compareRateDisplay"),
    criticalDisplay: document.getElementById("criticalDisplay"),
  };

  const ctx = els.graph.getContext("2d");
  let coeffValues = {};
  let coeffValues2 = {};
  let coeffInputRefs = {};
  let coeffInputRefs2 = {};
  let probeX = 1;
  let dragState = null;
  let currentModel = null;

  function getViewRange() {
    return {
      xMin: parseFloat(els.xMin.value),
      xMax: parseFloat(els.xMax.value),
      yMin: parseFloat(els.yMin.value),
      yMax: parseFloat(els.yMax.value),
    };
  }

  function renderCoeffInputs(type, container, values, refs, onChange) {
    const defs = MathEngine.COEFF_DEFS[type];
    if (!defs) return;
    container.innerHTML = "";
    Object.keys(refs).forEach((k) => delete refs[k]);
    for (const def of defs) {
      if (values[def.key] === undefined) values[def.key] = def.default;
      const row = document.createElement("div");
      row.className = "coeff-row";
      row.innerHTML = `
        <label>${def.label}</label>
        <input type="text" class="coeff-input" data-key="${def.key}" value="${MathEngine.fmtCoeffInput(values[def.key])}" inputmode="text" autocomplete="off" spellcheck="false" placeholder="如 1/2" />
      `;
      const input = row.querySelector("input");
      refs[def.key] = input;

      input.addEventListener("input", () => {
        const raw = input.value;
        if (MathEngine.isPartialNumberInput(raw)) {
          input.classList.remove("input-invalid");
          return;
        }
        const parsed = MathEngine.parseNumberInput(raw);
        if (parsed.ok) {
          input.classList.remove("input-invalid");
          values[def.key] = parsed.value;
          onChange();
        } else {
          input.classList.add("input-invalid");
        }
      });

      input.addEventListener("blur", () => {
        const parsed = MathEngine.parseNumberInput(input.value);
        if (parsed.ok) {
          values[def.key] = parsed.value;
          input.value = MathEngine.fmtCoeffInput(parsed.value);
          input.classList.remove("input-invalid");
          onChange();
        } else if (!MathEngine.isPartialNumberInput(input.value)) {
          input.value = MathEngine.fmtCoeffInput(values[def.key] ?? 0);
          input.classList.remove("input-invalid");
        } else {
          input.value = MathEngine.fmtCoeffInput(values[def.key] ?? 0);
          input.classList.remove("input-invalid");
        }
      });

      container.appendChild(row);
    }
  }

  function syncCoeffInputs(values, refs) {
    for (const [key, input] of Object.entries(refs)) {
      if (input && values[key] !== undefined && document.activeElement !== input) {
        input.value = MathEngine.fmtCoeffInput(values[key]);
        input.classList.remove("input-invalid");
      }
    }
  }

  function toggleSections() {
    const isCustomF = els.funcType.value === "custom";
    const compare = els.compareEnabled.checked;
    const isCustomG = compare && els.funcType2.value === "custom";

    els.coeffSection.classList.toggle("hidden", isCustomF);
    els.customSection.classList.toggle("hidden", !isCustomF);

    els.comparePanel.classList.toggle("hidden", !compare);
    els.coeffSection2.classList.toggle("hidden", !compare || isCustomG);
    els.customSection2.classList.toggle("hidden", !compare || !isCustomG);
    els.compareAnalysis.classList.toggle("hidden", !compare);
    els.compareMonotoneSection.classList.toggle("hidden", !compare);
    els.compareRateSection.classList.toggle("hidden", !compare);
  }

  function initCompareG() {
    const type2 = els.funcType2.value;
    if (type2 === "custom") {
      return;
    }
    renderCoeffInputs(type2, els.coeffInputs2, coeffValues2, coeffInputRefs2, update);
    const defs = MathEngine.COEFF_DEFS[type2] || [];
    const fType = els.funcType.value;
    const fDefs = MathEngine.COEFF_DEFS[fType];
    if (fType !== "custom" && fType !== type2 && fDefs) {
      for (const def of defs) {
        const base = coeffValues[def.key] ?? def.default;
        coeffValues2[def.key] =
          def.key === "a" ? base * 0.5 : base + (def.key === "c" || def.key === "d" || def.key === "b" ? 1 : 0);
      }
    } else {
      for (const def of defs) {
        if (coeffValues2[def.key] === undefined) coeffValues2[def.key] = def.default;
      }
    }
    syncCoeffInputs(coeffValues2, coeffInputRefs2);
  }

  function buildModelFrom(type, coeffs, customExpr, xMin, xMax, derivPrefix = "f′(x)") {
    const spec = MathEngine.buildFunction(type, coeffs, customExpr, { derivPrefix });
    const analysis = spec.analyze(xMin, xMax);
    const deriv = typeof spec.derivative === "function" ? spec.derivative : () => spec.derivative;
    const rateData = MathEngine.analyzeRate(deriv, xMin, xMax);
    return {
      formula: spec.formula(),
      derivativeFormula: spec.derivativeFormula(),
      intervals: analysis.intervals,
      criticalPoints: analysis.criticalPoints,
      f: spec.f,
      deriv,
      rateData,
    };
  }

  function enrichIntervals(intervals, deriv, xMin, xMax, derivLabel = "f′") {
    return intervals.map((iv) => {
      if (iv.type === "const") return iv;
      const mid = (Math.max(iv.from, xMin) + Math.min(iv.to, xMax)) / 2;
      const rate = MathEngine.rateAt(deriv, mid);
      return {
        ...iv,
        label: `${iv.label}，${rate.label}（|${derivLabel}| ≈ ${MathEngine.fmtNum(rate.abs)}）`,
      };
    });
  }

  function renderRateProbe(model, model2) {
    const rateF = MathEngine.rateAt(model.deriv, probeX);
    let html = `<div class="rate-line">x = ${MathEngine.fmtNum(probeX)}</div>`;
    html += `<div class="rate-line">f′(x) = ${MathEngine.fmtNum(rateF.sign)}</div>`;
    html += `<div class="rate-line rate-${rateF.level}">${rateF.label}</div>`;
    if (Number.isFinite(rateF.abs)) {
      html += `<div class="rate-line muted">|f′| 越大，增减越快；越小，变化越慢</div>`;
    }
  if (model2) {
      const rateG = MathEngine.rateAt(model2.deriv, probeX);
      html += `<div class="rate-divider"></div>`;
      html += `<div class="rate-line">g′(x) = ${MathEngine.fmtNum(rateG.sign)}（${rateG.label}）</div>`;
      if (Number.isFinite(rateF.abs) && Number.isFinite(rateG.abs)) {
        const diff = rateF.abs - rateG.abs;
        const faster = Math.abs(diff) < 0.05 ? "两者变化快慢相近" : diff > 0 ? "f 增减更快" : "g 增减更快";
        html += `<div class="rate-line accent">${faster}</div>`;
      }
    }
    els.rateDisplay.innerHTML = html;

    if (model2 && els.compareEnabled.checked) {
      els.compareRateDisplay.innerHTML = `
        <div class="rate-line">同一点 x = ${MathEngine.fmtNum(probeX)}：</div>
        <div class="rate-line">|f′| = ${MathEngine.fmtNum(rateF.abs)}，|g′| = ${MathEngine.fmtNum(MathEngine.rateAt(model2.deriv, probeX).abs)}</div>
        <div class="rate-line muted">可对比两函数在同一位置的增减快慢</div>
      `;
    }
  }

  function renderAnalysis(model, model2, error) {
    if (!model && !model2) {
      const msg = error || "无法分析";
      els.formulaDisplay.innerHTML = `<span class="error-msg">${msg}</span>`;
      els.derivativeDisplay.textContent = "";
      els.monotoneDisplay.innerHTML = `<span class="error-msg">—</span>`;
      els.criticalDisplay.textContent = "—";
      els.rateDisplay.innerHTML = `<span class="error-msg">—</span>`;
      if (els.compareEnabled.checked) {
        els.formulaDisplay2.textContent = "—";
        els.derivativeDisplay2.textContent = "";
        els.monotoneDisplay2.innerHTML = "";
      }
      return;
    }

    if (model) {
      els.formulaDisplay.textContent = model.formula;
      els.derivativeDisplay.textContent = model.derivativeFormula;
      els.monotoneDisplay.innerHTML = enrichIntervals(
        model.intervals,
        model.deriv,
        getViewRange().xMin,
        getViewRange().xMax
      )
        .map((iv) => `<span class="interval ${iv.type}">${iv.label}</span>`)
        .join("");

      if (model.criticalPoints.length === 0) {
        els.criticalDisplay.textContent = "当前区间内无驻点 / 极值点";
      } else {
        els.criticalDisplay.innerHTML = model.criticalPoints
          .map(
            (pt) =>
              `<div class="critical-point">${pt.kind}：x = ${MathEngine.fmtNum(pt.x)}，y = ${MathEngine.fmtNum(pt.y)}</div>`
          )
          .join("");
      }
    } else {
      els.formulaDisplay.innerHTML = `<span class="error-msg">${error}</span>`;
      els.derivativeDisplay.textContent = "";
      els.monotoneDisplay.innerHTML = "";
      els.criticalDisplay.textContent = "—";
    }

    if (model2) {
      els.formulaDisplay2.textContent = model2.formula;
      els.derivativeDisplay2.textContent = model2.derivativeFormula;
      els.monotoneDisplay2.innerHTML = enrichIntervals(
        model2.intervals,
        model2.deriv,
        getViewRange().xMin,
        getViewRange().xMax,
        "g′"
      )
        .map((iv) => `<span class="interval ${iv.type}">${iv.label}</span>`)
        .join("");
    } else if (els.compareEnabled.checked) {
      els.formulaDisplay2.innerHTML = error
        ? `<span class="error-msg">${error}</span>`
        : "—";
      els.derivativeDisplay2.textContent = "";
      els.monotoneDisplay2.innerHTML = "";
    }

    renderRateProbe(model, model2);
    if (error && model) {
      els.rateDisplay.insertAdjacentHTML(
        "afterbegin",
        `<div class="rate-line error-msg">${error}</div><div class="rate-divider"></div>`
      );
    }
  }

  function getHandles(type, coeffs, f) {
    const raw = MathEngine.getDragHandles(type, coeffs);
    return raw.map((h) => {
      let y = h.y;
      try {
        y = f(h.x);
      } catch {
        y = h.y;
      }
      return { ...h, y };
    });
  }

  function applyCoeffs(values, refs) {
    syncCoeffInputs(values, refs);
  }

  function update() {
    toggleSections();
    const type = els.funcType.value;
    const type2 = els.funcType2.value;
    const range = getViewRange();
    const { xMin, xMax, yMin, yMax } = range;
    const isCustomF = type === "custom";
    const compare = els.compareEnabled.checked;

    if (xMax <= xMin || yMax <= yMin) {
      renderAnalysis(null, null, "视图范围无效：最大值须大于最小值");
      return;
    }

    let model = null;
    let model2 = null;
    const errors = [];
    try {
      model = buildModelFrom(type, coeffValues, els.customExpr.value, xMin, xMax);
    } catch (e) {
      errors.push(`f(x)：${e.message || "表达式错误"}`);
    }
    if (compare) {
      try {
        model2 = buildModelFrom(type2, coeffValues2, els.customExpr2.value, xMin, xMax, "g′(x)");
      } catch (e) {
        errors.push(`g(x)：${e.message || "表达式错误"}`);
      }
    }

    if (!model && (!compare || !model2)) {
      ctx.clearRect(0, 0, els.graph.width, els.graph.height);
      ctx.fillStyle = "#fafbfc";
      ctx.fillRect(0, 0, els.graph.width, els.graph.height);
      renderAnalysis(null, null, errors.join("；"));
      currentModel = null;
      return;
    }

    if (errors.length) {
      renderAnalysis(model, model2, errors.join("；"));
    }

    const handles = model && !isCustomF ? getHandles(type, coeffValues, model.f) : [];
    currentModel = { type, type2, model, model2, handles, range, isCustomF, compare };

    if (!model) {
      currentModel = null;
      return;
    }

    Plotter.draw(ctx, {
      width: els.graph.width,
      height: els.graph.height,
      xMin,
      xMax,
      yMin,
      yMax,
      f: model.f,
      deriv: model.deriv,
      f2: model2?.f,
      deriv2: model2?.deriv,
      intervals: model.intervals,
      intervals2: model2?.intervals,
      criticalPoints: model.criticalPoints,
      showDerivative: els.showDerivative.checked,
      showMonotone: els.showMonotone.checked,
      showRate: els.showRate.checked,
      rateData: model.rateData,
      rateData2: model2?.rateData,
      probeX,
      handles,
      activeHandleId: dragState?.handleId ?? null,
      compareEnabled: compare,
    });

    if (!errors.length) {
      renderAnalysis(model, model2, null);
    }
  }

  function canvasPos(evt) {
    const rect = els.graph.getBoundingClientRect();
    const sx = els.graph.width / rect.width;
    const sy = els.graph.height / rect.height;
    return {
      px: (evt.clientX - rect.left) * sx,
      py: (evt.clientY - rect.top) * sy,
    };
  }

  function onPointerDown(evt) {
    if (!currentModel) return;
    const { px, py } = canvasPos(evt);
    const { xMin, xMax, yMin, yMax } = currentModel.range;
    const plot = Plotter.createPlotContext(els.graph.width, els.graph.height, xMin, xMax, yMin, yMax);
    if (!plot.inPlot(px, py)) return;

    const handle = Plotter.hitHandle(currentModel.handles, plot, px, py, xMin, xMax);
    if (handle) {
      dragState = { mode: "handle", handleId: handle.id, handle };
      els.graph.setPointerCapture(evt.pointerId);
      els.graph.classList.add("dragging");
      update();
      return;
    }

    const near = Plotter.nearestOnCurve(currentModel.model.f, plot, px, py, xMin, xMax);
    if (near.dist < 400) {
      dragState = {
        mode: "curve",
        anchorX: near.x,
      };
      els.graph.setPointerCapture(evt.pointerId);
      els.graph.classList.add("dragging");
      return;
    }

    probeX = plot.fromX(px);
    update();
  }

  function onPointerMove(evt) {
    if (!dragState || !currentModel) return;
    const { px, py } = canvasPos(evt);
    const { type, range, isCustomF } = currentModel;
    if (isCustomF) return;
    const { xMin, xMax, yMin, yMax } = range;
    const plot = Plotter.createPlotContext(els.graph.width, els.graph.height, xMin, xMax, yMin, yMax);
    const mx = plot.fromX(px);
    const my = plot.fromY(py);

    if (dragState.mode === "handle") {
      const next = dragState.handle.apply(mx, my);
      Object.assign(coeffValues, next);
      applyCoeffs(coeffValues, coeffInputRefs);
      update();
      return;
    }

    if (dragState.mode === "curve") {
      const next = MathEngine.fitConstantTerm(type, coeffValues, dragState.anchorX, my);
      Object.assign(coeffValues, next);
      applyCoeffs(coeffValues, coeffInputRefs);
      probeX = dragState.anchorX;
      update();
    }
  }

  function onPointerUp(evt) {
    if (dragState) {
      dragState = null;
      els.graph.classList.remove("dragging");
      try {
        els.graph.releasePointerCapture(evt.pointerId);
      } catch {
        /* ignore */
      }
      update();
    }
  }

  els.funcType.addEventListener("change", () => {
    renderCoeffInputs(els.funcType.value, els.coeffInputs, coeffValues, coeffInputRefs, update);
    update();
  });

  els.funcType2.addEventListener("change", () => {
    renderCoeffInputs(els.funcType2.value, els.coeffInputs2, coeffValues2, coeffInputRefs2, update);
    update();
  });

  els.compareEnabled.addEventListener("change", () => {
    if (els.compareEnabled.checked) {
      initCompareG();
    }
    update();
  });

  ["xMin", "xMax", "yMin", "yMax"].forEach((id) => els[id].addEventListener("input", update));
  els.customExpr.addEventListener("input", update);
  els.customExpr2.addEventListener("input", update);
  els.showDerivative.addEventListener("change", update);
  els.showMonotone.addEventListener("change", update);
  els.showRate.addEventListener("change", update);

  els.graph.addEventListener("pointerdown", onPointerDown);
  els.graph.addEventListener("pointermove", onPointerMove);
  els.graph.addEventListener("pointerup", onPointerUp);
  els.graph.addEventListener("pointerleave", onPointerUp);

  function fitCanvasSize() {
    const wrap = els.graphWrap;
    if (!wrap || els.graphArea.classList.contains("collapsed")) return;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width - 24));
    const h = Math.max(200, Math.floor(rect.height - 48));
    if (els.graph.width !== w || els.graph.height !== h) {
      els.graph.width = w;
      els.graph.height = h;
      update();
    }
  }

  function initExprToolbars() {
    const shortcuts = [
      { label: "x", insert: "x" },
      { label: "+", insert: " + " },
      { label: "−", insert: " - " },
      { label: "×", insert: " * " },
      { label: "÷", insert: " / " },
      { label: "^", insert: "**" },
      { label: "(", insert: "(" },
      { label: ")", insert: ")" },
      { label: "sin", insert: "sin(" },
      { label: "cos", insert: "cos(" },
      { label: "tan", insert: "tan(" },
      { label: "ln", insert: "ln(" },
      { label: "log", insert: "log(" },
      { label: "√", insert: "sqrt(" },
      { label: "|·|", insert: "abs(" },
      { label: "π", insert: "pi" },
      { label: "e", insert: "e" },
    ];

    function mount(toolbarEl, inputEl) {
      if (!toolbarEl || !inputEl) return;
      toolbarEl.innerHTML = shortcuts
        .map(
          (s) =>
            `<button type="button" class="expr-btn" data-insert="${s.insert.replace(/"/g, "&quot;")}">${s.label}</button>`
        )
        .join("");

      toolbarEl.querySelectorAll(".expr-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const insert = btn.dataset.insert || "";
          const start = inputEl.selectionStart ?? inputEl.value.length;
          const end = inputEl.selectionEnd ?? start;
          const v = inputEl.value;
          inputEl.value = v.slice(0, start) + insert + v.slice(end);
          const pos = start + insert.length;
          inputEl.focus();
          inputEl.setSelectionRange(pos, pos);
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        });
      });
    }

    mount(document.getElementById("toolbarCustomF"), els.customExpr);
    mount(document.getElementById("toolbarCustomG"), els.customExpr2);
  }

  function initLayoutResize() {
    const root = document.documentElement;
    const limits = { left: [200, 420], right: [220, 420], graph: [200, 900] };
    let savedGraphHeight = null;

    function startDrag(mode, e) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseInt(getComputedStyle(root).getPropertyValue("--col-left"), 10) || 260;
      const startRight = parseInt(getComputedStyle(root).getPropertyValue("--col-right"), 10) || 280;
      const startGraph = parseInt(getComputedStyle(root).getPropertyValue("--graph-height"), 10) || 520;

      document.body.classList.add("is-resizing");
      const activeEl =
        mode === "left"
          ? els.splitterLeft
          : mode === "right"
            ? els.splitterRight
            : els.resizeBarV;
      activeEl?.classList.add("dragging");

      function onMove(ev) {
        if (mode === "left") {
          const w = Math.min(limits.left[1], Math.max(limits.left[0], startLeft + (ev.clientX - startX)));
          root.style.setProperty("--col-left", `${w}px`);
        } else if (mode === "right") {
          const w = Math.min(limits.right[1], Math.max(limits.right[0], startRight - (ev.clientX - startX)));
          root.style.setProperty("--col-right", `${w}px`);
        } else if (mode === "graph") {
          const h = Math.min(limits.graph[1], Math.max(limits.graph[0], startGraph + (ev.clientY - startY)));
          root.style.setProperty("--graph-height", `${h}px`);
          requestAnimationFrame(fitCanvasSize);
        }
      }

      function onUp() {
        document.body.classList.remove("is-resizing");
        activeEl?.classList.remove("dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        fitCanvasSize();
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    els.splitterLeft?.addEventListener("pointerdown", (e) => startDrag("left", e));
    els.splitterRight?.addEventListener("pointerdown", (e) => startDrag("right", e));
    els.resizeBarV?.addEventListener("pointerdown", (e) => startDrag("graph", e));

    els.graphCollapseBtn?.addEventListener("click", () => {
      const collapsed = els.graphArea.classList.toggle("collapsed");
      els.graphCollapseBtn.textContent = collapsed ? "展开" : "收起";
      els.graphCollapseBtn.setAttribute("aria-expanded", String(!collapsed));
      if (collapsed) {
        savedGraphHeight = getComputedStyle(root).getPropertyValue("--graph-height");
        root.style.setProperty("--graph-height", "0px");
      } else {
        root.style.setProperty("--graph-height", savedGraphHeight || "520px");
        requestAnimationFrame(fitCanvasSize);
      }
    });

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => fitCanvasSize());
      ro.observe(els.graphWrap);
    }
    window.addEventListener("resize", fitCanvasSize);
  }

  renderCoeffInputs(els.funcType.value, els.coeffInputs, coeffValues, coeffInputRefs, update);
  renderCoeffInputs(els.funcType2.value, els.coeffInputs2, coeffValues2, coeffInputRefs2, update);
  initExprToolbars();
  initLayoutResize();
  requestAnimationFrame(fitCanvasSize);
})();
