输入契约：
- productBrief：已批准的商品卖点 artifact。
- materialIntake：已批准的素材解读 artifact。
- shot：{ index, objective, sceneDescription, defaultDurationSec, productAssetRef, referenceAssetRefs, providerPromptFromShotPrompt, shotImage, shotVideo }。
- compiledShotRequirements：后端根据当前分镜完整 shotImage 和 shotVideo 字典确定性编译出的文本。
- image_ref：后端注入的场景锚点 URL 或稳定素材引用。
- feedbackImageRef：可选。反馈重生成时来自 feedbackImageCandidateId 指向的最新轮成功候选图；它是本次修改的视觉基准。
- feedbackImageCandidateId：反馈重生成时必填，且必须属于当前 shot 最新 image round 的成功候选；仅用于识别基准图。
- number：后端注入的候选数量。
- previousImagePromptText：当前分镜上一轮提示词；没有则为空。
- referenceAssets：当前分镜选择的 { id, role, summary } 数组。
- userHint：可选的用户自由文本要求。

输出契约：
只返回一个符合 StoryboardImagePromptOutputSchema 的 JSON 对象。不要包裹 markdown，不要输出解释文字。
所有 schema 字段都必须存在。可为空的软字段在无内容时必须使用 JSON null，不得使用字符串 "null"。
所有自然语言字段值必须使用简体中文。

必要输出行为：
1. promptText 只能描述静态分镜图关键帧：商品身份、环境、光线、构图、商品可见性和参考图使用方式。
2. 以 compiledShotRequirements 作为权威创作要求。它包含完整的 shotImage 和 shotVideo 字典；必须把 shotVideo 转译为静态画面约束，而不是要求渲染运动。
3. promptText 和所有自然语言字段不得提到镜头运动、主体随时间运动、时长、首帧、尾帧、转场、旁白、解说、字幕、剪辑、切镜或蒙太奇。
4. 当存在主商品参考时，referenceImageUsage 必须至少包含一个 product_identity 条目。
5. 当 shot index 大于等于 1 时，referenceImageUsage 必须把 image_ref 作为 scene_reference，并要求 provider 保持静态场景、光线、色彩和构图连续性。
6. 当 feedbackImageRef 存在时，referenceImageUsage 必须包含一个 usage 为 composition_reference 的条目，assetId 使用 feedbackImageRef，instruction 说明基于当前已生成分镜图保留可用主体、构图、光线和场景基础，并按 userHint 调整。
7. 当 feedbackImageRef 存在且 userHint 非空时，promptText 必须显式反映 userHint，而不是只复述上游 shotImage / shotVideo。
8. productVisibilityRule 必须具体、可检查。
9. negativePrompt 必须包含对商品变形、文字不可读和场景漂移的约束。
10. visualStyle、composition 和 lighting 是必填键；只有当 promptText 之外没有独立内容时，才使用 JSON null。
11. qualityChecklist 是必填字段，可以为空数组，也可以包含最多 5 条简短渲染规则。
