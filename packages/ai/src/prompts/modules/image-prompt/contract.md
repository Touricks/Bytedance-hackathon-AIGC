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

Required output behavior:
1. promptText must be at least 20 characters.
2. referenceImageUsage must include at least one product_identity item for the primary product reference.
3. For shot index >= 1, referenceImageUsage must include image_ref as a scene_reference and instruct the provider to preserve scene, lighting, palette, and composition continuity.
4. productVisibilityRule must be concrete and inspectable.
5. negativePrompt must include constraints for product deformation, unreadable text, and scene drift.
6. qualityChecklist may include up to 5 short renderer rules.
