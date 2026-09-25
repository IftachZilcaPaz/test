// Renders the Hebrew caption PNGs (c1..c7) with headless Chromium so RTL shaping/bidi is correct.
// Usage: G=$(npm root -g) node captions.cjs   (writes into ./assets)
const { chromium } = require(`${process.env.G ?? "."}/playwright`);

const CAPTIONS = {
  c1: "מתכננים טיול?",
  c2: "כותבים משפט אחד:<br>לאן ומתי",
  c3: "מסלול מלא,<br>יום אחרי יום",
  c4: "טיסות ומלונות אמיתיים<br><span class=s>במחירים מהשוק</span>",
  c5: "שומרים · עורכים · משתפים",
  c6: "הכול בעברית<br><span class=s>באתר ובוואטסאפ</span>",
  c7: "בואו נתכנן<br>את הטיול הבא",
};

const HTML = `<html dir=rtl><head>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;800&display=block" rel="stylesheet">
<style>
  html,body{margin:0;background:transparent}
  #c{width:1000px;height:300px;display:flex;align-items:center;justify-content:center;text-align:center;
     font-family:Heebo,sans-serif;font-weight:800;font-size:84px;line-height:1.12;color:#fff;letter-spacing:-1px;
     text-shadow:0 4px 24px rgba(0,0,0,.65),0 2px 6px rgba(0,0,0,.5)}
  .s{font-weight:500;font-size:58px;color:#e6e0ff}
</style></head><body><div id=c></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 300 } });
    await page.setContent(HTML, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (!(await page.evaluate(() => document.fonts.check("800 84px Heebo")))) {
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
