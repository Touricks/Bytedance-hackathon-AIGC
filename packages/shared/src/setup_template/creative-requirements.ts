import { z } from "zod";

/**
 * 商品种类：虚拟服务 / 可消耗实体 / 不可消耗实体
 */
export const productTypeSchema = z.enum([
  "virtual-service", // 虚拟服务
  "consumable", // 可消耗实体
  "durable", // 不可消耗实体
]);
export type ProductType = z.infer<typeof productTypeSchema>;

/**
 * 适用人群：幼儿 / 儿童 / 青年 / 老年
 */
export const audienceSchema = z.enum([
  "toddler", // 幼儿
  "child", // 儿童
  "youth", // 青年
  "senior", // 老年
]);
export type Audience = z.infer<typeof audienceSchema>;

export const creativeRequirementTemplateValuesSchema = z.object({
  imageStyle: z.string().trim().min(1),
  imageComposition: z.string().trim().min(1),
  imageAvoid: z.string().trim().min(1),
  scriptTone: z.string().trim().min(1),
  storyboardRhythm: z.string().trim().min(1),
  shotImageGlobal: z.string().trim().min(1),
  shotVideoGlobal: z.string().trim().min(1),
});

export const creativeRequirementTemplateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  // 分类维度：商品种类 + 适用人群（人群用数组，单模板可覆盖多类，如母婴覆盖幼儿+儿童）
  productType: productTypeSchema,
  audiences: z.array(audienceSchema).min(1),
  values: creativeRequirementTemplateValuesSchema,
});

export const creativeRequirementTemplatesSchema = z
  .array(creativeRequirementTemplateSchema)
  .min(1)
  .superRefine((templates, context) => {
    const seen = new Set<string>();
    for (const [index, template] of templates.entries()) {
      if (seen.has(template.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Duplicate creative requirement template id: ${template.id}`,
        });
      }
      seen.add(template.id);
    }
  });

export type CreativeRequirementTemplate = z.infer<
  typeof creativeRequirementTemplateSchema
>;

export const CREATIVE_REQUIREMENT_TEMPLATES = [
  // ① 可消耗实体 × 青年 —— 日常快消，最高频场景
  {
    id: "consumable-youth-seeding",
    name: "快消种草·青年",
    summary: "自然种草质感，体验驱动，痛点到下单顺滑。",
    productType: "consumable",
    audiences: ["youth"],
    values: {
      imageStyle: "真实生活感种草质感，保留商品包装、质地和使用瞬间的真实细节",
      imageComposition: "手部或人物与商品自然互动，商品始终是焦点，生活化背景但不杂乱",
      imageAvoid: "硬广摆拍，夸张滤镜，商品变形，虚假成分对比，违规功效贴片",
      scriptTone: "亲切真实有体验感，像朋友安利，卖点和使用感受清晰",
      storyboardRhythm: "开场抓痛点或场景，快速给体验和卖点，结尾给明确购买理由和优惠钩子",
      shotImageGlobal: "分镜图保持同一生活场景、商品包装和用量一致，人物动作自然可信",
      shotVideoGlobal: "镜头轻量自然贴近手机实拍，开箱、使用、特写节奏与口播一致",
    },
  },
  // ② 不可消耗实体 × 青年 —— 数码家居好物
  {
    id: "durable-youth-showcase",
    name: "数码家居·青年",
    summary: "质感实拍，功能可视化，参数到场景说服。",
    productType: "durable",
    audiences: ["youth"],
    values: {
      imageStyle: "精致实拍质感，材质、做工和品牌识别清晰，兼顾科技感和生活感",
      imageComposition: "主体稳定居中或场景化摆放，留白克制，突出关键功能部位",
      imageAvoid: "廉价影棚感，参数贴片造假，商品变形，多余配件抢占画面，环境漂移",
      scriptTone: "理性可信，强调功能、参数和使用场景，专业但不晦涩",
      storyboardRhythm: "开场点需求，中段功能演示加参数证明，结尾场景代入和行动引导",
      shotImageGlobal: "分镜图延续同一商品身份、配色和环境，功能特写保持结构真实",
      shotVideoGlobal: "运镜稳定流畅，功能演示连贯，前后镜头空间一致，避免突兀转场",
    },
  },
  // ③ 虚拟服务 × 青年 —— 知识/服务转化
  {
    id: "virtual-youth-conversion",
    name: "知识服务·青年",
    summary: "信任驱动，价值可视化，效果到报名转化。",
    productType: "virtual-service",
    audiences: ["youth"],
    values: {
      imageStyle: "干净专业的概念化视觉，用人物、界面或场景具象化抽象服务",
      imageComposition: "主信息清晰，图文层次分明，避免空洞抽象画面",
      imageAvoid: "纯文字大字报，夸大效果承诺贴片，虚假数据，与服务无关的炫技画面",
      scriptTone: "可信有价值感，强调能解决什么问题、带来什么结果，避免空泛和绝对化承诺",
      storyboardRhythm: "开场点焦虑或目标，中段讲方法和成果证明，结尾给低门槛行动引导",
      shotImageGlobal: "分镜图统一视觉语言和品牌色，人物或界面演示保持一致身份",
      shotVideoGlobal: "节奏明快信息密度高，画面切换贴合服务口播逻辑，避免冗长空镜",
    },
  },
  // ④ 可消耗实体 × 老年 —— 银发健康滋补（常为子女代购）
  {
    id: "consumable-senior-health",
    name: "银发滋补·老年",
    summary: "温暖可信，功效克制合规，自用与孝心送礼双视角。",
    productType: "consumable",
    audiences: ["senior"],
    values: {
      imageStyle: "温暖真实的生活质感，保留商品和食用场景真实细节，画面明亮安心",
      imageComposition: "商品与温馨家庭或自用场景结合，主体清晰，避免冰冷影棚感",
      imageAvoid: "夸大功效，疾病治疗暗示，恐吓式对比，违规医疗承诺，商品变形",
      scriptTone: "温暖可信有陪伴感，强调品质和日常滋养，避免夸大和恐吓，严守功效合规",
      storyboardRhythm: "开场建立关心或生活场景，中段讲品质和适用人群，结尾给安心购买或孝心送礼引导",
      shotImageGlobal: "分镜图保持温暖统一色调、商品身份和家庭场景连续",
      shotVideoGlobal: "运镜平缓温和，节奏舒适不急促，贴近真实生活观感",
    },
  },
  // ⑤ 不可消耗实体 × 儿童 —— 玩具/教育硬件（家长决策）
  {
    id: "durable-child-parent",
    name: "儿童好物·家长向",
    summary: "安全可信，向家长说服，成长价值清晰。",
    productType: "durable",
    audiences: ["child"],
    values: {
      imageStyle: "明亮安全的实拍质感，保留材质、做工和安全细节，色彩友好",
      imageComposition: "商品与儿童使用场景或家长视角结合，主体清晰，画面整洁",
      imageAvoid: "危险使用示范，夸大教育效果，违规承诺，可能误导安全的画面，商品变形",
      scriptTone: "向家长说服，强调安全、材质和成长发展价值，可信不夸大",
      storyboardRhythm: "开场点家长关切，中段讲安全设计和成长价值，结尾给放心购买引导",
      shotImageGlobal: "分镜图保持商品身份、安全细节和使用场景一致，儿童出镜自然",
      shotVideoGlobal: "运镜稳定友好，演示符合安全规范，节奏明快但不躁",
    },
  },
  // ⑥ 可消耗实体 × 幼儿 —— 母婴食品/用品（新手家长决策，强监管）
  {
    id: "consumable-toddler-mombaby",
    name: "母婴用品·幼儿",
    summary: "安全第一，成分透明合规，向新手家长建立信任。",
    productType: "consumable",
    audiences: ["toddler"],
    values: {
      imageStyle: "干净柔和的实拍质感，保留商品包装、成分和使用真实细节，画面安心",
      imageComposition: "商品与温柔育儿场景或成分展示结合，主体清晰，背景柔和整洁",
      imageAvoid: "夸大功效，替代母乳暗示，违规成分承诺，恐吓式育儿焦虑，商品变形",
      scriptTone: "温柔可信向新手家长说话，强调安全成分和使用安心，严格合规不夸大",
      storyboardRhythm: "开场共情育儿场景，中段讲成分安全和适用月龄，结尾给安心购买引导",
      shotImageGlobal: "分镜图保持柔和色调、商品身份和成分展示一致，育儿场景温暖连续",
      shotVideoGlobal: "运镜轻柔平缓，节奏舒缓安心，贴近真实育儿观感",
    },
  },
] satisfies CreativeRequirementTemplate[];

export function getCreativeRequirementTemplates(
  templates: unknown = CREATIVE_REQUIREMENT_TEMPLATES,
): CreativeRequirementTemplate[] {
  return creativeRequirementTemplatesSchema.parse(templates);
}

/**
 * 按商品种类 / 适用人群筛选模板，供剧本模块的二维选择器使用。
 * 两个条件均可选，均传时取交集。
 */
export function filterCreativeRequirementTemplates(
  filters: { productType?: ProductType; audience?: Audience } = {},
  templates: CreativeRequirementTemplate[] = getCreativeRequirementTemplates(),
): CreativeRequirementTemplate[] {
  const { productType, audience } = filters;
  return templates.filter((template) => {
    if (productType && template.productType !== productType) return false;
    if (audience && !template.audiences.includes(audience)) return false;
    return true;
  });
}