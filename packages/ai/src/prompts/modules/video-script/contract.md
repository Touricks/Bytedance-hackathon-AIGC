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

Required output behavior:
1. durationSec must equal the request value.
2. providerPrompt must be at least 30 characters and describe a single continuous shot.
3. cameraMotion must use provider-friendly lower_snake_case vocabulary such as static, push_in, pull_out, pan, tilt, handheld, or orbit.
4. providerPrompt must explicitly describe the first frame and, when last_frame_url is present, the intended ending frame.
5. voiceover must equal shot.voiceover exactly when shot.voiceover is present.
6. When voiceover is non-empty, providerPrompt must include the exact voiceover line as an audio/narration requirement, not as on-screen text.
7. negativePrompt must include product deformation, camera shake, and unnatural motion constraints.
8. Do not invent product attributes not present in approved upstream artifacts.
