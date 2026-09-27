/**
 * Voice gallery. ElevenLabs premade voices, all rendered with eleven_v3 in Hebrew
 * (tested 5/5 on the mentor it script with Roger). Descriptions are ours, in Hebrew.
 */
export const VOICES = [
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "רוג'ר", gender: "male", description: "רגוע וחם, נשמע כמו חבר" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "ג'ורג'", gender: "male", description: "מספר סיפורים, עמוק ומזמין" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "צ'רלי", gender: "male", description: "עמוק ואנרגטי, בטוח בעצמו" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "ליאם", gender: "male", description: "צעיר ואנרגטי, סגנון רשתות" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "ריבר", gender: "neutral", description: "רגוע ומיידע, ניטרלי" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "שרה", gender: "female", description: "בוגרת ומרגיעה, מעוררת אמון" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "אליס", gender: "female", description: "ברורה ומעניינת, כמו מורה טובה" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "לורה", gender: "female", description: "נלהבת וקלילה" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];
export const VOICE_IDS = VOICES.map((voice) => voice.id) as [VoiceId, ...VoiceId[]];
export const isVoiceId = (id: string): id is VoiceId => (VOICE_IDS as readonly string[]).includes(id);

/** The same short line for every voice, so customers compare voices, not texts. */
export const SAMPLE_TEXT = "שלום! ככה אני נשמע בעברית. ספרו לי על העסק שלכם, ואני אספר עליו לכל מי שצריך לשמוע.";

// ElevenLabs API list price for eleven_v3: $0.10 per 1,000 characters.
export const USD_PER_CHAR = 0.1 / 1000;
export const voiceCostUsd = (text: string) => text.length * USD_PER_CHAR;

export type TimedWord = { word: string; start: number; end: number };
