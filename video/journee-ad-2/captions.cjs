// Renders the Hebrew b-roll captions (c1..c3) with headless Chromium so RTL shaping/bidi is correct.
// Usage: G=$(npm root -g) node captions.cjs   (writes into ./assets)
const { chromium } = require(`${process.env.G ?? "."}/playwright`);

const CAPTIONS = {
  c1: "מתכננים טיול?",
  c2: "ראיתם סרטון<br>בטיקטוק?",
  c3: "חבר שלח<br>רשימת המלצות?",
};

const HTML = `<html dir=rtl><head>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;800&display=block" rel="stylesheet">
<style>
  html,body{margin:0;background:transparent}
  #c{width:1000px;height:300px;display:flex;align-items:center;justify-content:center;text-align:center;
     font-family:Heebo,sans-serif;font-weight:800;font-size:84px;line-height:1.12;color:#fff;letter-spacing:-1px;
     text-shadow:0 4px 24px rgba(0,0,0,.65),0 2px 6px rgba(0,0,0,.5)}
</style></head><body><div id=c></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 300 } });
    await page.setContent(HTML, { waitUntil: "networkidle" });
    // Heebo's Hebrew glyphs are a separate unicode-range subset: load it explicitly with Hebrew sample text.
    await page.evaluate(async () => {
      await document.fonts.load("800 84px Heebo", "מתכננים טיול");
      await document.fonts.ready;
    });
    if (!(await page.evaluate(() => document.fonts.check("800 84px Heebo", "מתכננים")))) {
      throw new Error("Heebo failed to load; captions would fall back to a system font");
    }
    for (const [name, html] of Object.entries(CAPTIONS)) {
      await page.evaluate((h) => { document.getElementById("c").innerHTML = h; }, html);
      await page.locator("#c").screenshot({ path: `assets/${name}.png`, omitBackground: true });
    }
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exit(1); });
