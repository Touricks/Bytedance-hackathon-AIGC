import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";
import type { ViralTemplate } from "../data/viral-templates.js";

export const VIRAL_IMITATION_PROMPT_VERSION = "viral-imitation.v2";

export interface ViralImitationInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  candidateTemplates?: ViralTemplate[];
}

function formatTemplate(t: ViralTemplate): string {
  const shots = t.structure
    .map(
      (s, i) =>
        `  ${i + 1}. [${s.purpose}] ${s.description}（${s.durationSec}s）`,
    )
    .join("\n");
  return [
    `### ${t.name}`,
    `- 适用品类：${t.categories.join("、")}`,
    `- Hook 技巧：${t.hookTechnique}`,
    `- 分镜结构：`,
    shots,
    `- 情绪弧线：${t.emotionalArc}`,
    `- 台词风格：${t.copyStyle}`,
  ].join("\n");
}

export function buildViralImitationPrompt(input: ViralImitationInput): string {
  const { brief, material, candidateTemplates } = input;

  const includedAssets = material.assets.filter((a) => a.included);
  const refs = includedAssets.map((a) => a.ref);

  const templateSection =
    candidateTemplates && candidateTemplates.length > 0
      ? [
          "## 候选爆款模板（已按品类相关性预筛选，从中选最匹配的一个）",
          ...candidateTemplates.map(formatTemplate),
        ].join("\n\n")
      : "## 爆款模板库（从中选最匹配的一个）\n（无预筛选模板，请根据商品品类自行判断）";

  return [
    "角色：",
    "你是电商爆款视频策划专家。你的任务是：根据商品 brief，从候选模板中选出最匹配的一个，然后按该模板的叙事结构生成一套完整的 UGC 分镜脚本。",
    "",
    "## 商品信息",
    `商品名称：${brief.product.name}`,
    `品类：${brief.product.category}`,
    `核心卖点：${brief.coreSellingPoint}`,
    `目标人群：${brief.audience.who}`,
    `人群痛点/欲望：${brief.audience.painOrDesire}`,
    `人群情感方向：${brief.audience.painOrDesire}`,
    `品牌调性：${brief.brandTone}`,
    brief.offer ? `促销信息：${brief.offer}` : "",
    brief.proof.length > 0 ? `背书信息：${brief.proof.join("、")}` : "",
    brief.bannedExpressions.length > 0
      ? `合规禁用词（voiceover 和 scene 中绝对不得出现）：${brief.bannedExpressions.join("、")}`
      : "",
    "",
    "## 可用素材（productAssetRef 只能使用以下 ref）",
    JSON.stringify(
      includedAssets.map((a) => ({
        ref: a.ref,
        role: a.role,
        description: a.description,
      })),
    ),
    refs.length === 1
      ? `注意：只有一个可用素材（${refs[0]}），所有 shots 均使用该 ref。`
      : "",
    "",
    templateSection,
    "",
    "## 你的任务",
    "",
    "第一步：从候选模板中选出最匹配当前商品品类和受众的模板，记录 viralTemplateUsed（模板名称）和 matchReason（选择理由，一句话）。",
    "",
    "第二步：严格按照所选模板的【分镜结构】生成 6 个分镜，每个分镜对应模板结构中的一项：",
    "- 时长严格按模板结构中的 durationSec 填写",
    "- purpose 严格按模板结构中的 purpose 填写",
    "",
    "每个分镜字段要求：",
    "- voiceover：≤15 字，真实口语，禁止广告腔，体现所选模板的台词风格",
    "- scene：具体地点+光线，≤20 字",
    "- visualDirection：镜头类型（特写/中景/全景）+ 运动方式 + 角度（平视/俯拍/仰拍）",
    "- productAssetRef：从可用素材 ref 中选择最合适的一个",
    "- transition：镜头切换方式（如：直切、淡入、快切）",
    "",
    "第三步：写一句 narrative（整体叙事主线，20-50字），说明这套脚本遵循的爆款逻辑。",
    "",
    "输出要求：",
    "- 严格按 JSON Schema 输出，不要包含 Markdown",
    "- viralTemplateUsed 填模板名称（与候选模板名称完全一致）",
    "- matchReason 一句话说明为什么选这个模板",
    "- 整体情绪弧线必须符合所选模板的情绪走向",
  ]
    .filter(Boolean)
    .join("\n");
}
