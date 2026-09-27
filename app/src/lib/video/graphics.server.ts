import "server-only";
import { join } from "node:path";
import sharp from "sharp";
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "@/lib/media/ffmpeg.server";

/**
 * Hebrew text is rasterized with Pango (via sharp) using the bundled Rubik font,
 * so bidi, shaping and line wrapping are correct on every machine.
 */
const FONT_FILE = join(process.cwd(), "assets", "fonts", "Rubik-Hebrew-Bold.ttf");

const escapeMarkup = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function textImage(text: string, { size, color, width }: { size: number; color: string; width: number }) {
  return sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
      fontfile: FONT_FILE,
      font: `Rubik Bold ${size}`,
      width,
      align: "centre",
      wrap: "word",
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

const svg = (width: number, height: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);

/** Caption plate: white Rubik on a soft ink pill, sized to the text. */
export async function captionPng(text: string): Promise<{ png: Buffer; width: number; height: number }> {
  const label = await textImage(text, { size: 46, color: "#FFFFFF", width: VIDEO_WIDTH - 140 });
  const width = label.info.width + 64;
  const height = label.info.height + 44;
  const png = await sharp(svg(width, height, `<rect width="100%" height="100%" rx="34" fill="#2C2548" fill-opacity="0.78"/>`))
    .composite([{ input: label.data, gravity: "centre" }])
    .png()
    .toBuffer();
  return { png, width, height };
}

/** Branded closing frame: business name and call to action on the lavender gradient. */
export async function endCardPng(business: string, callToAction: string): Promise<Buffer> {
  const name = await textImage(business, { size: 72, color: "#2C2548", width: VIDEO_WIDTH - 220 });
  const cta = await textImage(callToAction, { size: 40, color: "#FFFFFF", width: VIDEO_WIDTH - 320 });
  // The button grows with the call to action (it may wrap to two lines).
  const pillHeight = cta.info.height + 64;
  const cardHeight = name.info.height + pillHeight + 240;
  const cardTop = Math.round((VIDEO_HEIGHT - cardHeight) / 2);
  const nameTop = cardTop + 90;
  const pillTop = nameTop + name.info.height + 70;
  const background = svg(
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6DEFB"/><stop offset="1" stop-color="#FCE2EE"/></linearGradient>
     <linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F49BB7"/><stop offset="1" stop-color="#8B6FE8"/></linearGradient></defs>
     <rect width="100%" height="100%" fill="url(#g)"/>
     <rect x="70" y="${cardTop}" width="${VIDEO_WIDTH - 140}" height="${cardHeight}" rx="64" fill="#FFFDFF"/>
     <rect x="130" y="${pillTop}" width="${VIDEO_WIDTH - 260}" height="${pillHeight}" rx="${Math.min(60, pillHeight / 2)}" fill="url(#b)"/>`,
  );
  return sharp(background)
    .composite([
      { input: name.data, top: nameTop, left: Math.round((VIDEO_WIDTH - name.info.width) / 2) },
      { input: cta.data, top: pillTop + 32, left: Math.round((VIDEO_WIDTH - cta.info.width) / 2) },
    ])
    .png()
    .toBuffer();
}
