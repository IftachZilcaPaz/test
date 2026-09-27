#!/usr/bin/env node
/**
 * Verifies the two providers of the standalone reynovation app before we price
 * it for customers:
 *   1. ElevenLabs: renders the approved mentor it script (1ב) in Hebrew with
 *      eleven_v3 and eleven_multilingual_v2, so we can compare pronunciation.
 *   2. Higgsfield API: asks the free /estimate endpoint what one 5-second
 *      vertical scene costs on Seedance 2.0 and 2.5. Nothing is generated.
 *
 * Keys are read from .env (see .env.example) and never printed.
 * Usage: node tools/check-providers.mjs [--skip-voice] [--skip-video]
 * Spend: ~0.06 USD of ElevenLabs characters; the Higgsfield estimate is free.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tools", "out");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const args = new Set(process.argv.slice(2));
const env = (name) => process.env[name]?.trim() || "";

// Approved script 1ב, with the brand pointed exactly as in video/lexicon.json.
const SCRIPT =
  "שנה של ניסוי וטעייה, או שעה אחת עם מישהו שכבר טעה בשבילכם? במֶנְטוֹר אִיט מוצאים מנטור לקריירה, ליזמות, לזוגיות או לכסף, רואים מראש מה תקבלו וכמה זה עולה, ונפגשים אונליין או פנים מול פנים. מֶנְטוֹר אִיט. קיצור הדרך שלכם.";
const VOICE_MODELS = ["eleven_v3", "eleven_multilingual_v2"];
const USD_PER_1K_CHARS = 0.1; // ElevenLabs API list price for both models (Sep 2026).

const SCENE = {
  prompt:
    "Vertical cinematic b-roll: a young woman and her mentor talk warmly in a sunlit cafe. No text, letters or logos.",
  duration: 5,
  resolution: "720p",
  aspect_ratio: "9:16",
  generate_audio: false,
};
const VIDEO_MODELS = ["bytedance/seedance-2.0/text-to-video", "bytedance/seedance-2.5/text-to-video"];

async function failBody(response) {
  const text = await response.text().catch(() => "");
  return `${response.status} ${response.statusText} ${text.slice(0, 300)}`;
}

async function checkVoice() {
  const key = env("ELEVENLABS_API_KEY");
  if (!key) return console.log("• ElevenLabs: skipped (ELEVENLABS_API_KEY is empty in .env)");
  const headers = { "xi-api-key": key };

  let voiceId = env("ELEVENLABS_VOICE_ID");
  if (!voiceId) {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers });
    if (!response.ok) throw new Error(`ElevenLabs voices: ${await failBody(response)}`);
    const { voices = [] } = await response.json();
    if (voices.length === 0) throw new Error("ElevenLabs returned no voices for this account");
    console.log("• ElevenLabs voices (first 10):");
    for (const voice of voices.slice(0, 10)) console.log(`   ${voice.voice_id}  ${voice.name}`);
    voiceId = voices[0].voice_id;
    console.log(`  using ${voices[0].name}; set ELEVENLABS_VOICE_ID to try another`);
  }

  await mkdir(outDir, { recursive: true });
  const speak = (model, withLanguage) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ text: SCRIPT, model_id: model, ...(withLanguage ? { language_code: "he" } : {}) }),
    });
  for (const model of VOICE_MODELS) {
    let response = await speak(model, true);
    // Models without official Hebrew reject the hint; retry letting the model detect the language.
    if (response.status === 400 && (await response.clone().text()).includes("unsupported_language")) {
      console.log(`• ${model}: Hebrew is not an official language here, retrying without the language hint`);
      response = await speak(model, false);
    }
    if (!response.ok) {
      console.log(`• ${model}: FAILED ${await failBody(response)}`);
      continue;
    }
    const file = join(outDir, `voice-${model}.mp3`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    const cost = (SCRIPT.length / 1000) * USD_PER_1K_CHARS;
    console.log(`• ${model}: saved ${file} (${SCRIPT.length} chars ≈ $${cost.toFixed(3)})`);
  }
}

async function checkVideo() {
  // The console hands out one copyable credential ("id:secret"); older docs show the parts separately.
  const credential = env("HF_API_KEY") || (env("HF_API_KEY_ID") && env("HF_API_KEY_SECRET") ? `${env("HF_API_KEY_ID")}:${env("HF_API_KEY_SECRET")}` : "");
  if (!credential) return console.log("• Higgsfield: skipped (HF_API_KEY empty in .env)");
  for (const model of VIDEO_MODELS) {
    const response = await fetch(`https://api.higgsfield.ai/estimate/${model}`, {
      method: "POST",
      headers: { authorization: `Key ${credential}`, "content-type": "application/json" },
      body: JSON.stringify(SCENE),
    });
    if (!response.ok) {
      console.log(`• ${model}: FAILED ${await failBody(response)}`);
      continue;
    }
    const estimate = await response.json();
    const usd = Number(estimate.usd);
    const perSecond = Number.isFinite(usd) ? ` = $${(usd / SCENE.duration).toFixed(4)}/s` : "";
    console.log(`• ${model}: ${SCENE.duration}s ${SCENE.resolution} ${SCENE.aspect_ratio} → ${JSON.stringify(estimate)}${perSecond}`);
  }
}

try {
  if (!args.has("--skip-voice")) await checkVoice();
  if (!args.has("--skip-video")) await checkVideo();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
