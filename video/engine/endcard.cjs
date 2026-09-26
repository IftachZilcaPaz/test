// Renders a branded end card (PNG, full frame) in headless Chromium, for apps without a CTA screen.
// Usage: node endcard.cjs <endcard.json> <out.png>
// endcard.json: { width, height, brand: {font, headingFont, dir, accent, cardBackground, cardText, cardMuted},
//                 card: { title, url, wordmark?, badge?, subtitle?, button? } }
// All text is inserted with textContent (never innerHTML), so spec text can't inject markup.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const PLAYWRIGHT = path.join(execSync("npm root -g").toString().trim(), "playwright");
const { chromium } = require(PLAYWRIGHT);

const [, , cfgPath, outPath] = process.argv;
if (!cfgPath || !outPath) {
  console.error("usage: node endcard.cjs <endcard.json> <out.png>");
  process.exit(2);
}
const { width, height, brand, card } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const body = brand.font ?? "Heebo";
const heading = brand.headingFont || body;
const family = (f, w) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${w}`;
const fontUrl = `https://fonts.googleapis.com/css2?${[...new Set([family(body, "500;800"), family(heading, "700")])].join("&")}&display=block`;
const css = (v) => String(v).replace(/[^#(),.%\w\s-]/g, ""); // colors only: no quotes/semicolons

const HTML = `<html dir="${brand.dir === "ltr" ? "ltr" : "rtl"}"><head>
<link href="${fontUrl}" rel="stylesheet">
<style>
  html,body{margin:0}
  #c{width:${width}px;height:${height}px;box-sizing:border-box;padding:0 90px;display:flex;flex-direction:column;
     align-items:center;justify-content:center;text-align:center;gap:0;font-family:'${body}',sans-serif;
     color:${css(brand.cardText)};background:${css(brand.cardBackground)};position:relative;overflow:hidden}
  #glow{position:absolute;inset:-20%;background:radial-gradient(closest-side at 50% 42%,${css(brand.accent)}38,transparent 70%)}
  #c>*{position:relative}
  #mark{display:flex;align-items:center;gap:14px;direction:ltr;font-weight:800;font-size:96px;letter-spacing:-2px;margin-bottom:110px}
  #badge{background:${css(brand.accent)};color:#fff;border-radius:22px;padding:0 20px 8px;line-height:1.05}
  #title{font-family:'${heading}',serif;font-weight:700;font-size:104px;text-wrap:balance;line-height:1.08;margin:0 0 44px}
  #sub{font-weight:500;font-size:50px;text-wrap:balance;line-height:1.3;color:${css(brand.cardMuted)};margin:0 0 110px}
  #btn{background:${css(brand.accent)};color:#fff;font-weight:800;font-size:60px;border-radius:999px;padding:34px 96px;
       box-shadow:0 24px 60px ${css(brand.accent)}55}
  #url{direction:ltr;font-weight:800;font-size:64px;color:${css(brand.accent)};margin-top:56px;letter-spacing:1px}
</style></head><body><div id="c"><div id="glow"></div></div></body></html>`;

(async () => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(HTML, { waitUntil: "networkidle" });
    await page.evaluate((card) => {
      const c = document.getElementById("c");
      const add = (id, text, parent = c) => {
        const el = document.createElement("div");
        el.id = id;
        text.split("\n").forEach((line, i) => {
          if (i) el.appendChild(document.createElement("br"));
          el.appendChild(document.createTextNode(line));
        });
        parent.appendChild(el);
        return el;
      };
      if (card.wordmark) {
        const mark = add("mark", "");
        mark.appendChild(document.createTextNode(card.wordmark));
        if (card.badge) add("badge", card.badge, mark);
      }
      add("title", card.title);
      if (card.subtitle) add("sub", card.subtitle);
      if (card.button) add("btn", card.button);
      add("url", card.url);
    }, card);
    const sample = [card.wordmark, card.badge, card.title, card.subtitle, card.button, card.url].filter(Boolean).join(" ");
    const ok = await page.evaluate(async ({ b, h, s }) => {
      await Promise.all([document.fonts.load(`800 60px '${b}'`, s), document.fonts.load(`500 54px '${b}'`, s),
                         document.fonts.load(`700 104px '${h}'`, s)]);
      await document.fonts.ready;
      return document.fonts.check(`800 60px '${b}'`, s) && document.fonts.check(`700 104px '${h}'`, s);
    }, { b: body, h: heading, s: sample });
    if (!ok) throw new Error(`fonts '${body}'/'${heading}' failed to load; the card would use a system font`);
    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exit(1); });
