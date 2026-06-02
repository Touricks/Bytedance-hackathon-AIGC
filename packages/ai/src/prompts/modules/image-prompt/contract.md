Input contract:
- productBrief: approved product brief artifact.
- materialIntake: approved material intake artifact.
- shot: { index, objective, sceneDescription, defaultDurationSec, productAssetRef, referenceAssetRefs, providerPromptFromShotPrompt, shotImage }.
- image_ref: backend-injected scene anchor URL or stable asset reference.
- number: backend-injected candidate count.
- previousImagePromptText: previous prompt for this shot, if any.
- referenceAssets: array of { id, role, summary } selected for this shot.
- userHint: optional free-form user instruction.

Output contract:
Return only one JSON object matching StoryboardImagePromptOutputSchema. Do not wrap in markdown. Do not include explanatory text.
All schema fields are required. Nullable soft fields must be JSON null when empty, not the string "null".
Natural-language field values must be written in Simplified Chinese.

Required output behavior:
1. promptText must describe a still image key frame only: product identity, environment, lighting, composition, product visibility, and reference-image usage.
2. Use shot.shotImage as the main creative requirement. providerPromptFromShotPrompt is only context and must not be copied as the final prompt.
3. promptText and all natural-language fields must not mention camera motion, subject motion over time, duration, first frame, last frame, transition, voiceover, narration, subtitles, editing, cuts, or montage.
4. referenceImageUsage must include at least one product_identity item for the primary product reference when a primary product reference is available.
5. For shot index >= 1, referenceImageUsage must include image_ref as a scene_reference and instruct the provider to preserve static scene, lighting, palette, and composition continuity.
6. productVisibilityRule must be concrete and inspectable.
7. negativePrompt must include constraints for product deformation, unreadable text, and scene drift.
8. visualStyle, composition, and lighting are required keys; use JSON null only when there is no distinct value beyond promptText.
9. qualityChecklist is required and may be an empty array or include up to 5 short renderer rules.
