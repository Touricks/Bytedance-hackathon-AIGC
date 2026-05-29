import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const REGENERATE_SHOT_PROMPT_VERSION = "regenerate-shot.v1";

export type RegenerateShotMode = "voiceover" | "visual" | "all";

export interface RegenerateShotInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  shotIndex: number;
  mode: RegenerateShotMode;
  instruction: string;
}

export interface RegenerateShotPromptViewInput extends RegenerateShotInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

const modeLabel: Record<RegenerateShotMode, string> = {
  voiceover: "只改台词（voiceover），保持画面描述不变",
  visual: "只改画面描述（scene / visualDirection），保持台词不变",
  all: "重新生成整个镜头",
};

export function buildRegenerateShotPromptView(
  input: RegenerateShotPromptViewInput,
): RuntimePromptView {
  const targetShot = input.storyboard.shots[input.shotIndex];
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "分镜局部重生成提示词",
      sections: [
        {
          id: "target_shot",
          label: "目标镜头",
          body: targetShot
            ? `第 ${input.shotIndex + 1} 段（purpose=${targetShot.purpose}，${targetShot.durationSec}s）：${targetShot.voiceover}`
            : `第 ${input.shotIndex + 1} 段（未找到）`,
        },
        {
          id: "change_mode",
          label: "修改模式",
          body: modeLabel[input.mode],
        },
        {
          id: "instruction",
          label: "修改指令",
          body: input.instruction,
        },
        {
          id: "coherence_context",
          label: "上下文约束",
          body: `前后镜头叙事主线：${input.storyboard.narrative}。整片核心卖点：${input.brief.coreSellingPoint}。`,
        },
      ],
    },
    variables: {
      shotIndex: input.shotIndex,
      mode: input.mode,
      instruction: input.instruction,
      targetShotPurpose: targetShot?.purpose ?? null,
    },
  };
}

export function buildRegenerateShotPrompt(input: RegenerateShotInput): string {
  const shots = input.storyboard.shots;
  const targetShot = shots[input.shotIndex];

  if (!targetShot) {
    throw new Error(
      `Shot index ${input.shotIndex} not found in storyboard (total shots: ${shots.length})`,
    );
  }

  const refs = input.material.assets
    .filter((a) => a.included)
    .map((a) => a.ref);

  const shotContext = shots
    .map(
      (s, i) =>
        `第${i + 1}段 [${s.purpose}] ${s.durationSec}s：台词「${s.voiceover}」/ 场景「${s.scene}」`,
    )
    .join("\n");

  const frozenFields: Record<RegenerateShotMode, string> = {
    voiceover: "scene、visualDirection、productAssetRef、transition、durationSec 保持不变，只修改 voiceover。",
    visual: "voiceover、durationSec 保持不变，只修改 scene 和 visualDirection。",
    all: "purpose 和 durationSec 必须保持不变，其余字段根据修改指令重新生成。",
  };

  return [
    "角色：",
    "你是电商分镜编辑器。只修改指定镜头的特定字段，必须保持整条视频的叙事连贯性。",
    "",
    "整条分镜上下文（只读，用于保证修改后前后衔接）：",
    `叙事主线：${input.storyboard.narrative}`,
    `核心卖点：${input.brief.coreSellingPoint}`,
    `目标人群：${input.brief.audience.who}`,
    "全部镜头：",
    shotContext,
    "",
    `需要修改的是第 ${input.shotIndex + 1} 段镜头（index=${input.shotIndex}）：`,
    JSON.stringify(targetShot),
    "",
    `修改模式：${modeLabel[input.mode]}`,
    `修改指令：${input.instruction}`,
    "",
    "字段约束：",
    frozenFields[input.mode],
    `productAssetRef 只能使用以下 ref：${refs.join("、")}。`,
    "voiceover 不超过 15 字，使用真实口语，禁止广告体。",
    "scene 写具体地点+光线，不超过 20 字。",
    "visualDirection 写镜头类型（特写/中景/全景）+ 运动方式。",
    "修改后的镜头必须与前后段叙事衔接自然，不要引入新的商品主张。",
    "",
    "输出：",
    "只返回修改后的单个镜头 JSON，结构与输入 shot 完全一致，不要包含 Markdown。",
    "结构契约由 Ark response_format.json_schema 强制约束。",
  ].join("\n");
}
