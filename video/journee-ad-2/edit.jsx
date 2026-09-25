// Journee ad #2 — 9:16 Hebrew promo, 29s. Channels (WhatsApp / Instagram / web), TikTok links,
// friend's list, offline documents. Cuts land on ElevenLabs VO word timings (+0.3s lead-in).
// Screens are designed 1080×1920 slides, so they play full-bleed as a carousel; captions only on b-roll.
const W = 1080, H = 1920;
const ASSETS = process.env.ASSETS_DIR ?? `${process.cwd()}/assets`; // absolute path required by p.add()
const SCRIM = { kind: "linear", angle: 90, stops: [
  { offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#000000", opacity: 0.7 } ] };
const capIn = [
  { property: "offsetY", from: 36, to: 0, duration: 0.45, easing: "house" },
  { property: "opacity", from: 0, to: 1, duration: 0.3 } ];

export default async ({ project }) => {
  const p = await project({ dir: "proj", size: `${W}x${H}`, fps: 30, background: "#121418" });
  const a = {};
  for (const n of ["roof.mp4", "nyc.mp4", "thai.mp4",
                   "s6.png", "s7.png", "s8.png", "s9.png", "s10.png", "s11.png", "s12.png", "s13.png", "s14.png",
                   "c1.png", "c2.png", "c3.png"])
    a[n.split(".")[0]] = await p.add(`${ASSETS}/${n}`);

  // Full-bleed cinematic b-roll with a lower-third caption over a bottom scrim.
  const broll = (clip, cap, at, dur, from = 0.3) => p.compose(
    <frame width={W} height={H} layout="none">
      <media file={clip} x={0} y={0} width={W} height={H} fit="cover" trimStart={from} muted
        animate={[{ property: "scale", from: 1.0, to: 1.05, duration: dur, easing: "linear" }]} />
      <rect x={0} y={1100} width={W} height={820} fill={SCRIM} />
      <media file={cap} x={40} y={1400} width={1000} height={300} animate={capIn} />
    </frame>, { at, dur });

  // Designed slide: carousel-style entry from the left (RTL "next"), then a slow settle.
  const slide = (img, at, dur) => p.compose(
    <frame width={W} height={H} layout="none">
      <media file={img} x={0} y={0} width={W} height={H} fit="cover"
        animate={[{ property: "offsetX", from: -160, to: 0, duration: 0.35, easing: "house" },
                  { property: "opacity", from: 0, to: 1, duration: 0.2 },
                  { property: "scale", from: 1.04, to: 1.0, duration: dur, easing: "ease-out" }]} />
    </frame>, { at, dur });

  broll(a.roof, a.c1, 0.00, 1.58);   // מתכננים טיול?
  slide(a.s7,         1.58, 2.20);   // פשוט שולחים הודעה, בוואטסאפ
  slide(a.s8,         3.78, 0.80);   // באינסטגרם
  slide(a.s9,         4.58, 1.82);   // או באתר
  slide(a.s12,        6.40, 3.04);   // משפט אחד — טיסה, מלון ומסלול מלא
  broll(a.nyc,  a.c2, 9.44, 1.94);   // ראיתם סרטון בטיקטוק?
  slide(a.s10,       11.38, 3.58);   // שלחו את הלינק — כל המקומות
  broll(a.thai, a.c3, 14.96, 2.20);  // חבר שלח רשימת המלצות?
  slide(a.s11,       17.16, 2.24);   // מדביקים — ומקבלים מסלול
  slide(a.s13,       19.40, 3.56);   // המסמכים איתכם, גם בלי קליטה
  slide(a.s6,        22.96, 2.64);   // ג'רני, עוזר הטיולים החכם שלכם

  // End card: the real CTA screen with a slow push-in.
  p.compose(
    <frame width={W} height={H} layout="none">
      <media file={a.s14} x={0} y={0} width={W} height={H} fit="cover"
        animate={[{ property: "scale", from: 1.0, to: 1.06, duration: 3.4, easing: "linear" },
                  { property: "opacity", from: 0, to: 1, duration: 0.35 }]} />
    </frame>, { at: 25.60, dur: 3.40 });

  // VO is muxed with ffmpeg after render (delayed 0.3s): audio and visual clips can't share a track.
  for (const t of [0.8, 2.5, 4.1, 5.5, 8, 10.4, 13, 16, 18, 21, 24, 27]) await p.frame(t, `renders/f_${t}.png`);
};
