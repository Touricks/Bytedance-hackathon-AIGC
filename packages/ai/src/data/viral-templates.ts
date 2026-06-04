import type { ProductBriefArtifact } from "@aigc-video/shared";

export interface ViralTemplateShotStructure {
  purpose: "hook" | "benefit" | "proof" | "cta";
  description: string;
  durationSec: number;
}

export interface ViralTemplate {
  id: string;
  name: string;
  categories: string[];
  angleTypes: string[];
  hookTechnique: string;
  structure: ViralTemplateShotStructure[];
  emotionalArc: string;
  copyStyle: string;
}

export const VIRAL_TEMPLATES: ViralTemplate[] = [
  {
    id: "beauty-pain-transform",
    name: "美妆/护肤 · 痛点蜕变型",
    categories: ["护肤品", "彩妆", "美容仪器", "美妆", "护肤"],
    angleTypes: ["problem_solution", "before_after"],
    hookTechnique: "年龄/皮肤焦虑开场，制造危机感",
    structure: [
      { purpose: "hook", description: "展示皮肤痛点场景（暗沉/细纹/痘痘），直接说出目标人群的困境", durationSec: 2 },
      { purpose: "benefit", description: "产品使用过程特写，强调质地/气味/上脸感受", durationSec: 3 },
      { purpose: "benefit", description: "7天/30天效果对比，画面切换前后", durationSec: 3 },
      { purpose: "proof", description: "真实素人反馈或成分权威背书", durationSec: 2 },
      { purpose: "proof", description: "具体数字（98%用户/皮肤科认证/XX万人在用）", durationSec: 1 },
      { purpose: "cta", description: "限时价格+催促（今天下单立减/名额有限）", durationSec: 1 },
    ],
    emotionalArc: "焦虑 → 好奇 → 惊喜 → 信任 → 行动冲动",
    copyStyle: "口语化自述，第一人称，避免广告腔",
  },
  {
    id: "tech-scene-pain",
    name: "3C/数码 · 场景痛点型",
    categories: ["耳机", "手机配件", "小家电", "智能设备", "数码", "3C", "电子"],
    angleTypes: ["problem_solution"],
    hookTechnique: "展示没有这个产品时的尴尬场景",
    structure: [
      { purpose: "hook", description: "没有此产品的痛苦场景（地铁噪音/充电焦虑/信号差）", durationSec: 2 },
      { purpose: "benefit", description: "产品解决问题的瞬间，强调使用感受", durationSec: 3 },
      { purpose: "benefit", description: "核心功能演示，用数据说话（降噪40dB/续航72小时）", durationSec: 3 },
      { purpose: "proof", description: "与竞品对比或专业测评截图", durationSec: 2 },
      { purpose: "proof", description: "真实使用场景，用户好评语录", durationSec: 1 },
      { purpose: "cta", description: "价格锚定（原价XX，现在只要XX）+行动引导", durationSec: 1 },
    ],
    emotionalArc: "共鸣痛点 → 解脱感 → 理性认可 → 价值确认 → 下单",
    copyStyle: "直接、干脆，多用数字和对比",
  },
  {
    id: "food-appetite-shock",
    name: "食品/零食 · 食欲冲击型",
    categories: ["零食", "饮品", "预制食品", "特产", "食品", "餐饮"],
    angleTypes: ["lifestyle_upgrade", "trust_proof"],
    hookTechnique: "用「money shot」开场：拉丝/冒热气/截面/酱汁坠落/手掰开的瞬间——无需旁白，画面本身就是钩子",
    structure: [
      { purpose: "hook", description: "产品最有感官冲击力的动态画面极近特写：拉丝瞬间/热气升腾/截面纹理/酱汁淋下/手掰开的断面——画面填满，无旁白", durationSec: 2 },
      { purpose: "benefit", description: "食材/用料的新鲜感特写：水珠在食材表面、切开的饱满截面、倒入锅里的天然原料——让观众感知用料品质，旁白轻描食材亮点", durationSec: 3 },
      { purpose: "benefit", description: "第一口入镜的真实反应：手拿/夹起食物、送入口中、咀嚼时真实表情（不夸张）——重点是食物入镜时的质感，旁白描述口感触感", durationSec: 3 },
      { purpose: "proof", description: "产地/工艺的可视化细节：产地实景/手工制作过程/新鲜日期近景——用画面建立品质信任，不用销量数字", durationSec: 2 },
      { purpose: "proof", description: "包装/配料表/认证标志近景特写，或复购/分享的真实场景——细节建立信任", durationSec: 1 },
      { purpose: "cta", description: "食物在自然场景中的满足感收尾（早餐桌/下午茶/宵夜氛围），余韵感强，不制造稀缺焦虑", durationSec: 1 },
    ],
    emotionalArc: "食欲瞬间激发 → 食材好奇/品质感知 → 口感代入 → 品质信任 → 自然想拥有",
    copyStyle: "感官词驱动：写质地（酥/脆/绵/糯/流心）、温度（滚烫/冰凉/温热）、声音联觉（听得见的酥脆感）；旁白轻，留白给画面；禁止「好吃到爆」「人间美味」等空洞感叹词",
  },
  {
    id: "fashion-lifestyle-upgrade",
    name: "服装/穿搭 · 生活升级型",
    categories: ["服装", "鞋包", "饰品", "穿搭", "包", "鞋子", "配饰"],
    angleTypes: ["lifestyle_upgrade", "before_after"],
    hookTechnique: "用松弛感强的日常场景开场，商品自然出现，不制造「变了一个人」的紧张感",
    structure: [
      { purpose: "hook", description: "真实生活片段，商品随手出现在画面，氛围感驱动停留（不是痛点）", durationSec: 2 },
      { purpose: "benefit", description: "人在日常场景中自然使用/佩戴产品，画面松弛不刻意，像朋友随手拍", durationSec: 3 },
      { purpose: "benefit", description: "产品细节特写，强调质感和做工，voiceover 轻描淡写「就是那种感觉」", durationSec: 3 },
      { purpose: "proof", description: "不同场合/搭配下的真实上身/使用效果，强调自然好看而非变身", durationSec: 2 },
      { purpose: "proof", description: "材质/工艺细节或真实用户反馈，建立品质信任", durationSec: 1 },
      { purpose: "cta", description: "轻推荐语气，「感兴趣去看看」「链接挂主页了」，不制造稀缺紧迫感", durationSec: 1 },
    ],
    emotionalArc: "氛围吸引 → 自然好感 → 品质认可 → 不费力的满足感 → 轻松下单",
    copyStyle: "松弛随意，留白多，像真实用户分享而非广告，不说「变了一个人」",
  },
  {
    id: "home-lazy-essentials",
    name: "家居/生活用品 · 懒人刚需型",
    categories: ["收纳", "清洁", "厨房用品", "家装", "家居", "生活用品"],
    angleTypes: ["problem_solution", "before_after"],
    hookTechnique: "展示家里乱/脏/不便的真实痛苦场面",
    structure: [
      { purpose: "hook", description: "没有此产品时的混乱/麻烦/费时场景", durationSec: 2 },
      { purpose: "benefit", description: "产品使用过程，强调省力/省时/好用", durationSec: 3 },
      { purpose: "benefit", description: "使用前后对比（乱→整齐/脏→干净）", durationSec: 3 },
      { purpose: "proof", description: "具体节省时间/空间数据", durationSec: 2 },
      { purpose: "proof", description: "家人/朋友的反应，真实互动", durationSec: 1 },
      { purpose: "cta", description: "组合装/套装优惠+下单引导", durationSec: 1 },
    ],
    emotionalArc: "共鸣麻烦 → 解脱轻松 → 效果惊喜 → 实用认可 → 下单",
    copyStyle: "接地气，说大白话，强调「真的好用」",
  },
  {
    id: "sport-self-discipline",
    name: "运动/健康 · 自律激励型",
    categories: ["运动器材", "保健品", "健身装备", "运动", "健康", "健身"],
    angleTypes: ["problem_solution", "lifestyle_upgrade"],
    hookTechnique: "用「你是不是也…」直接点名目标人群的懈怠感",
    structure: [
      { purpose: "hook", description: "点名懒惰/亚健康的生活状态，引发自我代入", durationSec: 2 },
      { purpose: "benefit", description: "产品如何降低运动门槛/让健康更简单", durationSec: 3 },
      { purpose: "benefit", description: "坚持使用的正向变化（体重/状态/精力）", durationSec: 3 },
      { purpose: "proof", description: "用户打卡记录或真实成果截图", durationSec: 2 },
      { purpose: "proof", description: "专家/KOL背书或科学数据", durationSec: 1 },
      { purpose: "cta", description: "限时优惠+今天就开始的行动召唤", durationSec: 1 },
    ],
    emotionalArc: "自我审视 → 希望燃起 → 信任建立 → 决心激发 → 下单",
    copyStyle: "励志但不鸡汤，真实感强，有同理心",
  },
  {
    id: "baby-safety-care",
    name: "母婴 · 安心守护型",
    categories: ["婴儿用品", "儿童食品", "母婴护肤", "母婴", "儿童"],
    angleTypes: ["trust_proof"],
    hookTechnique: "用孩子/宝宝的可爱或安全焦虑开场",
    structure: [
      { purpose: "hook", description: "展示孩子的需求或妈妈的担忧（安全/成长/健康）", durationSec: 2 },
      { purpose: "benefit", description: "产品安全认证/成分天然特写", durationSec: 3 },
      { purpose: "benefit", description: "宝宝实际使用场景，真实反应", durationSec: 3 },
      { purpose: "proof", description: "权威认证/医生推荐/检测报告", durationSec: 2 },
      { purpose: "proof", description: "妈妈群真实好评，情感共鸣", durationSec: 1 },
      { purpose: "cta", description: "买给孩子最好的+下单引导", durationSec: 1 },
    ],
    emotionalArc: "共情担忧 → 安心感 → 信任建立 → 母爱认同 → 下单",
    copyStyle: "温暖、安心、有情感，站在妈妈的视角说话",
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/·,，。、]+/)
    .filter(Boolean);
}

function scoreTemplate(template: ViralTemplate, brief: Pick<ProductBriefArtifact, "product">): number {
  let score = 0;
  const categoryTokens = tokenize(brief.product.category);

  for (const cat of template.categories) {
    const catTokens = tokenize(cat);
    for (const token of categoryTokens) {
      if (catTokens.some((t) => t.includes(token) || token.includes(t))) {
        score += 3;
        break;
      }
    }
  }

  const nameMatch = tokenize(template.name).some((t) =>
    categoryTokens.some((ct) => ct.includes(t) || t.includes(ct)),
  );
  if (nameMatch) score += 1;

  return score;
}

export function searchTemplates(
  brief: Pick<ProductBriefArtifact, "product">,
  topK = 3,
): ViralTemplate[] {
  const scored = VIRAL_TEMPLATES.map((t) => ({
    template: t,
    score: scoreTemplate(t, brief),
  })).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, topK);
  if (top.length === 0 || top[0]!.score === 0) {
    return VIRAL_TEMPLATES.slice(0, topK);
  }
  return top.map((s) => s.template);
}
