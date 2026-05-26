import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "node_modules", "katex", "dist");
const dest = path.join(root, "vendor", "katex");

if (!fs.existsSync(src)) {
  console.error("未找到 node_modules/katex，请先运行: npm install");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log("Copied KaTeX to vendor/katex");
