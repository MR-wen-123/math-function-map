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

  /** 将数值格式化为最简分数（分母 ≤ 64），无法表示则返回 null */
  function toSimpleFraction(n) {
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) < EPS) return "0";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (Math.abs(abs - Math.round(abs)) < EPS) return sign + String(Math.round(abs));
    for (let den = 2; den <= 64; den++) {
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
    return formatPolynomialExpression("y", [
      { coef: a, power: 2 },
      { coef: b, power: 1 },
      { coef: cc, power: 0 },
    ]);
  }

  function formatCubic(a, b, cc, d) {
    return formatPolynomialExpression("y", [
      { coef: a, power: 3 },
      { coef: b, power: 2 },
      { coef: cc, power: 1 },
      { coef: d, power: 0 },
    ]);
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

  function normalizeExprInput(expr) {
    let s = expr.trim();
    if (!s) throw new Error("表达式不能为空");
    s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/−/g, "-");
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

    function parseUnary() {
      if (peek() === "-") {
        consume("-");
        return { type: "neg", child: parseUnary() };
      }
      if (peek() === "+") consume("+");
      return parsePower();
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
        if (peek() === "(") {
          consume("(");
          const arg = parseExpr();
          consume(")");
          return { type: "call", name, arg };
        }
        if (name === "pi") return { type: "num", value: Math.PI };
        if (name === "e") return { type: "num", value: Math.E };
        return { type: "var", name };
      }
      throw new Error("表达式语法错误");
    }

    const ast = parseExpr();
    if (pos < tokens.length) throw new Error("表达式语法错误");
    return ast;
  }

  function differentiate(ast, v = "x") {
    const zero = () => ({ type: "num", value: 0 });
    const one = () => ({ type: "num", value: 1 });

    function d(node) {
      switch (node.type) {
        case "num":
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
          if (node.right.type !== "num") return null;
          const n = node.right.value;
          return {
            type: "mul",
            left: { type: "num", value: n },
            right: {
              type: "mul",
              left: { type: "pow", left: node.left, right: { type: "num", value: n - 1 } },
              right: d(node.left),
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
        return node;
      case "neg": {
        const c = simplifyAst(node.child);
        if (!c) return null;
        if (c.type === "num") return { type: "num", value: -c.value };
        if (isZeroNode(c)) return { type: "num", value: 0 };
        if (c.type === "neg") return c.child;
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

  function formatAst(node, parentPrec = 0) {
    if (!node) return "";
    const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };

    switch (node.type) {
      case "num":
        return fmtCoefDisplay(node.value);
      case "var":
        return node.name;
      case "neg": {
        const inner = formatAst(node.child, 4);
        if (isZeroNode(node.child)) return "0";
        return `−${needsParen(node.child, 4) ? `(${inner})` : inner}`;
      }
      case "add": {
        const l = formatAst(node.left, 1);
        const r = formatAst(node.right, 1);
        if (isZeroNode(node.left)) return r;
        if (isZeroNode(node.right)) return l;
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
        const l = formatAst(node.left, 2);
        const r = formatAst(node.right, 2);
        const rWrap = needsParen(node.right, 2) ? `(${r})` : r;
        const lWrap = needsParen(node.left, 2) ? `(${l})` : l;
        if (node.left.type === "num" || node.left.type === "var" || node.left.type === "call") {
          return `${lWrap}${rWrap}`;
        }
        return `${lWrap}·${rWrap}`;
      }
      case "div": {
        if (isZeroNode(node.left)) return "0";
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
          const r = formatAst(node.right, 3);
          den = needsParen(node.right, 3) ? `(${r})` : r;
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

  function astToCompileExpr(node) {
    switch (node.type) {
      case "num":
        return String(node.value);
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
      case "call":
        return `${node.name}(${astToCompileExpr(node.arg)})`;
      default:
        return "0";
    }
  }

  function symbolicDerivativeExpr(expr) {
    try {
      const ast = parseExpression(expr);
      const dAst = simplifyAst(differentiate(ast));
      if (!dAst) return null;
      if (isZeroNode(dAst)) return "0";
      const formatted = formatAst(dAst);
      return formatted || null;
    } catch {
      return null;
    }
  }

  function compileSymbolicDerivative(expr) {
    try {
      const ast = parseExpression(expr);
      const dAst = simplifyAst(differentiate(ast));
      if (!dAst) return null;
      const code = astToCompileExpr(dAst);
      return compileCustom(code);
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

  function compileCustom(expr) {
    const sanitized = sanitizeExpr(expr);
    const fn = new Function(
      "x",
      "sin",
      "cos",
      "tan",
      "sqrt",
      "abs",
      "log",
      "ln",
      "PI",
      "E",
      `
      with (Math) {
        const log10 = (v) => Math.log10(v);
        return (${sanitized});
      }
    `
    );
    return (x) => {
      const y = fn(
        x,
        Math.sin,
        Math.cos,
        Math.tan,
        Math.sqrt,
        Math.abs,
        Math.log10,
        Math.log,
        Math.PI,
        Math.E
      );
      if (!Number.isFinite(y)) throw new Error("定义域外或未定义");
      return y;
    };
  }

  function buildFunction(type, coeffs, customExpr, options = {}) {
    const derivPrefix = options.derivPrefix || "f′(x)";
    const c = coeffs;
    switch (type) {
      case "linear":
        return {
          f: (x) => c.a * x + c.b,
          domain: () => ({ min: -Infinity, max: Infinity }),
          formula: () =>
            formatPolynomialExpression("y", [
              { coef: c.a, power: 1 },
              { coef: c.b, power: 0 },
            ]),
          derivativeFormula: () => `${derivPrefix} = ${fmtCoefDisplay(c.a)}`,
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
          derivativeFormula: () =>
            formatPolynomialExpression(
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
          derivativeFormula: () => {
            const coef = c.a * c.b;
            const exp = Math.abs(c.b - 1) < EPS ? "x" : `${fmtCoefDisplay(c.b)}x`;
            const lead =
              Math.abs(coef - 1) < EPS ? "" : Math.abs(coef + 1) < EPS ? "−" : `${fmtCoefDisplay(coef)}·`;
            return `${derivPrefix} = ${lead || ""}e^(${exp})`;
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
          derivativeFormula: () => {
            const aDisp = fmtCoefDisplay(c.a);
            return `${derivPrefix} = ${aDisp}/x`;
          },
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
          derivativeFormula: () => {
            const coef = c.a * c.n;
            const nStr = fmtCoefDisplay(c.n - 1);
            const lead = Math.abs(coef - 1) < EPS ? "" : `${fmtCoefDisplay(coef)}·`;
            return `${derivPrefix} = ${lead}x^${nStr}`;
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
        const derivSym = symbolicDerivativeExpr(customExpr);
        const derivCompiled = compileSymbolicDerivative(customExpr);
        const derivFn = derivCompiled || ((x) => numericalDerivative(f, x));
        return {
          f,
          domain: () => ({ min: -Infinity, max: Infinity }),
          formula: () => formatCustomFormula(customExpr),
          derivativeFormula: () =>
            derivSym ? `${derivPrefix} = ${derivSym}` : `${derivPrefix} ≈ 数值求导（|x| 等暂不支持符号求导）`,
          derivative: derivFn,
          analyze: (xMin, xMax) => numericalAnalyze(f, xMin, xMax),
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

  function analyzeFromCriticalPoints(crits, opensUp, xMin, xMax, f, derivFn) {
    const points = crits.filter((x) => x > xMin - EPS && x < xMax + EPS).sort((a, b) => a - b);
    const bounds = [xMin, ...points, xMax];
    const intervals = [];
    const criticalPoints = [];

    for (const x of points) {
      if (!Number.isFinite(f(x))) continue;
      const dLeft = derivFn ? derivFn(x - 1e-4) : null;
      const dRight = derivFn ? derivFn(x + 1e-4) : null;
      let kind = "驻点";
      if (dLeft !== null && dRight !== null) {
        if (dLeft > 0 && dRight < 0) kind = "极大值点";
        else if (dLeft < 0 && dRight > 0) kind = "极小值点";
        else kind = "拐点";
      } else if (opensUp !== null) {
        kind = opensUp ? "极小值点" : "极大值点";
      }
      criticalPoints.push({ x, y: f(x), kind });
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

  function numericalAnalyze(f, xMin, xMax) {
    const n = 800;
    const step = (xMax - xMin) / n;
    const crits = [];
    let prevD = null;

    for (let i = 0; i <= n; i++) {
      const x = xMin + i * step;
      let d;
      try {
        d = numericalDerivative(f, x);
      } catch {
        prevD = null;
        continue;
      }
      if (!Number.isFinite(d)) {
        prevD = null;
        continue;
      }
      if (prevD !== null && prevD * d < 0) {
        crits.push((x - step / 2));
      }
      prevD = d;
    }

    return analyzeFromCriticalPoints(crits, null, xMin, xMax, f, (x) => numericalDerivative(f, x));
  }

  function fmtInterval(a, b) {
  const fa = !Number.isFinite(a) ? "−∞" : fmtNum(a);
  const fb = !Number.isFinite(b) ? "+∞" : fmtNum(b);
  return `${fa}, ${fb}`;
  }

  function describeRate(d) {
    if (!Number.isFinite(d)) return { level: "unknown", label: "未定义", abs: NaN };
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

  return {
    COEFF_DEFS,
    fmtNum,
    fmtCoeffInput,
    parseNumberInput,
    isPartialNumberInput,
    symbolicDerivativeExpr,
    formatCustomFormula,
    buildFunction,
    describeRate,
    analyzeRate,
    rateAt,
    getDragHandles,
    fitConstantTerm,
  };
})();
