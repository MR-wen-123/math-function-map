import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 将 vendor/katex 的 CSS（含字体）与 JS 读入，供 standalone 内联 */
export function loadInlineKatex(rootDir = root) {
  const katexDir = path.join(rootDir, "vendor", "katex");
  const cssPath = path.join(katexDir, "katex.min.css");
  const jsPath = path.join(katexDir, "katex.min.js");
  const fontsDir = path.join(katexDir, "fonts");

  if (!fs.existsSync(cssPath) || !fs.existsSync(jsPath)) {
    return null;
  }

  let css = fs.readFileSync(cssPath, "utf8");
  css = css.replace(/url\(fonts\/([^)]+)\)/g, (_match, fontFile) => {
    const fontPath = path.join(fontsDir, fontFile);
    if (!fs.existsSync(fontPath)) return _match;
    const buf = fs.readFileSync(fontPath);
    const ext = path.extname(fontFile).toLowerCase();
    const mime =
      ext === ".woff2" ? "font/woff2" : ext === ".woff" ? "font/woff" : "font/ttf";
    return `url(data:${mime};base64,${buf.toString("base64")})`;
  });

  const js = fs.readFileSync(jsPath, "utf8");
  return { css, js };
}
