import type { Brief, ScriptOption } from "./types";

/**
 * Free demo mode (no ANTHROPIC_API_KEY): three sample scripts built from the brief
 * so the whole screen can be tried without spending anything. Clearly labelled in the UI.
 */
const DEMO_LOOK = {
  summary: "אישה צעירה ושמחה בבית קפה מואר ונעים",
  character: "a cheerful woman in her early thirties with wavy dark hair, wearing a light linen shirt",
  setting: "a bright, cozy neighborhood cafe with wooden tables, plants and soft window light",
};

export function demoOptions(brief: Brief, screenCount = 0): ScriptOption[] {
  const name = brief.business;
  const cta = brief.callToAction || "דברו איתנו עוד היום";
  const who = brief.audience || "מי שמחפש משהו טוב באמת";
  const options: ScriptOption[] = [
    {
      title: "הרגע הקטן",
      script: `יש רגעים קטנים שעושים את כל היום. ב${name} אנחנו דואגים שיהיו לכם יותר מהם: יחס אישי, תשומת לב לכל פרט, ומקום שבא לחזור אליו. ${name}. ${cta}.`,
      scenes: [
        { caption: "יש רגעים קטנים", visual: "Close-up of a person smiling softly in warm morning light, shallow depth of field, no text" },
        { caption: "יחס אישי, תשומת לב", visual: "Friendly staff member greeting a customer warmly in a cozy space, natural light, no text or signs" },
        { caption: "מקום שבא לחזור אליו", visual: "Wide cinematic shot of an inviting interior with people relaxing, golden hour, no readable text" },
      ],
    },
    {
      title: "למה דווקא אנחנו",
      script: `כבר ניסיתם הכול ושום דבר לא הרגיש נכון? ${name} נבנה בשביל ${who}. בלי הפתעות, בלי כאב ראש, רק תוצאה שרואים. ${name}. ${cta}.`,
      scenes: [
        { caption: "כבר ניסיתם הכול", visual: "Person looking thoughtful by a window, soft daylight, cinematic, no text" },
        { caption: "בלי הפתעות, בלי כאב", visual: "Calm hands arranging items neatly on a wooden table, top-down shot, no letters" },
        { caption: "רק תוצאה שרואים", visual: "Happy customer admiring the result, bright natural light, vertical framing, no logos" },
      ],
    },
    {
      title: "יום אחד אצלנו",
      script: `בוקר רגיל, ופתאום הכול זורם. ככה מרגיש יום עם ${name}. אנשים שאכפת להם, שירות מהיר, וחיוך בסוף. בואו לראות בעצמכם. ${name}. ${cta}.`,
      scenes: [
        { caption: "בוקר רגיל, ופתאום הכול", visual: "Sunrise over a city street, people starting their day, cinematic vertical shot, no signs" },
        { caption: "אנשים שאכפת להם", visual: "Team members laughing together while working, warm tones, no text" },
        { caption: "וחיוך בסוף", visual: "Close-up of a genuine smile, soft bokeh background, no letters or logos" },
      ],
    },
  ];
  // In the screenshots style, show the customer's screens on the middle beats.
  return options.map((option) => ({
    ...option,
    look: DEMO_LOOK,
    // In the presenter style, the middle beat is a silent cutaway.
    scenes: option.scenes.map((scene, index) => ({
      ...scene,
      screen: index > 0 && index <= screenCount ? index : 0,
      onCamera: index !== 1,
    })),
  }));
}
