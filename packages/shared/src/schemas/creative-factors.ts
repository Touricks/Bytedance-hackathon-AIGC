import { z } from "zod";

export const productTypeSchema = z.enum([
  "consumable-good",
  "durable-good",
  "digital-service",
  "offline-experience-service",
]);
export type ProductType = z.infer<typeof productTypeSchema>;

export const audienceSchema = z.enum(["toddler", "child", "youth", "senior"]);
export type Audience = z.infer<typeof audienceSchema>;

export const strategySchema = z.enum([
  "pain-solution",
  "scenario-demo",
  "review-comparison",
  "tutorial-value",
  "authority-proof",
  "emotional-story",
  "curiosity-hook",
]);
export type Strategy = z.infer<typeof strategySchema>;

export const visualStyleSchema = z.enum(["authentic", "cinematic"]);
export type VisualStyle = z.infer<typeof visualStyleSchema>;

export const creativeFactorsSchema = z.object({
  productType: productTypeSchema,
  audience: audienceSchema,
  strategy: strategySchema,
  visualStyle: visualStyleSchema.default("authentic"),
});
export type CreativeFactors = z.infer<typeof creativeFactorsSchema>;

export const compiledRequirementFieldSchema = z.enum([
  "image.style",
  "image.composition",
  "image.avoid",
  "script.tone",
  "storyboard.rhythm",
  "shotImage.global",
  "shotVideo.global",
]);
export type CompiledRequirementField = z.infer<typeof compiledRequirementFieldSchema>;

export const factorGuidanceSchema = z.object({
  productType: z.object({
    subjectPresentation: z.string().trim().min(1),
    sceneAndDelivery: z.string().trim().min(1),
    authenticityBoundaries: z.string().trim().min(1),
  }),
  audience: z.object({
    addressingAndTone: z.string().trim().min(1),
    benefitFrame: z.string().trim().min(1),
    sensitivityBoundaries: z.string().trim().min(1),
  }),
  strategy: z.object({
    openingHook: z.string().trim().min(1),
    storyStructure: z.string().trim().min(1),
    evidenceAndCta: z.string().trim().min(1),
  }),
});
export type FactorGuidance = z.infer<typeof factorGuidanceSchema>;

export const factorGuidanceFieldPathSchema = z.enum([
  "factorGuidance.productType.subjectPresentation",
  "factorGuidance.productType.sceneAndDelivery",
  "factorGuidance.productType.authenticityBoundaries",
  "factorGuidance.audience.addressingAndTone",
  "factorGuidance.audience.benefitFrame",
  "factorGuidance.audience.sensitivityBoundaries",
  "factorGuidance.strategy.openingHook",
  "factorGuidance.strategy.storyStructure",
  "factorGuidance.strategy.evidenceAndCta",
]);
export type FactorGuidanceFieldPath = z.infer<typeof factorGuidanceFieldPathSchema>;

export const compiledRequirementSourceSchema = z.object({
  sourcePath: factorGuidanceFieldPathSchema.or(z.string().trim().min(1)),
  label: z.string().trim().min(1),
  factor: z.enum(["productType", "audience", "strategy", "scriptInfluence"]),
  affects: z.array(compiledRequirementFieldSchema).min(1),
});
export type CompiledRequirementSource = z.infer<typeof compiledRequirementSourceSchema>;

const sourceListSchema = z.array(compiledRequirementSourceSchema);

export const compiledRequirementSourceMapSchema = z.object({
  imageStyle: sourceListSchema,
  imageComposition: sourceListSchema,
  imageAvoid: sourceListSchema,
  scriptTone: sourceListSchema,
  storyboardRhythm: sourceListSchema,
  shotImageGlobal: sourceListSchema,
  shotVideoGlobal: sourceListSchema,
});
export type CompiledRequirementSourceMap = z.infer<
  typeof compiledRequirementSourceMapSchema
>;

export const scriptInfluenceSchema = z.object({
  productType: z.object({
    scriptRole: z.string().trim().min(1),
    proofObjects: z.array(z.string().trim().min(1)).min(1),
    forbiddenClaims: z.array(z.string().trim().min(1)).min(1),
  }),
  audience: z.object({
    addressee: z.string().trim().min(1),
    tone: z.string().trim().min(1),
    benefitPriority: z.array(z.string().trim().min(1)).min(1),
  }),
  strategy: z.object({
    openingPattern: z.string().trim().min(1),
    storyArc: z.array(z.string().trim().min(1)).min(1),
    ctaStyle: z.string().trim().min(1),
  }),
});
export type ScriptInfluence = z.infer<typeof scriptInfluenceSchema>;

export const creativeRequirementTemplateSourceSchema = z.object({
  source: z.literal("setup-template"),
  templateId: z.string().trim().min(1),
  templateNameSnapshot: z.string().trim().min(1),
  templateVersion: z.string().trim().min(1),
  status: z.enum(["applied", "customized", "detached"]),
});
export type CreativeRequirementTemplateSource = z.infer<
  typeof creativeRequirementTemplateSourceSchema
>;

const looseDraftSchema = z
  .object({
    image: z.record(z.unknown()).optional(),
    script: z.record(z.unknown()).optional(),
    storyboard: z.record(z.unknown()).optional(),
    shotImage: z.record(z.unknown()).optional(),
    shotVideo: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const creativeFactorRequirementsDataSchema = looseDraftSchema.extend({
  image: z.record(z.unknown()),
  script: z.record(z.unknown()),
  storyboard: z.record(z.unknown()),
  shotImage: z.record(z.unknown()),
  shotVideo: z.record(z.unknown()),
  creativeFactors: creativeFactorsSchema,
  factorGuidance: factorGuidanceSchema,
  scriptInfluence: scriptInfluenceSchema,
  compiledRequirementSourceMap: compiledRequirementSourceMapSchema.optional(),
  creativeRequirementTemplate: creativeRequirementTemplateSourceSchema.optional(),
});
export type CreativeFactorRequirementsData = z.infer<
  typeof creativeFactorRequirementsDataSchema
>;

export const DEFAULT_CREATIVE_FACTORS = {
  productType: "durable-good",
  audience: "youth",
  strategy: "scenario-demo",
  visualStyle: "authentic",
} as const satisfies CreativeFactors;

const PRODUCT_TYPE_GUIDANCE = {
  "consumable-good": {
    factorGuidance: {
      subjectPresentation: "真实展示商品包装、质地、用量和使用瞬间。",
      sceneAndDelivery: "按开箱、展示、使用、效果感受和购买理由推进。",
      authenticityBoundaries: "避免虚假成分对比、夸大功效和商品变形。",
    },
    scriptInfluence: {
      scriptRole: "可消耗商品需要证明使用场景、真实质地和复购理由。",
      proofObjects: ["商品包装", "质地/成分", "使用动作", "体验结果"],
      forbiddenClaims: ["虚假成分对比", "夸大功效", "违规功效承诺"],
    },
  },
  "durable-good": {
    factorGuidance: {
      subjectPresentation: "真实展示商品主体、关键功能部位、使用场景和必要配件。",
      sceneAndDelivery: "按需求场景、功能展示、细节证明和使用结果推进。",
      authenticityBoundaries: "避免虚假参数、商品结构变形和不存在的配件承诺。",
    },
    scriptInfluence: {
      scriptRole: "耐用品需要证明功能、材质、结构细节和长期使用价值。",
      proofObjects: ["商品主体", "功能部位", "材质细节", "使用场景"],
      forbiddenClaims: ["虚假参数", "商品结构变形", "不存在的配件承诺"],
    },
  },
  "digital-service": {
    factorGuidance: {
      subjectPresentation: "用界面、人物操作和服务结果具象化抽象服务。",
      sceneAndDelivery: "按问题、服务流程、关键能力、案例证明和咨询路径推进。",
      authenticityBoundaries: "避免夸大效果、虚假数据和不可验证承诺。",
    },
    scriptInfluence: {
      scriptRole: "数字服务需要把抽象价值转成可理解的问题、流程和结果。",
      proofObjects: ["服务界面", "流程步骤", "案例结果", "咨询入口"],
      forbiddenClaims: ["夸大效果", "虚假数据", "不可验证承诺"],
    },
  },
  "offline-experience-service": {
    factorGuidance: {
      subjectPresentation: "真实展示目的地、交通、场地、服务人员和体验者。",
      sceneAndDelivery: "按出发、到达、服务交付、核心体验和保障证明推进。",
      authenticityBoundaries: "避免虚假场地、不存在的交通/酒店承诺和夸大安全保障。",
    },
    scriptInfluence: {
      scriptRole: "线下体验服务不是可直接开箱的商品,剧本要证明服务交付过程。",
      proofObjects: ["目的地", "路线", "场地", "服务人员", "真实体验结果"],
      forbiddenClaims: ["虚假场地", "不存在的交通/酒店承诺", "绝对安全承诺"],
    },
  },
} satisfies Record<
  ProductType,
  {
    factorGuidance: FactorGuidance["productType"];
    scriptInfluence: ScriptInfluence["productType"];
  }
>;

const AUDIENCE_GUIDANCE = {
  toddler: {
    factorGuidance: {
      addressingAndTone: "向新手家长说服,语气温柔可信。",
      benefitFrame: "强调安全、成分透明、照护省心和日常适用。",
      sensitivityBoundaries: "避免制造育儿焦虑、替代专业建议和夸大成长效果。",
    },
    scriptInfluence: {
      addressee: "新手家长",
      tone: "温柔可信,强调安全和安心,避免制造焦虑。",
      benefitPriority: ["安全", "安心", "成分透明", "照护省心"],
    },
  },
  child: {
    factorGuidance: {
      addressingAndTone: "向家长说服,语气温暖可信。",
      benefitFrame: "强调安全、省心、陪伴和孩子真实体验。",
      sensitivityBoundaries: "避免制造教育焦虑、危险示范和夸大成长效果。",
    },
    scriptInfluence: {
      addressee: "家长",
      tone: "温暖可信,强调省心和安全,避免制造焦虑。",
      benefitPriority: ["安全", "省心", "陪伴", "成长体验"],
    },
  },
  youth: {
    factorGuidance: {
      addressingAndTone: "向年轻用户说服,语气直接、有体验感。",
      benefitFrame: "强调效率、颜值、实用价值和即时体验。",
      sensitivityBoundaries: "避免虚假对比、过度制造焦虑和绝对化承诺。",
    },
    scriptInfluence: {
      addressee: "年轻用户",
      tone: "直接、有体验感,卖点清晰,避免夸张硬广。",
      benefitPriority: ["效率", "颜值", "实用", "即时体验"],
    },
  },
  senior: {
    factorGuidance: {
      addressingAndTone: "向银发用户或子女说服,语气温和稳重。",
      benefitFrame: "强调安心、品质、日常便利和送礼心意。",
      sensitivityBoundaries: "避免疾病治疗暗示、恐吓式表达和医疗承诺。",
    },
    scriptInfluence: {
      addressee: "银发用户或子女",
      tone: "温和稳重,强调安心和品质,严守功效合规。",
      benefitPriority: ["安心", "品质", "便利", "心意"],
    },
  },
} satisfies Record<
  Audience,
  {
    factorGuidance: FactorGuidance["audience"];
    scriptInfluence: ScriptInfluence["audience"];
  }
>;

const STRATEGY_GUIDANCE = {
  "pain-solution": {
    factorGuidance: {
      openingHook: "用真实痛点或高频需求开场,快速建立为什么需要它。",
      storyStructure: "按痛点、原因、解决方式、证据和行动引导推进。",
      evidenceAndCta: "用真实使用结果和购买理由完成转化。",
    },
    scriptInfluence: {
      openingPattern: "用真实痛点或高频需求开场,快速说明问题。",
      storyArc: ["痛点出现", "原因解释", "解决方式", "证据证明", "行动引导"],
      ctaStyle: "给出清晰购买理由,不要制造强压式逼单。",
    },
  },
  "scenario-demo": {
    factorGuidance: {
      openingHook: "用真实使用场景或操作瞬间开场,快速建立代入。",
      storyStructure: "按场景进入、过程演示、关键卖点、结果证明和行动引导推进。",
      evidenceAndCta: "用过程演示和可见结果完成转化。",
    },
    scriptInfluence: {
      openingPattern: "用真实使用场景或操作瞬间开场,快速说明商品如何解决问题。",
      storyArc: ["场景进入", "过程演示", "关键卖点", "结果证明", "行动引导"],
      ctaStyle: "引导了解或下单,避免脱离场景的硬转化。",
    },
  },
  "review-comparison": {
    factorGuidance: {
      openingHook: "用真实体验结论或前后差异开场,明确对比维度。",
      storyStructure: "按测评标准、使用过程、对比结果、适用建议和行动引导推进。",
      evidenceAndCta: "用可验证对比和适用人群建议完成转化。",
    },
    scriptInfluence: {
      openingPattern: "用真实体验结论或明确对比维度开场。",
      storyArc: ["测评标准", "使用过程", "对比结果", "适用建议", "行动引导"],
      ctaStyle: "给出适用建议,避免虚假踩一捧一。",
    },
  },
  "tutorial-value": {
    factorGuidance: {
      openingHook: "用一个可学会的小技巧或使用误区开场。",
      storyStructure: "按方法步骤、关键注意点、效果展示和行动引导推进。",
      evidenceAndCta: "用教程价值和上手门槛完成转化。",
    },
    scriptInfluence: {
      openingPattern: "用小技巧或常见误区开场,让观众知道能学到什么。",
      storyArc: ["问题/误区", "步骤一", "步骤二", "效果展示", "行动引导"],
      ctaStyle: "引导收藏、咨询或购买,避免只讲教程不落转化。",
    },
  },
  "authority-proof": {
    factorGuidance: {
      openingHook: "用资质、标准或可信证明开场,先建立信任。",
      storyStructure: "按可信来源、核心能力、证据细节、适用场景和行动引导推进。",
      evidenceAndCta: "用合规证明和真实案例完成转化。",
    },
    scriptInfluence: {
      openingPattern: "用可信证明或标准开场,先降低怀疑。",
      storyArc: ["可信来源", "核心能力", "证据细节", "适用场景", "行动引导"],
      ctaStyle: "引导进一步了解或咨询,不要夸大权威背书。",
    },
  },
  "emotional-story": {
    factorGuidance: {
      openingHook: "用真实关系或情绪场景开场,先建立共鸣。",
      storyStructure: "按人物处境、情绪需求、使用/服务过程、改善结果和行动引导推进。",
      evidenceAndCta: "用真实体验和情绪价值完成转化。",
    },
    scriptInfluence: {
      openingPattern: "用真实关系或情绪场景开场,快速建立共鸣。",
      storyArc: ["人物处境", "情绪需求", "使用/服务过程", "改善结果", "行动引导"],
      ctaStyle: "用温和建议收束,避免情绪绑架。",
    },
  },
  "curiosity-hook": {
    factorGuidance: {
      openingHook: "用反常识问题或悬念画面开场,快速吸引注意。",
      storyStructure: "按悬念、揭示、卖点解释、证据和行动引导推进。",
      evidenceAndCta: "用清晰解释承接悬念,避免标题党。",
    },
    scriptInfluence: {
      openingPattern: "用反常识问题或悬念画面开场,但马上回到真实卖点。",
      storyArc: ["悬念提出", "答案揭示", "卖点解释", "证据证明", "行动引导"],
      ctaStyle: "用解释后的购买理由转化,避免纯猎奇。",
    },
  },
} satisfies Record<
  Strategy,
  {
    factorGuidance: FactorGuidance["strategy"];
    scriptInfluence: ScriptInfluence["strategy"];
  }
>;

const VISUAL_STYLE_SHOT_GUIDANCE = {
  authentic: {
    shotImage: "视觉风格：UGC真实质感，自然光或窗边漫射光，曝光充足偏高，色彩干净通透，非广告棚感。",
    shotVideo: "运镜质感：镜头固定或轻微手持晃动，动作有物理重量感，无过度运镜，真实UGC节奏。",
    storyboard: "场景描写强调真实物理感，商品在自然生活场景中，人物极简（手部/局部优先）。",
  },
  cinematic: {
    shotImage: "视觉风格：电影级产品摄影，戏剧性方向光，高饱和高对比，商品是绝对主角，允许完美布光与超现实色彩处理。",
    shotVideo: "运镜质感：完美平滑运镜无手持感，允许AI原生视觉效果——极致慢动作、液体流动特效、光线折射、粒子爆散，追求品牌向往感而非真实感。",
    storyboard: "场景可以写AI原生视觉：极致慢动作/光线爆发/液体流动特效/超现实材质特写，追求电影级品牌质感，不需要UGC真实感。",
  },
} satisfies Record<VisualStyle, { shotImage: string; shotVideo: string; storyboard: string }>;

function compact(values: string[]) {
  return values.filter((value) => value.trim().length > 0);
}

function unique(values: string[]) {
  return Array.from(new Set(compact(values)));
}

const SOURCE_DESCRIPTORS = {
  subjectPresentation: {
    sourcePath: "factorGuidance.productType.subjectPresentation",
    label: "商品/服务类型:主体呈现",
    factor: "productType",
    affects: ["image.style", "shotImage.global"],
  },
  sceneAndDelivery: {
    sourcePath: "factorGuidance.productType.sceneAndDelivery",
    label: "商品/服务类型:场景与交付",
    factor: "productType",
    affects: [
      "image.composition",
      "storyboard.rhythm",
      "shotImage.global",
      "shotVideo.global",
    ],
  },
  authenticityBoundaries: {
    sourcePath: "factorGuidance.productType.authenticityBoundaries",
    label: "商品/服务类型:真实性边界",
    factor: "productType",
    affects: ["image.avoid"],
  },
  addressingAndTone: {
    sourcePath: "factorGuidance.audience.addressingAndTone",
    label: "适用人群:称谓与语气",
    factor: "audience",
    affects: ["script.tone"],
  },
  benefitFrame: {
    sourcePath: "factorGuidance.audience.benefitFrame",
    label: "适用人群:利益表达",
    factor: "audience",
    affects: ["image.composition", "script.tone"],
  },
  sensitivityBoundaries: {
    sourcePath: "factorGuidance.audience.sensitivityBoundaries",
    label: "适用人群:敏感边界",
    factor: "audience",
    affects: ["image.avoid"],
  },
  openingHook: {
    sourcePath: "factorGuidance.strategy.openingHook",
    label: "推销手法:开场方式",
    factor: "strategy",
    affects: ["shotVideo.global"],
  },
  storyStructure: {
    sourcePath: "factorGuidance.strategy.storyStructure",
    label: "推销手法:故事结构",
    factor: "strategy",
    affects: ["storyboard.rhythm"],
  },
  evidenceAndCta: {
    sourcePath: "factorGuidance.strategy.evidenceAndCta",
    label: "推销手法:证据与行动引导",
    factor: "strategy",
    affects: ["script.tone", "storyboard.rhythm"],
  },
} as const satisfies Record<string, CompiledRequirementSource>;

export const FACTOR_GUIDANCE_FIELD_AFFECTS: Record<
  FactorGuidanceFieldPath,
  {
    label: string;
    factor: "productType" | "audience" | "strategy";
    affects: CompiledRequirementField[];
  }
> = Object.fromEntries(
  Object.values(SOURCE_DESCRIPTORS).map((source) => [
    source.sourcePath,
    {
      label: source.label,
      factor: source.factor,
      affects: [...source.affects],
    },
  ]),
) as Record<
  FactorGuidanceFieldPath,
  {
    label: string;
    factor: "productType" | "audience" | "strategy";
    affects: CompiledRequirementField[];
  }
>;

export const DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP =
  compiledRequirementSourceMapSchema.parse({
    imageStyle: [SOURCE_DESCRIPTORS.subjectPresentation],
    imageComposition: [
      SOURCE_DESCRIPTORS.sceneAndDelivery,
      SOURCE_DESCRIPTORS.benefitFrame,
    ],
    imageAvoid: [
      SOURCE_DESCRIPTORS.authenticityBoundaries,
      SOURCE_DESCRIPTORS.sensitivityBoundaries,
    ],
    scriptTone: [
      SOURCE_DESCRIPTORS.addressingAndTone,
      SOURCE_DESCRIPTORS.benefitFrame,
      SOURCE_DESCRIPTORS.evidenceAndCta,
    ],
    storyboardRhythm: [
      SOURCE_DESCRIPTORS.storyStructure,
      SOURCE_DESCRIPTORS.evidenceAndCta,
      SOURCE_DESCRIPTORS.sceneAndDelivery,
    ],
    shotImageGlobal: [
      SOURCE_DESCRIPTORS.subjectPresentation,
      SOURCE_DESCRIPTORS.sceneAndDelivery,
    ],
    shotVideoGlobal: [
      SOURCE_DESCRIPTORS.openingHook,
      SOURCE_DESCRIPTORS.sceneAndDelivery,
    ],
  });

export function compileCreativeRequirementFields(input: {
  factorGuidance: FactorGuidance;
  scriptInfluence: ScriptInfluence;
  visualStyle?: VisualStyle;
}) {
  const { factorGuidance } = input;
  const vs = VISUAL_STYLE_SHOT_GUIDANCE[input.visualStyle ?? "authentic"];
  return {
    image: {
      style: `${factorGuidance.productType.subjectPresentation} 保持商品/服务身份可识别。 ${vs.shotImage}`,
      composition: `${factorGuidance.productType.sceneAndDelivery} ${factorGuidance.audience.benefitFrame}`,
      avoid: unique([
        factorGuidance.productType.authenticityBoundaries,
        factorGuidance.audience.sensitivityBoundaries,
      ]),
    },
    script: {
      tone: `${factorGuidance.audience.addressingAndTone} ${factorGuidance.audience.benefitFrame} ${factorGuidance.strategy.evidenceAndCta}`,
    },
    storyboard: {
      rhythm: `${factorGuidance.strategy.storyStructure} ${factorGuidance.strategy.evidenceAndCta} ${factorGuidance.productType.sceneAndDelivery} ${vs.storyboard}`,
    },
    shotImage: {
      global: `${factorGuidance.productType.subjectPresentation} ${factorGuidance.productType.sceneAndDelivery} ${vs.shotImage}`,
    },
    shotVideo: {
      global: `${factorGuidance.strategy.openingHook} ${factorGuidance.productType.sceneAndDelivery} ${vs.shotVideo}`,
    },
    compiledRequirementSourceMap: DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
  };
}

export function buildCreativeFactorRequirements(
  input: Partial<CreativeFactors> = {},
): CreativeFactorRequirementsData {
  const creativeFactors = creativeFactorsSchema.parse({
    ...DEFAULT_CREATIVE_FACTORS,
    ...input,
  });
  const productType = PRODUCT_TYPE_GUIDANCE[creativeFactors.productType];
  const audience = AUDIENCE_GUIDANCE[creativeFactors.audience];
  const strategy = STRATEGY_GUIDANCE[creativeFactors.strategy];
  const factorGuidance: FactorGuidance = {
    productType: productType.factorGuidance,
    audience: audience.factorGuidance,
    strategy: strategy.factorGuidance,
  };
  const scriptInfluence: ScriptInfluence = {
    productType: productType.scriptInfluence,
    audience: audience.scriptInfluence,
    strategy: strategy.scriptInfluence,
  };

  return creativeFactorRequirementsDataSchema.parse({
    ...compileCreativeRequirementFields({ factorGuidance, scriptInfluence, visualStyle: creativeFactors.visualStyle }),
    creativeFactors,
    factorGuidance,
    scriptInfluence,
  });
}

function mergeSection(
  compiled: Record<string, unknown>,
  draft: unknown,
): Record<string, unknown> {
  return draft && typeof draft === "object" && !Array.isArray(draft)
    ? { ...compiled, ...(draft as Record<string, unknown>) }
    : compiled;
}

export function applyCreativeFactorsToPromptRequirements(
  draft: unknown,
  input: Partial<CreativeFactors> = {},
): CreativeFactorRequirementsData {
  const compiled = buildCreativeFactorRequirements(input);
  const parsedDraft = looseDraftSchema.safeParse(draft);
  const safeDraft = parsedDraft.success ? parsedDraft.data : {};

  return creativeFactorRequirementsDataSchema.parse({
    ...safeDraft,
    image: mergeSection(compiled.image, safeDraft.image),
    script: mergeSection(compiled.script, safeDraft.script),
    storyboard: mergeSection(compiled.storyboard, safeDraft.storyboard),
    shotImage: mergeSection(compiled.shotImage, safeDraft.shotImage),
    shotVideo: mergeSection(compiled.shotVideo, safeDraft.shotVideo),
    creativeFactors: compiled.creativeFactors,
    factorGuidance: compiled.factorGuidance,
    scriptInfluence: compiled.scriptInfluence,
  });
}
