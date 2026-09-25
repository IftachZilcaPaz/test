# Journee ad #2: channels & features (9:16, Hebrew)

A 29s vertical ad (1080×1920, 30fps, H.264 + AAC), built with the
[`hebrew-promo-video`](../../.claude/skills/hebrew-promo-video/SKILL.md) skill.

**Render:** https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/28dc5b20-3138-45cb-8483-915fc22e3774.mp4
(Higgsfield media `28dc5b20-3138-45cb-8483-915fc22e3774`)

**Sped up ×1.15 (25.2s):** https://d2ol7oe51mr4n9.cloudfront.net/user_3JmONODBWc3nm2ewZfPJcp0njwW/aa5d3ddb-4c83-48b1-afc9-17a0f43f34de.mp4
(see [speed-up](../journee-ad/README.md#speed-up-no-credits))

## Structure

| Time (s)    | Visual                                    | VO                                        |
| ----------- | ----------------------------------------- | ----------------------------------------- |
| 0.00–1.58   | B-roll: rooftop + phone (reused from #1)  | מתכננים טיול?                              |
| 1.58–3.78   | Slide: WhatsApp                           | פשוט שולחים הודעה, בוואטסאפ                |
| 3.78–4.58   | Slide: Instagram                          | באינסטגרם                                  |
| 4.58–6.40   | Slide: website                            | או באתר                                    |
| 6.40–9.44   | Slide: full package                       | משפט אחד, ומקבלים טיסה, מלון ומסלול מלא    |
| 9.44–11.38  | B-roll: Brooklyn Bridge (new)             | ראיתם סרטון בטיקטוק?                       |
| 11.38–14.96 | Slide: TikTok/Instagram link → places     | שִׁלְחוּ את הלינק, וג'רְנִי מוציא…              |
| 14.96–17.16 | B-roll: Thai bay (new)                    | חבר שלח רשימת המלצות?                      |
| 17.16–19.40 | Slide: paste a friend's list              | מדביקים, ומקבלים מסלול                     |
| 19.40–22.96 | Slide: documents offline                  | וכל המסמכים של הטיול איתכם, גם בלי קליטה   |
| 22.96–25.60 | Slide: feature summary                    | ג'רְנִי, עוזר הטיולים החכם שלכם             |
| 25.60–29.00 | End card: CTA (same screen as ad #1)      | (none)                                     |

The screens are designed 9:16 slides, so they play full-bleed as a right-to-left carousel.
Captions appear only on the b-roll beats.

## Voice-over

ElevenLabs (`text2speech_v2`, `elevenlabs`), voice Daisy `032386ec-491b-5bdc-81ac-49e9a6a2c89d`.
Job `384c9b39-37a7-4905-9e6b-56982314f9a2`, 25.2s long. Whisper detected Hebrew with 0.98
probability. Pointed words: שִׁלְחוּ and ג'רְנִי. The user approved both before generation.

## Generated assets

| Asset    | Model                     | Job ID                                 |
| -------- | ------------------------- | -------------------------------------- |
| nyc.mp4  | seedance_2_5, 720p, 5s    | `94c9dd3c-0552-4189-a930-4919fe00fdbc` |
| thai.mp4 | seedance_2_5, 720p, 5s    | `54641196-8399-4b11-91ff-9190da7d5bd5` |
| roof.mp4 | reused from ad #1         | `5770920e-d796-469b-b517-f9ad9ffa733f` |

Screen media IDs: s6 `6eed74f8…`, s7 `c66959f0…`, s8 `c9213f47…`, s9 `4e0bfc7e…`, s10 `c9683bee…`,
s11 `35f3a5a5…`, s12 `f8dc982d…`, s13 `cb84498f…`, s14 (= ad #1 CTA) `fa06a978…`.

## Rebuild

Follow the same steps as in [`../journee-ad/README.md`](../journee-ad/README.md#rebuild):
`captions.cjs` → `higgsedit build edit.jsx` → render → ffmpeg VO mux (`adelay=300`, loudnorm −14 LUFS).
