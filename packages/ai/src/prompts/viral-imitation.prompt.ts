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
    "你是电商爆款视频策划专家。你的任务是：根据商品 brief，从候选模板中选出最匹配的一个，把该模板的爆款逻辑融入到固定的 3 镜脚本中。",
    "",
    "## 商品信息",
    `商品名称：${brief.product.name}`,
    `品类：${brief.product.category}`,
    `核心卖点：${brief.coreSellingPoint}`,
    `目标人群：${brief.audience.who}`,
    `人群痛点/欲望：${brief.audience.painOrDesire}`,
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
    "第二步：把所选模板的爆款策略融入固定的 3 镜结构中生成分镜脚本：",
    "- shots 必须且只能有 3 项，purpose 按顺序严格是 hook、proof、cta",
    "- durationSec 按顺序严格是 4、7、4",
    "- 把模板的【Hook 技巧】用在 hook 镜头上",
    "- 把模板的【情绪弧线】体现在 3 镜的整体走向中",
    "- 把模板的【台词风格】用在所有 voiceover 上",
    "- 模板的分镜结构是参考灵感，不是逐条照搬——根据商品特点灵活融合",
    "",
    "每个分镜字段要求：",
    "",
    "voiceover 规则（全片 TTS 语速 fast，目标最大化 15 秒信息密度）：",
    "- hook/cta：字数 20-32 字（不低于 20，不超过 32）；proof：字数 35-56 字（不低于 35，不超过 56）",
    "- 【情绪/动作分离原则】voiceover 说「感受/情绪/结论」，scene 演「物理动作」——两条线不重复：",
    "  - ✗ 错误：scene 写「展示包内构」，voiceover 说「给大家看看包里面」（重复）",
    "  - ✓ 正确：scene 写「双手撑开包口向镜头展示内构」，voiceover 说「装这么多，廓形还是这样」（补充情绪/结论）",
    "- 语气像发语音给朋友，不像在念广告稿",
    "- 用口语碎片（「最近出门必背，这容量绝了」比「这款包适合日常出行」信息量多三倍）",
    "- cta 绝对禁止：「感兴趣的可以去看看哦」「喜欢的可以点一下」「心动不如行动」「手慢无」「快来了解」「点击下方」「赶紧入手」「链接在主页」",
    "- cta 推荐：留白无口播 / 「就这一个」/ 「反正我已经回购了」/ 「背上就知道了」",
    "",
    "scene 规则（最重要，必须写足三个要素）：",
    "- ① 人物或商品状态：谁在哪里，或商品以什么姿态出现",
    "- ② 具体动作：正在做什么，动作要有明确目的（「低头翻包找东西」「手指轻压皮料」「俯身整理内层」）——有目的的动作比「站着拿着」真实十倍",
    "- ③ 环境细节：至少一个具体道具或背景元素（「咖啡杯放在一旁」「背景是模糊的街道人流」「桌上散着几张纸」）",
    "",
    "【hook 专项——商品是「揭晓」而非「摆好了等你看」】",
    "- 爆款 hook 的商品出现方式：手把商品拿起/带入画面 / 身体挡住商品然后移开 / 商品从包装里被取出",
    "- ✗ 低质感：商品已经摆在桌上等你看（像广告棚）",
    "- ✓ 高质感：手从画面边缘把包举起，侧光打亮皮面的瞬间（商品在动作中「出现」）",
    "",
    "【人物构图专项约束——防止 AI 模特感】",
    "- 优先选择局部入镜而非全身：背影/肩部以下/手部特写/侧身 45°——全身正面站姿是 AI 最容易生成僵硬模特的构图",
    "- 人物的视线和注意力必须指向商品或动作，不要正视镜头（「低头看包」「眼神看向手中的东西」「侧脸）",
    "- 动作要有物理目的：「低头翻包找东西」✓ / 「拿着包微笑站立」✗",
    "- ✗ 错误：「女生站在街头自然光下拿着包微笑」（全身正面+直视镜头+无目的=AI模特）",
    "- ✓ 正确：「女生背对镜头走向咖啡馆门口，包斜挎在右肩，侧光勾勒出包的轮廓，背景是虚化的玻璃门」",
    "- ✓ 正确：「手从画面左侧伸入，拨开包的前袋拉链，手背和拉链头占画面下半部分，背景是模糊的木桌」",
    "",
    "proof 专项规则——必须有「产品功能操作演示」，主角是商品本身而非人物：",
    "- 核心原则：镜头聚焦商品，用双手操作来展示产品，避免出现人物面部或全身（AI 生成的人脸/上身说服力弱）",
    "- 按品类选择展示动作：",
    "  - 包袋/皮具：商品平放，① 双手撑开包口展示包内观/隔层结构 ② 拉开拉链展示内袋 ③ 手指揉捏皮料展示质感回弹——主体始终是包，不是拿包的人",
    "  - 护肤/美妆：① 挤出/倒出产品在手背上，手指抹开展示质地/延展性 ② 翻转展示成分表——主体是手+产品特写",
    "  - 服装/面料：① 手指触摸面料近景，感受垂感 ② 展示缝线/接缝/工艺细节特写 ③ 轻轻拽起面料展示悬垂感——主体是面料特写，不是穿搭全身",
    "  - 食品：① 打开包装/袋子 ② 掰开/切开展示内部截面（面包芯/夹馅/层次）③ 手拿起食物靠近镜头，近距离拍颜色质地——主体是食物",
    "  - 日用品/器具：① 实际操作（倒水/开关/按压）② 展示结果（无渗漏/回弹截面）③ 底部/侧面工艺特写",
    "- proof 7 秒建议分两段：前段质感/材质（触觉维度），后段功能/容量（使用维度）——两层叠加更有说服力",
    "- proof 的 voiceover 说「操作后的结果感受」，不列功能清单（「就这个质感，指甲这么捏根本不留痕」比「质量好材质佳」有力）",
    "",
    "scene 物理重量感：涉及放置/拿起/操作商品时写出重量和惯性",
    "- ✗「把包放在桌上」",
    "- ✓「将包缓缓放置到木桌，包底接触桌面后皮料略向外扩，有轻微下沉感」",
    "",
    "scene 色调建议：背景/道具/环境优先与商品色调统一（暖色商品配暖米/木纹背景），避免冷暖混搭",
    "",
    "visualDirection：镜头类型（特写/中景/全景）+ 运动方式 + 角度；优先「镜头固定，主体动」",
    "productAssetRef：从可用素材 ref 中选择",
    "transition：镜头切换方式",
    "",
    "第三步：写一句 narrative（整体叙事主线，20-50字），说明这套脚本的爆款逻辑。",
    "",
    "输出要求：",
    "- 严格按 JSON Schema 输出，不要包含 Markdown",
    "- viralTemplateUsed 填模板名称",
    "- matchReason 一句话说明为什么选这个模板",
  ]
    .filter(Boolean)
    .join("\n");
}
