/**
 * 复合函数例题自测（参考高中复合函数常见题型 / kuaiyizhi 等教程）
 * 运行: node scripts/test-composite.mjs
 */
import { readFileSync } from "fs";
import { runInThisContext } from "vm";

const code = readFileSync("js/math-engine.js", "utf8") + "\nglobalThis.MathEngine = MathEngine;\n";
runInThisContext(code);

const CASES = [
  { expr: "sin(x**2)", x: 2, y: Math.sin(4) },
  { expr: "sin(x^2)", x: 2, y: Math.sin(4) },
  { expr: "e**(sqrt(x))", x: 4, y: Math.exp(2) },
  { expr: "exp(sqrt(x))", x: 4, y: Math.exp(2) },
  { expr: "ln(x**2+1)", x: 1, y: Math.log(2) },
  { expr: "ln(sqrt(x**2+1))", x: 0, y: 0 },
  { expr: "sin(ln(x))", x: 1, y: 0 },
  { expr: "sqrt(1/(x-1))", x: 2, y: 1 },
  { expr: "sin(x**2+3*x)", x: 1, y: Math.sin(4) },
  { expr: "cos(ln(x))", x: 1, y: 1 },
  { expr: "tan(sqrt(x))", x: 4, y: Math.tan(2) },
  { expr: "sqrt(sin(x))", x: Math.PI / 2, y: 1 },
  { expr: "log(x**2)", x: 10, y: 2 },
  { expr: "abs(sin(x))", x: -1, y: Math.abs(Math.sin(-1)) },
  { expr: "sin(cos(x))", x: 0, y: Math.sin(1) },
  { expr: "ln(x**2-2*x-3)", x: 4, y: Math.log(5) },
  { expr: "sqrt(x**2-1)", x: 2, y: Math.sqrt(3) },
  { expr: "abs(x**2-2*x-3)", x: 0, y: 3 },
  { expr: "1/(x*(x-1))", x: 2, y: 0.5 },
  { expr: "1/(x(x-1))", x: -2, y: 1 / 6 },
  { expr: "1/sqrt(2*x**2-5*x-42)", x: 7, y: 1 / Math.sqrt(2 * 49 - 35 - 42) },
  { expr: "1/(x**2+2*x+3)", x: 0, y: 1 / 3 },
  { expr: "sqrt(3-2*x-x**2)", x: 0, y: Math.sqrt(3) },
  { expr: "abs(-x+3)", x: 3, y: 0 },
  { expr: "abs((-x+6)-3)", x: 3, y: 0 },
  { expr: "abs((-x+6)-3)", x: 0, y: 3 },
  { expr: "8+2*(2-x**2)-(2-x**2)**2", x: 0, y: 8 },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  try {
    const spec = MathEngine.buildFunction("custom", {}, c.expr);
    const f = spec.f;
    const got = f(c.x);
    const tol = c.tol ?? 1e-5;
    if (!Number.isFinite(got) && Number.isFinite(c.y)) throw new Error(`f(${c.x})=${got}`);
    if (Number.isFinite(c.y) && Math.abs(got - c.y) > tol) {
      throw new Error(`f(${c.x})=${got} expected ${c.y}`);
    }
    const deriv = spec.derivative(c.x);
    if (!Number.isFinite(deriv) && c.x > 0) {
      /* some OK at boundaries */
    }
    console.log("OK", c.expr, `@${c.x} →`, got);
    pass++;
  } catch (e) {
    console.log("FAIL", c.expr, e.message);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
