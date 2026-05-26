/**
 * 数学引擎：函数求值、导数、单调性分析
 */
const MathEngine = (() => {
  const EPS = 1e-9;

  const COEFF_DEFS = {
    linear: [
      { key: "a", label: "a", default: 1, step: 0.1 },
      { key: "b", label: "b", default: 0, step: 0.1 },
    ],
    quadratic: [
      { key: "a", label: "a", default: 1, step: 0.1 },
      { key: "b", label: "b", default: -2, step: 0.1 },
      { key: "c", label: "c", default: -3, step: 0.1 },
    ],
    cubic: [
      { key: "a", label: "a", default: 1, step: 0.1 },
      { key: "b", label: "b", default: 0, step: 0.1 },
      { key: "c", label: "c", default: -3, step: 0.1 },
      { key: "d", label: "d", default: 0, step: 0.1 },
    ],
    exponential: [
      { key: "a", label: "a", default: 1, step: 0.1 },
      { key: "b", label: "b", default: 1, step: 0.1 },
      { key: "c", label: "c", default: 0, step: 0.1 },
    ],
    logarithmic: [
      { key: "a", label: "a", default: 1, step: 0.1 },
      { key: "b", label: "b", default: 0, step: 0.1 },
    ],
    power: [
      { key: "a", label: "a", default: 1, step: 0.1 },
      { key: "n", label: "n", default: 2, step: 0.1 },
    ],
  };

  function fmtNum(n) {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) < EPS) return "0";
    const rounded = Math.round(n * 1000) / 1000;
    if (Number.isInteger(rounded)) return String(rounded);
    return String(rounded);
  }

  function unboundedDomain() {
    return { min: -Infinity, max: Infinity, openMin: false, openMax: false };
  }

  function normalizeDomainToken(raw) {
    return String(raw ?? "")
      .trim()
      .replace(/−/g, "-")
      .replace(/\s/g, "")
      .toLowerCase();
  }

  /** 解析定义域端点：数值或 ±∞ */
  function parseDomainBound(raw) {
    const s = normalizeDomainToken(raw);
    if (!s) return { ok: true, value: null, partial: true };
    const negInf = new Set([
      "-inf",
      "-infinity",
      "-infty",
      "-∞",
      "∞-",
      "负无穷",
      "负无穷大",
      "无穷小",
      "-无穷",
      "-无穷大",
    ]);
    const posInf = new Set([
      "+inf",
      "inf",
      "+infinity",
      "infinity",
      "infty",
      "+∞",
      "∞",
      "无穷",
      "正无穷",
      "无穷大",
      "+无穷",
    ]);
    if (negInf.has(s)) return { ok: true, value: -Infinity };
    if (posInf.has(s)) return { ok: true, value: Infinity };
    if (/^[+-]?$/.test(s) || /^[+-]?∞?$/.test(s) || /^[+-]?inf(inity|y)?$/.test(s)) {
      return { ok: false, value: NaN, partial: true };
    }
    const num = parseNumberInput(raw);
    if (num.partial) return { ok: false, value: NaN, partial: true };
    if (num.ok) return { ok: true, value: num.value };
    return { ok: false, value: NaN, error: "端点格式无效，可用数字或 −∞ / +∞" };
  }

  function isPartialDomainInput(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return true;
    const p = parseDomainBound(raw);
    if (p.ok && !p.partial) return false;
    if (p.partial) return true;
    return isPartialNumberInput(raw);
  }

  function unboundedSegment() {
    return { min: -Infinity, max: Infinity, openMin: false, openMax: false };
  }

  function domainToSegments(domain) {
    if (domain?.segments?.length) return domain.segments;
    return [
      {
        min: domain.min,
        max: domain.max,
        openMin: !!domain.openMin,
        openMax: !!domain.openMax,
      },
    ];
  }

  function domainFromSegments(segments) {
    const clean = segments.filter((s) => s.max > s.min + EPS || Number.isFinite(s.min) || Number.isFinite(s.max));
    if (!clean.length) return { min: 0, max: 0, empty: true, segments: [] };
    return { segments: clean };
  }

  function pointInSegment(x, seg) {
    if (!Number.isFinite(x)) return false;
    if (seg.openMin ? x <= seg.min + EPS : x < seg.min - EPS) return false;
    if (seg.openMax ? x >= seg.max - EPS : x > seg.max + EPS) return false;
    return true;
  }

  function isInDomain(x, domain) {
    if (!Number.isFinite(x)) return false;
    if (domain.segments?.length) {
      return domain.segments.some((seg) => pointInSegment(x, seg));
    }
    if (domain.holes?.length) {
      for (const h of domain.holes) {
        if (Math.abs(x - h) < 1e-10) return false;
      }
    }
    if (x < domain.min - EPS || x > domain.max + EPS) return false;
    if (domain.openMin && x <= domain.min + EPS) return false;
    if (domain.openMax && x >= domain.max - EPS) return false;
    return true;
  }

  function intersectTwoSegments(a, b) {
    const min = Math.max(a.min, b.min);
    const max = Math.min(a.max, b.max);
    if (max < min - EPS) return null;
    const openMin =
      (Math.abs(min - a.min) < EPS && a.openMin) || (Math.abs(min - b.min) < EPS && b.openMin);
    const openMax =
      (Math.abs(max - a.max) < EPS && a.openMax) || (Math.abs(max - b.max) < EPS && b.openMax);
    if (max - min < EPS && (openMin || openMax)) return null;
    return { min, max, openMin, openMax };
  }

  function intersectSegmentLists(listA, listB) {
    const out = [];
    for (const a of listA) {
      for (const b of listB) {
        const seg = intersectTwoSegments(a, b);
        if (seg) out.push(seg);
      }
    }
    return out.sort((p, q) => p.min - q.min);
  }

  function excludePointsFromSegments(segments, points) {
    let segs = segments;
    for (const p of points) {
      if (!Number.isFinite(p)) continue;
      const next = [];
      for (const s of segs) {
        if (p <= s.min + EPS || p >= s.max - EPS) {
          next.push(s);
          continue;
        }
        next.push({ min: s.min, max: p, openMin: s.openMin, openMax: true });
        next.push({ min: p, max: s.max, openMin: true, openMax: s.openMax });
      }
      segs = next;
    }
    return segs.filter((s) => s.max > s.min + EPS || (!s.openMin && !s.openMax && Math.abs(s.max - s.min) < EPS));
  }

  function intersectDomains(a, b) {
    const segs = intersectSegmentLists(domainToSegments(a), domainToSegments(b));
    if (!segs.length) return { min: 0, max: 0, empty: true, segments: [] };
    if (segs.length === 1 && !Number.isFinite(segs[0].min) && !Number.isFinite(segs[0].max)) {
      return { min: segs[0].min, max: segs[0].max, openMin: segs[0].openMin, openMax: segs[0].openMax };
    }
    return domainFromSegments(segs);
  }

  function resolveEffectiveDomain(spec, userDomain) {
    const natural = spec.domain ? spec.domain() : unboundedDomain();
    if (!userDomain?.limit) return natural;
    return intersectDomains(natural, userDomain.bounds);
  }

  function analysisRange(viewMin, viewMax, domain) {
    if (domain.segments?.length) {
      let min = Infinity;
      let max = -Infinity;
      let valid = false;
      for (const s of domain.segments) {
        const a = Math.max(viewMin, s.min);
        const b = Math.min(viewMax, s.max);
        if (b <= a + EPS) continue;
        valid = true;
        min = Math.min(min, a);
        max = Math.max(max, b);
      }
      return { min, max, valid };
    }
    const min = Math.max(viewMin, domain.min);
    const max = Math.min(viewMax, domain.max);
    return { min, max, valid: max > min + EPS };
  }

  function restrictToDomain(fn, domain) {
    return (x) => {
      if (!isInDomain(x, domain)) throw new Error("定义域外");
      return fn(x);
    };
  }

  function formatSegment(seg) {
    const leftSym = !Number.isFinite(seg.min) ? "−∞" : fmtNum(seg.min);
    const rightSym = !Number.isFinite(seg.max) ? "+∞" : fmtNum(seg.max);
    const leftBracket = !Number.isFinite(seg.min) ? "(" : seg.openMin ? "(" : "[";
    const rightBracket = !Number.isFinite(seg.max) ? ")" : seg.openMax ? ")" : "]";
    return `${leftBracket}${leftSym}, ${rightSym}${rightBracket}`;
  }

  function formatDomain(domain) {
    if (domain.segments?.length) {
      return domain.segments.map(formatSegment).join(" ∪ ");
    }
    return formatSegment(domain);
  }

  function formatDomainLabel(domain) {
    if (domain.segments?.length) {
      return `定义域 D = ${formatDomain(domain)}`;
    }
    if (domain.holes?.length) {
      const sorted = [...domain.holes].filter(Number.isFinite).sort((a, b) => a - b);
      if (sorted.length) {
        const parts = [];
        let leftSym = "−∞";
        for (const h of sorted) {
          parts.push(`(${leftSym}, ${fmtNum(h)})`);
          leftSym = fmtNum(h);
        }
        parts.push(`(${leftSym}, +∞)`);
        return `定义域 D = ${parts.join(" ∪ ")}`;
      }
    }
    return `定义域 D = ${formatDomain(domain)}`;
  }

  /** 从分式结构推断有理函数奇点（一次因式） */
  function linearFactorZeros(node, v = "x") {
    if (!node) return [];
    if (node.type === "var" && node.name === v) return [0];
    if (
      node.type === "sub" &&
      node.left?.type === "var" &&
      node.left.name === v &&
      node.right?.type === "num"
    ) {
      return [node.right.value];
    }
    if (
      node.type === "sub" &&
      node.right?.type === "var" &&
      node.right.name === v &&
      node.left?.type === "num"
    ) {
      return [node.left.value];
    }
    if (node.type === "mul") {
      return [...linearFactorZeros(node.left, v), ...linearFactorZeros(node.right, v)];
    }
    return [];
  }

  function collectRationalPoles(node, out, v = "x") {
    if (!node) return;
    if (node.type === "div") {
      linearFactorZeros(node.right, v).forEach((z) => out.push(z));
      collectRationalPoles(node.left, out, v);
      collectRationalPoles(node.right, out, v);
    } else {
      if (node.left) collectRationalPoles(node.left, out, v);
      if (node.right) collectRationalPoles(node.right, out, v);
      if (node.child) collectRationalPoles(node.child, out, v);
      if (node.arg) collectRationalPoles(node.arg, out, v);
    }
  }

  /** 二次式 ax²+bx+c ≥ 0 或 > 0 的 x 区间 */
  function quadraticInequalitySegments(a, b, c, strict) {
    if (Math.abs(a) < EPS) {
      if (Math.abs(b) < EPS) {
        return c > (strict ? 0 : -EPS) ? [unboundedSegment()] : [];
      }
      const root = -c / b;
      if (b > 0) {
        return strict
          ? [{ min: root, max: Infinity, openMin: true, openMax: false }]
          : [{ min: root, max: Infinity, openMin: false, openMax: false }];
      }
      return strict
        ? [{ min: -Infinity, max: root, openMin: false, openMax: true }]
        : [{ min: -Infinity, max: root, openMin: false, openMax: false }];
    }
    const disc = b * b - 4 * a * c;
    if (disc < -EPS) return a > 0 ? [] : [unboundedSegment()];
    const roots = solveQuadratic(a, b, c);
    if (!roots.length) return [];
    if (roots.length === 1) {
      const r = roots[0];
      if (a > 0) {
        return strict
          ? [
              { min: -Infinity, max: r, openMin: false, openMax: true },
              { min: r, max: Infinity, openMin: true, openMax: false },
            ]
          : [
              { min: -Infinity, max: r, openMin: false, openMax: false },
              { min: r, max: Infinity, openMin: false, openMax: false },
            ];
      }
      return strict
        ? []
        : [{ min: r, max: r, openMin: false, openMax: false }];
    }
    const [r1, r2] = roots;
    if (a > 0) {
      return [
        { min: -Infinity, max: r1, openMin: false, openMax: strict },
        { min: r2, max: Infinity, openMin: strict, openMax: false },
      ];
    }
    return [{ min: r1, max: r2, openMin: strict, openMax: strict }];
  }

  function radicandDomain(node, strictPositive) {
    if (node.type === "var" && node.name === "x") {
      return strictPositive
        ? [{ min: 0, max: Infinity, openMin: true, openMax: false }]
        : [{ min: 0, max: Infinity, openMin: false, openMax: false }];
    }
    if (
      node.type === "sub" &&
      node.left?.type === "var" &&
      node.left.name === "x" &&
      node.right?.type === "num"
    ) {
      const r = node.right.value;
      return strictPositive
        ? [{ min: r, max: Infinity, openMin: true, openMax: false }]
        : [{ min: r, max: Infinity, openMin: false, openMax: false }];
    }
    const coeffs = collectQuadraticCoeffs(node);
    if (coeffs && Math.abs(coeffs.a) >= EPS) {
      return quadraticInequalitySegments(coeffs.a, coeffs.b, coeffs.c, strictPositive);
    }
    const zeros = [...new Set(linearFactorZeros(node))].filter(Number.isFinite).sort((p, q) => p - q);
    if (zeros.length >= 2) {
      const [r1, r2] = zeros;
      if (strictPositive) {
        return [{ min: r2, max: Infinity, openMin: true, openMax: false }];
      }
      return [{ min: r1, max: r2, openMin: false, openMax: false }];
    }
    if (zeros.length === 1) {
      const r = zeros[0];
      return strictPositive
        ? [{ min: r, max: Infinity, openMin: true, openMax: false }]
        : [
            { min: -Infinity, max: r, openMin: false, openMax: false },
            { min: r, max: Infinity, openMin: false, openMax: false },
          ];
    }
    return [unboundedSegment()];
  }

  function inferDomainSegmentsFromAst(node) {
    if (!node) return [unboundedSegment()];
    switch (node.type) {
      case "num":
      case "var":
        return [unboundedSegment()];
      case "call": {
        if (node.name === "sqrt") {
          return intersectSegmentLists(radicandDomain(node.arg, false), inferDomainSegmentsFromAst(node.arg));
        }
        if (node.name === "ln" || node.name === "log") {
          return intersectSegmentLists(radicandDomain(node.arg, true), inferDomainSegmentsFromAst(node.arg));
        }
        return inferDomainSegmentsFromAst(node.arg);
      }
      case "div": {
        let segs = intersectSegmentLists(
          inferDomainSegmentsFromAst(node.left),
          inferDomainSegmentsFromAst(node.right)
        );
        const poles = [...new Set(linearFactorZeros(node.right))].filter(Number.isFinite);
        if (poles.length) segs = excludePointsFromSegments(segs, poles);
        return segs.length ? segs : [unboundedSegment()];
      }
      case "add":
      case "sub":
      case "mul":
        return intersectSegmentLists(inferDomainSegmentsFromAst(node.left), inferDomainSegmentsFromAst(node.right));
      case "neg":
        return inferDomainSegmentsFromAst(node.child);
      case "pow":
        if (node.right?.type === "num" && node.right.value < 0) {
          const base = inferDomainSegmentsFromAst(node.left);
          const zeros = [...new Set(linearFactorZeros(node.left))].filter(Number.isFinite);
          return zeros.length ? excludePointsFromSegments(base, zeros) : base;
        }
        return intersectSegmentLists(inferDomainSegmentsFromAst(node.left), inferDomainSegmentsFromAst(node.right));
      default:
        return [unboundedSegment()];
    }
  }

  function customExprDomain(expr) {
    try {
      const ast = simplifyAst(parseExpression(expr));
      const segments = inferDomainSegmentsFromAst(ast);
      if (segments.length && !(segments.length === 1 && !Number.isFinite(segments[0].min) && !Number.isFinite(segments[0].max))) {
        const hasRestriction = segments.some(
          (s) => Number.isFinite(s.min) || Number.isFinite(s.max) || s.openMin || s.openMax
        );
        if (hasRestriction) return domainFromSegments(segments);
      }
      const poles = [];
      collectRationalPoles(ast, poles);
      const holes = [...new Set(poles.filter(Number.isFinite))];
      if (!holes.length) return unboundedDomain();
      return { min: -Infinity, max: Infinity, holes };
    } catch {
      return unboundedDomain();
    }
  }

  /** 定义域边界：分式奇点、√ 内式零点（用于分段单调性分析） */
  function collectDomainBreakpoints(node, out = [], v = "x") {
    if (!node) return out;
    if (node.type === "div") {
      linearFactorZeros(node.right, v).forEach((z) => out.push(z));
      collectDomainBreakpoints(node.left, out, v);
      collectDomainBreakpoints(node.right, out, v);
    } else if (node.type === "call" && node.name === "sqrt") {
      const coeffs = collectQuadraticCoeffs(node.arg);
      if (coeffs && Math.abs(coeffs.a) >= EPS) {
        solveQuadratic(coeffs.a, coeffs.b, coeffs.c).forEach((z) => out.push(z));
      } else {
        linearFactorZeros(node.arg, v).forEach((z) => out.push(z));
      }
      collectDomainBreakpoints(node.arg, out, v);
    } else {
      if (node.left) collectDomainBreakpoints(node.left, out, v);
      if (node.right) collectDomainBreakpoints(node.right, out, v);
      if (node.arg) collectDomainBreakpoints(node.arg, out, v);
      if (node.child) collectDomainBreakpoints(node.child, out, v);
    }
    return out;
  }

  function isFiniteAt(f, x) {
    try {
      return Number.isFinite(f(x));
    } catch {
      return false;
    }
  }

  /** 在 [xMin,xMax] 内按定义域切分为若干连续区间 */
  function splitDefinedIntervals(expr, xMin, xMax, f) {
    const PAD = 1e-4;
    let breaks = [xMin, xMax];
    try {
      const ast = simplifyAst(parseExpression(expr));
      collectDomainBreakpoints(ast)
        .filter((x) => Number.isFinite(x) && x > xMin + PAD && x < xMax - PAD)
        .forEach((x) => breaks.push(x));
    } catch {
      /* ignore */
    }
    breaks = [...new Set(breaks)].sort((a, b) => a - b);
    const pieces = [];
    for (let i = 0; i < breaks.length - 1; i++) {
      let a = breaks[i];
      let b = breaks[i + 1];
      if (i > 0) a += PAD;
      if (i < breaks.length - 2) b -= PAD;
      if (b - a < PAD * 4) continue;
      if (!isFiniteAt(f, (a + b) / 2)) continue;
      pieces.push([a, b]);
    }
    return pieces.length ? pieces : [[xMin, xMax]];
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a || 1;
  }

  /** 关键点等：仅展示分母不超过此值的分数 */
  const CRITICAL_FRAC_MAX_DEN = 20;

  /** 将数值格式化为最简分数（分母 ≤ maxDen），无法表示则返回 null */
  function toSimpleFraction(n, maxDen = 64) {
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) < EPS) return "0";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (Math.abs(abs - Math.round(abs)) < EPS) return sign + String(Math.round(abs));
    for (let den = 2; den <= maxDen; den++) {
      const num = abs * den;
      if (Math.abs(num - Math.round(num)) < 1e-9) {
        let r = Math.round(num);
        const g = gcd(r, den);
        r /= g;
        const d = den / g;
        if (d === 1) return sign + String(r);
        return `${sign}${r}/${d}`;
      }
    }
    return null;
  }

  /** 分数是否与 fmtNum 的三位小数一致，且分子、分母均 ≤ 20 */
  function isCriticalFractionNice(fracStr, n) {
    if (!fracStr.includes("/")) return true;
    const m = String(fracStr).match(/^(-?)(\d+)\/(\d+)$/);
    if (!m) return false;
    const num = parseInt(m[2], 10);
    const den = parseInt(m[3], 10);
    if (num > CRITICAL_FRAC_MAX_DEN || den > CRITICAL_FRAC_MAX_DEN) return false;
    const val = (m[1] === "-" ? -1 : 1) * (num / den);
    const roundedN = Math.round(n * 1000) / 1000;
    const roundedV = Math.round(val * 1000) / 1000;
    return Math.abs(roundedN - roundedV) < 1e-9;
  }

  /** 近似最简分数（分母 ≤ maxDen，且与三位小数显示一致） */
  function toFractionApprox(n, maxDen = CRITICAL_FRAC_MAX_DEN) {
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) < EPS) return "0";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    let bestNum = 0;
    let bestDen = 1;
    let bestErr = Infinity;
    for (let den = 1; den <= maxDen; den++) {
      const num = Math.round(abs * den);
      if (num === 0) continue;
      const err = Math.abs(abs - num / den);
      if (err < bestErr) {
        bestErr = err;
        bestNum = num;
        bestDen = den;
      }
    }
    const tol = 5e-4;
    if (bestErr > tol) return null;
    let r = bestNum;
    let d = bestDen;
    const g = gcd(r, d);
    r /= g;
    d /= g;
    if (d > maxDen) return null;
    const plain = d === 1 ? sign + String(r) : `${sign}${r}/${d}`;
    return isCriticalFractionNice(plain, n) ? plain : null;
  }

  /** 关键点等：优先精确分数，其次合理近似分数，最后小数 */
  function fmtNumForCritical(n) {
    if (!Number.isFinite(n)) return "—";
    const exact = toSimpleFraction(n, CRITICAL_FRAC_MAX_DEN);
    if (exact && isCriticalFractionNice(exact, n)) return exact;
    const approx = toFractionApprox(n);
    if (approx) return approx;
    return fmtNum(n);
  }

  function fracDisplayToLatex(fracStr) {
    const m = String(fracStr).match(/^(-?)(\d+)\/(\d+)$/);
    if (m) return `${m[1] === "-" ? "-" : ""}\\frac{${m[2]}}{${m[3]}}`;
    return String(fracStr).replace(/−/g, "-");
  }

  function fmtNumLatexForCritical(n) {
    if (!Number.isFinite(n)) return "\\ldots";
    const plain = fmtNumForCritical(n);
    if (plain.includes("/")) return fracDisplayToLatex(plain);
    return plain;
  }

  function formatCriticalPointPlain(pt) {
    return `${pt.kind}：(${fmtNumForCritical(pt.x)}, ${fmtNumForCritical(pt.y)})`;
  }

  function formatCriticalPointLatex(pt) {
    return `\\text{${pt.kind}}\\colon\\left(${fmtNumLatexForCritical(pt.x)},\\,${fmtNumLatexForCritical(pt.y)}\\right)`;
  }

  function formatCriticalPointsLatex(points) {
    return points.map(formatCriticalPointLatex).join("\\\\[6pt]");
  }

  /**
   * 解析系数输入：整数、小数、分数 (1/2)、带分数 (1 1/2)
   * @returns {{ ok: boolean, value: number, partial?: boolean }}
   */
  function parseNumberInput(raw) {
    if (raw == null) return { ok: false, value: NaN };
    let s = String(raw).trim().replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
    if (!s) return { ok: false, value: NaN, partial: true };

    if (/^[+-]?$/.test(s) || /\/$/.test(s) || /^[+-]?\d+\s+$/.test(s)) {
      return { ok: false, value: NaN, partial: true };
    }

    const mixed = s.match(/^([+-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const sign = mixed[1] === "-" ? -1 : 1;
      const whole = parseInt(mixed[2], 10);
      const num = parseInt(mixed[3], 10);
      const den = parseInt(mixed[4], 10);
      if (den === 0) return { ok: false, value: NaN };
      return { ok: true, value: sign * (whole + num / den) };
    }

    const frac = s.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
    if (frac) {
      const num = parseInt(frac[1], 10);
      const den = parseInt(frac[2], 10);
      if (den === 0) return { ok: false, value: NaN };
      return { ok: true, value: num / den };
    }

    const n = Number(s);
    if (Number.isFinite(n)) return { ok: true, value: n };

    return { ok: false, value: NaN };
  }

  function isPartialNumberInput(raw) {
    const s = String(raw ?? "").trim();
    return !s || /^[+-]?$/.test(s) || /\/$/.test(s) || /^[+-]?\d+\s+$/.test(s);
  }

  function fmtCoeffInput(n) {
    return toSimpleFraction(n) ?? fmtNum(n);
  }

  /** 公式中显示系数：优先最简分数 */
  function fmtCoefDisplay(n) {
    return toSimpleFraction(n) ?? fmtNum(n);
  }

  /** 分数系数单独出现时加括号，避免与后续项粘连产生歧义 */
  function formatCoefFactor(n) {
    const s = fmtCoefDisplay(n);
    return s.includes("/") ? `(${s})` : s;
  }

  /**
   * 有理数系数 × 变量：用 x/10、2x/3，避免 1/10x 歧义
   */
  function formatRationalTimesVar(coef, varName = "x") {
    if (Math.abs(coef) < EPS) return "0";
    const sign = coef < 0 ? "−" : "";
    const abs = Math.abs(coef);
    if (Math.abs(abs - 1) < EPS) return `${sign}${varName}`;
    const frac = toSimpleFraction(abs);
    if (frac && frac.includes("/")) {
      const m = frac.match(/^(\d+)\/(\d+)$/);
      if (m) {
        const p = parseInt(m[1], 10);
        const q = parseInt(m[2], 10);
        if (p === 1) return `${sign}${varName}/${q}`;
        return `${sign}${p}${varName}/${q}`;
      }
      return `${sign}(${frac})·${varName}`;
    }
    const c = fmtCoefDisplay(abs);
    if (c === "1") return `${sign}${varName}`;
    return `${sign}${c}${varName}`;
  }

  function formatDivDenominator(node) {
    if (node.type === "mul") {
      if (node.left.type === "num" && node.right.type === "var") {
        return `${formatCoefFactor(node.left.value)}·${node.right.name}`;
      }
      if (node.left.type === "var" && node.right.type === "num") {
        return `${node.left.name}·${formatCoefFactor(node.right.value)}`;
      }
    }
    const s = formatAst(node, 3);
    return needsParen(node, 3) ? `(${s})` : s;
  }

  function varPart(variable, power) {
    if (power === 0) return "";
    if (power === 1) return variable;
    if (power === 2) return `${variable}²`;
    if (power === 3) return `${variable}³`;
    return `${variable}^${power}`;
  }

  /**
   * 单项式核心（不含正负号）
   * @param hideUnitCoef 为 true 时，|系数|=1 的变量项不显示 1
   */
  function coefCore(absCoef, variable, power, hideUnitCoef) {
    if (Math.abs(absCoef) < EPS) return null;
    if (power === 0) return fmtCoefDisplay(absCoef);
    const vp = varPart(variable, power);
    if (hideUnitCoef && Math.abs(absCoef - 1) < EPS) return vp;
    return `${fmtCoefDisplay(absCoef)}${vp}`;
  }

  /**
   * 拼接多项式：y = … 或 f′(x) = …
   * @param termList {{ coef: number, power: number }[]}
   */
  function formatPolynomialExpression(prefix, termList, hideUnitCoef = false) {
    const segments = [];
    for (const { coef, power } of termList) {
      const core = coefCore(Math.abs(coef), "x", power, hideUnitCoef);
      if (!core) continue;
      segments.push({ coef, core });
    }
    if (!segments.length) return `${prefix} = 0`;
    let s = `${prefix} = `;
    segments.forEach((seg, i) => {
      if (i === 0) {
        s += seg.coef >= 0 ? seg.core : `−${seg.core}`;
      } else {
        s += seg.coef >= 0 ? ` + ${seg.core}` : ` − ${seg.core}`;
      }
    });
    return s;
  }

  function fmtTerm(coef, variable, power) {
    if (Math.abs(coef) < EPS) return "";
    const sign = coef >= 0 ? "+" : "−";
    const abs = fmtNum(Math.abs(coef));
    if (power === 0) return `${sign} ${abs}`;
    if (power === 1) {
      if (Math.abs(coef - 1) < EPS) return `${sign} ${variable}`;
      if (Math.abs(coef + 1) < EPS) return `${sign} −${variable}`;
      return `${sign} ${abs}${variable}`;
    }
    if (Math.abs(coef - 1) < EPS) return `${sign} ${variable}^${power}`;
    return `${sign} ${abs}${variable}^${power}`;
  }

  function formatQuadratic(a, b, cc) {
    return formatPolynomialExpression(
      "y",
      [
        { coef: a, power: 2 },
        { coef: b, power: 1 },
        { coef: cc, power: 0 },
      ],
      true
    );
  }

  function formatCubic(a, b, cc, d) {
    return formatPolynomialExpression(
      "y",
      [
        { coef: a, power: 3 },
        { coef: b, power: 2 },
        { coef: cc, power: 1 },
        { coef: d, power: 0 },
      ],
      true
    );
  }

  function latexPrefix(prefix) {
    return String(prefix).replace(/′/g, "'").trim();
  }

  /** KaTeX 系数：分数用 \\frac */
  function fmtCoefLatex(n) {
    if (!Number.isFinite(n)) return String(n);
    if (Math.abs(n) < EPS) return "0";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    const frac = toSimpleFraction(abs);
    if (frac && frac.includes("/")) {
      const m = frac.match(/^(\d+)\/(\d+)$/);
      if (m) return `${sign}\\frac{${m[1]}}{${m[2]}}`;
    }
    const r = Math.round(abs * 1000) / 1000;
    if (Number.isInteger(r)) return sign + String(r);
    return sign + String(r);
  }

  function coefCoreLatex(absCoef, variable, power, hideUnitCoef) {
    if (Math.abs(absCoef) < EPS) return null;
    if (power === 0) return fmtCoefLatex(absCoef);
    const vp =
      power === 1 ? variable : power === 2 ? `${variable}^{2}` : power === 3 ? `${variable}^{3}` : `${variable}^{${power}}`;
    if (hideUnitCoef && Math.abs(absCoef - 1) < EPS) return vp;
    return `${fmtCoefLatex(absCoef)}\\,${vp}`;
  }

  function formatPolynomialLatex(prefix, termList, hideUnitCoef = false) {
    const segments = [];
    for (const { coef, power } of termList) {
      const core = coefCoreLatex(Math.abs(coef), "x", power, hideUnitCoef);
      if (!core) continue;
      segments.push({ coef, core });
    }
    const head = latexPrefix(prefix.includes("=") ? prefix.split("=")[0] : prefix);
    if (!segments.length) return `${head} = 0`;
    let s = `${head} = `;
    segments.forEach((seg, i) => {
      if (i === 0) s += seg.coef >= 0 ? seg.core : `-${seg.core}`;
      else s += seg.coef >= 0 ? ` + ${seg.core}` : ` - ${seg.core}`;
    });
    return s;
  }

  /** 将 formatAst 的 Unicode 式转为 KaTeX 可渲染的 LaTeX */
  function exprDisplayToLatex(s) {
    let t = String(s)
      .replace(/−/g, "-")
      .replace(/·/g, " \\cdot ")
      .replace(/²/g, "^{2}")
      .replace(/³/g, "^{3}")
      .replace(/π/g, "\\pi");
    t = t.replace(/\be\^\(([^)]+)\)/g, "e^{$1}");
    t = t.replace(/\be\^([a-zA-Z0-9]+)/g, "e^{$1}");
    for (const fn of ["sin", "cos", "tan", "ln", "log"]) {
      t = t.replace(new RegExp(`\\b${fn}\\(`, "g"), `\\${fn}(`);
    }
    t = t.replace(/(\d+)x\/(\d+)/g, "\\frac{$1x}{$2}");
    t = t.replace(/\bx\/(\d+)/g, "\\frac{x}{$1}");
    t = t.replace(/(^|[+\-\s])(\d+)\/(\d+)(?=[+\-\s]|$)/g, "$1\\frac{$2}{$3}");
    t = t.replace(/\((\d+)\/(\d+)\)/g, "\\frac{$1}{$2}");
    t = t.replace(/1\\,([a-z])/g, "$1");
    t = t.replace(/(^|[^0-9.])(1)([a-z])/g, "$1$3");
    return t;
  }

  function formatCustomFormulaLatex(expr) {
    try {
      const ast = simplifyAst(parseExpression(expr));
      return `y = ${astToLatex(ast)}`;
    } catch {
      return `y = ${expr.trim()}`;
    }
  }

  function symbolicDerivativeLatex(expr, derivPrefix = "f'(x)") {
    try {
      return formatDerivativeLatex(symbolicDerivativeResult(expr), derivPrefix);
    } catch {
      return null;
    }
  }

  function buildPolyFormula(coeffs, varName = "x") {
    const terms = [];
    const keys = Object.keys(coeffs).sort((a, b) => {
      const order = { a: 3, b: 2, c: 1, d: 0, n: 0 };
      return (order[b] ?? 0) - (order[a] ?? 0);
    });
    for (const key of keys) {
      const powerMap = { a: 3, b: 2, c: 1, d: 0 };
      if (key === "n") continue;
      if (key in powerMap) {
        const t = fmtTerm(coeffs[key], varName, powerMap[key]);
        if (t) terms.push(t);
      }
    }
    if (terms.length === 0) return "y = 0";
    let body = terms[0].replace(/^\+ /, "");
    if (body.startsWith("−")) body = "−" + body.slice(2);
    return `y = ${body}${terms.slice(1).join(" ")}`;
  }

  /** 插入隐式乘号：2x、2(x+1)、(a)(b)、x sin(x) 等 */
  function insertImplicitMultiplication(s) {
    let out = "";
    let i = 0;
    const isDigit = (c) => c >= "0" && c <= "9";
    const isAlpha = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
    const needsMulAfter = (c) => isAlpha(c) || isDigit(c) || c === "." || c === "(";

    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) {
        out += c;
        i++;
        continue;
      }
      if (isDigit(c) || c === ".") {
        let j = i;
        while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
        out += s.slice(i, j);
        i = j;
        if (i < s.length && needsMulAfter(s[i]) && s[i] !== "*") out += "*";
        continue;
      }
      if (c === ")") {
        out += c;
        i++;
        if (i < s.length && needsMulAfter(s[i]) && s[i] !== "*") out += "*";
        continue;
      }
      if (isAlpha(c)) {
        let j = i;
        while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
        out += s.slice(i, j);
        i = j;
        if (i < s.length && s[i] !== "(" && needsMulAfter(s[i]) && s[i] !== "*") out += "*";
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  function normalizeExprInput(expr) {
    let s = expr.trim();
    if (!s) throw new Error("表达式不能为空");
    s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/−/g, "-");
    s = insertImplicitMultiplication(s);
    return s;
  }

  function sanitizeExpr(expr) {
    let s = normalizeExprInput(expr);
    s = s.replace(/\bpi\b/gi, "PI").replace(/\be\b/g, "E");
    if (!/^[0-9+\-*/().,\s_a-zA-Z]+$/.test(s)) {
      throw new Error("表达式包含不支持的字符");
    }
    return s;
  }

  /** —— 自定义表达式：符号求导 —— */
  function tokenizeExpr(s) {
    const tokens = [];
    let i = 0;
    const isDigit = (c) => c >= "0" && c <= "9";
    const isAlpha = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (c === "*" && s[i + 1] === "*") {
        tokens.push("**");
        i += 2;
        continue;
      }
      if ("+-*/^()".includes(c)) {
        tokens.push(c);
        i++;
        continue;
      }
      if (isDigit(c) || c === ".") {
        let j = i;
        while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
        tokens.push({ type: "num", value: parseFloat(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (isAlpha(c)) {
        let j = i;
        while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
        tokens.push({ type: "ident", value: s.slice(i, j).toLowerCase() });
        i = j;
        continue;
      }
      throw new Error("表达式包含无法解析的符号");
    }
    return tokens;
  }

  const KNOWN_FUNCS = new Set(["sin", "cos", "tan", "ln", "log", "sqrt", "abs", "exp"]);

  function parseExpression(expr) {
    const tokens = tokenizeExpr(normalizeExprInput(expr));
    let pos = 0;

    function peek() {
      return tokens[pos];
    }
    function consume(expected) {
      const t = tokens[pos];
      if (expected !== undefined && t !== expected) throw new Error("表达式语法错误");
      pos++;
      return t;
    }

    function parseExpr() {
      let node = parseTerm();
      while (peek() === "+" || peek() === "-") {
        const op = consume();
        const right = parseTerm();
        node = { type: op === "+" ? "add" : "sub", left: node, right };
      }
      return node;
    }

    function parseTerm() {
      let node = parseUnary();
      while (peek() === "*" || peek() === "/") {
        const op = consume();
        const right = parseUnary();
        node = { type: op === "*" ? "mul" : "div", left: node, right };
      }
      return node;
    }

    function canStartJuxtaposition() {
      const t = peek();
      if (t === "(") return true;
      if (t && t.type === "num") return true;
      if (t && t.type === "ident") return true;
      return false;
    }

    /** x(x−1)、2(x+1) 等未写乘号的相邻因子（sin(x) 仍须显式函数调用） */
    function parseJuxtaposition() {
      let node = parsePower();
      while (canStartJuxtaposition()) {
        const right = parsePower();
        node = { type: "mul", left: node, right };
      }
      return node;
    }

    function parseUnary() {
      if (peek() === "-") {
        consume("-");
        return { type: "neg", child: parseUnary() };
      }
      if (peek() === "+") consume("+");
      return parseJuxtaposition();
    }

    function parsePower() {
      let node = parsePrimary();
      if (peek() === "**") {
        consume("**");
        const right = parseUnary();
        node = { type: "pow", left: node, right };
      }
      return node;
    }

    function parsePrimary() {
      const t = peek();
      if (t === "(") {
        consume("(");
        const node = parseExpr();
        consume(")");
        return node;
      }
      if (t && t.type === "num") {
        consume();
        return { type: "num", value: t.value };
      }
      if (t && t.type === "ident") {
        consume();
        const name = t.value;
        if (name === "exp") {
          if (peek() !== "(") throw new Error("exp 需写成 exp(…)");
          consume("(");
          const arg = parseExpr();
          consume(")");
          return { type: "pow", left: { type: "const", name: "e" }, right: arg };
        }
        if (peek() === "(" && KNOWN_FUNCS.has(name)) {
          consume("(");
          const arg = parseExpr();
          consume(")");
          return { type: "call", name, arg };
        }
        if (name === "pi") return { type: "const", name: "pi" };
        if (name === "e") return { type: "const", name: "e" };
        return { type: "var", name };
      }
      throw new Error("表达式语法错误");
    }

    const ast = parseExpr();
    if (pos < tokens.length) throw new Error("表达式语法错误");
    return ast;
  }

  function isEulerBase(node) {
    return (
      (node?.type === "const" && node.name === "e") ||
      (node?.type === "num" && Math.abs(node.value - Math.E) < EPS)
    );
  }

  function differentiate(ast, v = "x") {
    const zero = () => ({ type: "num", value: 0 });
    const one = () => ({ type: "num", value: 1 });

    function d(node) {
      switch (node.type) {
        case "num":
          return zero();
        case "const":
          return zero();
        case "var":
          return node.name === v ? one() : zero();
        case "neg":
          return { type: "neg", child: d(node.child) };
        case "add":
          return { type: "add", left: d(node.left), right: d(node.right) };
        case "sub":
          return { type: "sub", left: d(node.left), right: d(node.right) };
        case "mul":
          return {
            type: "add",
            left: { type: "mul", left: d(node.left), right: node.right },
            right: { type: "mul", left: node.left, right: d(node.right) },
          };
        case "div": {
          const u = node.left;
          const vNode = node.right;
          return {
            type: "div",
            left: {
              type: "sub",
              left: { type: "mul", left: d(u), right: vNode },
              right: { type: "mul", left: u, right: d(vNode) },
            },
            right: { type: "pow", left: vNode, right: { type: "num", value: 2 } },
          };
        }
        case "pow": {
          if (isEulerBase(node.left)) {
            const du = d(node.right);
            if (!du) return null;
            if (isZeroNode(du)) return zero();
            return { type: "mul", left: node, right: du };
          }
          if (node.right.type !== "num") return null;
          const n = node.right.value;
          const dBase = d(node.left);
          if (!dBase) return null;
          if (isZeroNode(dBase)) return zero();
          return {
            type: "mul",
            left: { type: "num", value: n },
            right: {
              type: "mul",
              left: { type: "pow", left: node.left, right: { type: "num", value: n - 1 } },
              right: dBase,
            },
          };
        }
        case "call": {
          const u = node.arg;
          const du = d(u);
          switch (node.name) {
            case "sin":
              return { type: "mul", left: { type: "call", name: "cos", arg: u }, right: du };
            case "cos":
              return { type: "neg", child: { type: "mul", left: { type: "call", name: "sin", arg: u }, right: du } };
            case "tan": {
              const cosu = { type: "call", name: "cos", arg: u };
              return {
                type: "div",
                left: du,
                right: { type: "pow", left: cosu, right: { type: "num", value: 2 } },
              };
            }
            case "ln":
              return { type: "div", left: du, right: u };
            case "log":
              return {
                type: "div",
                left: du,
                right: { type: "mul", left: u, right: { type: "num", value: Math.LN10 } },
              };
            case "sqrt":
              return {
                type: "div",
                left: du,
                right: { type: "mul", left: { type: "num", value: 2 }, right: { type: "call", name: "sqrt", arg: u } },
              };
            case "abs":
              return null;
            case "exp":
              return { type: "mul", left: { type: "call", name: "exp", arg: u }, right: du };
            default:
              return null;
          }
        }
        default:
          return null;
      }
    }

    return d(ast);
  }

  function simplifyAst(node) {
    if (!node) return null;

    switch (node.type) {
      case "num":
      case "var":
      case "const":
        return node;
      case "neg": {
        const c = simplifyAst(node.child);
        if (!c) return null;
        if (c.type === "num") return { type: "num", value: -c.value };
        if (isZeroNode(c)) return { type: "num", value: 0 };
        if (c.type === "neg") return c.child;
        if (c.type === "mul" && c.left.type === "num" && c.left.value < 0) {
          return { type: "mul", left: { type: "num", value: -c.left.value }, right: c.right };
        }
        if (c.type === "div" && c.left.type === "num") {
          return { type: "div", left: { type: "num", value: -c.left.value }, right: c.right };
        }
        return { type: "neg", child: c };
      }
      case "add": {
        const left = simplifyAst(node.left);
        const right = simplifyAst(node.right);
        if (!left || !right) return null;
        if (left.type === "num" && right.type === "num") {
          return { type: "num", value: left.value + right.value };
        }
        if (isZeroNode(left)) return right;
        if (isZeroNode(right)) return left;
        return { type: "add", left, right };
      }
      case "sub": {
        const left = simplifyAst(node.left);
        const right = simplifyAst(node.right);
        if (!left || !right) return null;
        if (left.type === "num" && right.type === "num") {
          return { type: "num", value: left.value - right.value };
        }
        if (isZeroNode(left)) return simplifyAst({ type: "neg", child: right });
        if (isZeroNode(right)) return left;
        return { type: "sub", left, right };
      }
      case "mul": {
        const left = simplifyAst(node.left);
        const right = simplifyAst(node.right);
        if (!left || !right) return null;
        if (left.type === "num" && right.type === "num") {
          return { type: "num", value: left.value * right.value };
        }
        if (isZeroNode(left) || isZeroNode(right)) return { type: "num", value: 0 };
        if (isOneNode(left)) return right;
        if (isOneNode(right)) return left;
        if (isNegOneNode(left)) return simplifyAst({ type: "neg", child: right });
        if (isNegOneNode(right)) return simplifyAst({ type: "neg", child: left });
        return { type: "mul", left, right };
      }
      case "div": {
        const left = simplifyAst(node.left);
        const right = simplifyAst(node.right);
        if (!left || !right) return null;
        if (left.type === "num" && right.type === "num" && Math.abs(right.value) > EPS) {
          return { type: "num", value: left.value / right.value };
        }
        if (isZeroNode(left)) return { type: "num", value: 0 };
        return { type: "div", left, right };
      }
      case "pow": {
        const left = simplifyAst(node.left);
        const right = simplifyAst(node.right);
        if (!left || !right) return null;
        if (left.type === "num" && right.type === "num") {
          return { type: "num", value: Math.pow(left.value, right.value) };
        }
        if (isOneNode(right)) return left;
        if (isZeroNode(right)) return { type: "num", value: 1 };
        return { type: "pow", left, right };
      }
      case "call":
        return { type: "call", name: node.name, arg: simplifyAst(node.arg) };
      default:
        return node;
    }
  }

  function isZeroNode(node) {
    return node.type === "num" && Math.abs(node.value) < EPS;
  }

  function isOneNode(node) {
    return node.type === "num" && Math.abs(node.value - 1) < EPS;
  }

  function isNegOneNode(node) {
    return node.type === "num" && Math.abs(node.value + 1) < EPS;
  }

  function formatConstLiteral(node) {
    if (node.type === "const") return node.name === "pi" ? "π" : node.name;
    if (node.type === "num") {
      if (Math.abs(node.value - Math.E) < EPS) return "e";
      if (Math.abs(node.value - Math.PI) < EPS) return "π";
    }
    return null;
  }

  function formatEulerPower(expNode) {
    const exp = formatAst(expNode, 4);
    if (expNode.type === "var") return `e^${exp}`;
    return `e^(${exp})`;
  }

  function needsNegParen(node) {
    if (!node) return false;
    return node.type === "add" || node.type === "sub" || node.type === "mul" || node.type === "div";
  }

  function formatAst(node, parentPrec = 0) {
    if (!node) return "";
    const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };

    switch (node.type) {
      case "num": {
        const lit = formatConstLiteral(node);
        return lit ?? fmtCoefDisplay(node.value);
      }
      case "const":
        return formatConstLiteral(node);
      case "var":
        return node.name;
      case "neg": {
        if (isZeroNode(node.child)) return "0";
        if (node.child.type === "mul" && node.child.left.type === "num" && node.child.right.type === "var") {
          const c = -node.child.left.value;
          if (Math.abs(c - 1) < EPS) return `−${node.child.right.name}`;
          if (Math.abs(c + 1) < EPS) return node.child.right.name;
          return `−${fmtCoefDisplay(Math.abs(c))}${node.child.right.name}`;
        }
        const inner = formatAst(node.child, 4);
        return needsNegParen(node.child) ? `−(${inner})` : `−${inner}`;
      }
      case "add": {
        const l = formatAst(node.left, 1);
        const r = formatAst(node.right, 1);
        if (isZeroNode(node.left)) return r;
        if (isZeroNode(node.right)) return l;
        if (node.right.type === "num" && node.right.value < -EPS) {
          return `${l} − ${fmtCoefDisplay(Math.abs(node.right.value))}`;
        }
        if (node.right.type === "neg") {
          return `${l} − ${formatAst(node.right.child, 1)}`;
        }
        return `${l} + ${r}`;
      }
      case "sub": {
        const l = formatAst(node.left, 1);
        const r = formatAst(node.right, 1);
        if (isZeroNode(node.left)) return formatAst({ type: "neg", child: node.right }, 1);
        if (isZeroNode(node.right)) return l;
        return `${l} − ${r}`;
      }
      case "mul": {
        if (isZeroNode(node.left) || isZeroNode(node.right)) return "0";
        if (isOneNode(node.left)) return formatAst(node.right, 2);
        if (isOneNode(node.right)) return formatAst(node.left, 2);
        if (isNegOneNode(node.left)) return formatAst({ type: "neg", child: node.right }, 2);
        if (node.right.type === "pow" && isEulerBase(node.right.left)) {
          const coef = formatAst(node.left, 2);
          const ep = formatEulerPower(node.right.right);
          return `${coef}·${ep}`;
        }
        if (node.left.type === "num" && node.right.type === "var") {
          return formatRationalTimesVar(node.left.value, node.right.name);
        }
        if (
          node.left.type === "div" &&
          node.left.left.type === "num" &&
          node.left.right.type === "num" &&
          node.right.type === "var"
        ) {
          return formatRationalTimesVar(node.left.left.value / node.left.right.value, node.right.name);
        }
        if (node.left.type === "num" && (node.right.type === "call" || node.right.type === "pow")) {
          const r = formatAst(node.right, 2);
          const rOut = needsParen(node.right, 2) ? `(${r})` : r;
          if (Math.abs(node.left.value - 1) < EPS) return rOut;
          return `${formatCoefFactor(node.left.value)}·${rOut}`;
        }
        const l = formatAst(node.left, 2);
        const r = formatAst(node.right, 2);
        const rWrap = needsParen(node.right, 2) ? `(${r})` : r;
        const lWrap = needsParen(node.left, 2) ? `(${l})` : l;
        if (
          node.left.type === "num" ||
          node.left.type === "const" ||
          node.left.type === "var" ||
          node.left.type === "call"
        ) {
          return `${lWrap}${rWrap}`;
        }
        return `${lWrap}·${rWrap}`;
      }
      case "div": {
        if (isZeroNode(node.left)) return "0";
        if (node.left.type === "var" && node.right.type === "num") {
          const v = node.right.value;
          if (Math.abs(v - 1) < EPS) return node.left.name;
          if (Math.abs(v + 1) < EPS) return `−${node.left.name}`;
          return `${node.left.name}/${fmtCoefDisplay(v)}`;
        }
        if (
          node.left.type === "num" &&
          node.right.type === "var" &&
          Math.abs(node.left.value - 1) < EPS
        ) {
          return `1/${node.right.name}`;
        }
        let den;
        if (
          node.right.type === "pow" &&
          node.right.right.type === "num" &&
          Math.abs(node.right.right.value - 2) < EPS
        ) {
          const base = formatAst(node.right.left, 4);
          const wrapBase =
            node.right.left.type === "var" || node.right.left.type === "num" || node.right.left.type === "call";
          den = `${wrapBase ? base : needsParen(node.right.left, 4) ? `(${base})` : base}²`;
        } else {
          den = formatDivDenominator(node.right);
        }
        if (node.left.type === "num") {
          const v = node.left.value;
          if (Math.abs(v - 1) < EPS) return `1/${den}`;
          if (Math.abs(v + 1) < EPS) return `−1/${den}`;
          if (Math.abs(v) < EPS) return "0";
          return `${fmtCoefDisplay(v)}/${den}`;
        }
        const l = formatAst(node.left, 3);
        const lWrap = needsParen(node.left, 3) ? `(${l})` : l;
        return `${lWrap}/${den}`;
      }
      case "pow": {
        if (isEulerBase(node.left)) return formatEulerPower(node.right);
        const base = formatAst(node.left, 4);
        if (node.right.type === "num") {
          const p = node.right.value;
          if (Math.abs(p - 2) < EPS) {
            const b = needsParen(node.left, 4) ? `(${base})` : base;
            return `${b}²`;
          }
          if (Math.abs(p - 3) < EPS) {
            const b = needsParen(node.left, 4) ? `(${base})` : base;
            return `${b}³`;
          }
          return `${needsParen(node.left, 4) ? `(${base})` : base}^${fmtCoefDisplay(p)}`;
        }
        return `${base}^(${formatAst(node.right)})`;
      }
      case "call": {
        const arg = formatAst(node.arg, 0);
        const a = needsParen(node.arg, 0) ? `(${arg})` : arg;
        if (node.name === "abs") return `|${a}|`;
        return `${node.name}(${a})`;
      }
      default:
        return "";
    }
  }

  function needsParen(node, parentPrec) {
    if (!node) return false;
    const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };
    const p = PREC[node.type] ?? 0;
    return p < parentPrec;
  }

  /** 合并关于 x 的一次式：x − 1 + x → 2x − 1 */
  function linearPolyCoeffs(node, v = "x") {
    if (!node) return null;
    switch (node.type) {
      case "var":
        return node.name === v ? { a: 1, b: 0 } : null;
      case "num":
        return { a: 0, b: node.value };
      case "neg": {
        const p = linearPolyCoeffs(node.child, v);
        return p ? { a: -p.a, b: -p.b } : null;
      }
      case "mul": {
        if (node.left.type === "num" && node.right.type === "var" && node.right.name === v) {
          return { a: node.left.value, b: 0 };
        }
        if (node.right.type === "num" && node.left.type === "var" && node.left.name === v) {
          return { a: node.right.value, b: 0 };
        }
        return null;
      }
      case "add": {
        const l = linearPolyCoeffs(node.left, v);
        const r = linearPolyCoeffs(node.right, v);
        return l && r ? { a: l.a + r.a, b: l.b + r.b } : null;
      }
      case "sub": {
        const l = linearPolyCoeffs(node.left, v);
        const r = linearPolyCoeffs(node.right, v);
        return l && r ? { a: l.a - r.a, b: l.b - r.b } : null;
      }
      default:
        return null;
    }
  }

  function astFromLinearPoly({ a, b }, v = "x") {
    let expr = null;
    const append = (term, positive) => {
      if (!term) return;
      if (!expr) {
        expr = positive ? term : { type: "neg", child: term };
        return;
      }
      expr = positive ? { type: "add", left: expr, right: term } : { type: "sub", left: expr, right: term };
    };
    if (Math.abs(a) >= EPS) {
      const absA = Math.abs(a);
      let xTerm =
        Math.abs(absA - 1) < EPS
          ? { type: "var", name: v }
          : { type: "mul", left: { type: "num", value: absA }, right: { type: "var", name: v } };
      if (a < 0) xTerm = { type: "neg", child: xTerm };
      append(xTerm, true);
    }
    if (Math.abs(b) >= EPS) {
      append({ type: "num", value: Math.abs(b) }, b >= 0);
    }
    return expr ?? { type: "num", value: 0 };
  }

  function deepSimplifyLinear(node, v = "x") {
    if (!node) return node;
    const map = (n) => {
      if (!n) return n;
      const next = { ...n };
      if (n.left) next.left = map(n.left);
      if (n.right) next.right = map(n.right);
      if (n.child) next.child = map(n.child);
      if (n.arg) next.arg = map(n.arg);
      const simplified = simplifyAst(next);
      const coeffs = linearPolyCoeffs(simplified, v);
      return coeffs ? simplifyAst(astFromLinearPoly(coeffs, v)) : simplified;
    };
    return map(node);
  }

  function cloneAst(node) {
    if (!node) return node;
    const c = { ...node };
    if (node.left) c.left = cloneAst(node.left);
    if (node.right) c.right = cloneAst(node.right);
    if (node.child) c.child = cloneAst(node.child);
    if (node.arg) c.arg = cloneAst(node.arg);
    return c;
  }

  function tryPiecewiseAbsDerivative(ast) {
    if (ast.type !== "call" || ast.name !== "abs") return null;
    const inner = simplifyAst(ast.arg);
    const du = deepSimplifyLinear(differentiate(inner));
    if (!du) return null;

    const quad = collectQuadraticCoeffs(inner);
    if (quad && Math.abs(quad.a) > EPS) {
      const roots = solveQuadratic(quad.a, quad.b, quad.c).sort((a, b) => a - b);
      if (roots.length === 2) {
        const [r1, r2] = roots;
        const positiveOutside = quad.a > 0;
        const eOut = deepSimplifyLinear(positiveOutside ? du : { type: "neg", child: cloneAst(du) });
        const eIn = deepSimplifyLinear(positiveOutside ? { type: "neg", child: cloneAst(du) } : du);
        return {
          type: "piecewise",
          roots: [r1, r2],
          pieces: [
            {
              intervalText: `x < ${fmtNum(r1)}`,
              intervalLatex: `x<${fmtCoefLatex(r1)}`,
              expr: eOut,
            },
            {
              intervalText: `${fmtNum(r1)} < x < ${fmtNum(r2)}`,
              intervalLatex: `${fmtCoefLatex(r1)}<x<${fmtCoefLatex(r2)}`,
              expr: eIn,
            },
            {
              intervalText: `x > ${fmtNum(r2)}`,
              intervalLatex: `x>${fmtCoefLatex(r2)}`,
              expr: eOut,
            },
          ],
          note: `x = ${fmtNum(r1)}、${fmtNum(r2)} 处不可导`,
        };
      }
    }

    const lin = collectLinearCoeffs(inner);
    if (lin && Math.abs(lin.m) > EPS) {
      const r = -lin.b / lin.m;
      const ePos = deepSimplifyLinear(du);
      const eNeg = deepSimplifyLinear({ type: "neg", child: cloneAst(du) });
      const pieces =
        lin.m > 0
          ? [
              { intervalText: `x < ${fmtNum(r)}`, intervalLatex: `x<${fmtCoefLatex(r)}`, expr: eNeg },
              { intervalText: `x > ${fmtNum(r)}`, intervalLatex: `x>${fmtCoefLatex(r)}`, expr: ePos },
            ]
          : [
              { intervalText: `x < ${fmtNum(r)}`, intervalLatex: `x<${fmtCoefLatex(r)}`, expr: ePos },
              { intervalText: `x > ${fmtNum(r)}`, intervalLatex: `x>${fmtCoefLatex(r)}`, expr: eNeg },
            ];
      return {
        type: "piecewise",
        roots: [r],
        pieces,
        note: `x = ${fmtNum(r)} 处不可导`,
      };
    }

    return null;
  }

  function collectLinearCoeffs(ast, v = "x") {
    const q = collectQuadraticCoeffs(ast, v);
    if (!q || Math.abs(q.a) > EPS) return null;
    return { m: q.b, b: q.c };
  }

  function symbolicDerivativeResult(expr) {
    try {
      const ast = simplifyAst(parseExpression(expr));
      const pw = tryPiecewiseAbsDerivative(ast);
      if (pw) return pw;
      const dAst = deepSimplifyLinear(differentiate(ast));
      if (!dAst) return null;
      if (isZeroNode(dAst)) return { type: "single", ast: dAst };
      return { type: "single", ast: dAst };
    } catch {
      return null;
    }
  }

  function formatDerivativeResult(result, derivPrefix = "f′(x)") {
    if (!result) return null;
    if (result.type === "piecewise") {
      const lines = result.pieces.map((p) => `  ${p.intervalText}：${formatAst(p.expr)}`);
      let s = `${derivPrefix} =\n${lines.join("\n")}`;
      if (result.note) s += `\n（${result.note}）`;
      return s;
    }
    if (isZeroNode(result.ast)) return `${derivPrefix} = 0`;
    return `${derivPrefix} = ${formatAst(result.ast)}`;
  }

  function formatDerivativeLatex(result, derivPrefix = "f′(x)") {
    if (!result) return null;
    const head = latexPrefix(derivPrefix);
    if (result.type === "piecewise") {
      const rows = result.pieces
        .map((p) => `${astToLatex(p.expr)} & ${p.intervalLatex}`)
        .join(" \\\\ ");
      let body = `${head} = \\begin{cases} ${rows} \\end{cases}`;
      if (result.note) {
        body += `\\\\[6pt]\\text{（${result.note.replace(/、/g, "，")}）}`;
      }
      return body;
    }
    if (isZeroNode(result.ast)) return `${head} = 0`;
    return `${head} = ${astToLatex(result.ast)}`;
  }

  function compileDerivativeResult(result) {
    if (!result) return null;
    if (result.type === "single") {
      return makeCompiledFn(astToCompileExpr(result.ast));
    }
    const codes = result.pieces.map((p) => astToCompileExpr(p.expr));
    const fns = codes.map((code) => makeCompiledFn(code));
    if (result.roots.length === 2) {
      const [r1, r2] = result.roots;
      return (x) => {
        if (x < r1 - 1e-9) return fns[0](x);
        if (x > r2 + 1e-9) return fns[2](x);
        if (x > r1 + 1e-9 && x < r2 - 1e-9) return fns[1](x);
        const y1 = fns[0](x);
        const y2 = fns[2](x);
        if (Number.isFinite(y1) && Number.isFinite(y2)) return (y1 + y2) / 2;
        return NaN;
      };
    }
    if (result.roots.length === 1) {
      const [r] = result.roots;
      return (x) => {
        if (x < r - 1e-9) return fns[0](x);
        if (x > r + 1e-9) return fns[1](x);
        return NaN;
      };
    }
    return null;
  }

  function derivativeAst(expr) {
    const r = symbolicDerivativeResult(expr);
    if (!r) return null;
    if (r.type === "single") return r.ast;
    return null;
  }

  function astToLatexParen(node) {
    if (!node) return "";
    if (node.type === "add" || node.type === "sub" || node.type === "mul" || node.type === "div" || node.type === "neg") {
      return `\\left(${astToLatex(node)}\\right)`;
    }
    return astToLatex(node);
  }

  function astToLatexJuxtapose(node) {
    if (node.type === "mul") {
      const l = astToLatexJuxtaposeFactor(node.left);
      const r = astToLatexJuxtaposeFactor(node.right);
      return `${l}${r}`;
    }
    return astToLatexParen(node);
  }

  function astToLatexJuxtaposeFactor(node) {
    if (node.type === "var") return node.name;
    if (node.type === "num") return fmtCoefLatex(node.value);
    if (node.type === "neg") return `-${astToLatexJuxtaposeFactor(node.child)}`;
    if (node.type === "sub" || node.type === "add") return `\\left(${astToLatex(node)}\\right)`;
    if (node.type === "pow") {
      const base = node.left;
      if (node.right.type === "num" && Math.abs(node.right.value - 2) < EPS) {
        const b =
          base.type === "var" || base.type === "num"
            ? astToLatex(base)
            : `\\left(${astToLatex(base)}\\right)`;
        return `{${b}}^{2}`;
      }
    }
    return astToLatexParen(node);
  }

  function astToLatexDenominator(node) {
    if (node.type === "mul") return astToLatexJuxtapose(node);
    if (node.type === "pow" && node.right.type === "num" && Math.abs(node.right.value - 2) < EPS) {
      const inner = node.left.type === "mul" ? astToLatexJuxtapose(node.left) : astToLatexParen(node.left);
      return `{${inner}}^{2}`;
    }
    return astToLatexParen(node);
  }

  function astToLatex(node) {
    if (!node) return "";
    switch (node.type) {
      case "num":
        return fmtCoefLatex(node.value);
      case "const":
        return node.name === "pi" ? "\\pi" : "e";
      case "var":
        return node.name;
      case "neg": {
        const inner = astToLatex(node.child);
        if (node.child.type === "add" || node.child.type === "sub") return `-\\left(${inner}\\right)`;
        return `-${inner}`;
      }
      case "add":
        return `${astToLatex(node.left)} + ${astToLatex(node.right)}`;
      case "sub":
        return `${astToLatex(node.left)} - ${astToLatex(node.right)}`;
      case "mul": {
        if (node.left.type === "num" && node.right.type === "var") {
          const c = node.left.value;
          if (Math.abs(c - 1) < EPS) return node.right.name;
          if (Math.abs(c + 1) < EPS) return `-${node.right.name}`;
          return `${fmtCoefLatex(c)}${node.right.name}`;
        }
        return `${astToLatex(node.left)} \\cdot ${astToLatex(node.right)}`;
      }
      case "div": {
        const num = astToLatex(node.left);
        const den = astToLatexDenominator(node.right);
        return `\\frac{${num}}{${den}}`;
      }
      case "pow": {
        if (isEulerBase(node.left)) {
          const exp = astToLatex(node.right);
          return node.right.type === "var" ? `e^{${exp}}` : `e^{\\left(${exp}\\right)}`;
        }
        const base = astToLatexParen(node.left);
        const exp =
          node.right.type === "num" && Math.abs(node.right.value - 2) < EPS
            ? "2"
            : astToLatex(node.right);
        return `{${base}}^{${exp}}`;
      }
      case "call": {
        if (node.name === "abs") {
          return `\\left|${astToLatex(node.arg)}\\right|`;
        }
        const inner = astToLatex(node.arg);
        switch (node.name) {
          case "sqrt":
            return `\\sqrt{${inner}}`;
          case "ln":
            return `\\ln\\left(${inner}\\right)`;
          case "log":
            return `\\log\\left(${inner}\\right)`;
          case "exp":
            return `\\exp\\left(${inner}\\right)`;
          default:
            return `\\${node.name}\\left(${inner}\\right)`;
        }
      }
      default:
        return "";
    }
  }

  function astToCompileExpr(node) {
    switch (node.type) {
      case "num":
        return String(node.value);
      case "const":
        return node.name === "pi" ? "PI" : "E";
      case "var":
        return node.name;
      case "neg":
        return `(-${astToCompileExpr(node.child)})`;
      case "add":
        return `(${astToCompileExpr(node.left)}+${astToCompileExpr(node.right)})`;
      case "sub":
        return `(${astToCompileExpr(node.left)}-${astToCompileExpr(node.right)})`;
      case "mul":
        return `(${astToCompileExpr(node.left)}*${astToCompileExpr(node.right)})`;
      case "div":
        return `(${astToCompileExpr(node.left)}/${astToCompileExpr(node.right)})`;
      case "pow":
        return `(${astToCompileExpr(node.left)}**${astToCompileExpr(node.right)})`;
      case "call": {
        const arg = astToCompileExpr(node.arg);
        if (node.name === "exp") return `Math.exp(${arg})`;
        return `${node.name}(${arg})`;
      }
      default:
        return "0";
    }
  }

  function symbolicDerivativeExpr(expr) {
    try {
      const formatted = formatDerivativeResult(symbolicDerivativeResult(expr));
      if (!formatted) return null;
      const eq = formatted.indexOf("=");
      return eq >= 0 ? formatted.slice(eq + 1).trim() : formatted;
    } catch {
      return null;
    }
  }

  function compileSymbolicDerivative(expr) {
    try {
      return compileDerivativeResult(symbolicDerivativeResult(expr));
    } catch {
      return null;
    }
  }

  function formatCustomFormula(expr) {
    try {
      const ast = simplifyAst(parseExpression(expr));
      const s = formatAst(ast);
      return `y = ${s}`;
    } catch {
      return `y = ${expr.trim()}`;
    }
  }

  function compileExprCode(expr) {
    const ast = parseExpression(expr);
    return astToCompileExpr(ast);
  }

  function makeCompiledFn(code) {
    const fn = new Function(
      "x",
      `
      const sin = Math.sin, cos = Math.cos, tan = Math.tan;
      const sqrt = Math.sqrt, abs = Math.abs;
      const log = Math.log10, ln = Math.log, exp = Math.exp;
      const PI = Math.PI, E = Math.E;
      return (${code});
    `
    );
    return (x) => {
      const y = fn(x);
      if (!Number.isFinite(y)) throw new Error("定义域外或未定义");
      return y;
    };
  }

  function compileCustom(expr) {
    return makeCompiledFn(compileExprCode(expr));
  }

  function buildFunction(type, coeffs, customExpr, options = {}) {
    const derivPrefix = options.derivPrefix || "f′(x)";
    const derivPrefixLatex = latexPrefix(derivPrefix);
    const c = coeffs;
    switch (type) {
      case "linear":
        return {
          f: (x) => c.a * x + c.b,
          domain: () => ({ min: -Infinity, max: Infinity }),
          formula: () =>
            formatPolynomialExpression(
              "y",
              [
                { coef: c.a, power: 1 },
                { coef: c.b, power: 0 },
              ],
              true
            ),
          formulaLatex: () =>
            formatPolynomialLatex(
              "y",
              [
                { coef: c.a, power: 1 },
                { coef: c.b, power: 0 },
              ],
              true
            ),
          derivativeFormula: () => `${derivPrefix} = ${fmtCoefDisplay(c.a)}`,
          derivativeFormulaLatex: () => `${derivPrefixLatex} = ${fmtCoefLatex(c.a)}`,
          derivative: () => c.a,
          analyze: (xMin, xMax) => analyzeConstantDerivative(c.a, xMin, xMax),
        };

      case "quadratic": {
        const a = c.a,
          b = c.b,
          cc = c.c;
        return {
          f: (x) => a * x * x + b * x + cc,
          domain: () => ({ min: -Infinity, max: Infinity }),
          formula: () => formatQuadratic(a, b, cc),
          formulaLatex: () =>
            formatPolynomialLatex(
              "y",
              [
                { coef: a, power: 2 },
                { coef: b, power: 1 },
                { coef: cc, power: 0 },
              ],
              true
            ),
          derivativeFormula: () =>
            formatPolynomialExpression(
              derivPrefix,
              [
                { coef: 2 * a, power: 1 },
                { coef: b, power: 0 },
              ],
              true
            ),
          derivativeFormulaLatex: () =>
            formatPolynomialLatex(
              derivPrefix,
              [
                { coef: 2 * a, power: 1 },
                { coef: b, power: 0 },
              ],
              true
            ),
          derivative: (x) => 2 * a * x + b,
          analyze: (xMin, xMax) => {
            if (Math.abs(a) < EPS) {
              return analyzeConstantDerivative(b, xMin, xMax);
            }
            const xv = -b / (2 * a);
            return analyzeFromCriticalPoints(
              [xv],
              a > 0,
              xMin,
              xMax,
              (x) => a * x * x + b * x + cc,
              (x) => 2 * a * x + b
            );
          },
        };
      }

      case "cubic": {
        const a = c.a,
          b = c.b,
          cc = c.c,
          d = c.d;
        return {
          f: (x) => a * x ** 3 + b * x ** 2 + cc * x + d,
          domain: () => ({ min: -Infinity, max: Infinity }),
          formula: () => formatCubic(a, b, cc, d),
          formulaLatex: () =>
            formatPolynomialLatex(
              "y",
              [
                { coef: a, power: 3 },
                { coef: b, power: 2 },
                { coef: cc, power: 1 },
                { coef: d, power: 0 },
              ],
              true
            ),
          derivativeFormula: () =>
            formatPolynomialExpression(
              derivPrefix,
              [
                { coef: 3 * a, power: 2 },
                { coef: 2 * b, power: 1 },
                { coef: cc, power: 0 },
              ],
              true
            ),
          derivativeFormulaLatex: () =>
            formatPolynomialLatex(
              derivPrefix,
              [
                { coef: 3 * a, power: 2 },
                { coef: 2 * b, power: 1 },
                { coef: cc, power: 0 },
              ],
              true
            ),
          derivative: (x) => 3 * a * x * x + 2 * b * x + cc,
          analyze: (xMin, xMax) => {
            const roots = solveQuadratic(3 * a, 2 * b, cc);
            return analyzeFromCriticalPoints(roots, null, xMin, xMax, (x) => a * x ** 3 + b * x ** 2 + cc * x + d, (x) => 3 * a * x * x + 2 * b * x + cc);
          },
        };
      }

      case "exponential": {
        const a = c.a,
          b = c.b,
          cc = c.c;
        return {
          f: (x) => a * Math.exp(b * x) + cc,
          domain: () => ({ min: -Infinity, max: Infinity }),
          formula: () => {
            const exp = Math.abs(c.b - 1) < EPS ? "x" : `${fmtCoefDisplay(c.b)}x`;
            let base;
            if (Math.abs(c.a - 1) < EPS) base = "e";
            else if (Math.abs(c.a + 1) < EPS) base = "−e";
            else base = `${fmtCoefDisplay(c.a)}·e`;
            let s = `y = ${base}^(${exp})`;
            if (Math.abs(c.c) >= EPS) s += c.c >= 0 ? ` + ${fmtCoefDisplay(c.c)}` : ` − ${fmtCoefDisplay(Math.abs(c.c))}`;
            return s;
          },
          formulaLatex: () => {
            const exp = Math.abs(c.b - 1) < EPS ? "x" : `${fmtCoefLatex(c.b)}x`;
            let base;
            if (Math.abs(c.a - 1) < EPS) base = "e";
            else if (Math.abs(c.a + 1) < EPS) base = "-e";
            else base = `${fmtCoefLatex(c.a)} \\cdot e`;
            let s = `y = ${base}^{${exp}}`;
            if (Math.abs(c.c) >= EPS) s += c.c >= 0 ? ` + ${fmtCoefLatex(c.c)}` : ` - ${fmtCoefLatex(Math.abs(c.c))}`;
            return s;
          },
          derivativeFormula: () => {
            const coef = c.a * c.b;
            const exp = Math.abs(c.b - 1) < EPS ? "x" : `${fmtCoefDisplay(c.b)}x`;
            const lead =
              Math.abs(coef - 1) < EPS ? "" : Math.abs(coef + 1) < EPS ? "−" : `${fmtCoefDisplay(coef)}·`;
            return `${derivPrefix} = ${lead || ""}e^(${exp})`;
          },
          derivativeFormulaLatex: () => {
            const coef = c.a * c.b;
            const exp = Math.abs(c.b - 1) < EPS ? "x" : `${fmtCoefLatex(c.b)}x`;
            let lead = "";
            if (Math.abs(coef - 1) >= EPS) lead = Math.abs(coef + 1) < EPS ? "-" : `${fmtCoefLatex(coef)} \\cdot `;
            return `${derivPrefixLatex} = ${lead}e^{${exp}}`;
          },
          derivative: (x) => a * b * Math.exp(b * x),
          analyze: (xMin, xMax) => {
            const sign = a * b;
            return analyzeConstantDerivative(sign, xMin, xMax);
          },
        };
      }

      case "logarithmic": {
        const a = c.a,
          b = c.b;
        return {
          f: (x) => {
            if (x <= 0) throw new Error("定义域外");
            return a * Math.log(x) + b;
          },
          domain: () => ({ min: 0, max: Infinity, openMin: true }),
          formula: () => {
            let s = Math.abs(c.a - 1) < EPS ? "y = ln(x)" : `y = ${fmtCoefDisplay(c.a)}·ln(x)`;
            if (Math.abs(c.b) >= EPS) s += c.b >= 0 ? ` + ${fmtCoefDisplay(c.b)}` : ` − ${fmtCoefDisplay(Math.abs(c.b))}`;
            return s;
          },
          formulaLatex: () => {
            let s = Math.abs(c.a - 1) < EPS ? "y = \\ln(x)" : `y = ${fmtCoefLatex(c.a)} \\ln(x)`;
            if (Math.abs(c.b) >= EPS) s += c.b >= 0 ? ` + ${fmtCoefLatex(c.b)}` : ` - ${fmtCoefLatex(Math.abs(c.b))}`;
            return s;
          },
          derivativeFormula: () => {
            const aDisp = fmtCoefDisplay(c.a);
            return `${derivPrefix} = ${aDisp}/x`;
          },
          derivativeFormulaLatex: () => `${derivPrefixLatex} = \\frac{${fmtCoefLatex(c.a)}}{x}`,
          derivative: (x) => a / x,
          analyze: (xMin, xMax) => {
            const lo = Math.max(xMin, EPS);
            const sign = a;
            return analyzeSignOnInterval(sign, lo, xMax, sign > 0 ? "inc" : sign < 0 ? "dec" : "const");
          },
        };
      }

      case "power": {
        const a = c.a,
          n = c.n;
        return {
          f: (x) => a * Math.pow(x, n),
          domain: () => (Number.isInteger(n) && n < 0 ? { min: 0, max: Infinity, openMin: true } : { min: -Infinity, max: Infinity }),
          formula: () => {
            const nStr = fmtCoefDisplay(c.n);
            if (Math.abs(c.a - 1) < EPS) return `y = x^${nStr}`;
            return `y = ${fmtCoefDisplay(c.a)}·x^${nStr}`;
          },
          formulaLatex: () => {
            const nStr = fmtCoefLatex(c.n);
            if (Math.abs(c.a - 1) < EPS) return `y = x^{${nStr}}`;
            return `y = ${fmtCoefLatex(c.a)} \\cdot x^{${nStr}}`;
          },
          derivativeFormula: () => {
            const coef = c.a * c.n;
            const nStr = fmtCoefDisplay(c.n - 1);
            const lead = Math.abs(coef - 1) < EPS ? "" : `${fmtCoefDisplay(coef)}·`;
            return `${derivPrefix} = ${lead}x^${nStr}`;
          },
          derivativeFormulaLatex: () => {
            const coef = c.a * c.n;
            const nStr = fmtCoefLatex(c.n - 1);
            const lead = Math.abs(coef - 1) < EPS ? "" : `${fmtCoefLatex(coef)} \\cdot `;
            return `${derivPrefixLatex} = ${lead}x^{${nStr}}`;
          },
          derivative: (x) => a * n * Math.pow(x, n - 1),
          analyze: (xMin, xMax) => {
            const crit = n === 1 ? [] : [0];
            const inc = a * n > 0 ? (n % 2 === 0 ? false : true) : false;
            return analyzeFromCriticalPoints(crit, null, xMin, xMax, (x) => a * Math.pow(x, n), (x) => a * n * Math.pow(x, n - 1));
          },
        };
      }

      case "custom": {
        const f = compileCustom(customExpr);
        const derivResult = symbolicDerivativeResult(customExpr);
        const derivCompiled = compileSymbolicDerivative(customExpr);
        const derivFn = derivCompiled || ((x) => numericalDerivative(f, x));
        const derivPlain = formatDerivativeResult(derivResult, derivPrefix);
        const derivLatex = formatDerivativeLatex(derivResult, derivPrefix);
        return {
          f,
          domain: () => customExprDomain(customExpr),
          formula: () => formatCustomFormula(customExpr),
          formulaLatex: () => formatCustomFormulaLatex(customExpr),
          derivativeFormula: () =>
            derivPlain || `${derivPrefix} ≈ 数值求导（复杂表达式暂不支持符号求导）`,
          derivativeFormulaLatex: () => derivLatex,
          derivativeIsPiecewise: () => derivResult?.type === "piecewise",
          derivative: derivFn,
          analyze: (xMin, xMax) => analyzeCustomFunction(customExpr, xMin, xMax, f, derivFn),
        };
      }

      default:
        throw new Error("未知函数类型");
    }
  }

  function solveQuadratic(a, b, c) {
    if (Math.abs(a) < EPS) {
      if (Math.abs(b) < EPS) return [];
      return [-c / b];
    }
    const disc = b * b - 4 * a * c;
    if (disc < -EPS) return [];
    if (Math.abs(disc) <= EPS) return [-b / (2 * a)];
    const s = Math.sqrt(disc);
    const r1 = (-b - s) / (2 * a);
    const r2 = (-b + s) / (2 * a);
    return r1 <= r2 ? [r1, r2] : [r2, r1];
  }

  function analyzeConstantDerivative(sign, xMin, xMax) {
    if (Math.abs(sign) < EPS) {
      return {
        intervals: [{ type: "const", from: xMin, to: xMax, label: "恒为常数" }],
        criticalPoints: [],
      };
    }
    const type = sign > 0 ? "inc" : "dec";
    const label = sign > 0 ? "单调递增" : "单调递减";
    return {
      intervals: [{ type, from: xMin, to: xMax, label: `在 (${fmtInterval(xMin, xMax)}) 上${label}` }],
      criticalPoints: [],
    };
  }

  function analyzeSignOnInterval(sign, xMin, xMax, type) {
    const labels = { inc: "单调递增", dec: "单调递减", const: "恒为常数" };
    return {
      intervals: [{ type, from: xMin, to: xMax, label: `在 (${fmtInterval(xMin, xMax)}) 上${labels[type]}` }],
      criticalPoints: [],
    };
  }

  function factorMonoTerm(node, v = "x") {
    if (node.type === "var" && node.name === v) return { coef: 1, power: 1 };
    if (node.type === "num") return { coef: node.value, power: 0 };
    if (node.type === "pow" && node.left.type === "var" && node.left.name === v && node.right.type === "num") {
      return { coef: 1, power: node.right.value };
    }
    if (node.type === "mul") {
      const l = factorMonoTerm(node.left, v);
      const r = factorMonoTerm(node.right, v);
      if (l && r && l.power === 0 && r.power > 0) return { coef: l.coef * r.coef, power: r.power };
      if (r && l && r.power === 0 && l.power > 0) return { coef: l.coef * r.coef, power: l.power };
    }
    return null;
  }

  /** 提取 ax²+bx+c 系数（无法识别则 null） */
  function collectQuadraticCoeffs(ast, v = "x") {
    const coeffs = { 0: 0, 1: 0, 2: 0 };
    const add = (p, k) => {
      coeffs[p] = (coeffs[p] || 0) + k;
    };
    const walk = (n, sign = 1) => {
      if (!n) return true;
      switch (n.type) {
        case "num":
          add(0, sign * n.value);
          return true;
        case "var":
          if (n.name === v) {
            add(1, sign);
            return true;
          }
          return false;
        case "neg":
          return walk(n.child, -sign);
        case "add":
          return walk(n.left, sign) && walk(n.right, sign);
        case "sub":
          return walk(n.left, sign) && walk(n.right, -sign);
        case "mul": {
          const t = factorMonoTerm(n, v);
          if (!t) return false;
          add(t.power, sign * t.coef);
          return true;
        }
        case "pow":
          if (n.left.type === "var" && n.left.name === v && n.right.type === "num" && Math.abs(n.right.value - 2) < EPS) {
            add(2, sign);
            return true;
          }
          return false;
        default:
          return false;
      }
    };
    if (!walk(ast)) return null;
    return { a: coeffs[2], b: coeffs[1], c: coeffs[0] };
  }

  function snapNearRoot(x, f) {
    if (!Number.isFinite(x)) return x;
    let best = x;
    let bestY = Math.abs(f(x));
    for (let k = Math.round(x) - 4; k <= Math.round(x) + 4; k++) {
      try {
        const y = Math.abs(f(k));
        if (y < bestY) {
          bestY = y;
          best = k;
        }
      } catch {
        /* skip */
      }
    }
    return bestY < 1e-4 ? best : x;
  }

  function classifyCriticalKind(x, f, derivFn, opensUp = null) {
    const h = 1e-4;
    let dLeft = NaN;
    let dRight = NaN;
    try {
      dLeft = derivFn ? derivFn(x - h) : NaN;
    } catch {
      dLeft = NaN;
    }
    try {
      dRight = derivFn ? derivFn(x + h) : NaN;
    } catch {
      dRight = NaN;
    }
    let y;
    try {
      y = f(x);
    } catch {
      return "驻点";
    }
    if (Math.abs(y) < 1e-3) return "零点";
    if (!Number.isFinite(dLeft) || !Number.isFinite(dRight)) return "折点";
    if (Math.abs(dLeft - dRight) > 0.35) return "折点";
    if (dLeft > 1e-3 && dRight < -1e-3) return "极大值点";
    if (dLeft < -1e-3 && dRight > 1e-3) return "极小值点";
    if (opensUp !== null) return opensUp ? "极小值点" : "极大值点";
    return "驻点";
  }

  /** |ax+b|：折点 x₀ = −b/a，小视图与宽视图均精确分段 */
  function analyzeAbsLinear(inner, xMin, xMax, f, derivFn) {
    const lin = collectLinearCoeffs(simplifyAst(inner));
    if (!lin || Math.abs(lin.m) < EPS) return null;
    const r = -lin.b / lin.m;
    const xs = r >= xMin - EPS && r <= xMax + EPS ? [r] : [];
    const { intervals, criticalPoints } = analyzeFromCriticalPoints(xs, null, xMin, xMax, f, derivFn);
    return { intervals, criticalPoints: refineCriticalPointsList(criticalPoints, f, derivFn) };
  }

  function analyzeAbsQuadratic(inner, xMin, xMax, f, derivFn) {
    const { a, b, c } = collectQuadraticCoeffs(inner) || {};
    if (!a || Math.abs(a) < EPS) return null;
    const roots = solveQuadratic(a, b, c);
    const vx = -b / (2 * a);
    const gvx = a * vx * vx + b * vx + c;
    const xs = [...roots];
    if (!roots.some((r) => Math.abs(r - vx) < 1e-8)) xs.push(vx);
    xs.sort((a, b) => a - b);
    const criticalPoints = [];
    for (const x of roots) {
      if (x < xMin - EPS || x > xMax + EPS) continue;
      criticalPoints.push({ x, y: 0, kind: "零点" });
    }
    if (vx >= xMin - EPS && vx <= xMax + EPS && gvx < -EPS) {
      criticalPoints.push({ x: vx, y: -gvx, kind: "极大值点" });
    } else if (vx >= xMin - EPS && vx <= xMax + EPS && gvx > EPS) {
      criticalPoints.push({ x: vx, y: gvx, kind: "极小值点" });
    }
    const { intervals } = analyzeFromCriticalPoints(xs, null, xMin, xMax, f, derivFn);
    return { intervals, criticalPoints };
  }

  function analyzeSqrtQuadratic(inner, xMin, xMax, f, derivFn) {
    const coeffs = collectQuadraticCoeffs(inner);
    if (!coeffs || Math.abs(coeffs.a) < EPS) return null;
    const { a, b } = coeffs;
    const vx = -b / (2 * a);
    const xs = [vx].filter((x) => x > xMin + EPS && x < xMax - EPS && isFiniteAt(f, x));
    if (!xs.length) return null;
    const { intervals, criticalPoints } = analyzeFromCriticalPoints(xs, null, xMin, xMax, f, derivFn);
    return { intervals, criticalPoints: refineCriticalPointsList(criticalPoints, f, derivFn) };
  }

  function analyzeCustomExpr(expr, xMin, xMax, f, derivFn) {
    try {
      const ast = simplifyAst(parseExpression(expr));
      if (ast.type === "call" && ast.name === "abs") {
        const inner = simplifyAst(ast.arg);
        const absLin = analyzeAbsLinear(inner, xMin, xMax, f, derivFn);
        if (absLin) return absLin;
        const absResult = analyzeAbsQuadratic(inner, xMin, xMax, f, derivFn);
        if (absResult) return absResult;
      }
      if (ast.type === "call" && ast.name === "sqrt") {
        const sqrtResult = analyzeSqrtQuadratic(ast.arg, xMin, xMax, f, derivFn);
        if (sqrtResult) return sqrtResult;
      }
    } catch {
      /* fallback */
    }
    return null;
  }

  function refineCriticalPointsList(points, f, derivFn) {
    const seen = new Set();
    const out = [];
    for (const pt of points) {
      const x = snapNearRoot(pt.x, f);
      const key = x.toFixed(6);
      if (seen.has(key)) continue;
      seen.add(key);
      let y;
      try {
        y = f(x);
      } catch {
        continue;
      }
      if (!Number.isFinite(y)) continue;
      const kind = pt.kind || classifyCriticalKind(x, f, derivFn);
      out.push({ x, y, kind });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  function analyzeFromCriticalPoints(crits, opensUp, xMin, xMax, f, derivFn) {
    const points = crits.filter((x) => x > xMin - EPS && x < xMax + EPS).sort((a, b) => a - b);
    const bounds = [xMin, ...points, xMax];
    const intervals = [];
    const criticalPoints = [];

    for (const x of points) {
      if (!Number.isFinite(f(x))) continue;
      const sx = snapNearRoot(x, f);
      const kind = classifyCriticalKind(sx, f, derivFn, opensUp);
      criticalPoints.push({ x: sx, y: f(sx), kind });
    }

    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i];
      const to = bounds[i + 1];
      if (to - from < EPS) continue;
      const mid = (from + to) / 2;
      let d;
      try {
        d = derivFn ? derivFn(mid) : numericalDerivative(f, mid);
      } catch {
        continue;
      }
      if (!Number.isFinite(d)) continue;
      let type, label;
      if (Math.abs(d) < 1e-4) type = "const";
      else if (d > 0) type = "inc";
      else type = "dec";
      const names = { inc: "单调递增", dec: "单调递减", const: "单调不变" };
      intervals.push({ type, from, to, label: `在 (${fmtInterval(from, to)}) 上${names[type]}` });
    }

    return { intervals, criticalPoints };
  }

  function numericalDerivative(f, x, h = 1e-5) {
    const y1 = f(x + h);
    const y2 = f(x - h);
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return NaN;
    return (y1 - y2) / (2 * h);
  }

  const MAX_MONOTONE_INTERVALS_UI = 14;
  const MAX_CRITICAL_POINTS_UI = 28;
  const HIGH_FREQUENCY_CRITICAL_THRESHOLD = 22;

  function pickCriticalPointsForDisplay(points, xMin, xMax, maxCount) {
    if (!points?.length) return [];
    const vis = points
      .filter((p) => p.x >= xMin - EPS && p.x <= xMax + EPS && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    if (vis.length <= maxCount) return vis;
    const rank = (kind) =>
      kind === "极大值点" || kind === "极小值点" ? 0 : kind === "零点" || kind === "折点" ? 1 : 2;
    const sorted = [...vis].sort((a, b) => rank(a.kind) - rank(b.kind) || a.x - b.x);
    const chosen = [];
    const step = sorted.length / maxCount;
    for (let i = 0; i < maxCount; i++) {
      const idx = Math.min(sorted.length - 1, Math.round(i * step + step / 2 - 0.5));
      const pt = sorted[idx];
      if (!chosen.some((c) => Math.abs(c.x - pt.x) < 1e-4)) chosen.push(pt);
    }
    return chosen.sort((a, b) => a.x - b.x);
  }

  /** 高频振荡时压缩单调区间/驻点，避免 UI 与画布过载 */
  function compressAnalysisPresentation(analysis, xMin, xMax) {
    const intervals = (analysis.intervals || []).filter((iv) => iv.to > xMin + EPS && iv.from < xMax - EPS);
    const criticalPoints = analysis.criticalPoints || [];
    const critN = criticalPoints.length;

    if (critN > HIGH_FREQUENCY_CRITICAL_THRESHOLD || intervals.length > MAX_MONOTONE_INTERVALS_UI * 4) {
      return {
        intervals: [
          {
            type: "osc",
            from: xMin,
            to: xMax,
            label: `在 (${fmtInterval(xMin, xMax)}) 上导数频繁变号（高频振荡，约 ${critN} 个驻点）；请缩小 x 区间查看分段单调性`,
          },
        ],
        criticalPoints: pickCriticalPointsForDisplay(criticalPoints, xMin, xMax, Math.min(18, MAX_CRITICAL_POINTS_UI)),
        highFrequency: true,
        analysisNote: `当前视图驻点过多，已隐藏逐段红绿底纹；图像仅保留少量标注点。`,
      };
    }

    let note = null;
    let shown = intervals;
    if (intervals.length > MAX_MONOTONE_INTERVALS_UI) {
      shown = intervals.slice(0, MAX_MONOTONE_INTERVALS_UI);
      note = `共 ${intervals.length} 个单调区间，以下仅列前 ${MAX_MONOTONE_INTERVALS_UI} 段。`;
    }

    return {
      intervals: shown,
      criticalPoints: pickCriticalPointsForDisplay(criticalPoints, xMin, xMax, MAX_CRITICAL_POINTS_UI),
      highFrequency: false,
      analysisNote: note,
    };
  }

  function numericalAnalyze(f, xMin, xMax, derivFn) {
    const dFn = derivFn || ((x) => numericalDerivative(f, x));
    const span = Math.max(xMax - xMin, 1e-6);
    const n = Math.min(6000, Math.max(1200, Math.ceil(span * 100)));
    const step = span / n;
    const crits = [];
    let prevD = null;

    for (let i = 0; i <= n; i++) {
      const x = xMin + i * step;
      let d;
      try {
        d = dFn(x);
      } catch {
        prevD = null;
        continue;
      }
      if (!Number.isFinite(d)) {
        prevD = null;
        continue;
      }
      if (prevD !== null) {
        if (prevD * d < 0) crits.push(x - step / 2);
        else if (Math.abs(d) < 1e-5 && Math.abs(prevD) > 1e-4) crits.push(x - step / 2);
      }
      if (Math.abs(d) >= 1e-5) prevD = d;
    }

    const merged = [];
    crits.sort((a, b) => a - b);
    for (const x of crits) {
      if (!merged.length || Math.abs(x - merged[merged.length - 1]) > step * 2) merged.push(x);
    }

    const result = analyzeFromCriticalPoints(merged, null, xMin, xMax, f, dFn);
    result.criticalPoints = refineCriticalPointsList(result.criticalPoints, f, dFn);
    return compressAnalysisPresentation(result, xMin, xMax);
  }

  function analyzeCustomOnInterval(expr, xMin, xMax, f, derivFn) {
    const structured = analyzeCustomExpr(expr, xMin, xMax, f, derivFn);
    if (structured) return structured;
    return numericalAnalyze(f, xMin, xMax, derivFn);
  }

  function analyzeCustomFunction(expr, xMin, xMax, f, derivFn) {
    const pieces = splitDefinedIntervals(expr, xMin, xMax, f);
    if (pieces.length === 1 && pieces[0][0] <= xMin + 1e-6 && pieces[0][1] >= xMax - 1e-6) {
      return analyzeCustomOnInterval(expr, xMin, xMax, f, derivFn);
    }

    const intervals = [];
    const criticalPoints = [];
    const seenCrit = new Set();
    for (const [a, b] of pieces) {
      if (b - a < 1e-3) continue;
      const part = analyzeCustomOnInterval(expr, a, b, f, derivFn);
      intervals.push(...part.intervals);
      for (const pt of part.criticalPoints || []) {
        const key = pt.x.toFixed(6);
        if (seenCrit.has(key)) continue;
        seenCrit.add(key);
        criticalPoints.push(pt);
      }
    }
    const merged = { intervals, criticalPoints: criticalPoints.sort((p, q) => p.x - q.x) };
    return compressAnalysisPresentation(merged, xMin, xMax);
  }

  function fmtInterval(a, b) {
  const fa = !Number.isFinite(a) ? "−∞" : fmtNum(a);
  const fb = !Number.isFinite(b) ? "+∞" : fmtNum(b);
  return `${fa}, ${fb}`;
  }

  function describeRate(d) {
    if (!Number.isFinite(d)) return { level: "unknown", label: "不在定义域或未定义", abs: NaN };
    const abs = Math.abs(d);
    if (abs < 1e-4) return { level: "flat", label: "几乎不变", abs: 0 };
    const direction = d > 0 ? "递增" : "递减";
    let speed;
    if (abs < 0.5) speed = "缓慢";
    else if (abs < 2) speed = "适中";
    else speed = "快速";
    return { level: speed, label: `${speed}${direction}`, abs, direction, sign: d };
  }

  function analyzeRate(deriv, xMin, xMax, samples = 80) {
    const points = [];
    let maxAbs = 0;
    const step = (xMax - xMin) / samples;
    for (let i = 0; i <= samples; i++) {
      const x = xMin + i * step;
      let d;
      try {
        d = typeof deriv === "function" ? deriv(x) : deriv;
      } catch {
        continue;
      }
      if (!Number.isFinite(d)) continue;
      maxAbs = Math.max(maxAbs, Math.abs(d));
      points.push({ x, d, rate: describeRate(d) });
    }
    return { points, maxAbs: maxAbs || 1 };
  }

  function rateAt(deriv, x) {
    let d;
    try {
      d = typeof deriv === "function" ? deriv(x) : deriv;
    } catch {
      return describeRate(NaN);
    }
    return describeRate(d);
  }

  function getDragHandles(type, coeffs) {
    const c = { ...coeffs };
    const handles = [];

    function add(id, x, y, label, apply) {
      handles.push({ id, x, y, label, apply });
    }

    switch (type) {
      case "linear": {
        const y0 = c.a * 0 + c.b;
        const y1 = c.a * 1 + c.b;
        add("intercept", 0, y0, "截距 b", (nx, ny) => {
          const b = ny;
          return { ...c, b };
        });
        add("slope", 1, y1, "斜率点", (nx, ny) => {
          const a = ny - c.b;
          return { ...c, a };
        });
        break;
      }
      case "quadratic": {
        if (Math.abs(c.a) >= EPS) {
          const xv = -c.b / (2 * c.a);
          const yv = c.a * xv * xv + c.b * xv + c.c;
          add("vertex", xv, yv, "顶点", (nx, ny) => {
            const a = c.a;
            const b = -2 * a * nx;
            const cc = a * nx * nx + ny;
            return { a, b, c: cc };
          });
        }
        add("intercept", 0, c.c, "截距 c", (_, ny) => ({ ...c, c: ny }));
        add("shape", 2, c.a * 4 + c.b * 2 + c.c, "开口", (nx, ny) => {
          const xRef = Math.abs(nx) < 0.5 ? 2 : nx;
          const a = (ny - c.b * xRef - c.c) / (xRef * xRef);
          return { a, b: c.b, c: c.c };
        });
        break;
      }
      case "cubic": {
        add("intercept", 0, c.d, "截距 d", (_, ny) => ({ ...c, d: ny }));
        if (Math.abs(c.a) >= EPS) {
          const xv = (-2 * c.b + Math.sqrt(Math.max(0, 4 * c.b * c.b - 12 * c.a * c.c))) / (6 * c.a);
          if (Number.isFinite(xv)) {
            const yv = c.a * xv ** 3 + c.b * xv ** 2 + c.c * xv + c.d;
            add("inflect", xv, yv, "拐点", (nx, ny) => {
              const shift = ny - (c.a * nx ** 3 + c.b * nx ** 2 + c.c * nx + c.d);
              return { ...c, d: c.d + shift };
            });
          }
        }
        add("shape", 1, c.a + c.b + c.c + c.d, "形状点", (nx, ny) => {
          const shift = ny - (c.a * nx ** 3 + c.b * nx ** 2 + c.c * nx + c.d);
          return { ...c, d: c.d + shift };
        });
        break;
      }
      case "exponential": {
        add("base", 0, c.a * Math.exp(0) + c.c, "起点", (_, ny) => ({ ...c, a: ny - c.c }));
        add("growth", 1, c.a * Math.exp(c.b) + c.c, "增长", (nx, ny) => {
          const inner = ny - c.c;
          if (Math.abs(c.a) < EPS || inner / c.a <= 0) return c;
          const b = Math.log(inner / c.a) / nx;
          return { ...c, b: Number.isFinite(b) ? b : c.b };
        });
        break;
      }
      case "logarithmic": {
        add("anchor", 1, c.b, "过 (1, b)", (_, ny) => ({ ...c, b: ny }));
        add("scale", Math.E, c.a * Math.log(Math.E) + c.b, "缩放", (nx, ny) => {
          if (nx <= 0) return c;
          const a = (ny - c.b) / Math.log(nx);
          return { ...c, a };
        });
        break;
      }
      case "power": {
        add("scale", 1, c.a, "系数 a", (_, ny) => ({ ...c, a: ny }));
        add("shape", 2, c.a * Math.pow(2, c.n), "幂次参考", (nx, ny) => {
          if (Math.abs(nx) < EPS || ny / c.a <= 0) return c;
          const n = Math.log(ny / c.a) / Math.log(Math.abs(nx));
          return { ...c, n: Number.isFinite(n) ? n : c.n };
        });
        break;
      }
      default:
        break;
    }
    return handles;
  }

  function fitConstantTerm(type, coeffs, x, y) {
    const c = { ...coeffs };
    switch (type) {
      case "linear":
        return { ...c, b: y - c.a * x };
      case "quadratic":
        return { ...c, c: y - c.a * x * x - c.b * x };
      case "cubic":
        return { ...c, d: y - c.a * x ** 3 - c.b * x ** 2 - c.c * x };
      case "exponential":
        return { ...c, c: y - c.a * Math.exp(c.b * x) };
      case "logarithmic":
        if (x <= 0) return c;
        return { ...c, b: y - c.a * Math.log(x) };
      case "power":
        return c;
      default:
        return c;
    }
  }

  /** 复合函数例题（知乎「复合函数单调性」+ 常见题型） */
  const COMPOSITE_FUNCTION_EXAMPLES = [
    { group: "例子", label: "√(x²−1)", expr: "sqrt(x**2-1)", note: "x≤−1 减，x≥1 增" },
    {
      group: "例子",
      label: "|f(x)−3|",
      expr: "abs((-x+6)-3)",
      note: "f(x)=−x+6，f(3)=3；(−∞,3]减 [3,∞)增",
    },
    { group: "例子", label: "|x²−2x−3|", expr: "abs(x**2-2*x-3)", note: "四段单调区间" },
    { group: "例子", label: "1/(x(x−1))", expr: "1/(x*(x-1))", note: "x≠0,1；同增异减" },
    {
      group: "例子",
      label: "1/√(2x²−5x−42)",
      expr: "1/sqrt(2*x**2-5*x-42)",
      note: "先求内式>0 的定义域",
    },
    { group: "例子", label: "1/(x²+2x+3)", expr: "1/(x**2+2*x+3)", note: "分母恒正，整体递减" },
    { group: "例子", label: "√(3−2x−x²)", expr: "sqrt(3-2*x-x**2)", note: "定义域约 [−3,1]" },
    {
      group: "例子",
      label: "f(2−x²)",
      expr: "8+2*(2-x**2)-(2-x**2)**2",
      note: "f(x)=8+2x−x²，g(x)=f(2−x²)",
    },
    { group: "常见", label: "sin(x²)", expr: "sin(x**2)", note: "三角 ∘ 幂函数" },
    { group: "常见", label: "e^(√x)", expr: "exp(sqrt(x))", note: "指数 ∘ 根式" },
    { group: "常见", label: "ln(x²+1)", expr: "ln(x**2+1)", note: "对数 ∘ 多项式" },
    { group: "常见", label: "sin(ln x)", expr: "sin(ln(x))", note: "x>0" },
    { group: "常见", label: "√(1/(x−1))", expr: "sqrt(1/(x-1))", note: "x>1" },
    { group: "常见", label: "sin(cos x)", expr: "sin(cos(x))", note: "三角嵌套" },
  ];

  return {
    COEFF_DEFS,
    COMPOSITE_FUNCTION_EXAMPLES,
    fmtNum,
    fmtNumForCritical,
    fmtNumLatexForCritical,
    formatCriticalPointPlain,
    formatCriticalPointLatex,
    formatCriticalPointsLatex,
    fmtCoeffInput,
    parseNumberInput,
    isPartialNumberInput,
    parseDomainBound,
    isPartialDomainInput,
    formatDomain,
    formatDomainLabel,
    resolveEffectiveDomain,
    analysisRange,
    restrictToDomain,
    isInDomain,
    symbolicDerivativeExpr,
    symbolicDerivativeResult,
    formatDerivativeResult,
    formatDerivativeLatex,
    formatCustomFormula,
    formatCustomFormulaLatex,
    symbolicDerivativeLatex,
    buildFunction,
    describeRate,
    analyzeRate,
    rateAt,
    getDragHandles,
    fitConstantTerm,
  };
})();
