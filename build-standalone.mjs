import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadInlineKatex } from "./scripts/inline-katex.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const math = fs.readFileSync(path.join(root, "js", "math-engine.js"), "utf8");
const plot = fs.readFileSync(path.join(root, "js", "plotter.js"), "utf8");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");

const katex = loadInlineKatex(root);
if (!katex) {
  console.error("缺少 vendor/katex，请先运行: npm run vendor");
  process.exit(1);
}

const note = "  <!-- 单文件版：用浏览器直接打开本文件即可，无需服务器；KaTeX 已内嵌 -->\n";

let out = html
  .replace(/<link rel="stylesheet" href="css\/style.css" \/>/, "")
  .replace(
    /<link[\s\S]*?katex\.min\.css"[\s\S]*?\/>/,
    ""
  )
  .replace(
    /<script[\s\S]*?katex\.min\.js"[\s\S]*?><\/script>\s*/i,
    ""
  )
  .replace(
    /<script src="js\/math-engine.js"><\/script>\s*<script src="js\/plotter.js"><\/script>\s*<script src="js\/app.js"><\/script>/,
    ""
  )
  .replace(
    "输入系数或方程，拖动控制点改参数；对比 f 与 g；图像支持滚轮缩放、拖拽平移。",
    "单文件版 · 用浏览器直接打开即可使用。输入系数或方程，拖动控制点改参数；对比 f 与 g，查看增减快慢；图像支持滚轮缩放、拖拽平移。"
  )
  .replace("<head>", `<head>\n${note}`)
  .replace(
    "</head>",
    `  <style>\n${katex.css}\n</style>\n  <style>\n${css}\n  </style>\n</head>`
  )
  .replace(
    "</body>",
    `  <script>\n${katex.js}\n</script>\n  <script>\n${math}\n</script>\n  <script>\n${plot}\n</script>\n  <script>\n${app}\n</script>\n</body>`
  );

const outPath = path.join(root, "standalone.html");
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote", outPath, "(" + fs.statSync(outPath).size + " bytes)");
