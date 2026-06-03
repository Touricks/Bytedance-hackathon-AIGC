import type { CreativeRequirementTemplate } from "@aigc-video/shared";
import type { PromptRequirementsData } from "../../lib/api/client.js";

function stringifyRequirementValue(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join("，");
  return typeof value === "string" && value.trim() ? value : fallback;
}

function requirementSection(
  data: PromptRequirementsData | null,
  section: "image" | "script" | "storyboard" | "shotImage" | "shotVideo"
) {
  const value = data?.[section];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type RequirementsFormState = {
  imageStyle: string;
  imageComposition: string;
  imageAvoid: string;
  scriptTone: string;
  storyboardRhythm: string;
  shotImageGlobal: string;
  shotVideoGlobal: string;
};

export function applyCreativeRequirementTemplate(
  template: CreativeRequirementTemplate
): RequirementsFormState {
  return { ...template.values };
}

export function requirementFormFromArtifact(
  data: PromptRequirementsData | null
): RequirementsFormState {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return {
    imageStyle: stringifyRequirementValue(
      image.style,
      "真实电商产品摄影，保留商品材质和品牌识别"
    ),
    imageComposition: stringifyRequirementValue(
      image.composition,
      "干净主视觉，主体稳定，避免无关道具抢占画面"
    ),
    imageAvoid: stringifyRequirementValue(
      image.avoid,
      "文字贴片、商品变形、额外产品变体、环境漂移"
    ),
    scriptTone: stringifyRequirementValue(script.tone, "直接、可信、卖点清晰"),
    storyboardRhythm: stringifyRequirementValue(
      storyboard.rhythm,
      "开场快，卖点明确，证明充分，结尾行动引导清楚"
    ),
    shotImageGlobal: stringifyRequirementValue(
      shotImage.global,
      "每张分镜图延续前一镜环境、灯光、构图和商品身份"
    ),
    shotVideoGlobal: stringifyRequirementValue(
      shotVideo.global,
      "镜头运动平滑，前后镜头保持空间连续"
    )
  };
}

export function requirementFormFromImportedDraft(
  data: PromptRequirementsData,
  fallback: RequirementsFormState
): RequirementsFormState {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return {
    imageStyle: stringifyRequirementValue(image.style, fallback.imageStyle),
    imageComposition: stringifyRequirementValue(
      image.composition,
      fallback.imageComposition
    ),
    imageAvoid: stringifyRequirementValue(image.avoid, fallback.imageAvoid),
    scriptTone: stringifyRequirementValue(script.tone, fallback.scriptTone),
    storyboardRhythm: stringifyRequirementValue(
      storyboard.rhythm,
      fallback.storyboardRhythm
    ),
    shotImageGlobal: stringifyRequirementValue(
      shotImage.global,
      fallback.shotImageGlobal
    ),
    shotVideoGlobal: stringifyRequirementValue(shotVideo.global, fallback.shotVideoGlobal)
  };
}
