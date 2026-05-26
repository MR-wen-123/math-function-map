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
    domainLimitF: document.getElementById("domainLimitF"),
    domainMinF: document.getElementById("domainMinF"),
    domainMaxF: document.getElementById("domainMaxF"),
    domainPanelF: document.getElementById("domainPanelF"),
    domainLimitG: document.getElementById("domainLimitG"),
    domainMinG: document.getElementById("domainMinG"),
    domainMaxG: document.getElementById("domainMaxG"),
    domainPanelG: document.getElementById("domainPanelG"),
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
    showCriticalPoints: document.getElementById("showCriticalPoints"),
    showProbe: document.getElementById("showProbe"),
    showHandles: document.getElementById("showHandles"),
    graph: document.getElementById("graph"),
    graphWrap: document.getElementById("graphWrap"),
    graphArea: document.getElementById("graphArea"),
    graphBody: document.getElementById("graphBody"),
    graphCollapseBtn: document.getElementById("graphCollapseBtn"),
    showCoordsBtn: document.getElementById("showCoordsBtn"),
    showCoordsBtnText: document.getElementById("showCoordsBtnText"),
    resetViewBtn: document.getElementById("resetViewBtn"),
    splitterLeft: document.getElementById("splitterLeft"),
    splitterRight: document.getElementById("splitterRight"),
    resizeBarV: document.getElementById("resizeBarV"),
    mainLayout: document.getElementById("mainLayout"),
    panelLeft: document.getElementById("panelLeft"),
    panelRight: document.getElementById("panelRight"),
    collapseLeftBtn: document.getElementById("collapseLeftBtn"),
    collapseRightBtn: document.getElementById("collapseRightBtn"),
    formulaDisplay: document.getElementById("formulaDisplay"),
    formulaDisplay2: document.getElementById("formulaDisplay2"),
    domainDisplay: document.getElementById("domainDisplay"),
    domainDisplay2: document.getElementById("domainDisplay2"),
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
  let showCoords = true;
  let dragState = null;
  let currentModel = null;

  const DEFAULT_VIEW = { xMin: -5, xMax: 5, yMin: -10, yMax: 10 };
  const ZOOM_FACTOR = 1.12;
  const MAX_VIEW_SPAN = 1e7;
  const ABS_MIN_VIEW_SPAN = 1e-12;
  const layoutDesktopMq = window.matchMedia(`(min-width: ${1101}px)`);

  function isLayoutDesktop() {
    return layoutDesktopMq.matches;
  }

  function isPageVerticallyScrollable() {
    const doc = document.documentElement;
    return doc.scrollHeight > doc.clientHeight + 2;
  }

  /** 窄屏或页面可纵向滚动时，滚轮默认滚动页面；Ctrl/⌘ + 滚轮缩放图像 */
  function shouldGraphWheelZoom(evt) {
    if (evt.ctrlKey || evt.metaKey) return true;
    if (!isLayoutDesktop()) return false;
    return !isPageVerticallyScrollable();
  }

  function syncCoordsBtn() {
    if (!els.showCoordsBtn) return;
    els.showCoordsBtn.setAttribute("aria-pressed", String(showCoords));
    if (els.showCoordsBtnText) {
      els.showCoordsBtnText.textContent = showCoords ? "坐标标注：开" : "坐标标注：关";
    }
  }

  function formatProbeCoord(x, y) {
    return `(${MathEngine.fmtNum(x)}, ${MathEngine.fmtNum(y)})`;
  }

  function getViewRange() {
    return {
      xMin: parseFloat(els.xMin.value),
      xMax: parseFloat(els.xMax.value),
      yMin: parseFloat(els.yMin.value),
      yMax: parseFloat(els.yMax.value),
    };
  }

  /** 视窗跨度越小，保留越多有效数字 */
  function decimalsForSpan(span) {
    if (!Number.isFinite(span) || span <= 0) return 6;
    const d = Math.ceil(-Math.log10(span / 250));
    return Math.max(2, Math.min(14, d));
  }

  function roundView(n, span) {
    const d = decimalsForSpan(span);
    const f = 10 ** d;
    const r = Math.round(n * f) / f;
    return Number.isInteger(r) ? r : r;
  }

  /** 允许随当前视窗继续放大，高精度时不受 0.15 硬下限束缚 */
  function getMinViewSpan(min, max) {
    const span = Math.max(max - min, 0);
    const center = (min + max) / 2;
    const ref = Math.max(Math.abs(center), Math.abs(min), Math.abs(max), 1e-9);
    const relative = ref * 1e-9;
    const progressive = span > 0 ? span / 400 : relative;
    return Math.max(ABS_MIN_VIEW_SPAN, relative, progressive);
  }

  function setViewRange(range) {
    els.xMin.value = range.xMin;
    els.xMax.value = range.xMax;
    els.yMin.value = range.yMin;
    els.yMax.value = range.yMax;
  }

  function applyViewRange(xMin, xMax, yMin, yMax) {
    const xSpan = xMax - xMin;
    const ySpan = yMax - yMin;
    if (xSpan < getMinViewSpan(xMin, xMax) || ySpan < getMinViewSpan(yMin, yMax)) return false;
    if (xSpan > MAX_VIEW_SPAN || ySpan > MAX_VIEW_SPAN) return false;
    setViewRange({
      xMin: roundView(xMin, xSpan),
      xMax: roundView(xMax, xSpan),
      yMin: roundView(yMin, ySpan),
      yMax: roundView(yMax, ySpan),
    });
    update();
    return true;
  }

  function zoomViewAt(mx, my, zoomIn) {
    const { xMin, xMax, yMin, yMax } = getViewRange();
    if (xMax <= xMin || yMax <= yMin) return;
    const scale = zoomIn ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    applyViewRange(
      mx - (mx - xMin) * scale,
      mx + (xMax - mx) * scale,
      my - (my - yMin) * scale,
      my + (yMax - my) * scale
    );
  }

  function resetViewToDefault() {
    setViewRange({ ...DEFAULT_VIEW });
    probeX = 0;
    update();
  }

  function onGraphWheel(evt) {
    if (!shouldGraphWheelZoom(evt)) return;
    evt.preventDefault();
    const range = getViewRange();
    if (range.xMax <= range.xMin || range.yMax <= range.yMin) return;

    const zoomIn = evt.deltaY < 0;
    const plot = Plotter.createPlotContext(
      els.graph.width,
      els.graph.height,
      range.xMin,
      range.xMax,
      range.yMin,
      range.yMax
    );
    const { px, py } = canvasPos(evt);
    let mx = (range.xMin + range.xMax) / 2;
    let my = (range.yMin + range.yMax) / 2;
    if (plot.inPlot(px, py)) {
      mx = plot.fromX(px);
      my = plot.fromY(py);
    }
    zoomViewAt(mx, my, zoomIn);
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

  function readDomainConfig(limitEl, minEl, maxEl) {
    if (!limitEl?.checked) return { limit: false };
    const rawMin = minEl?.value ?? "";
    const rawMax = maxEl?.value ?? "";
    const pMin = MathEngine.parseDomainBound(rawMin);
    const pMax = MathEngine.parseDomainBound(rawMax);
    if (pMin.partial || pMax.partial) {
      return { limit: true, partial: true };
    }
    if (!pMin.ok || !pMax.ok) {
      return {
        limit: true,
        error: pMin.error || pMax.error || "定义域端点格式无效",
      };
    }
    const min = pMin.value === null ? -Infinity : pMin.value;
    const max = pMax.value === null ? Infinity : pMax.value;
    if (Number.isFinite(min) && Number.isFinite(max) && min >= max) {
      return { limit: true, error: "左端点须小于右端点" };
    }
    return {
      limit: true,
      bounds: { min, max, openMin: false, openMax: false },
    };
  }

  function bindDomainInputs(limitEl, panelEl, minEl, maxEl, onChange) {
    limitEl?.addEventListener("change", () => {
      panelEl?.classList.toggle("hidden", !limitEl.checked);
      onChange();
    });
    const onInput = () => {
      const partial =
        MathEngine.isPartialDomainInput(minEl?.value) || MathEngine.isPartialDomainInput(maxEl?.value);
      minEl?.classList.toggle("input-invalid", !partial && !MathEngine.parseDomainBound(minEl?.value ?? "").ok);
      maxEl?.classList.toggle("input-invalid", !partial && !MathEngine.parseDomainBound(maxEl?.value ?? "").ok);
      if (!partial) onChange();
    };
    minEl?.addEventListener("input", onInput);
    maxEl?.addEventListener("input", onInput);
    minEl?.addEventListener("blur", onInput);
    maxEl?.addEventListener("blur", onInput);
  }

  function toggleSections() {
    const isCustomF = els.funcType.value === "custom";
    const compare = els.compareEnabled.checked;
    const isCustomG = compare && els.funcType2.value === "custom";
    els.domainPanelF?.classList.toggle("hidden", !els.domainLimitF?.checked);
    els.domainPanelG?.classList.toggle("hidden", !compare || !els.domainLimitG?.checked);

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

  function setMathFormula(el, plainText, latex, options = {}) {
    if (!el) return;
    const text = plainText ?? "";
    const multiline = options.multiline || text.includes("\n");
    if (latex && typeof katex !== "undefined") {
      try {
        katex.render(latex, el, {
          throwOnError: true,
          strict: "warn",
          displayMode: options.displayMode === true || (options.displayMode !== false && !multiline),
          output: "html",
        });
        el.classList.add("formula-math");
        if (multiline || options.displayMode === true) el.classList.add("formula-math-block");
        else el.classList.remove("formula-math-block");
        el.dataset.plainFormula = text;
        return;
      } catch {
        /* 无效 LaTeX 时回退为可读纯文本，避免显示原始 \sqrt\left 等 */
      }
    }
    el.textContent = text || "";
    el.classList.remove("formula-math", "formula-math-block");
    delete el.dataset.plainFormula;
  }

  function renderCriticalPoints(el, points, extraNote = null) {
    if (!el) return;
    if (!points?.length) {
      el.textContent = extraNote || "当前区间内无驻点 / 极值点";
      el.classList.remove("formula-math");
      return;
    }
    const plain = points.map((pt) => MathEngine.formatCriticalPointPlain(pt)).join("\n");
    const latex = MathEngine.formatCriticalPointsLatex(points);
    setMathFormula(el, plain, latex, { displayMode: false });
    const oldNote = el.querySelector(".analysis-note");
    if (oldNote) oldNote.remove();
    if (extraNote) {
      const note = document.createElement("p");
      note.className = "hint analysis-note";
      note.textContent = extraNote;
      el.appendChild(note);
    }
  }

  function buildModelFrom(type, coeffs, customExpr, xMin, xMax, derivPrefix = "f′(x)", domainConfig = null) {
    if (domainConfig?.partial) {
      throw new Error("定义域输入未完成");
    }
    if (domainConfig?.error) {
      throw new Error(domainConfig.error);
    }
    const spec = MathEngine.buildFunction(type, coeffs, customExpr, { derivPrefix });
    const domain = MathEngine.resolveEffectiveDomain(spec, domainConfig);
    const range = MathEngine.analysisRange(xMin, xMax, domain);
    if (!range.valid) {
      throw new Error("定义域与当前视图 x 范围无交集");
    }
    const rawDeriv = typeof spec.derivative === "function" ? spec.derivative : () => spec.derivative;
    const f = MathEngine.restrictToDomain(spec.f, domain);
    const deriv = MathEngine.restrictToDomain(rawDeriv, domain);
    const analysis = spec.analyze(range.min, range.max);
    const rateData = MathEngine.analyzeRate(deriv, range.min, range.max);
    return {
      formula: spec.formula(),
      formulaLatex: spec.formulaLatex?.() ?? null,
      domainText: MathEngine.formatDomainLabel(domain),
      derivativeFormula: spec.derivativeFormula(),
      derivativeFormulaLatex: spec.derivativeFormulaLatex?.() ?? null,
      derivativeIsPiecewise: spec.derivativeIsPiecewise?.() ?? false,
      intervals: analysis.intervals,
      criticalPoints: analysis.criticalPoints,
      analysisNote: analysis.analysisNote || null,
      highFrequency: !!analysis.highFrequency,
      f,
      deriv,
      domain,
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

  function probeYAt(model, x) {
    try {
      const y = model.f(x);
      return Number.isFinite(y) ? y : null;
    } catch {
      return null;
    }
  }

  function renderRateProbe(model, model2) {
    const rateF = MathEngine.rateAt(model.deriv, probeX);
    const fy = probeYAt(model, probeX);
    let html = `<div class="rate-line">点击 / 探针：${fy != null ? `f ${formatProbeCoord(probeX, fy)}` : `x = ${MathEngine.fmtNum(probeX)}（f 未定义）`}</div>`;
    html += `<div class="rate-line">f′(x) = ${MathEngine.fmtNum(rateF.sign)}</div>`;
    html += `<div class="rate-line rate-${rateF.level}">${rateF.label}</div>`;
    if (Number.isFinite(rateF.abs)) {
      html += `<div class="rate-line muted">|f′| 越大，增减越快；越小，变化越慢</div>`;
    }
  if (model2) {
      const rateG = MathEngine.rateAt(model2.deriv, probeX);
      const gy = probeYAt(model2, probeX);
      html += `<div class="rate-divider"></div>`;
      if (gy != null) {
        html += `<div class="rate-line">g ${formatProbeCoord(probeX, gy)}</div>`;
      }
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
      els.domainDisplay.textContent = "";
      els.derivativeDisplay.textContent = "";
      els.monotoneDisplay.innerHTML = `<span class="error-msg">—</span>`;
      els.criticalDisplay.textContent = "—";
      els.rateDisplay.innerHTML = `<span class="error-msg">—</span>`;
      if (els.compareEnabled.checked) {
        els.formulaDisplay2.textContent = "—";
        els.domainDisplay2.textContent = "";
        els.derivativeDisplay2.textContent = "";
        els.monotoneDisplay2.innerHTML = "";
      }
      return;
    }

    if (model) {
      setMathFormula(els.formulaDisplay, model.formula, model.formulaLatex, { displayMode: false });
      els.domainDisplay.textContent = model.domainText || "";
      setMathFormula(els.derivativeDisplay, model.derivativeFormula, model.derivativeFormulaLatex, {
        displayMode: model.derivativeIsPiecewise,
        multiline: model.derivativeIsPiecewise,
      });
      let monoHtml = enrichIntervals(
        model.intervals,
        model.deriv,
        getViewRange().xMin,
        getViewRange().xMax
      )
        .map((iv) => `<span class="interval ${iv.type}">${iv.label}</span>`)
        .join("");
      if (model.analysisNote) {
        monoHtml += `<p class="hint analysis-note">${model.analysisNote}</p>`;
      }
      els.monotoneDisplay.innerHTML = monoHtml;

      renderCriticalPoints(els.criticalDisplay, model.criticalPoints, model.analysisNote);
    } else {
      els.formulaDisplay.innerHTML = `<span class="error-msg">${error}</span>`;
      els.domainDisplay.textContent = "";
      els.derivativeDisplay.textContent = "";
      els.monotoneDisplay.innerHTML = "";
      els.criticalDisplay.textContent = "—";
    }

    if (model2) {
      setMathFormula(els.formulaDisplay2, model2.formula, model2.formulaLatex, { displayMode: false });
      els.domainDisplay2.textContent = model2.domainText || "";
      setMathFormula(els.derivativeDisplay2, model2.derivativeFormula, model2.derivativeFormulaLatex, {
        displayMode: model2.derivativeIsPiecewise,
        multiline: model2.derivativeIsPiecewise,
      });
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
    const domainF = readDomainConfig(els.domainLimitF, els.domainMinF, els.domainMaxF);
    const domainG = readDomainConfig(els.domainLimitG, els.domainMinG, els.domainMaxG);
    try {
      model = buildModelFrom(type, coeffValues, els.customExpr.value, xMin, xMax, "f′(x)", domainF);
    } catch (e) {
      errors.push(`f(x)：${e.message || "表达式错误"}`);
    }
    if (compare) {
      try {
        model2 = buildModelFrom(type2, coeffValues2, els.customExpr2.value, xMin, xMax, "g′(x)", domainG);
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
      criticalPoints2: model2?.criticalPoints,
      fmtCoord: (n) => MathEngine.fmtNumForCritical(n),
      showCoords,
      showDerivative: els.showDerivative.checked,
      showMonotone: els.showMonotone.checked,
      showRate: els.showRate.checked,
      showCriticalPoints: els.showCriticalPoints?.checked !== false,
      showProbe: els.showProbe?.checked !== false,
      showHandles: els.showHandles?.checked !== false,
      highFrequency: model.highFrequency,
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

  const PAN_CLICK_THRESHOLD = 6;

  function panViewByDrag(px, py) {
    const { startPx, startPy, startRange } = dragState;
    const plot = Plotter.createPlotContext(
      els.graph.width,
      els.graph.height,
      startRange.xMin,
      startRange.xMax,
      startRange.yMin,
      startRange.yMax
    );
    const xSpan = startRange.xMax - startRange.xMin;
    const ySpan = startRange.yMax - startRange.yMin;
    const shiftX = ((px - startPx) / plot.plotW) * xSpan;
    const shiftY = ((py - startPy) / plot.plotH) * ySpan;
    applyViewRange(
      startRange.xMin - shiftX,
      startRange.xMax - shiftX,
      startRange.yMin + shiftY,
      startRange.yMax + shiftY
    );
  }

  function onPointerDown(evt) {
    const range = getViewRange();
    if (range.xMax <= range.xMin || range.yMax <= range.yMin) return;

    const { px, py } = canvasPos(evt);
    const plot = Plotter.createPlotContext(
      els.graph.width,
      els.graph.height,
      range.xMin,
      range.xMax,
      range.yMin,
      range.yMax
    );
    if (!plot.inPlot(px, py)) return;

    if (currentModel) {
      const { xMin, xMax } = currentModel.range;
      const handle =
        els.showHandles?.checked !== false
          ? Plotter.hitHandle(currentModel.handles, plot, px, py, xMin, xMax)
          : null;
      if (handle) {
        dragState = { mode: "handle", handleId: handle.id, handle };
        els.graph.setPointerCapture(evt.pointerId);
        els.graph.classList.add("dragging");
        update();
        return;
      }

      const near = Plotter.nearestOnCurve(currentModel.model.f, plot, px, py, xMin, xMax);
      if (els.showProbe?.checked !== false && near.dist < 400) {
        probeX = near.x;
        dragState = {
          mode: "curve",
          anchorX: near.x,
        };
        els.graph.setPointerCapture(evt.pointerId);
        els.graph.classList.add("dragging");
        return;
      }
    }

    dragState = {
      mode: "pan-pending",
      startPx: px,
      startPy: py,
      startRange: { ...range },
      probeX: plot.fromX(px),
    };
    els.graph.setPointerCapture(evt.pointerId);
  }

  function onPointerMove(evt) {
    const { px, py } = canvasPos(evt);

    if (dragState?.mode === "pan-pending") {
      const dx = px - dragState.startPx;
      const dy = py - dragState.startPy;
      if (Math.hypot(dx, dy) >= PAN_CLICK_THRESHOLD) {
        dragState.mode = "pan";
        els.graph.classList.add("panning");
      }
      return;
    }

    if (dragState?.mode === "pan") {
      panViewByDrag(px, py);
      return;
    }

    if (!dragState || !currentModel) return;
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
      if (dragState.mode === "pan-pending") {
        probeX = dragState.probeX;
        update();
      }
      dragState = null;
      els.graph.classList.remove("dragging", "panning");
      try {
        els.graph.releasePointerCapture(evt.pointerId);
      } catch {
        /* ignore */
      }
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
  bindDomainInputs(els.domainLimitF, els.domainPanelF, els.domainMinF, els.domainMaxF, update);
  bindDomainInputs(els.domainLimitG, els.domainPanelG, els.domainMinG, els.domainMaxG, update);
  els.customExpr.addEventListener("input", update);
  els.customExpr2.addEventListener("input", update);
  els.showCoordsBtn?.addEventListener("click", () => {
    showCoords = !showCoords;
    syncCoordsBtn();
    update();
  });
  els.resetViewBtn?.addEventListener("click", resetViewToDefault);
  els.showDerivative.addEventListener("change", update);
  els.showMonotone.addEventListener("change", update);
  els.showRate.addEventListener("change", update);
  els.showCriticalPoints?.addEventListener("change", update);
  els.showProbe?.addEventListener("change", update);
  els.showHandles?.addEventListener("change", update);

  els.graph.addEventListener("pointerdown", onPointerDown);
  els.graph.addEventListener("pointermove", onPointerMove);
  els.graph.addEventListener("pointerup", onPointerUp);
  els.graph.addEventListener("pointerleave", onPointerUp);
  els.graph.addEventListener("wheel", onGraphWheel, { passive: false });

  function getGraphHeightMax() {
    const max = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--graph-height-max"),
      10
    );
    return Number.isFinite(max) && max > 200 ? max : 2400;
  }

  function computeDefaultGraphHeight() {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const minH = isLayoutDesktop() ? 200 : 220;
    const maxH = getGraphHeightMax();
    const resizeBarH = els.resizeBarV?.offsetHeight ?? 10;

    if (isLayoutDesktop()) {
      const header = document.querySelector(".app-header");
      const graphHeader = els.graphArea?.querySelector(".graph-header");
      const app = document.querySelector(".app");
      const headerH = header?.offsetHeight ?? 48;
      const graphHeaderH = graphHeader?.offsetHeight ?? 44;
      let appPad = 40;
      if (app) {
        const s = getComputedStyle(app);
        appPad = (parseFloat(s.paddingTop) || 16) + (parseFloat(s.paddingBottom) || 24);
      }
      const mainGap = 12;
      const h = Math.floor(vh - appPad - headerH - mainGap - graphHeaderH - resizeBarH);
      return Math.min(maxH, Math.max(minH, h));
    }

    const h = Math.floor(vh * 0.48);
    return Math.min(maxH, Math.max(minH, Math.min(h, 480)));
  }

  function getGraphHeightFromVar() {
    const gh = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--graph-height"),
      10
    );
    return Number.isFinite(gh) && gh > 0 ? gh : computeDefaultGraphHeight();
  }

  function fitCanvasSize() {
    const wrap = els.graphWrap;
    const body = els.graphBody;
    if (!wrap || !body || els.graphArea.classList.contains("collapsed")) return;

    const wrapW = wrap.clientWidth;
    if (wrapW < 8) return;

    const minW = isLayoutDesktop() ? 320 : 240;
    const minH = isLayoutDesktop() ? 200 : 180;
    const w = Math.max(minW, Math.floor(wrapW - 24));

    const legendEl = wrap.querySelector(".legend");
    const legendH = legendEl ? legendEl.offsetHeight + 12 : 40;
    const resizeBarH = els.resizeBarV?.offsetHeight ?? 10;
    const bodyH = body.clientHeight;
    const available =
      bodyH > 0 ? bodyH - legendH - resizeBarH - 24 : getGraphHeightFromVar() - legendH - resizeBarH;
    const h = Math.max(minH, Math.floor(available));

    if (els.graph.width !== w || els.graph.height !== h) {
      els.graph.width = w;
      els.graph.height = h;
      update();
    }
  }

  function clearDesktopLayoutVars() {
    const root = document.documentElement;
    root.style.removeProperty("--col-left");
    root.style.removeProperty("--col-right");
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
      { label: "exp", insert: "exp(" },
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

  function initCompositeExamples() {
    const examples = MathEngine.COMPOSITE_FUNCTION_EXAMPLES || [];
    const groups = [];
    const groupIndex = new Map();
    for (const ex of examples) {
      const g = ex.group || "例题";
      if (!groupIndex.has(g)) {
        groupIndex.set(g, groups.length);
        groups.push({ title: g, items: [] });
      }
      groups[groupIndex.get(g)].items.push(ex);
    }

    function mountExamples(containerId, inputEl) {
      const container = document.getElementById(containerId);
      if (!container || !inputEl) return;
      container.innerHTML = groups
        .map((g) => {
          const hideSubTitle = g.title === "例子";
          return `
        <div class="example-chip-group">
          ${hideSubTitle ? "" : `<span class="example-chip-group-title">${g.title}</span>`}
          <div class="example-chip-row">
            ${g.items
              .map(
                (ex) =>
                  `<button type="button" class="example-chip" data-expr="${ex.expr.replace(/"/g, "&quot;")}" title="${(ex.note || "").replace(/"/g, "&quot;")}">${ex.label}</button>`
              )
              .join("")}
          </div>
        </div>`;
        })
        .join("");
      container.querySelectorAll(".example-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          inputEl.value = btn.dataset.expr || "";
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        });
      });
    }

    mountExamples("compositeExamplesF", els.customExpr);
    mountExamples("compositeExamplesG", els.customExpr2);
  }

  const PANEL_COLLAPSED_WIDTH = 44;

  function initPanelCollapse() {
    const root = document.documentElement;
    const saved = { left: null, right: null };

    function syncPanelBtn(side, collapsed) {
      const btn = side === "left" ? els.collapseLeftBtn : els.collapseRightBtn;
      if (!btn) return;
      btn.textContent = collapsed ? "展开" : "收起";
      btn.setAttribute("aria-expanded", String(!collapsed));
      btn.title = collapsed
        ? side === "left"
          ? "展开左侧参数栏"
          : "展开右侧分析栏"
        : side === "left"
          ? "收起左侧参数栏"
          : "收起右侧分析栏";
    }

    function togglePanel(side) {
      const panel = side === "left" ? els.panelLeft : els.panelRight;
      if (!panel) return;
      const collapsed = !panel.classList.contains("collapsed");
      const varName = side === "left" ? "--col-left" : "--col-right";
      const layoutClass = side === "left" ? "left-collapsed" : "right-collapsed";

      panel.classList.toggle("collapsed", collapsed);
      els.mainLayout?.classList.toggle(layoutClass, collapsed);
      syncPanelBtn(side, collapsed);

      if (collapsed) {
        saved[side] = getComputedStyle(root).getPropertyValue(varName).trim();
        root.style.setProperty(varName, `${PANEL_COLLAPSED_WIDTH}px`);
      } else {
        const fallback = side === "left" ? "260px" : "280px";
        root.style.setProperty(varName, saved[side] || fallback);
        saved[side] = null;
      }

      requestAnimationFrame(fitCanvasSize);
    }

    els.collapseLeftBtn?.addEventListener("click", () => togglePanel("left"));
    els.collapseRightBtn?.addEventListener("click", () => togglePanel("right"));
  }

  function initLayoutResize() {
    const root = document.documentElement;
    const graphHeightMax = getGraphHeightMax();
    const limits = { left: [200, 420], right: [220, 420], graph: [200, graphHeightMax] };
    let savedGraphHeight = null;
    let graphHeightUserSet = false;

    function applyDefaultGraphHeight() {
      root.style.setProperty("--graph-height", `${computeDefaultGraphHeight()}px`);
    }

    function startDrag(mode, e) {
      if ((mode === "left" || mode === "right") && !isLayoutDesktop()) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseInt(getComputedStyle(root).getPropertyValue("--col-left"), 10) || 260;
      const startRight = parseInt(getComputedStyle(root).getPropertyValue("--col-right"), 10) || 280;
      const startGraph =
        parseInt(getComputedStyle(root).getPropertyValue("--graph-height"), 10) ||
        computeDefaultGraphHeight();

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
          graphHeightUserSet = true;
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

    layoutDesktopMq.addEventListener("change", () => {
      if (!isLayoutDesktop()) {
        clearDesktopLayoutVars();
        els.panelLeft?.classList.remove("collapsed");
        els.panelRight?.classList.remove("collapsed");
        els.mainLayout?.classList.remove("left-collapsed", "right-collapsed");
        root.style.setProperty("--col-left", "260px");
        root.style.setProperty("--col-right", "280px");
      }
      graphHeightUserSet = false;
      applyDefaultGraphHeight();
      requestAnimationFrame(fitCanvasSize);
    });

    els.graphCollapseBtn?.addEventListener("click", () => {
      const collapsed = els.graphArea.classList.toggle("collapsed");
      els.graphCollapseBtn.textContent = collapsed ? "展开" : "收起";
      els.graphCollapseBtn.setAttribute("aria-expanded", String(!collapsed));
      if (collapsed) {
        savedGraphHeight = getComputedStyle(root).getPropertyValue("--graph-height");
        root.style.setProperty("--graph-height", "0px");
      } else {
        root.style.setProperty(
          "--graph-height",
          savedGraphHeight || `${computeDefaultGraphHeight()}px`
        );
        requestAnimationFrame(fitCanvasSize);
      }
    });

    function onViewportChange() {
      if (!graphHeightUserSet && !els.graphArea.classList.contains("collapsed")) {
        applyDefaultGraphHeight();
      }
      requestAnimationFrame(fitCanvasSize);
    }

    applyDefaultGraphHeight();
    requestAnimationFrame(() => {
      if (!graphHeightUserSet && !els.graphArea.classList.contains("collapsed")) {
        applyDefaultGraphHeight();
      }
      fitCanvasSize();
    });

    if (typeof ResizeObserver !== "undefined" && els.graphBody) {
      const ro = new ResizeObserver(() => requestAnimationFrame(fitCanvasSize));
      ro.observe(els.graphBody);
    }
    window.addEventListener("resize", onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
    }
    window.addEventListener("orientationchange", () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(onViewportChange);
      });
    });
  }

  renderCoeffInputs(els.funcType.value, els.coeffInputs, coeffValues, coeffInputRefs, update);
  renderCoeffInputs(els.funcType2.value, els.coeffInputs2, coeffValues2, coeffInputRefs2, update);
  els.domainPanelF?.classList.toggle("hidden", !els.domainLimitF?.checked);
  els.domainPanelG?.classList.toggle("hidden", !els.domainLimitG?.checked);
  syncCoordsBtn();
  initExprToolbars();
  initCompositeExamples();
  initPanelCollapse();
  initLayoutResize();
})();
