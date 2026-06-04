import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";
import { buildModulePrompt } from "./module-prompt-assembler.js";

export const SHOTPROMPT_PROMPT_VERSION = "video-shotprompt.v1";

export interface BuildShotPromptPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

export interface BuildShotPromptPromptViewInput extends BuildShotPromptPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

interface CategoryVisualPreset {
  label: string;
  providerPromptStyle: string;
  shotImageStyle: string;
  keywords: RegExp;
}

const CATEGORY_VISUAL_PRESETS: CategoryVisualPreset[] = [
  {
    label: "食品饮品",
    keywords: /食品|零食|饮品|餐饮|食物|美食|茶|咖啡|烘焙|糖果|坚果|乳制|调味|速食|特产|预制/,
    providerPromptStyle:
      "【食品品类】美食写真风格：暖橙金色调高饱和，侧逆光让食材纹理发光通透，食物表面有细腻光泽；hook 镜头必须有动态元素（蒸汽/流动/拉伸/掰开瞬间）；benefit/proof 强调质地细节（酥脆纹理/流心截面/水珠食材）；禁止冷色调，禁止平铺俯拍无光感构图",
    shotImageStyle:
      "美食写真，暖橙金色调，高饱和，侧逆光使食材纹理发光，食物表面有细腻光泽，背景浅焦虚化，画面通透有食欲感",
  },
  {
    label: "美妆护肤",
    keywords: /护肤|彩妆|美妆|面膜|精华|口红|粉底|眼影|防晒|美容|护发|香水/,
    providerPromptStyle:
      "【美妆品类】柔光美肤风格：柔和漫射光突出肌肤质感，产品质地特写（膏体/液体流动/涂抹过程），色彩准确还原产品色号，皮肤细腻无瑕疵感，整体干净明亮",
    shotImageStyle:
      "美妆写真，柔和漫射光，色彩准确高还原，产品质地特写清晰，肤感细腻，背景简洁不抢镜，整体明亮通透",
  },
  {
    label: "3C数码",
    keywords: /数码|3C|耳机|手机|电脑|平板|相机|充电|智能|电子|小家电|数码配件/,
    providerPromptStyle:
      "【数码品类】科技产品摄影风格：冷白或深色简洁背景，产品光泽金属感突出，边缘线条清晰锐利，功能细节特写（接口/按键/屏幕显示），光线方向明确制造高光和阴影对比",
    shotImageStyle:
      "科技产品摄影，冷白简洁背景，金属光泽感，边缘线条锐利，细节特写清晰，方向光制造高光对比，整体干净精致",
  },
  {
    label: "运动健身",
    keywords: /运动|健身|户外|跑步|瑜伽|球|器材|保健|营养|蛋白/,
    providerPromptStyle:
      "【运动品类】高动感风格：高对比度+高饱和，运动状态中的人物动态抓拍感，汗水质感真实，光线强调肌肉轮廓和运动张力，整体充满能量感",
    shotImageStyle:
      "运动写真，高对比度高饱和，动态抓拍感，汗水质感，强方向光强调轮廓，充满能量",
  },
  {
    label: "母婴",
    keywords: /母婴|婴儿|儿童|宝宝|孕妇|玩具|辅食|奶粉|纸尿裤/,
    providerPromptStyle:
      "【母婴品类】温馨柔和风格：暖白柔光无硬阴影，色调温和干净，画面传递安全感和温柔感，场景真实家庭感，禁止强对比或冷色调",
    shotImageStyle:
      "母婴写真，暖白柔光，色调温和，安全感温馨感，真实家庭场景，整体柔和明亮",
  },
];

function getCategoryVisualPreset(category: string | undefined): CategoryVisualPreset | null {
  if (!category) return null;
  return CATEGORY_VISUAL_PRESETS.find((p) => p.keywords.test(category)) ?? null;
}

function voiceoverPreview(input: StoryboardArtifact) {
  return input.shots
    .map((shot) => `${shot.index + 1}. ${shot.voiceover}`)
    .join("\n");
}

export function buildShotPromptPromptView(
  input: BuildShotPromptPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "视频生成提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "你是 Seedance 视频生成提示词构建器。请把已确认分镜转成商家可编辑、可传给 provider 的视频生成提示词。",
        },
        {
          id: "approved_storyboard",
          label: "已确认分镜",
          body: input.storyboard.narrative,
        },
        {
          id: "voiceover_source",
          label: "口播来源",
          body: voiceoverPreview(input.storyboard) || "分镜中没有可用口播。",
        },
        {
          id: "task",
          label: "任务",
          body: "生成面向 Seedance 的提示词，必须保留商品、时间、参考素材和口播。V1 不生成字幕。",
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 targetProvider、durationSec、aspectRatio、prompt、negativePrompt、shots、tts 和 assumptions。",
        },
      ],
    },
    variables: {
      aspectRatio: input.aspectRatio,
      storyboardShotCount: input.storyboard.shots.length,
      voiceoverSource: "shots.voiceover",
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildShotPromptPrompt(input: BuildShotPromptPromptInput) {
  const categoryPreset = getCategoryVisualPreset(input.brief.product.category);

  const runtimeLines = [
    "输入：",
    `画幅比例：${input.aspectRatio}`,
    "已确认商品 brief：",
    JSON.stringify({
      product: { name: input.brief.product.name, category: input.brief.product.category },
      audience: input.brief.audience,
      coreSellingPoint: input.brief.coreSellingPoint,
      brandTone: input.brief.brandTone,
      bannedExpressions: input.brief.bannedExpressions,
    }),
    "已确认素材清单：",
    JSON.stringify(input.material.assets),
    "已确认分镜：",
    JSON.stringify({
      narrative: input.storyboard.narrative,
      totalDurationSec: input.storyboard.totalDurationSec,
      shots: input.storyboard.shots.map((s) => ({
        index: s.index,
        purpose: s.purpose,
        durationSec: s.durationSec,
        scene: s.scene,
        visualDirection: s.visualDirection,
        productAssetRef: s.productAssetRef,
        voiceover: s.voiceover,
      })),
    }),
  ];

  if (categoryPreset) {
    runtimeLines.push(
      "",
      `品类视觉风格预设（${categoryPreset.label}）：`,
      `providerPrompt 风格基调：${categoryPreset.providerPromptStyle}`,
      `shotImage style：${categoryPreset.shotImageStyle}`,
    );
  }

  if (input.brief.bannedExpressions.length > 0) {
    runtimeLines.push(
      "",
      `合规禁用词（providerPrompt 和 voiceover 中绝对不得出现）：${input.brief.bannedExpressions.join("、")}`,
    );
  }

  return buildModulePrompt({
    moduleId: "shotprompt",
    runtimeContext: runtimeLines.join("\n"),
  }).prompt;
}
