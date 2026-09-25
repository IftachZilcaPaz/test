// Renders caption PNGs (1000×300, transparent) in headless Chromium so RTL shaping/bidi is correct.
// Usage: node captions.cjs <captions.json> <outDir>
// captions.json: { font, color, subColor, dir, items: [{ name, text, sub? }] }. "\n" in text breaks lines.
// Text is inserted with textContent (never innerHTML), so spec text can't inject markup.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const PLAYWRIGHT = path.join(execSync("npm root -g").toString().trim(), "playwright");
const { chromium } = require(PLAYWRIGHT);

const [, , specPath, outDir] = process.argv;
if (!specPath || !outDir) {
  console.error("usage: node captions.cjs <captions.json> <outDir>");
  process.exit(2);
}
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const font = spec.font ?? "Heebo";
const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@500;800&display=block`;

const HTML = `<html dir="${spec.dir === "ltr" ? "ltr" : "rtl"}"><head>
<link href="${fontUrl}" rel="stylesheet">
<style>
  html,body{margin:0;background:transparent}
  #c{width:1000px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;
     text-align:center;font-family:'${font}',sans-serif;font-weight:800;font-size:84px;line-height:1.12;
     color:${spec.color ?? "#ffffff"};letter-spacing:-1px;
     text-shadow:0 4px 24px rgba(0,0,0,.65),0 2px 6px rgba(0,0,0,.5)}
  .s{font-weight:500;font-size:58px;color:${spec.subColor ?? "#e6e0ff"}}
</style></head><body><div id="c"></div></body></html>`;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 300 } });
    await page.setContent(HTML, { waitUntil: "networkidle" });
    // Web fonts ship per-script unicode-range subsets: load them with the real caption text.
    const sample = spec.items.map((i) => `${i.text} ${i.sub ?? ""}`).join(" ");
    const loaded = await page.evaluate(async ({ f, s }) => {
      await document.fonts.load(`800 84px '${f}'`, s);
      await document.fonts.load(`500 58px '${f}'`, s);
      await document.fonts.ready;
      return document.fonts.check(`800 84px '${f}'`, s);
    }, { f: font, s: sample });
    if (!loaded) throw new Error(`font '${font}' failed to load; captions would fall back to a system font`);

    for (const item of spec.items) {
      await page.evaluate(({ text, sub }) => {
        const c = document.getElementById("c");
        c.replaceChildren();
        const main = document.createElement("div");
        text.split("\n").forEach((line, i) => {
          if (i) main.appendChild(document.createElement("br"));
          main.appendChild(document.createTextNode(line));
        });
        c.appendChild(main);
        if (sub) {
          const s = document.createElement("div");
          s.className = "s";
          s.textContent = sub;
          c.appendChild(s);
        }
      }, { text: item.text, sub: item.sub ?? "" });
      await page.locator("#c").screenshot({ path: path.join(outDir, `${item.name}.png`), omitBackground: true });
    }
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exit(1); });
