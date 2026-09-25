// Journee — 9:16 Hebrew promo, ~22.5s. Cuts land on ElevenLabs VO word timings (+0.3s lead-in).
// Build: higgsedit build edit.jsx && higgsedit render proj --out renders/silent.mp4
// Then mux the VO (see README.md). Assets are expected in ./assets (see README.md).
const W = 1080, H = 1920, VO_AT = 0.3;
const ASSETS = process.env.ASSETS_DIR ?? `${process.cwd()}/assets`;
const BG = { kind: "linear", angle: 160, stops: [
  { offset: 0, color: "#10204a" }, { offset: 0.55, color: "#14171f" }, { offset: 1, color: "#3d2166" } ] };
const SCRIM = { kind: "linear", angle: 90, stops: [
  { offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#000000", opacity: 0.7 } ] };
const capIn = [
  { property: "offsetY", from: 36, to: 0, duration: 0.45, easing: "house" },
  { property: "opacity", from: 0, to: 1, duration: 0.3 } ];

export default async ({ project }) => {
  const p = await project({ dir: "proj", size: `${W}x${H}`, fps: 30, background: "#0d0f14" });
  const a = {};
  for (const n of ["roof.mp4","rome.mp4","plane.mp4","s1.png","s2.png","s3.png","s4.png","s5.png",
                   "c1.png","c2.png","c3.png","c4.png","c5.png","c6.png","c7.png"])
    a[n.split(".")[0]] = await p.add(`${ASSETS}/${n}`);

  // Full-bleed cinematic b-roll with a lower-third caption over a bottom scrim.
  const broll = (clip, cap, at, dur, from = 0.3) => {
    p.compose(
      <frame width={W} height={H} layout="none">
        <media file={clip} x={0} y={0} width={W} height={H} fit="cover" trimStart={from} muted
          animate={[{ property: "scale", from: 1.0, to: 1.05, duration: dur, easing: "linear" }]} />
        <rect x={0} y={1100} width={W} height={820} fill={SCRIM} />
        <media file={cap} x={40} y={1400} width={1000} height={300} animate={capIn} />
      </frame>, { at, dur });
  };

  // App screen inside a rounded "device" card on the brand gradient, caption above.
  const screen = (img, cap, at, dur) => p.compose(
    <frame width={W} height={H} layout="none">
      <rect x={0} y={0} width={W} height={H} fill={BG} />
      <media file={img} x={150} y={450} width={780} height={1387} fit="cover" radius={54}
        shadow={{ x: 0, y: 30, blur: 90, color: "rgba(0,0,0,0.7)" }}
        animate={[{ property: "scale", from: 0.92, to: 1.0, duration: dur, easing: "ease-out" },
                  { property: "opacity", from: 0, to: 1, duration: 0.25 }]} />
      <media file={cap} x={40} y={120} width={1000} height={300} animate={capIn} />
    </frame>, { at, dur });

  broll(a.roof,  a.c1, 0.0,  1.7);   // "מתכננים טיול?"
  screen(a.s4,   a.c2, 1.7,  2.9);   // chat — "כתבו משפט אחד: לאן ומתי"
  broll(a.rome,  a.c3, 4.6,  2.7);   // "ג'ורני בונה לכם מסלול מלא, יום אחרי יום"
  screen(a.s3,   a.c4, 7.3,  3.6);   // trip card — flights, hotels, market prices
  screen(a.s1,   a.c5, 10.9, 2.4);   // itinerary — save, edit, share
  screen(a.s2,   a.c6, 13.3, 3.2);   // home — Hebrew, site + WhatsApp
  broll(a.plane, a.c7, 16.5, 2.5);   // "בואו נתכנן את הטיול הבא"

  // End card: the real CTA screen with a slow push-in.
  p.compose(
    <frame width={W} height={H} layout="none">
      <media file={a.s5} x={0} y={0} width={W} height={H} fit="cover"
        animate={[{ property: "scale", from: 1.0, to: 1.06, duration: 3.5, easing: "linear" },
                  { property: "opacity", from: 0, to: 1, duration: 0.35 }]} />
    </frame>, { at: 19.0, dur: 3.5 });

  // VO is muxed with ffmpeg after render (delayed by VO_AT): audio and visual clips can't share a track.

  for (const t of [0.8, 3, 5.5, 9, 12, 15, 17.5, 21]) await p.frame(t, `renders/f_${t}.png`);
};
