Input contract:
- productBrief: approved product brief artifact.
- shot: { index, objective, sceneDescription, voiceover, providerPromptFromShotPrompt, shotVideo }.
- first_frame_url: backend-injected selected image URL for this shot.
- last_frame_url: backend-injected selected image URL for the next shot, or null for the final shot.
- number: backend-injected candidate count.
- selectedImage: { id, summary, url }.
- neighborImages: { prev?: { id, summary, url }, next?: { id, summary, url } }.
- durationSec: integer seconds chosen by backend.
- previousVideoScript: previous script for this shot, if any.
- userHint: optional free-form user instruction.

Output contract:
Return only one JSON object matching VideoShotScriptOutputSchema. Do not wrap in markdown. Do not include explanatory text.
All schema fields are required. Nullable soft fields must be JSON null when empty, not the string "null".
Natural-language field values should be written in Simplified Chinese unless a provider vocabulary enum or asset id requires English.

Required output behavior:
1. durationSec must equal the request value.
2. providerPrompt must be a motion/video provider prompt for a single continuous shot, not a still-image prompt.
3. cameraMotion must use provider-friendly lower_snake_case vocabulary such as static, push_in, pull_out, pan, tilt, handheld, or orbit.
4. Use shot.shotVideo as the main creative requirement. providerPromptFromShotPrompt is only context and must not be copied as the final providerPrompt.
5. providerPrompt must explicitly describe the first frame, movement during the requested duration, and, when last_frame_url is present, the intended ending frame and continuity into it.
6. providerPrompt must include camera motion, subject motion, duration/tempo, first-to-last-frame transition intent, and product visibility during motion.
7. voiceover must equal shot.voiceover exactly when shot.voiceover is present.
8. When voiceover is non-empty, providerPrompt must include the exact voiceover line as an audio/narration requirement, not as on-screen text.
9. negativePrompt must include product deformation, camera shake, and unnatural motion constraints.
10. Do not invent product attributes not present in approved upstream artifacts.
11. Do not simply copy image prompt wording or describe only static composition; visual details may appear only as anchors for motion generation.
