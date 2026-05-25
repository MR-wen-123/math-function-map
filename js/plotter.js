/**
 * Canvas 绘图：坐标系、函数曲线、单调区间、对比、速率、控制点
 */
const Plotter = (() => {
  const COLORS = {
    grid: "#e2e8f0",
    axis: "#94a3b8",
    text: "#64748b",
    canvasBg: "#fafbfc",
    curve: "#2563eb",
    curve2: "#ea580c",
    deriv: "#7c3aed",
    deriv2: "#db2777",
    inc: "rgba(22, 163, 74, 0.28)",
    dec: "rgba(220, 38, 38, 0.25)",
    crit: "#d97706",
    handle: "#2563eb",
    handleActive: "#1d4ed8",
    probe: "#0891b2",
    tangent: "#0891b2",
  };

  const PAD = { left: 48, right: 16, top: 16, bottom: 52 };

  function createPlotContext(width, height, xMin, xMax, yMin, yMax) {
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const toX = (x) => PAD.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const toY = (y) => PAD.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    const fromX = (px) => xMin + ((px - PAD.left) / plotW) * (xMax - xMin);
    const fromY = (py) => yMax - ((py - PAD.top) / plotH) * (yMax - yMin);
    const inPlot = (px, py) =>
      px >= PAD.left && px <= PAD.left + plotW && py >= PAD.top && py <= PAD.top + plotH;
    return { pad: PAD, plotW, plotH, toX, toY, fromX, fromY, inPlot };
  }

  function niceStep(range) {
    const rough = range / 8;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    let step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 5) step = 5;
    else step = 10;
    return step * pow;
  }

  function draw(ctx, model) {
    const {
      width,
      height,
      xMin,
      xMax,
      yMin,
      yMax,
      f,
      deriv,
      f2,
      deriv2,
      intervals,
      intervals2,
      criticalPoints,
      showDerivative,
      showMonotone,
      showRate,
      rateData,
      rateData2,
      probeX,
      probeRate,
      handles,
      activeHandleId,
      compareEnabled,
    } = model;

    const plot = createPlotContext(width, height, xMin, xMax, yMin, yMax);
    const { toX, toY, pad, plotW, plotH } = plot;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.canvasBg;
    ctx.fillRect(0, 0, width, height);

    const xStep = niceStep(xMax - xMin);
    const yStep = niceStep(yMax - yMin);

  function drawMonotoneBands(intervalList, rateInfo, prefix) {
      if (!showMonotone || !intervalList) return;
      for (const iv of intervalList) {
        const x1 = Math.max(iv.from, xMin);
        const x2 = Math.min(iv.to, xMax);
        if (x2 <= x1) continue;
        if (iv.type === "const") continue;

        let alpha = 0.35;
        if (showRate && rateInfo) {
          const mid = (x1 + x2) / 2;
          const pt = rateInfo.points.find((p) => Math.abs(p.x - mid) < (xMax - xMin) / 40);
          if (pt) {
            const t = Math.min(1, Math.abs(pt.d) / rateInfo.maxAbs);
            alpha = 0.15 + t * 0.55;
          }
        }

        const base = iv.type === "inc" ? "52, 199, 89" : "255, 107, 107";
        ctx.fillStyle = `rgba(${base}, ${alpha})`;
        const px1 = toX(x1);
        const px2 = toX(x2);
        ctx.fillRect(px1, pad.top, px2 - px1, plotH);
      }
    }

    drawMonotoneBands(intervals, rateData, "f");
    if (compareEnabled) drawMonotoneBands(intervals2, rateData2, "g");

    // 网格
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const px = toX(x);
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      const py = toY(y);
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
    }
    ctx.stroke();

    // 坐标轴
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (xMin <= 0 && xMax >= 0) {
      const ox = toX(0);
      ctx.moveTo(ox, pad.top);
      ctx.lineTo(ox, pad.top + plotH);
    }
    if (yMin <= 0 && yMax >= 0) {
      const oy = toY(0);
      ctx.moveTo(pad.left, oy);
      ctx.lineTo(pad.left + plotW, oy);
    }
    ctx.stroke();

    // 刻度
    ctx.fillStyle = COLORS.text;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      if (Math.abs(x) < 1e-10) continue;
      ctx.fillText(formatTick(x), toX(x), pad.top + plotH + 18);
    }
    ctx.textAlign = "right";
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      if (Math.abs(y) < 1e-10) continue;
      ctx.fillText(formatTick(y), pad.left - 6, toY(y) + 4);
    }

    // 速率条 |f'(x)|
    if (showRate && rateData) {
      drawRateBar(ctx, rateData, toX, pad, plotW, plotH, xMin, xMax, COLORS.curve);
      if (compareEnabled && rateData2) {
        drawRateBar(ctx, rateData2, toX, pad, plotW, plotH, xMin, xMax, COLORS.curve2, 14);
      }
    }

    // 导数
    if (showDerivative && deriv) {
      drawCurve(ctx, (x) => deriv(x), xMin, xMax, toX, toY, COLORS.deriv, 1.5, true);
    }
    if (compareEnabled && showDerivative && deriv2) {
      drawCurve(ctx, (x) => deriv2(x), xMin, xMax, toX, toY, COLORS.deriv2, 1.5, true);
    }

    // 函数曲线
    if (compareEnabled && f2) {
      drawCurve(ctx, f2, xMin, xMax, toX, toY, COLORS.curve2, 2.5, false);
    }
    drawCurve(ctx, f, xMin, xMax, toX, toY, COLORS.curve, 2.5, false);

    // 极值点
    if (criticalPoints) {
      for (const pt of criticalPoints) {
        if (pt.x < xMin || pt.x > xMax) continue;
        let py;
        try {
          py = toY(pt.y);
        } catch {
          continue;
        }
        if (py < pad.top || py > pad.top + plotH) continue;
        const px = toX(pt.x);
        ctx.fillStyle = COLORS.crit;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 探针点与切线
    if (probeX != null && Number.isFinite(probeX) && probeX >= xMin && probeX <= xMax) {
      let fy, slope;
      try {
        fy = f(probeX);
        slope = deriv(probeX);
      } catch {
        fy = null;
      }
      if (Number.isFinite(fy)) {
        const px = toX(probeX);
        const py = toY(fy);
        if (Number.isFinite(slope)) {
          const span = (xMax - xMin) * 0.12;
          const xA = probeX - span;
          const xB = probeX + span;
          const yA = fy - slope * span;
          const yB = fy + slope * span;
          ctx.strokeStyle = COLORS.tangent;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(toX(xA), toY(yA));
          ctx.lineTo(toX(xB), toY(yB));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = COLORS.probe;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = COLORS.probe;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px, pad.top);
        ctx.lineTo(px, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 拖拽控制点
    if (handles && handles.length) {
      for (const h of handles) {
        if (h.x < xMin || h.x > xMax) continue;
        let hy;
        try {
          hy = h.y;
        } catch {
          continue;
        }
        if (!Number.isFinite(hy)) continue;
        const px = toX(h.x);
        const py = toY(hy);
        if (py < pad.top - 20 || py > pad.top + plotH + 20) continue;
        const active = h.id === activeHandleId;
        ctx.fillStyle = active ? COLORS.handleActive : COLORS.handle;
        ctx.beginPath();
        ctx.arc(px, py, active ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = active ? COLORS.handleActive : COLORS.handle;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = COLORS.text;
        ctx.font = "10px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(h.label, px, py - 12);
      }
    }

    return plot;
  }

  function drawRateBar(ctx, rateData, toX, pad, plotW, plotH, xMin, xMax, color, offsetY = 4) {
    const barH = 8;
    const y0 = pad.top + plotH + offsetY;
    const { points, maxAbs } = rateData;
    if (!points.length) return;

    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const p2 = points[i + 1];
      const t = Math.abs(p.d) / maxAbs;
      const alpha = 0.25 + t * 0.75;
      ctx.fillStyle = p.d >= 0 ? `rgba(52, 199, 89, ${alpha})` : `rgba(255, 107, 107, ${alpha})`;
      const x1 = toX(p.x);
      const x2 = toX(p2.x);
      ctx.fillRect(x1, y0, Math.max(1, x2 - x1), barH);
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "9px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("|f′| 快慢", pad.left, y0 + barH + 10);
  }

  function drawCurve(ctx, fn, xMin, xMax, toX, toY, color, lineWidth, dashed) {
    const samples = 1200;
    const dx = (xMax - xMin) / samples;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (dashed) ctx.setLineDash([6, 4]);
    else ctx.setLineDash([]);

    let started = false;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const x = xMin + i * dx;
      let y;
      try {
        y = fn(x);
      } catch {
        started = false;
        continue;
      }
      if (!Number.isFinite(y)) {
        started = false;
        continue;
      }
      const px = toX(x);
      const py = toY(y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function formatTick(v) {
    if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
    const r = Math.round(v * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r);
  }

  function nearestOnCurve(f, plot, px, py, xMin, xMax) {
    const x = plot.fromX(px);
    let best = { dist: Infinity, x, y: 0 };
    const span = (xMax - xMin) / 200;
    for (let i = -20; i <= 20; i++) {
      const xi = x + i * span;
      if (xi < xMin || xi > xMax) continue;
      let yi;
      try {
        yi = f(xi);
      } catch {
        continue;
      }
      if (!Number.isFinite(yi)) continue;
      const dx = plot.toX(xi) - px;
      const dy = plot.toY(yi) - py;
      const dist = dx * dx + dy * dy;
      if (dist < best.dist) best = { dist, x: xi, y: yi };
    }
    return best;
  }

  function hitHandle(handles, plot, px, py, xMin, xMax) {
    const threshold = 12;
    for (const h of handles) {
      if (h.x < xMin || h.x > xMax) continue;
      const hx = plot.toX(h.x);
      const hy = plot.toY(h.y);
      const d = Math.hypot(hx - px, hy - py);
      if (d <= threshold) return h;
    }
    return null;
  }

  return { draw, createPlotContext, nearestOnCurve, hitHandle, PAD };
})();
