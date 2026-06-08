import {
  compileCreativeRequirementFields,
  creativeFactorRequirementsDataSchema,
} from "@aigc-video/shared";

export type CreativeRequirementsTarget =
  | "material-intake"
  | "product-brief"
  | "storyboard"
  | "shotprompt";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requirementSection(
  data: unknown,
  section: "image" | "script" | "storyboard" | "shotImage" | "shotVideo",
) {
  if (!isRecord(data)) return {};
  const value = data[section];
  return isRecord(value) ? value : {};
}

function formatRequirementValue(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatRequirementValue(item))
      .filter((item) => item && item !== "未填写");
    return items.length > 0 ? items.join("，") : "未填写";
  }
  if (typeof value === "string") {
    return value.trim() || "未填写";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value)) {
    return JSON.stringify(value);
  }
  return "未填写";
}

function list(values: string[]) {
  return values.length > 0 ? values.join("、") : "未填写";
}

type ParsedCreativeRequirements = ReturnType<
  typeof creativeFactorRequirementsDataSchema.parse
>;

function hasNoAudienceGuidance(data: ParsedCreativeRequirements) {
  return (
    data.factorGuidance.audience.addressingAndTone.trim() === "" &&
    data.factorGuidance.audience.benefitFrame.trim() === "" &&
    data.factorGuidance.audience.sensitivityBoundaries.trim() === ""
  );
}

function isAudienceUnspecified(data: ParsedCreativeRequirements) {
  return data.creativeFactors.audience === "general" || hasNoAudienceGuidance(data);
}

function audienceFactorText(data: ParsedCreativeRequirements) {
  return isAudienceUnspecified(data)
    ? "不限定特定人群"
    : data.creativeFactors.audience;
}

function audienceAddressee(data: ParsedCreativeRequirements) {
  return isAudienceUnspecified(data)
    ? "不限定特定人群"
    : data.scriptInfluence.audience.addressee;
}

function audienceTone(data: ParsedCreativeRequirements) {
  return isAudienceUnspecified(data)
    ? "清晰可信,聚焦商品/服务本身,不按特定人群定向。"
    : data.scriptInfluence.audience.tone;
}

function audienceBenefitPriority(data: ParsedCreativeRequirements) {
  return isAudienceUnspecified(data)
    ? "通用价值、使用场景、可验证体验"
    : list(data.scriptInfluence.audience.benefitPriority);
}

function audienceBoundary(data: ParsedCreativeRequirements) {
  const boundary = data.factorGuidance.audience.sensitivityBoundaries.trim();
  return boundary || "不限定特定人群，避免强行绑定年龄、性别、身份或焦虑叙事。";
}

function formatLegacyShotPromptRequirements(data: unknown) {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return [
    "已批准创作要求（导演约束）：",
    "以下内容来自 current approved prompt_requirements_artifacts.data。生成分镜生成要求时优先遵守，并按 providerPrompt / shotImage / shotVideo / tts.voiceProfile 各自职责吸收。",
    `- 图像风格：${formatRequirementValue(image.style)}`,
    `- 图像构图：${formatRequirementValue(image.composition)}`,
    `- 图像避免项：${formatRequirementValue(image.avoid)}`,
    `- 剧本语气：${formatRequirementValue(script.tone)}`,
    `- 分镜节奏：${formatRequirementValue(storyboard.rhythm)}`,
    `- 分镜图全局要求：${formatRequirementValue(shotImage.global)}`,
    `- 分镜视频全局要求：${formatRequirementValue(shotVideo.global)}`,
  ].join("\n");
}

function formatMaterialIntakeView(
  data: ParsedCreativeRequirements,
) {
  return [
    "已批准全局创作要求（素材解读视图）：",
    "只用于判断素材角色、相关性、主素材选择和纳入边界。不要生成商品卖点、剧本、分镜或视频提示词。",
    `- 商品/服务类型：${data.creativeFactors.productType}`,
    `- 目标人群：${audienceFactorText(data)}`,
    `- 主体展示：${data.factorGuidance.productType.subjectPresentation}`,
    `- 场景/交付过程：${data.factorGuidance.productType.sceneAndDelivery}`,
    `- 禁用承诺：${list(data.scriptInfluence.productType.forbiddenClaims)}`,
  ].join("\n");
}

function formatProductBriefView(
  data: ParsedCreativeRequirements,
) {
  return [
    "已批准全局创作要求（商品卖点视图）：",
    "用于定义商品/服务、目标人群、核心卖点、证明对象和禁用表达。不要生成开场钩子、分镜或最终视频提示词。",
    `- 因子组合：${data.creativeFactors.productType} / ${audienceFactorText(data)} / ${data.creativeFactors.strategy}`,
    `- 商品/服务剧本角色：${data.scriptInfluence.productType.scriptRole}`,
    `- 证明对象：${list(data.scriptInfluence.productType.proofObjects)}`,
    `- 受众称谓：${audienceAddressee(data)}`,
    `- 利益优先级：${audienceBenefitPriority(data)}`,
    `- 敏感边界：${audienceBoundary(data)}`,
    `- 禁用承诺：${list(data.scriptInfluence.productType.forbiddenClaims)}`,
  ].join("\n");
}

function formatStoryboardView(
  data: ParsedCreativeRequirements,
) {
  return [
    "已批准全局创作要求（分镜生成视图）：",
    "用于约束口播开场、分镜结构、证据顺序和 CTA 风格。不得改写已确认商品事实或新增素材中没有的证据。",
    `- 推销手法：${data.creativeFactors.strategy}`,
    `- 开场方式：${data.scriptInfluence.strategy.openingPattern}`,
    `- 分镜结构：${list(data.scriptInfluence.strategy.storyArc)}`,
    `- 口播语气：${audienceTone(data)}`,
    `- CTA 风格：${data.scriptInfluence.strategy.ctaStyle}`,
    `- 场景/交付顺序：${data.factorGuidance.productType.sceneAndDelivery}`,
  ].join("\n");
}

function formatShotPromptView(
  data: ParsedCreativeRequirements,
) {
  const legacyData = isAudienceUnspecified(data)
    ? {
        ...data,
        ...compileCreativeRequirementFields({
          factorGuidance: data.factorGuidance,
          scriptInfluence: data.scriptInfluence,
          visualStyle: data.creativeFactors.visualStyle,
        }),
      }
    : data;
  const audienceLine = isAudienceUnspecified(data)
    ? `- 受众称谓与语气：不限定特定人群，${audienceTone(data)}`
    : `- 受众称谓与语气：面向${data.scriptInfluence.audience.addressee}，${data.scriptInfluence.audience.tone}`;

  return [
    formatLegacyShotPromptRequirements(legacyData),
    "结构化剧本影响（分镜生成要求视图）：",
    `- 商品/服务角色：${data.scriptInfluence.productType.scriptRole}`,
    audienceLine,
    `- 推进结构：${list(data.scriptInfluence.strategy.storyArc)}`,
    `- CTA 风格：${data.scriptInfluence.strategy.ctaStyle}`,
  ].join("\n");
}

export function formatCreativeRequirementsForModule(
  data: unknown,
  target: CreativeRequirementsTarget,
): string | null {
  if (data === undefined || data === null) return null;
  const parsed = creativeFactorRequirementsDataSchema.safeParse(data);

  if (!parsed.success) {
    return target === "shotprompt"
      ? formatLegacyShotPromptRequirements(data)
      : null;
  }

  switch (target) {
    case "material-intake":
      return formatMaterialIntakeView(parsed.data);
    case "product-brief":
      return formatProductBriefView(parsed.data);
    case "storyboard":
      return formatStoryboardView(parsed.data);
    case "shotprompt":
      return formatShotPromptView(parsed.data);
  }
}
