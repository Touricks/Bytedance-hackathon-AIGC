import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import { formatCreativeRequirementsForModule } from "./creative-requirements-context.js";
import { buildModulePrompt } from "./module-prompt-assembler.js";

export const MATERIAL_INTAKE_PROMPT_VERSION = "material-intake";

export interface BuildMaterialIntakePromptInput {
  initialPrompt?: string;
  scanned: MaterialIntakeArtifact;
  textPreviews?: Array<{ ref: string; text: string }>;
  creativeRequirements?: unknown;
}

export interface RuntimePromptView {
  contractId: string;
  promptVersion: string;
  provider: "ark" | "seedance" | "deterministic";
  model?: string;
  nl: {
    title: string;
    sections: Array<{
      id: string;
      label: string;
      body: string;
    }>;
  };
  variables: Record<string, unknown>;
}

export interface BuildMaterialIntakePromptViewInput
  extends BuildMaterialIntakePromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function materialManifestPreview(input: MaterialIntakeArtifact) {
  return input.assets
    .map(
      (asset) =>
        `${asset.ref}（${asset.kind}，${asset.mime}，${asset.bytes} 字节，默认角色：${asset.role}）`
    )
    .join("\n");
}

export function buildMaterialIntakePromptView(
  input: BuildMaterialIntakePromptViewInput
): RuntimePromptView {
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "material-intake",
  );
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "素材清点提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body:
            "你是电商视频生成工作区的素材清点标签构建器，负责给已验证素材打标。"
        },
        {
          id: "user_intent",
          label: "用户意图",
          body: input.initialPrompt?.trim() || "未提供初始用户方向。"
        },
        {
          id: "selected_material_manifest",
          label: "已选择素材清单",
          body: materialManifestPreview(input.scanned) || "没有选择可用素材。"
        },
        ...(creativeRequirements
          ? [
              {
                id: "creative_requirements",
                label: "全局创作要求",
                body: creativeRequirements,
              },
            ]
          : []),
        {
          id: "task",
          label: "任务",
          body:
            "为每个已验证素材选择角色、描述、相关性和是否纳入生成。优先选择一张有效商品图作为 primaryProductRef。"
        },
        {
          id: "output_contract",
          label: "输出契约",
          body:
            "返回包含 primaryProductRef 和 tags 的严格 JSON。product_main/product_detail 的 description 要尽量详细（颜色、材质、形状、尺寸感知、五金、背法、内部结构等可见细节）。不要生成商品 brief、开场钩子、分镜或视频生成提示词。"
        }
      ]
    },
    variables: {
      initialPrompt: input.initialPrompt ?? null,
      materialRefs: input.scanned.assets.map((asset) => asset.ref),
      rejectedRefs: input.scanned.rejected.map((item) => item.ref),
      textPreviewRefs: input.textPreviews?.map((preview) => preview.ref) ?? []
    }
  };
}

export function buildMaterialIntakePrompt(input: BuildMaterialIntakePromptInput) {
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "material-intake",
  );
  return buildModulePrompt({
    moduleId: "material-intake",
    runtimeContext: [
      creativeRequirements,
      "输入：",
      `用户初始意图：${input.initialPrompt ?? "未指定"}`,
      "已验证素材清单：",
      JSON.stringify(input.scanned.assets),
      "被拒绝文件，仅作背景信息。不要把这些文件写入 tags：",
      JSON.stringify(input.scanned.rejected),
      "文本预览：",
      JSON.stringify(input.textPreviews ?? []),
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n"),
  }).prompt;
}
