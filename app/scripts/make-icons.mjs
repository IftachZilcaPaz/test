// Generates the PWA / home-screen icons from one SVG mark. Run: node scripts/make-icons.mjs
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const mark = ({ size, radius, scale }) => {
  const c = size / 2;
  const r = (size / 2) * 0.62 * scale;
  const t = r * 0.46; // play triangle half-height
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#f49bb7"/><stop offset="1" stop-color="#8b6fe8"/>
  </linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="#fffdff"/>
  <path d="M ${c - t * 0.7} ${c - t} L ${c + t * 1.05} ${c} L ${c - t * 0.7} ${c + t} Z" fill="#8b6fe8" stroke="#8b6fe8" stroke-width="${size * 0.03}" stroke-linejoin="round"/>
</svg>`;
};

const out = [
  ["public/icons/icon-192.png", { size: 192, radius: 42, scale: 1 }],
  ["public/icons/icon-512.png", { size: 512, radius: 112, scale: 1 }],
  // Maskable: full-bleed background, mark inside the 80% safe zone.
  ["public/icons/icon-maskable-512.png", { size: 512, radius: 0, scale: 0.8 }],
  ["src/app/apple-icon.png", { size: 180, radius: 0, scale: 0.9 }],
  ["src/app/icon.png", { size: 64, radius: 14, scale: 1 }],
];

await mkdir("public/icons", { recursive: true });
for (const [path, spec] of out) await sharp(Buffer.from(mark(spec))).png().toFile(path);
console.log("icons written");
