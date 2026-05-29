import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const STORYBOARD_PROMPT_VERSION = "ugc-storyboard.v1";

export type StoryboardTemplateStyle =
  | "种草"
  | "开箱"
  | "lifestyle"
  | "卖点";

export interface BuildStoryboardPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  templateStyle?: StoryboardTemplateStyle;
}

export interface BuildStoryboardPromptViewInput extends BuildStoryboardPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function hookStrategyGuide(angleType: ProductBriefArtifact["angleType"]) {
  const guides: Record<NonNullable<ProductBriefArtifact["angleType"]>, string> = {
    problem_solution: "开口提问直击痛点，例如「你是不是每次都……」，让观众感到被理解后自然停留。",
    before_after: "先用画面展示反差结果，不需要开口，视觉冲击就是钩子，再引出怎么做到的。",
    lifestyle_upgrade: "用强视觉场景制造生活向往，不必解释，画面本身就让人想停下来看。",
    trust_proof: "用具体数字或事实开场，例如「XX 万人选择的原因是……」，建立即时信任感。",
    budget_value: "直接报价冲击，例如「XX 元，比你想的便宜多了」，价格本身就是最强钩子。",
  };
  return angleType ? guides[angleType] : "根据商品特点选择最能在 1-2 秒内制造停滑动力的手法。";
}

function templateStyleGuide(style: StoryboardTemplateStyle | undefined): string {
  if (!style) return "";
  const guides: Record<StoryboardTemplateStyle, string> = {
    种草: [
      "【种草风格】整体像真实用户的真诚安利，不像广告。",
      "叙事语气：「我最近发现了一个宝藏，用了之后根本停不下来……」",
      "Hook：以创作者个人发现/惊喜开场，不直接介绍商品。",
      "benefit 段：分享使用体验而非功能介绍，带入真实生活场景。",
      "proof 段：用「我用了多久/多少次」等真实细节佐证，不用品牌数据。",
      "CTA：轻推荐，如「感兴趣的可以去看看」，不强迫。",
    ].join(" "),
    开箱: [
      "【开箱风格】以拆开包装/初次接触商品为叙事主线，主打第一印象和惊喜感。",
      "叙事语气：兴奋、真实、边看边说，像正在直播开箱。",
      "Hook：直接展示包装/快递，制造「这是什么」的好奇心。",
      "benefit 段：逐步展示商品细节，每展示一个细节说一句感受。",
      "proof 段：重点展示做工/材质/细节特写，让质感说话。",
      "CTA：「开箱完全超出预期，链接在主页」类自然结尾。",
    ].join(" "),
    lifestyle: [
      "【生活方式风格】用理想生活场景驱动，商品是生活美好的一部分，不是主角。",
      "叙事语气：安静、美好、有质感，像一条生活 vlog 的片段。",
      "Hook：先呈现令人向往的生活画面，不急着出商品。",
      "benefit 段：商品在场景中自然使用，强调「有了它，生活变成这样」。",
      "proof 段：氛围感细节，如清晨/傍晚/整洁的空间，情绪价值大于功能。",
      "CTA：留白式，让画面本身产生购买冲动，文字 CTA 极轻。",
    ].join(" "),
    卖点: [
      "【强卖点风格】直接、高效、以利益点驱动转化，适合决策快的低价商品。",
      "叙事语气：清晰、有力、每句话都有信息量，不废话。",
      "Hook：开门见山说最强利益点或价格，1 秒内让人觉得「值得继续看」。",
      "benefit 段：逐条列出核心功能/卖点，视觉配合文字说明，节奏快。",
      "proof 段：数据/对比/使用前后，用事实而非情绪说服。",
      "CTA：直接行动引导，如「现在下单」「今天截止」，不含糊。",
    ].join(" "),
  };
  return guides[style];
}

function storyboardMaterialSummary(input: MaterialIntakeArtifact) {
  return input.assets
    .filter((asset) => asset.included)
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}, ${asset.role}): ${asset.description}`,
    )
    .join("\n");
}

export function buildStoryboardPromptView(
  input: BuildStoryboardPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "口播分镜提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "你是电商口播分镜构建器。请把一份已确认商品 brief 转成商家可编辑的短视频分镜。",
        },
        {
          id: "approved_brief",
          label: "已确认商品 brief",
          body: `${input.brief.product.name}：${input.brief.coreSellingPoint}。目标人群：${input.brief.audience.who}。语气：${input.brief.brandTone}。角度：${input.brief.angleType ?? "未指定"}。情绪锚点：${input.brief.emotionalTrigger ?? "未指定"}。转化风格：${input.brief.conversionStyle ?? "未指定"}。`,
        },
        {
          id: "approved_material",
          label: "已确认素材",
          body:
            storyboardMaterialSummary(input.material) ||
            "没有可纳入生成的素材。",
        },
        {
          id: "hook_strategy",
          label: "Hook 策略",
          body: hookStrategyGuide(input.brief.angleType),
        },
        ...(input.templateStyle
          ? [
              {
                id: "template_style",
                label: "模板风格",
                body: templateStyleGuide(input.templateStyle),
              },
            ]
          : []),
        {
          id: "task",
          label: "任务",
          body: "按照 6 段时间线生成 12 秒抖音带货分镜：0-2s hook 停滑钩子、2-5s benefit 痛点共鸣、5-8s benefit 商品出现、8-10s proof 核心卖点、10-11s proof 信任支撑、11-12s cta 购买引导。每段 voiceover 不超过 15 字，使用创作者口语，禁止广告体。",
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 narrative、totalDurationSec、shots 和 assumptions。每个 shot 包含 purpose、durationSec、scene、visualDirection、productAssetRef、voiceover 和 transition。不要要求生成视频里出现可读文字。",
        },
      ],
    },
    variables: {
      productName: input.brief.product.name,
      coreSellingPoint: input.brief.coreSellingPoint,
      audience: input.brief.audience.who,
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildStoryboardPrompt(input: BuildStoryboardPromptInput) {
  return [
    "角色：",
    "你是电商口播分镜构建器。你要把一份已确认商品 brief 转成商家可编辑的短视频分镜。",
    "",
    "输入：",
    "已确认商品 brief：",
    JSON.stringify(input.brief),
    "已确认素材清单：",
    JSON.stringify(input.material.assets),
    "",
    "任务：",
    "只生成一条电商短视频分镜，整体风格必须像真实创作者拍摄，不像品牌广告。",
    "商品应自然融入生活场景，不要摆拍感，不要硬插产品镜头。",
    ...(input.templateStyle
      ? [
          "",
          "模板风格约束（优先级高于默认风格，整条分镜必须符合以下风格定义）：",
          templateStyleGuide(input.templateStyle),
          "",
        ]
      : []),
    "",
    "严格按照以下 6 段时间线分配 shots，每段有对应的情绪质地：",
    "- 0-2s  purpose=hook    情绪：紧迫/好奇/共鸣。" + hookStrategyGuide(input.brief.angleType),
    "- 2-5s  purpose=benefit 情绪：认同/代入。一句话戳中目标人群的痛点或欲望，情绪锚点：" + (input.brief.emotionalTrigger ?? "根据人群自行判断"),
    "- 5-8s  purpose=benefit 情绪：期待/好感。商品自然出现在生活场景中，不要广告腔，像朋友分享而不是品牌推销。",
    "- 8-10s purpose=proof   情绪：信任/惊喜。用一句话 + 具体细节或使用效果呈现核心卖点。",
    "- 10-11s purpose=proof  情绪：确信。用数据、细节或真实使用场景强化信任感，不要重复上一段。",
    "- 11-12s purpose=cta    情绪：行动向往。轻 CTA，风格：" + (input.brief.conversionStyle === "direct_cta" ? "直接告诉观众现在去买" : input.brief.conversionStyle === "personal_recommendation" ? "以创作者身份真诚推荐" : input.brief.conversionStyle === "problem_triggered_cta" ? "先提痛点再给出行动指引" : "自然引导，不强迫") + "。",
    "",
    "scene 字段：写具体可视化的场景，包含地点/物品/光线，不超过 20 字，禁止抽象描述（「温馨场景」「精致画面」）。",
    "visualDirection 字段：写镜头类型（特写/中景/全景）+ 运动方式（推进/拉远/静止/跟随），要具体可执行。",
    "voiceover 不超过 15 字，使用真实对话口语（「你有没有发现……」「我之前一直觉得……」），禁止广告体（「震撼来袭」「全场最低」）。",
    "忠实保留 brief 中唯一的 coreSellingPoint，不要引入新的商品主张。",
    "每个 shots[].purpose 必须严格是 hook、benefit、proof、cta 之一，不要使用自然语言目的标签。",
    "每个 shots[].productAssetRef 必须是已确认素材清单中的非空 ref。",
    "productAssetRef 只能使用已确认素材清单里的值。",
    "如果只有一个纳入生成的素材 ref，每个 shot 都使用该 ref。",
    "不要要求生成视频里出现可读文字。",
    "不要写 Seedance 图生视频提示词或最终 provider prompt 字符串。",
    "",
    "输出：",
    "返回严格 JSON，匹配以下结构，不要包含 Markdown：",
    JSON.stringify({
      narrative: "整条视频的叙事主线，一句话概括情绪转变弧线",
      totalDurationSec: 12,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 2,
          scene: "具体地点+物品+光线，不超过20字",
          visualDirection: "镜头类型（特写/中景/全景）+ 运动方式（推进/静止）",
          productAssetRef: "product.png",
          voiceover: "不超过15字的口语化台词",
          transition: "cut",
        },
        {
          index: 1,
          purpose: "benefit",
          durationSec: 3,
          scene: "具体地点+物品+光线，不超过20字",
          visualDirection: "镜头类型 + 运动方式",
          productAssetRef: "product.png",
          voiceover: "不超过15字的口语化台词",
          transition: "cut",
        },
        {
          index: 2,
          purpose: "benefit",
          durationSec: 3,
          scene: "具体地点+物品+光线，不超过20字",
          visualDirection: "镜头类型 + 运动方式",
          productAssetRef: "product.png",
          voiceover: "不超过15字的口语化台词",
          transition: "cut",
        },
        {
          index: 3,
          purpose: "proof",
          durationSec: 2,
          scene: "具体地点+物品+光线，不超过20字",
          visualDirection: "镜头类型 + 运动方式",
          productAssetRef: "product.png",
          voiceover: "不超过15字的口语化台词",
          transition: "cut",
        },
        {
          index: 4,
          purpose: "proof",
          durationSec: 1,
          scene: "具体地点+物品+光线，不超过20字",
          visualDirection: "镜头类型 + 运动方式",
          productAssetRef: "product.png",
          voiceover: "不超过15字的口语化台词",
          transition: "cut",
        },
        {
          index: 5,
          purpose: "cta",
          durationSec: 1,
          scene: "具体地点+物品+光线，不超过20字",
          visualDirection: "镜头类型 + 运动方式",
          productAssetRef: "product.png",
          voiceover: "不超过15字的轻CTA台词",
          transition: "cut",
        },
      ],
      assumptions: ["字符串"],
    }),
  ].join("\n");
}
