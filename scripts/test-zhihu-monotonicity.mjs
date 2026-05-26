/**
 * 知乎「复合函数单调性」例题 — 单调区间与文章结论对照
 * 运行: node scripts/test-zhihu-monotonicity.mjs
 */
import { readFileSync } from "fs";
import { runInThisContext } from "vm";

const code = readFileSync("js/math-engine.js", "utf8") + "\nglobalThis.MathEngine = MathEngine;\n";
runInThisContext(code);

function signAt(f, deriv, x) {
  let d;
  try {
    d = deriv(x);
  } catch {
    d = NaN;
  }
  if (!Number.isFinite(d)) return null;
  if (d > 1e-3) return "inc";
  if (d < -1e-3) return "dec";
  return "const";
}

function checkIntervals(expr, xMin, xMax, expected) {
  const spec = MathEngine.buildFunction("custom", {}, expr);
  const analysis = spec.analyze(xMin, xMax);
  const fails = [];
  for (const exp of expected) {
    const mid = (exp.from + exp.to) / 2;
    let got = null;
    for (const iv of analysis.intervals || []) {
      if (mid >= iv.from - 1e-3 && mid <= iv.to + 1e-3) {
        got = iv.type;
        break;
      }
    }
    if (!got) {
      got = signAt(spec.f, spec.derivative, mid);
    }
    if (got !== exp.type) {
      fails.push({ mid, want: exp.type, got });
    }
  }
  return { fails, intervals: analysis.intervals };
}

const CASES = [
  {
    name: "例1 √(x²−1)",
    expr: "sqrt(x**2-1)",
    xMin: -5,
    xMax: 5,
    expected: [
      { from: -4, to: -1.1, type: "dec" },
      { from: 1.1, to: 4, type: "inc" },
    ],
  },
  {
    name: "例3① |x²−2x−3|",
    expr: "abs(x**2-2*x-3)",
    xMin: -4,
    xMax: 6,
    expected: [
      { from: -4, to: -1, type: "dec" },
      { from: -1, to: 1, type: "inc" },
      { from: 1, to: 3, type: "dec" },
      { from: 3, to: 6, type: "inc" },
    ],
  },
  {
    name: "例3② 1/(x(x−1))",
    expr: "1/(x*(x-1))",
    xMin: -3,
    xMax: 4,
    expected: [
      { from: -2.5, to: -0.1, type: "inc" },
      { from: 0.1, to: 0.4, type: "inc" },
      { from: 0.6, to: 0.9, type: "dec" },
      { from: 1.1, to: 3.5, type: "dec" },
    ],
  },
  {
    name: "作业1② √(3−2x−x²)",
    expr: "sqrt(3-2*x-x**2)",
    xMin: -3,
    xMax: 1,
    expected: [
      { from: -2.8, to: -1.1, type: "inc" },
      { from: -0.9, to: 0.9, type: "dec" },
    ],
  },
  {
    name: "例2 |f(x)−3|，f=−x+6",
    expr: "abs((-x+6)-3)",
    xMin: -8,
    xMax: 10,
    expected: [
      { from: -7, to: 2.9, type: "dec" },
      { from: 3.1, to: 9, type: "inc" },
    ],
  },
  {
    name: "作业1① 1/(x²+2x+3)",
    expr: "1/(x**2+2*x+3)",
    xMin: -5,
    xMax: 5,
    expected: [{ from: -4, to: 4, type: "dec" }],
  },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const { fails, intervals } = checkIntervals(c.expr, c.xMin, c.xMax, c.expected);
  if (!fails.length) {
    console.log("OK", c.name);
    pass++;
  } else {
    console.log("FAIL", c.name);
    for (const f of fails) console.log("  mid", f.mid, "want", f.want, "got", f.got);
    console.log(
      "  intervals:",
      intervals?.map((iv) => `${iv.type}[${iv.from.toFixed(2)},${iv.to.toFixed(2)}]`).join(" ")
    );
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
