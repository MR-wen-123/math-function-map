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
    if (!Number.isFinite(range) || range <= 0) return 1;
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

  function withPlotClip(ctx, pad, plotW, plotH, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();
    fn();
    ctx.restore();
  }

  function strokePlotFrame(ctx, pad, plotW, plotH) {
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left + 0.5, pad.top + 0.5, plotW - 1, plotH - 1);
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
      criticalPoints2,
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
      fmtCoord,
      showCoords,
      showCriticalPoints = true,
      highFrequency = false,
      showProbe = true,
      showHandles = true,
    } = model;

    const plot = createPlotContext(width, height, xMin, xMax, yMin, yMax);
    const { toX, toY, pad, plotW, plotH } = plot;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.canvasBg;
    ctx.fillRect(0, 0, width, height);

    const xSpan = xMax - xMin;
    const ySpan = yMax - yMin;
    const xStep = niceStep(xSpan);
    const yStep = niceStep(ySpan);

  function drawMonotoneBands(intervalList, rateInfo, prefix) {
      if (!showMonotone || !intervalList || highFrequency) return;
      for (const iv of intervalList) {
        const x1 = Math.max(iv.from, xMin);
        const x2 = Math.min(iv.to, xMax);
        if (x2 <= x1) continue;
        if (iv.type === "const" || iv.type === "osc") continue;

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
    const EPS0 = 1e-10;
    ctx.fillStyle = COLORS.text;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      if (Math.abs(x) < EPS0) continue;
      ctx.fillText(formatTick(x, xStep), toX(x), pad.top + plotH + 18);
    }
    ctx.textAlign = "right";
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      if (Math.abs(y) < EPS0) continue;
      ctx.fillText(formatTick(y, yStep), pad.left - 6, toY(y) + 4);
    }
    if (xMin <= 0 && xMax >= 0) {
      ctx.textAlign = "center";
      ctx.fillText("0", toX(0), pad.top + plotH + 18);
    }
    if (yMin <= 0 && yMax >= 0) {
      ctx.textAlign = "right";
      const oy = toY(0);
      const labelY = xMin <= 0 && xMax >= 0 ? oy - 3 : oy + 4;
      ctx.fillText("0", pad.left - 6, labelY);
    }

    strokePlotFrame(ctx, pad, plotW, plotH);

    withPlotClip(ctx, pad, plotW, plotH, () => {
      drawMonotoneBands(intervals, rateData, "f");
      if (compareEnabled) drawMonotoneBands(intervals2, rateData2, "g");

      if (showDerivative && deriv) {
        drawCurve(ctx, (x) => deriv(x), xMin, xMax, toX, toY, pad, plotW, plotH, COLORS.deriv, 1.5, true);
      }
      if (compareEnabled && showDerivative && deriv2) {
        drawCurve(ctx, (x) => deriv2(x), xMin, xMax, toX, toY, pad, plotW, plotH, COLORS.deriv2, 1.5, true);
      }

      if (compareEnabled && f2) {
        drawCurve(ctx, f2, xMin, xMax, toX, toY, pad, plotW, plotH, COLORS.curve2, 2.5, false);
      }
      drawCurve(ctx, f, xMin, xMax, toX, toY, pad, plotW, plotH, COLORS.curve, 2.5, false);

      if (showCriticalPoints) {
        drawCriticalMarkers(
          ctx,
          criticalPoints,
          toX,
          toY,
          pad,
          plotW,
          plotH,
          COLORS.crit,
          xMin,
          xMax,
          fmtCoord,
          false,
          false
        );
        if (compareEnabled) {
          drawCriticalMarkers(
            ctx,
            criticalPoints2,
            toX,
            toY,
            pad,
            plotW,
            plotH,
            COLORS.curve2,
            xMin,
            xMax,
            fmtCoord,
            false,
            false
          );
        }
      }

      if (showProbe && probeX != null && Number.isFinite(probeX) && probeX >= xMin && probeX <= xMax) {
        const pxLine = toX(probeX);
        ctx.strokeStyle = COLORS.probe;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pxLine, pad.top);
        ctx.lineTo(pxLine, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        let fy, slope;
        try {
          fy = f(probeX);
          slope = deriv ? deriv(probeX) : NaN;
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
          drawMarker(ctx, px, py, COLORS.probe, 6);
        }

        if (compareEnabled && f2) {
          let gy;
          try {
            gy = f2(probeX);
          } catch {
            gy = null;
          }
          if (Number.isFinite(gy)) {
            drawMarker(ctx, toX(probeX), toY(gy), COLORS.curve2, 6);
          }
        }
      }

      if (showHandles && handles && handles.length) {
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
        }
      }
    });

    if (showCoords) {
      if (showCriticalPoints) {
        drawCriticalMarkers(
          ctx,
          criticalPoints,
          toX,
          toY,
          pad,
          plotW,
          plotH,
          COLORS.crit,
          xMin,
          xMax,
          fmtCoord,
          true,
          true
        );
        if (compareEnabled) {
          drawCriticalMarkers(
            ctx,
            criticalPoints2,
            toX,
            toY,
            pad,
            plotW,
            plotH,
            COLORS.curve2,
            xMin,
            xMax,
            fmtCoord,
            true,
            true
          );
        }
      }

      if (showProbe && probeX != null && Number.isFinite(probeX) && probeX >= xMin && probeX <= xMax) {
        let fy;
        try {
          fy = f(probeX);
        } catch {
          fy = null;
        }
        if (Number.isFinite(fy)) {
          drawCoordLabel(
            ctx,
            toX(probeX),
            toY(fy),
            `f ${coordPair(probeX, fy, fmtCoord)}`,
            COLORS.probe,
            pad,
            plotW,
            plotH,
            true
          );
        }
        if (compareEnabled && f2) {
          let gy;
          try {
            gy = f2(probeX);
          } catch {
            gy = null;
          }
          if (Number.isFinite(gy)) {
            drawCoordLabel(
              ctx,
              toX(probeX),
              toY(gy),
              `g ${coordPair(probeX, gy, fmtCoord)}`,
              COLORS.curve2,
              pad,
              plotW,
              plotH,
              false
            );
          }
        }
      }

      if (showHandles && handles && handles.length) {
        for (const h of handles) {
          if (h.x < xMin || h.x > xMax) continue;
          if (!Number.isFinite(h.y)) continue;
          const px = toX(h.x);
          const py = toY(h.y);
          drawCoordLabel(ctx, px, py, coordPair(h.x, h.y, fmtCoord), COLORS.handle, pad, plotW, plotH, false);
        }
      }
    }

    if (showHandles && handles && handles.length) {
      for (const h of handles) {
        if (h.x < xMin || h.x > xMax) continue;
        if (!Number.isFinite(h.y)) continue;
        const px = toX(h.x);
        const py = toY(h.y);
        if (py < pad.top || py > pad.top + plotH) continue;
        ctx.fillStyle = COLORS.text;
        ctx.font = "10px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(h.label, px, py - 12);
      }
    }

    if (showRate && rateData) {
      drawRateBar(ctx, rateData, toX, pad, plotW, plotH, xMin, xMax, COLORS.curve);
      if (compareEnabled && rateData2) {
        drawRateBar(ctx, rateData2, toX, pad, plotW, plotH, xMin, xMax, COLORS.curve2, 14);
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

  function curveSampleCount(plotW, xMin, xMax, fn) {
    let base = Math.max(800, Math.min(12000, Math.ceil(plotW * 2.5)));
    const xSpan = xMax - xMin;
    if (fn && xSpan > 0) {
      const probe = Math.min(400, Math.max(80, Math.ceil(plotW)));
      let turns = 0;
      let prev = null;
      let prev2 = null;
      for (let i = 0; i <= probe; i++) {
        const x = xMin + (i / probe) * xSpan;
        let y;
        try {
          y = fn(x);
        } catch {
          prev = null;
          prev2 = null;
          continue;
        }
        if (!Number.isFinite(y)) {
          prev = null;
          prev2 = null;
          continue;
        }
        if (prev !== null && prev2 !== null && (y - prev) * (prev - prev2) < 0) turns++;
        prev2 = prev;
        prev = y;
      }
      if (turns > 12) base = Math.min(24000, Math.max(base, Math.ceil(plotW * 6)));
    }
    return base;
  }

  function drawCurve(ctx, fn, xMin, xMax, toX, toY, pad, plotW, plotH, color, lineWidth, dashed) {
    const xSpan = xMax - xMin;
    const samples = curveSampleCount(plotW, xMin, xMax, fn);
    const dx = xSpan / samples;
    const yMarginPx = Math.max(32, plotH * 0.2);
    const yTop = pad.top - yMarginPx;
    const yBottom = pad.top + plotH + yMarginPx;
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
      if (py < yTop || py > yBottom) {
        started = false;
        continue;
      }
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

  function formatTick(v, step) {
    if (!Number.isFinite(v)) return "—";
    if (v === 0) return "0";
    const abs = Math.abs(v);
    if (abs >= 1e8 || (abs > 0 && abs < 1e-5)) return v.toPrecision(4);
    if (step && step > 0 && Number.isFinite(step)) {
      const decimals = Math.max(0, Math.min(12, -Math.floor(Math.log10(step)) + 1));
      const f = 10 ** decimals;
      const r = Math.round(v * f) / f;
      return Number.isInteger(r) ? String(r) : String(r);
    }
    if (abs >= 1000) return v.toExponential(2);
    const r = Math.round(v * 1000) / 1000;
    return Number.isInteger(r) ? String(r) : String(r);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function coordPair(x, y, fmtCoord) {
    const fx = fmtCoord ? fmtCoord(x) : formatTick(x);
    const fy = fmtCoord ? fmtCoord(y) : formatTick(y);
    return `(${fx}, ${fy})`;
  }

  function drawCoordLabel(ctx, cx, cy, text, color, pad, plotW, plotH, preferAbove = true) {
    ctx.font = "11px Segoe UI, sans-serif";
    const w = ctx.measureText(text).width + 10;
    const h = 18;
    let lx = cx + 10;
    let ly = preferAbove ? cy - h - 10 : cy + 14;
    lx = clamp(lx, pad.left + 2, pad.left + plotW - w - 2);
    ly = clamp(ly, pad.top + 2, pad.top + plotH - h - 2);

    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(lx + r, ly);
    ctx.lineTo(lx + w - r, ly);
    ctx.quadraticCurveTo(lx + w, ly, lx + w, ly + r);
    ctx.lineTo(lx + w, ly + h - r);
    ctx.quadraticCurveTo(lx + w, ly + h, lx + w - r, ly + h);
    ctx.lineTo(lx + r, ly + h);
    ctx.quadraticCurveTo(lx, ly + h, lx, ly + h - r);
    ctx.lineTo(lx, ly + r);
    ctx.quadraticCurveTo(lx, ly, lx + r, ly);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx + 5, ly + h / 2);
  }

  function drawMarker(ctx, cx, cy, color, radius = 5) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function thinCriticalPoints(points, toX, xMin, xMax, minGapPx = 52, maxCount = 22) {
    if (!points?.length) return [];
    const vis = points
      .filter((p) => p.x >= xMin && p.x <= xMax && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    if (vis.length <= maxCount) {
      const sparse = [];
      let lastPx = -Infinity;
      for (const pt of vis) {
        const px = toX(pt.x);
        if (px - lastPx >= minGapPx || sparse.length === 0) {
          sparse.push(pt);
          lastPx = px;
        }
      }
      return sparse;
    }
    const out = [];
    const step = vis.length / maxCount;
    let lastPx = -Infinity;
    for (let i = 0; i < maxCount; i++) {
      const pt = vis[Math.min(vis.length - 1, Math.round(i * step + step / 2 - 0.5))];
      const px = toX(pt.x);
      if (px - lastPx >= minGapPx * 0.6 || out.length === 0) {
        out.push(pt);
        lastPx = px;
      }
    }
    return out;
  }

  function drawCriticalMarkers(
    ctx,
    points,
    toX,
    toY,
    pad,
    plotW,
    plotH,
    color,
    xMin,
    xMax,
    fmtCoord,
    showCoords,
    labelsOnly = false
  ) {
    if (!points?.length) return;
    const drawn = thinCriticalPoints(points, toX, xMin, xMax, showCoords ? 56 : 36, showCoords ? 18 : 28);
    drawn.forEach((pt, i) => {
      if (!Number.isFinite(pt.y)) return;
      const px = toX(pt.x);
      const py = toY(pt.y);
      if (!labelsOnly) {
        if (py < pad.top || py > pad.top + plotH) return;
        drawMarker(ctx, px, py, color, 5);
      }
      if (showCoords && labelsOnly) {
        const label = `${pt.kind} ${coordPair(pt.x, pt.y, fmtCoord)}`;
        drawCoordLabel(ctx, px, py, label, color, pad, plotW, plotH, i % 2 === 0);
      }
    });
  }

  function nearestOnCurve(f, plot, px, py, xMin, xMax) {
    const x = plot.fromX(px);
    let best = { dist: Infinity, x, y: 0 };
    const steps = Math.max(200, Math.ceil(plot.plotW * 1.5));
    const span = (xMax - xMin) / steps;
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
