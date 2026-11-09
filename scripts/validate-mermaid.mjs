// Parses every ```mermaid block in README.md and docs/*.md with the real Mermaid parser
// inside headless Chromium. Exits non-zero on the first invalid diagram.
//   node scripts/validate-mermaid.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const files = ["README.md", ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];
const diagrams = [];
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  for (const m of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) diagrams.push({ file, source: m[1] });
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ path: join(root, "node_modules/mermaid/dist/mermaid.min.js") });
let failed = 0;
for (const d of diagrams) {
  const result = await page.evaluate(async (src) => {
    try {
      window.mermaid.initialize({ startOnLoad: false });
      await window.mermaid.parse(src);
      const { svg } = await window.mermaid.render(`d${Math.random().toString(36).slice(2)}`, src);
      return { ok: svg.includes("<svg") };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }, d.source);
  const head = d.source.trim().split("\n")[0];
  if (result.ok) console.log(`ok   ${d.file} — ${head}`);
  else {
    failed++;
    console.log(`FAIL ${d.file} — ${head}\n     ${result.error}`);
  }
}
await browser.close();
console.log(`\n${diagrams.length - failed}/${diagrams.length} diagrams valid`);
process.exit(failed ? 1 : 0);
