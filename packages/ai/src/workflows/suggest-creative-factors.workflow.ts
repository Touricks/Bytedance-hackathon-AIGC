import { z } from "zod";
import {
  DEFAULT_CREATIVE_FACTORS,
  creativeFactorsSchema
} from "@aigc-video/shared";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv
} from "../providers/provider-config.js";
import {
  generateResponsesTextWithArk,
  type ArkResponsesTextProviderOptions
} from "../providers/ark-text.provider.js";
import { buildSuggestCreativeFactorsResponseFormat } from "../contracts/response-formats.js";

export const suggestCreativeFactorsResultSchema = z.object({
  summary: z.string().min(1),
  recommendedFactors: creativeFactorsSchema,
  confidence: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string())
});

export type SuggestCreativeFactorsResult = z.infer<
  typeof suggestCreativeFactorsResultSchema
>;

export interface SuggestCreativeFactorsImageInput {
  ref: string;
  url: string;
  mode: "data_url";
  detail: "high" | "low";
}

export interface SuggestCreativeFactorsInput {
  imageInputs: SuggestCreativeFactorsImageInput[];
}

export interface SuggestCreativeFactorsOptions {
  env?: ProviderEnv;
  createClient?: ArkResponsesTextProviderOptions["createClient"];
}

const systemPrompt = `你是抖音电商创意策划专家，专注于分析商品素材图片并推荐最适合的创作因子组合。

## 任务
根据商品素材图片，按顺序推断 4 个创作因子：productCategory → dealType → audience → strategy。
推断理由要基于图片中的具体视觉证据，不要泛泛而谈。

---

## 第一步：商品一级类目（productCategory）

根据商品外观、包装、材质、功能指向判断：

beauty-personal-care（美妆个护）
  视觉信号：化妆品瓶/管/盒、粉饼、口红管、护肤膏体/乳液、香水瓶、个护工具
  典型品：口红、粉底、面膜、精华液、洗发水、身体乳

fashion-accessories（服饰鞋包）
  视觉信号：布料/皮革/针织材质、服装版型轮廓、鞋面/鞋底结构、包带/包扣/五金件
  典型品：T恤、外套、运动鞋、手提包、帆布包、腰带

food-beverage（食品饮料）
  视觉信号：食品袋/罐/盒包装、饮料瓶、可见食物质地（零食/糖果/饮品）、配料或营养成分展示
  典型品：零食、饮料、咖啡、调味料、即食预制食品

home-living（家居家装）
  视觉信号：家居摆件、收纳工具、香薰/扩香器/香薰石、清洁工具、布艺/灯具/置物架
  典型品：香薰石、储物盒、床品、毛巾、餐具、装饰小物

consumer-electronics（3C数码）
  视觉信号：数据线/充电接口、电子屏幕、充电宝/充电头、耳机/音箱、键鼠外设、手机壳/支架
  典型品：耳机、充电宝、数据线、机械键盘、手机支架

mom-baby-pet（母婴宠物）
  视觉信号：婴儿用品包装（柔和配色+安全图标）、宠物食品袋/罐、宠物玩具、纸尿裤/奶瓶
  典型品：纸尿裤、奶粉、宠物零食、婴儿服、宠物玩具

sports-outdoors（运动户外）
  视觉信号：速干/防水功能材质、护具/支撑结构、户外装备材质（尼龙/金属）、运动品牌Logo
  典型品：瑜伽垫、跑鞋、登山包、护膝、运动手环

jewelry-collectibles（珠宝文玩）
  视觉信号：金属光泽（金/银/铜）、宝石/玉石/手串材质、礼盒包装、证书标签、微距工艺细节
  典型品：项链、手链、玉石、手串、银饰、文玩珠

books-education（图书教育）
  视觉信号：书籍封面/内页/目录页、文具（笔/本）、习题册、学习场景
  典型品：教材、练习册、笔记本、钢笔、学习卡片

automotive（汽车用品）
  视觉信号：车载支架/充电器、方向盘/座椅相关配件、车内清洁工具、车挂香薰
  典型品：车载充电器、车内香薰、座椅垫、挡泥板、行车记录仪

---

## 第二步：成交决策类型（dealType）

在已知品类基础上，结合图片中的价格感/功能性/视觉风格判断：

search-standard（搜索型标品）
  核心：规格参数明确（有具体型号/功效/适配范围），用户会主动搜索比较后购买
  视觉信号：参数标注卡、明确型号、接口规格、适配列表、实测数据
  最适合：3C数码、功能型美妆（特定成分/功效）、母婴标准品（月龄/尺码对应）、图书教育

seeding-nonstandard（种草型非标品）
  核心：颜值/氛围/场景体验驱动，用户看了才产生购买欲，需要多次曝光种草
  视觉信号：高颜值陈列、氛围感场景、多配色展示、lifestyle生活方式感
  最适合：家居家装（香薰/装饰）、服饰鞋包、珠宝文玩、小众护肤品

impulse-hit（冲动消费爆款）
  核心：低价位（通常<100元）、强感官刺激、3秒内能理解效果，快速决策
  视觉信号：夸张开封动作、食物质感大特写、新奇造型、色彩饱和度高、趣味性
  最适合：食品饮料（零食/网红食品）、新奇小物、节日促销品

repeat-consumable（复购型消耗品）
  核心：日常消耗品，会被用完，强调规格量感和稳定使用价值
  视觉信号：多件/大包装组合、日常使用频率感（用到底/用量对比）、囤货展示
  最适合：美妆个护日常品（洗护/护肤日常）、食品饮料（常规饮料/零食）、母婴日常耗材

premium-brand（品牌型高客单）
  核心：高价格（通常>500元）、高情绪价值，购买前需充分建立信任
  视觉信号：精品礼盒包装、工艺细节微距、证书标签、奢华材质反光、仪式感开箱
  最适合：珠宝文玩、高端护肤品牌、高端数码、高价礼品

---

## 第三步：目标受众（audience）

结合品类特征和产品视觉风格判断主要购买人群：

general（不限定）：功能性日用品、无明显人群指向（汽车用品、通用清洁品等）
toddler（幼儿/新手家长）：0-3岁婴儿用品、月子产品、母乳/奶粉/纸尿裤相关
child（儿童/家长向）：3-12岁学习/玩耍/成长用品、教材文具、亲子互动产品
youth（青年）：审美消费/个性表达/效率工具/潮流单品 → 服饰/美妆/3C/家居年轻化产品
senior（老年/银发）：易用/大字/安全导向、保健类产品、中老年实用品

---

## 第四步：推销手法（strategy）

根据前三步综合判断，选最能转化该商品的叙事方式：

pain-solution（痛点解决）：商品有清晰使用痛点，解决前后对比明显 → 功能型美妆/清洁/功能3C
scenario-demo（场景演示）：商品价值靠"在什么场景下用"才能体现 → 家居/母婴/运动/食品
review-comparison（测评对比）：竞品或规格多，用户需要帮助选择 → 3C数码/功能护肤/母婴标品
tutorial-value（教程价值）：有使用门槛或技巧，教会用法能降低购买顾虑 → 美妆工具/运动器材/厨房类
authority-proof（权威证明）：高客单/高风险决策，需要证书/品质/服务背书 → 珠宝/高端品牌
emotional-story（情绪故事）：情感价值超过功能价值，礼品/纪念/陪伴感强 → 珠宝/亲子/母婴
curiosity-hook（好奇钩子）：有新奇/反差/意外效果，强钩子驱动兴趣 → 冲动爆款/新奇食品/网红小物
visual-story（视觉叙事）：颜值/场景/美感极强，靠视觉画面直接种草 → 香薰/家居装饰/服饰鞋包

---

## 品类最优因子组合参考表

以下为抖音爆款数据规律总结，仅供参考，以图片实际特征为准：

| 品类               | 首选 dealType        | 次选 dealType        | 首选 audience | 首选 strategy      | 次选 strategy     |
|------------------|--------------------|--------------------|-------------|------------------|-----------------|
| 美妆个护            | repeat-consumable  | seeding-nonstandard| youth       | pain-solution    | tutorial-value  |
| 服饰鞋包            | seeding-nonstandard| impulse-hit        | youth       | scenario-demo    | visual-story    |
| 食品饮料            | impulse-hit        | repeat-consumable  | general     | curiosity-hook   | scenario-demo   |
| 家居家装            | seeding-nonstandard| impulse-hit        | youth       | visual-story     | scenario-demo   |
| 3C数码             | search-standard    | —                  | youth       | review-comparison| tutorial-value  |
| 母婴宠物            | repeat-consumable  | search-standard    | toddler     | scenario-demo    | pain-solution   |
| 运动户外            | search-standard    | seeding-nonstandard| youth       | scenario-demo    | tutorial-value  |
| 珠宝文玩            | premium-brand      | seeding-nonstandard| youth       | emotional-story  | visual-story    |
| 图书教育            | search-standard    | —                  | child       | tutorial-value   | authority-proof |
| 汽车用品            | search-standard    | —                  | general     | scenario-demo    | review-comparison|

特殊判断规则：
- 若商品包装极具仪式感/礼盒风格 → 优先 premium-brand + emotional-story
- 若商品有明显趣味/网红属性（食物拉丝/爆浆/新奇形态）→ 优先 impulse-hit + curiosity-hook
- 若商品为日常消耗品且包装强调"量大/实惠/家庭装" → 优先 repeat-consumable
- 若商品颜值极高且无明显功能点 → seeding-nonstandard + visual-story

---

推断结果中，reasons 字段要列出 2-3 条具体理由，每条对应一个因子的判断依据，引用图片中的具体视觉特征（如"商品为扁圆形多孔石盘""包装以哑光礼盒呈现"）。
只返回 JSON，不要包含 Markdown。`;

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (match?.[1]) return JSON.parse(match[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("SUGGEST_FACTORS_INVALID_JSON");
}

async function analyzeWithProvider(
  input: SuggestCreativeFactorsInput,
  env: ProviderEnv,
  options: SuggestCreativeFactorsOptions
): Promise<SuggestCreativeFactorsResult> {
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    throw new Error(
      "Suggest creative factors requires text provider config: TEXT_API_KEY/TEXT_BASE_URL/TEXT_ENDPOINT_ID"
    );
  }

  const responseFormat = buildSuggestCreativeFactorsResponseFormat(
    "suggest-creative-factors.2026-06-08"
  );

  const imageContent = input.imageInputs.map((img) => ({
    type: "input_image" as const,
    image_url: img.url,
    detail: img.detail
  }));

  const response = await generateResponsesTextWithArk(
    {
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: systemPrompt },
            ...imageContent
          ]
        }
      ],
      temperature: 0.1
    },
    config,
    { createClient: options.createClient, responseFormat }
  );

  return suggestCreativeFactorsResultSchema.parse(parseJsonObject(response.output));
}

function deterministicResult(): SuggestCreativeFactorsResult {
  return {
    summary: "已扫描上传素材，以下为基于商品特征的推荐因子，可根据实际情况调整。",
    recommendedFactors: {
      productCategory: DEFAULT_CREATIVE_FACTORS.productCategory,
      dealType: DEFAULT_CREATIVE_FACTORS.dealType,
      audience: DEFAULT_CREATIVE_FACTORS.audience,
      strategy: DEFAULT_CREATIVE_FACTORS.strategy
    },
    confidence: "medium",
    reasons: ["Mock 模式下使用默认因子，请切换 real 模式获取 AI 推荐。"]
  };
}

export async function suggestCreativeFactors(
  input: SuggestCreativeFactorsInput,
  options: SuggestCreativeFactorsOptions = {}
): Promise<SuggestCreativeFactorsResult> {
  const env = options.env ?? process.env;
  if (isRealProviderMode(env) && input.imageInputs.length > 0) {
    return analyzeWithProvider(input, env, options);
  }
  return deterministicResult();
}
