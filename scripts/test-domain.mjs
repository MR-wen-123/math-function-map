/**
 * 自定义表达式定义域显示
 * 运行: node scripts/test-domain.mjs
 */
import { readFileSync } from "fs";
import { runInThisContext } from "vm";

const code = readFileSync("js/math-engine.js", "utf8") + "\nglobalThis.MathEngine = MathEngine;\n";
runInThisContext(code);

const CASES = [
  { expr: "sqrt(x**2-1)", expect: /−∞, -1\].*\[1, \+∞\)/ },
  { expr: "sqrt(3-2*x-x**2)", expect: /\[-3, 1\]/ },
  { expr: "ln(x)", expect: /\(0, \+∞\)/ },
  { expr: "1/(x*(x-1))", expect: /0.*1/ },
];

let pass = 0;
let fail = 0;

for (const c of CASES) {
  const label = MathEngine.formatDomainLabel(MathEngine.buildFunction("custom", {}, c.expr).domain());
  if (c.expect.test(label)) {
    console.log("OK", c.expr, "→", label);
    pass++;
  } else {
    console.log("FAIL", c.expr, "→", label);
    fail++;
  }
}

const dom = MathEngine.buildFunction("custom", {}, "sqrt(x**2-1)").domain();
if (!MathEngine.isInDomain(-0.5, dom) && MathEngine.isInDomain(2, dom)) {
  console.log("OK isInDomain sqrt(x**2-1)");
  pass++;
} else {
  console.log("FAIL isInDomain sqrt(x**2-1)");
  fail++;
}

console.log(`\n${pass} passed, ${fail} failed`);
