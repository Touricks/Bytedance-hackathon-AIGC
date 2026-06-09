import { z } from "zod";

export const FACTOR_PROMPT_VERSION = "factor-prompt.2026-06-08";
export const FACTOR_COMPILE_TEMPLATE_VERSION = "factor-compile-template";
export const CREATIVE_ATTRIBUTION_SCHEMA_VERSION = "creative-attribution";
export const FINAL_VIDEO_MANIFEST_SCHEMA_VERSION = "final-video-manifest";
export const DASHBOARD_VIDEO_METADATA_SCHEMA_VERSION = "dashboard-video-metadata";
export const LEGACY_CREATIVE_TAGS_SCHEMA_VERSION = "creative-tags.v2";

export const productCategorySchema = z.enum([
  "beauty-personal-care",
  "fashion-accessories",
  "food-beverage",
  "home-living",
  "consumer-electronics",
  "mom-baby-pet",
  "sports-outdoors",
  "jewelry-collectibles",
  "books-education",
  "automotive",
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const dealTypeSchema = z.enum([
  "search-standard",
  "seeding-nonstandard",
  "impulse-hit",
  "repeat-consumable",
  "premium-brand",
]);
export type DealType = z.infer<typeof dealTypeSchema>;

export const audienceSchema = z.enum([
  "general",
  "toddler",
  "child",
  "youth",
  "senior",
]);
export type Audience = z.infer<typeof audienceSchema>;

export const strategySchema = z.enum([
  "pain-solution",
  "scenario-demo",
  "review-comparison",
  "tutorial-value",
  "authority-proof",
  "emotional-story",
  "curiosity-hook",
  "visual-story",
]);
export type Strategy = z.infer<typeof strategySchema>;

export const creativeFactorsSchema = z
  .object({
    productCategory: productCategorySchema,
    dealType: dealTypeSchema,
    audience: audienceSchema,
    strategy: strategySchema,
  })
  .strict();
export type CreativeFactors = z.infer<typeof creativeFactorsSchema>;

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  "beauty-personal-care": "美妆个护",
  "fashion-accessories": "服饰鞋包",
  "food-beverage": "食品饮料",
  "home-living": "家居家装",
  "consumer-electronics": "3C数码",
  "mom-baby-pet": "母婴宠物",
  "sports-outdoors": "运动户外",
  "jewelry-collectibles": "珠宝文玩",
  "books-education": "图书教育",
  automotive: "汽车用品",
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  "search-standard": "搜索型标品",
  "seeding-nonstandard": "种草型非标品",
  "impulse-hit": "冲动消费型爆款",
  "repeat-consumable": "复购型消耗品",
  "premium-brand": "品牌型高客单",
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  general: "不限定",
  toddler: "幼儿 / 新手家长",
  child: "儿童 / 家长向",
  youth: "青年",
  senior: "老年 / 银发用户或子女",
};

export const STRATEGY_LABELS: Record<Strategy, string> = {
  "pain-solution": "痛点解决",
  "scenario-demo": "场景演示",
  "review-comparison": "测评对比",
  "tutorial-value": "教程价值",
  "authority-proof": "权威证明",
  "emotional-story": "情绪故事",
  "curiosity-hook": "好奇钩子",
  "visual-story": "视觉叙事",
};

const textArraySchema = z.array(z.string().trim().min(1)).min(1);

export const productCategoryGuidancePackSchema = z.object({
  requiredVisualElements: textArraySchema,
  proofObligation: textArraySchema,
  validUsageScenes: textArraySchema,
  aestheticBaseline: textArraySchema,
  authenticityComplianceBoundary: textArraySchema,
  categoryRiskAvoidance: textArraySchema,
});
export type ProductCategoryGuidancePack = z.infer<
  typeof productCategoryGuidancePackSchema
>;

export const dealTypeGuidancePackSchema = z.object({
  purchaseTask: textArraySchema,
  decisionInfoDimensions: textArraySchema,
  proofTypes: textArraySchema,
  conversionFriction: textArraySchema,
  offerCommitmentStrategy: textArraySchema,
  funnelPacing: textArraySchema,
});
export type DealTypeGuidancePack = z.infer<typeof dealTypeGuidancePackSchema>;

export const audienceGuidancePackSchema = z.object({
  addresseeRole: textArraySchema,
  languageStyle: textArraySchema,
  benefitPriority: textArraySchema,
  representationAndPov: textArraySchema,
  readabilityPacing: textArraySchema,
  sensitiveExpressionBoundary: textArraySchema,
});
export type AudienceGuidancePack = z.infer<typeof audienceGuidancePackSchema>;

export const strategyGuidancePackSchema = z.object({
  hookMechanism: textArraySchema,
  narrativeStructure: textArraySchema,
  evidenceOrganization: textArraySchema,
  shotEditingGrammar: textArraySchema,
});
export type StrategyGuidancePack = z.infer<typeof strategyGuidancePackSchema>;

export const factorGuidanceSchema = z.object({
  productCategory: productCategoryGuidancePackSchema,
  dealType: dealTypeGuidancePackSchema,
  audience: audienceGuidancePackSchema,
  strategy: strategyGuidancePackSchema,
});
export type FactorGuidance = z.infer<typeof factorGuidanceSchema>;

export const factorGuidanceFieldPathSchema = z.enum([
  "factorGuidance.productCategory.requiredVisualElements",
  "factorGuidance.productCategory.proofObligation",
  "factorGuidance.productCategory.validUsageScenes",
  "factorGuidance.productCategory.aestheticBaseline",
  "factorGuidance.productCategory.authenticityComplianceBoundary",
  "factorGuidance.productCategory.categoryRiskAvoidance",
  "factorGuidance.dealType.purchaseTask",
  "factorGuidance.dealType.decisionInfoDimensions",
  "factorGuidance.dealType.proofTypes",
  "factorGuidance.dealType.conversionFriction",
  "factorGuidance.dealType.offerCommitmentStrategy",
  "factorGuidance.dealType.funnelPacing",
  "factorGuidance.audience.addresseeRole",
  "factorGuidance.audience.languageStyle",
  "factorGuidance.audience.benefitPriority",
  "factorGuidance.audience.representationAndPov",
  "factorGuidance.audience.readabilityPacing",
  "factorGuidance.audience.sensitiveExpressionBoundary",
  "factorGuidance.strategy.hookMechanism",
  "factorGuidance.strategy.narrativeStructure",
  "factorGuidance.strategy.evidenceOrganization",
  "factorGuidance.strategy.shotEditingGrammar",
]);
export type FactorGuidanceFieldPath = z.infer<typeof factorGuidanceFieldPathSchema>;

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

export const compiledRequirementSourceSchema = z.object({
  sourcePath: factorGuidanceFieldPathSchema,
  label: z.string().trim().min(1),
  factor: z.enum(["productCategory", "dealType", "audience", "strategy"]),
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

export const compiledGlobalRequirementsSchema = z.object({
  image: z.object({
    style: textArraySchema,
    composition: textArraySchema,
    avoid: textArraySchema,
  }),
  script: z.object({
    tone: textArraySchema,
  }),
  storyboard: z.object({
    rhythm: textArraySchema,
  }),
  shotImage: z.object({
    global: textArraySchema,
  }),
  shotVideo: z.object({
    global: textArraySchema,
  }),
});
export type CompiledGlobalRequirements = z.infer<
  typeof compiledGlobalRequirementsSchema
>;

export const creativeRequirementPresetSourceSchema = z.object({
  source: z.literal("factor-preset"),
  presetId: z.string().trim().min(1),
  presetNameSnapshot: z.string().trim().min(1),
  presetVersion: z.string().trim().min(1),
  status: z.enum(["selected", "detached"]),
});
export type CreativeRequirementPresetSource = z.infer<
  typeof creativeRequirementPresetSourceSchema
>;

export const creativeRequirementTemplateSourceSchema =
  creativeRequirementPresetSourceSchema;
export type CreativeRequirementTemplateSource = CreativeRequirementPresetSource;

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
  image: z.object({
    style: textArraySchema,
    composition: textArraySchema,
    avoid: textArraySchema,
  }),
  script: z.object({ tone: textArraySchema }),
  storyboard: z.object({ rhythm: textArraySchema }),
  shotImage: z.object({ global: textArraySchema }),
  shotVideo: z.object({ global: textArraySchema }),
  creativeFactors: creativeFactorsSchema,
  factorGuidance: factorGuidanceSchema,
  compiledRequirementSourceMap: compiledRequirementSourceMapSchema,
  factorPromptVersion: z.string().trim().min(1),
  factorComboKey: z.string().trim().min(1),
  compiledRequirementsHash: z.string().trim().min(1),
  attributionEligible: z.literal(true),
  creativeRequirementTemplate: creativeRequirementPresetSourceSchema.optional(),
});
export type CreativeFactorRequirementsData = z.infer<
  typeof creativeFactorRequirementsDataSchema
>;

const creativeAttributionSchemaVersionSchema = z.union([
  z.literal(CREATIVE_ATTRIBUTION_SCHEMA_VERSION),
  z.literal(LEGACY_CREATIVE_TAGS_SCHEMA_VERSION),
]);

export const creativeAttributionSchema = z.object({
  schemaVersion: creativeAttributionSchemaVersionSchema,
  promptRequirementsArtifactId: z.string().trim().min(1).nullable(),
  shotPromptArtifactId: z.string().trim().min(1).nullable(),
  creativeFactors: creativeFactorsSchema.nullable(),
  factorPromptVersion: z.string().trim().min(1).nullable(),
});
export type CreativeAttribution = z.infer<typeof creativeAttributionSchema>;

export const creativeTagsV2Schema = creativeAttributionSchema;
export type CreativeTagsV2 = CreativeAttribution;

export const finalVideoManifestSchema = z
  .object({
    schemaVersion: z.literal(FINAL_VIDEO_MANIFEST_SCHEMA_VERSION),
    workspaceId: z.string().trim().min(1),
    creativeAttribution: creativeAttributionSchema,
    sources: z.array(
      z
        .object({
          shotId: z.string().trim().min(1),
          videoCandidateId: z.string().trim().min(1),
          providerUrl: z.string().trim().min(1),
          providerPromptHash: z.string().trim().min(1),
        })
        .passthrough(),
    ),
    transition: z.string().trim().min(1),
  })
  .passthrough();
export type FinalVideoManifest = z.infer<typeof finalVideoManifestSchema>;

export const dashboardVideoMetadataSchema = z
  .object({
    schemaVersion: z.literal(DASHBOARD_VIDEO_METADATA_SCHEMA_VERSION),
    id: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1),
    finalVideoJobId: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1),
    localUrl: z.string().trim().min(1),
    importedAt: z.string().trim().min(1),
  })
  .passthrough();
export type DashboardVideoMetadata = z.infer<typeof dashboardVideoMetadataSchema>;

export const DEFAULT_CREATIVE_FACTORS = {
  productCategory: "consumer-electronics",
  dealType: "search-standard",
  audience: "youth",
  strategy: "review-comparison",
} as const satisfies CreativeFactors;

function list(value: string) {
  return value.split("；").map((item) => item.trim()).filter(Boolean);
}

export const PRODUCT_CATEGORY_GUIDANCE = {
  "beauty-personal-care": {
    requiredVisualElements: list("产品包装；质地、膏体、液体、粉体或工具；使用部位或使用动作；色泽、肤感或清洁状态；自然光或清晰局部特写"),
    proofObligation: list("展示涂抹、上妆、清洁、护理或使用过程；展示质地延展性、服帖度、清爽感、颜色表现或使用后状态；前后状态必须克制真实"),
    validUsageScenes: list("梳妆台；浴室台面；通勤前准备；补妆场景；夜间护理场景；居家个护场景"),
    aestheticBaseline: list("明亮、干净、清透、柔和；保留真实皮肤纹理；避免过度磨皮和塑料感"),
    authenticityComplianceBoundary: list("不承诺医学治疗效果；不使用绝对化美白、祛斑、抗老、治愈表达；不伪造医生、机构、认证背书；不制造容貌焦虑"),
    categoryRiskAvoidance: list("避免夸张前后对比；避免不卫生共用；避免危险眼周操作；避免过度滤镜导致效果不可信"),
  },
  "fashion-accessories": {
    requiredVisualElements: list("上身、上脚、手提、肩背或佩戴效果；版型轮廓；面料纹理；颜色表现；尺码参照；走线、五金、鞋底或容量细节"),
    proofObligation: list("展示行走、转身、坐下、拿取、开合或搭配过程；展示垂感、弹性、容量、舒适度、搭配适配性或细节做工"),
    validUsageScenes: list("通勤；约会；街拍；旅行；居家试穿；运动休闲；聚会穿搭"),
    aestheticBaseline: list("生活方式感；真实比例；自然光；不过度拉长身体；突出材质和版型"),
    authenticityComplianceBoundary: list("不做身材羞辱；不夸大显瘦、增高、奢侈身份；不暗示假冒大牌；不隐藏尺码和真实版型"),
    categoryRiskAvoidance: list("避免过度修图拉腿；避免只拍氛围不露商品；避免危险行走或不合理穿着场景；避免遮挡关键细节"),
  },
  "food-beverage": {
    requiredVisualElements: list("产品包装；开封过程；食物或饮品质地；份量参照；倒出、掰开、拉丝、咀嚼、冲泡或饮用动作"),
    proofObligation: list("展示口感、香气、脆感、软糯、拉丝、爆浆、气泡、色泽或新鲜感；展示真实入口或分享场景；感官证据优先"),
    validUsageScenes: list("居家零食；办公室；追剧；聚会分享；早餐；户外野餐；饮品冲泡或即饮场景"),
    aestheticBaseline: list("高食欲感；干净桌面；自然饱满色彩；光线明亮；强调真实质地，不把食物拍成假模型"),
    authenticityComplianceBoundary: list("不暗示治疗、减肥、保健或疾病改善；不虚构成分、营养或特殊功效；不过度鼓励暴食"),
    categoryRiskAvoidance: list("避免不卫生处理；避免过期、污染、异物画面；避免危险烹饪动作；避免儿童不安全进食镜头"),
  },
  "home-living": {
    requiredVisualElements: list("商品在真实空间中的摆放或安装状态；空间比例；材质细节；结构、收纳、承重或开合方式；使用前后空间效果"),
    proofObligation: list("展示耐用性、承重、收纳能力、清洁便利、安装步骤、材质触感或空间改善效果；高价或安装类商品需要强调服务与保障方向"),
    validUsageScenes: list("客厅；卧室；厨房；浴室；阳台；租房改造；新家布置；家庭日常使用"),
    aestheticBaseline: list("真实居家感；自然采光；整洁但不假样板间；强调空间秩序和生活质感"),
    authenticityComplianceBoundary: list("不伪造环保、质量、承重或安全认证；不夸大房间面积；不展示不可能的安装和空间变化"),
    categoryRiskAvoidance: list("避免不安全安装；避免遮挡电线、火源、尖角等隐患；避免儿童或宠物危险接触；避免夸张承重演示"),
  },
  "consumer-electronics": {
    requiredVisualElements: list("设备本体；屏幕、指示灯、接口、按键或连接状态；配件关系；尺寸参照；桌面或移动使用状态"),
    proofObligation: list("展示兼容性、响应速度、连接稳定性、充电或续航相关过程、做工细节、使用前后效率变化；参数信息必须以通用维度呈现"),
    validUsageScenes: list("桌面办公；学习；游戏；通勤；移动创作；手机、平板、电脑或车载连接场景"),
    aestheticBaseline: list("干净、理性、科技感；高清细节；避免夸张赛博风；界面和接口要清楚可读"),
    authenticityComplianceBoundary: list("不伪造官方认证、兼容授权或性能参数；不做绝对性能承诺；不暗示非法破解、监听、入侵或违规改装"),
    categoryRiskAvoidance: list("避免危险充电、冒烟、火花、过热；避免隐私泄露界面；避免过度虚构屏幕内容；避免只拍酷炫光效不露功能"),
  },
  "mom-baby-pet": {
    requiredVisualElements: list("产品包装；材质、触感、厚薄、大小或规格范围；安全使用动作；照护者手部演示；宝宝或宠物使用场景需克制呈现"),
    proofObligation: list("展示柔软度、吸收力、舒适性、清洁过程、安全使用方式、适配过程或耐用性；强调照护便利与安心感"),
    validUsageScenes: list("婴儿房；换洗台；喂养场景；外出推车；家庭宠物角；宠物清洁、喂养、玩耍或休息场景"),
    aestheticBaseline: list("温暖、柔和、干净、安全感；避免刺激性视觉；家庭照护场景真实自然"),
    authenticityComplianceBoundary: list("不承诺治疗湿疹、过敏、疾病或行为问题；不制造育儿或养宠恐惧；不展示儿童隐私；不把宠物置于压力或危险状态"),
    categoryRiskAvoidance: list("避免危险抱姿、吞咽风险、小部件风险、窒息风险；避免儿童或宠物正脸过度暴露；避免强迫宠物配合"),
  },
  "sports-outdoors": {
    requiredVisualElements: list("产品结构；穿戴、握持、调节或安装位置；材质和防护细节；运动或户外使用环境；动作状态"),
    proofObligation: list("展示稳定性、支撑性、防滑性、透气性、防水性、耐磨性、便携性或正确使用方法；强调动作安全"),
    validUsageScenes: list("健身房；公园；步道；露营；骑行准备；徒步；居家运动；通勤运动"),
    aestheticBaseline: list("清晰、活力、真实运动感；动作可辨认；户外自然光或专业训练场景"),
    authenticityComplianceBoundary: list("不承诺治疗伤病或快速改变体型；不伪造专业认证；不鼓励高风险挑战或超能力表现"),
    categoryRiskAvoidance: list("避免危险动作、无保护极限运动、不当穿戴、湿滑高风险环境；避免误导性身体焦虑"),
  },
  "jewelry-collectibles": {
    requiredVisualElements: list("材质光泽；纹理、切面、雕工或工艺细节；佩戴或把玩效果；尺寸参照；包装；证书或标签位置的通用展示"),
    proofObligation: list("展示工艺细节、材质质感、佩戴效果、礼赠仪式感、收藏展示方式；高信任商品需要呈现证书或鉴定信息的存在感"),
    validUsageScenes: list("送礼；纪念日；日常佩戴；自我奖励；收藏展示；开盒仪式"),
    aestheticBaseline: list("高级、克制、温暖、细节感；柔光微距；避免廉价闪烁和过度炫富"),
    authenticityComplianceBoundary: list("不承诺升值、保值或投资收益；不伪造鉴定证书；不使用虚假产地、材质、文化或宗教背书"),
    categoryRiskAvoidance: list("避免炫富攀比、身份羞辱、假证书特写、过度磨皮反光；避免把文玩神化为改运工具"),
  },
  "books-education": {
    requiredVisualElements: list("封面；内页；目录；样章、练习页或知识结构；年龄、阶段或难度提示；实际阅读、书写或学习动作"),
    proofObligation: list("展示内容结构、难度递进、样页、学习路径、练习方式、亲子阅读或独立学习过程；强调可理解和可坚持"),
    validUsageScenes: list("书桌学习；亲子阅读；课堂延伸；睡前阅读；家庭学习角；备考或兴趣学习场景"),
    aestheticBaseline: list("明亮、温和、清楚、可读；内页信息清晰；学习氛围真实不压迫"),
    authenticityComplianceBoundary: list("不承诺成绩必涨、考试必过、快速逆袭；不制造教育焦虑；不伪造名师、机构、奖项背书"),
    categoryRiskAvoidance: list("避免羞辱儿童、焦虑式催促、儿童隐私暴露、内容看不清；避免只拍封面不展示内页"),
  },
  automotive: {
    requiredVisualElements: list("商品在车内或车外的安装、摆放或使用位置；车型空间参照；安装步骤；使用前后状态；细节、接口、材质或固定方式"),
    proofObligation: list("展示适配性、稳定性、清洁效果、保护效果、便利性、收纳能力、安装牢固度或日常驾驶前后体验；强调安全使用"),
    validUsageScenes: list("停车状态车内；车库；洗车场景；后备箱整理；出行准备；车内清洁或维护场景"),
    aestheticBaseline: list("实用、干净、清晰、车内空间真实；突出安装位置和使用前后变化"),
    authenticityComplianceBoundary: list("不承诺安全法规合规、事故防护或车辆性能提升；不伪造适配所有车型；不展示驾驶中危险操作"),
    categoryRiskAvoidance: list("避免开车拍摄操作；避免遮挡视线、气囊、踏板、档位或车机；避免违规改装；避免危险化学品使用"),
  },
} as const satisfies Record<ProductCategory, ProductCategoryGuidancePack>;

export const DEAL_TYPE_GUIDANCE = {
  "search-standard": {
    purchaseTask: ["用户已有明确需求，正在寻找可靠、适配、性价比合适的选择"],
    decisionInfoDimensions: list("规格维度；适配范围；价格价值感；质量稳定性；评价口碑；售后保障；使用门槛"),
    proofTypes: list("参数卡片；A/B 对比；真实使用演示；兼容或适配清单；细节特写；使用前后效率变化"),
    conversionFriction: list("怕不适配；怕质量不稳；怕参数虚标；怕售后麻烦；怕同类商品太多不好选"),
    offerCommitmentStrategy: list("强调明确选择建议、适配确认、详情页查看、售后保障、低风险下单"),
    funnelPacing: list("前 2 秒提出明确选择问题；中段展示 2-3 个决策维度；结尾给“适合谁/不适合谁”的购买建议"),
  },
  "seeding-nonstandard": {
    purchaseTask: ["用户原本没有强需求，被风格、场景、审美、体验或身份感触发兴趣"],
    decisionInfoDimensions: list("风格适配；场景想象；材质质感；使用体验；搭配方式；真实反馈；是否适合自己"),
    proofTypes: list("生活方式场景；真实使用过程；局部细节；多场景切换；轻口碑；前后氛围变化"),
    conversionFriction: list("怕不适合自己；怕图片好看实物普通；怕冲动后悔；怕不好搭配或不好使用"),
    offerCommitmentStrategy: list("强调收藏、搭配参考、低门槛尝试、组合选择、进入详情页看更多款式或场景"),
    funnelPacing: list("先建立场景和审美吸引，再展示产品细节，最后软性 CTA，不宜一开始强压转化"),
  },
  "impulse-hit": {
    purchaseTask: ["用户被新奇、低门槛、感官刺激、流行感或即时满足触发快速下单"],
    decisionInfoDimensions: list("新奇感；视觉或感官结果；价格门槛；分享价值；使用简单度；是否马上能理解"),
    proofTypes: list("反差展示；开箱开封；一秒结果；近景感官刺激；快速使用；人群反应；短口碑符号"),
    conversionFriction: list("怕是假效果；怕质量差；怕不好用；怕物流或售后麻烦"),
    offerCommitmentStrategy: list("强调尝鲜、限时、组合装、低门槛试买、下单即用场景"),
    funnelPacing: list("前 1 秒强钩子；3-6 秒完成结果展示；中段快速证明；结尾短促 CTA，可重复一次购买入口"),
  },
  "repeat-consumable": {
    purchaseTask: ["用户需要稳定补货、降低日常使用成本、减少断货和选择负担"],
    decisionInfoDimensions: list("使用频率；包装规格；单次成本感；温和性或安全性；耐用/消耗速度；存放便利；复购便利"),
    proofTypes: list("日常例行动作；用量展示；包装数量；消耗场景；前后清洁或替换过程；家庭囤货画面"),
    conversionFriction: list("怕浪费；怕不适合长期用；怕刺激或不舒适；怕囤多不好存；怕复购麻烦"),
    offerCommitmentStrategy: list("强调组合装、囤货装、周期补货、订阅或复购提醒、稳定使用价值"),
    funnelPacing: list("先切入高频痛点；中段展示稳定使用证据；结尾强调囤货和复购便利"),
  },
  "premium-brand": {
    purchaseTask: ["用户在高价格、高风险或高情绪价值场景下，需要建立充分信任再决策"],
    decisionInfoDimensions: list("品牌可信度；材质与工艺；证书或标准；服务流程；售后保障；长期价值；礼赠或身份场景"),
    proofTypes: list("证书或标准展示；工艺细节；服务流程；包装开箱；真实场景；用户评价；专家或权威原则说明"),
    conversionFriction: list("怕贵；怕假；怕买错；怕售后麻烦；怕不适合场景；怕价值不匹配"),
    offerCommitmentStrategy: list("强调咨询、预约、质保、售后、规格确认、礼盒或服务承诺；CTA 应降低决策风险"),
    funnelPacing: list("慢建立信任；先证明再转化；中后段解决顾虑；结尾以咨询、查看详情、确认服务为主"),
  },
} as const satisfies Record<DealType, DealTypeGuidancePack>;

export const AUDIENCE_GUIDANCE = {
  general: {
    addresseeRole: ["泛人群买家或实际使用者，不默认性别、年龄、收入、家庭结构"],
    languageStyle: ["中性、清晰、口语化、不过度圈层化"],
    benefitPriority: list("实用价值；使用体验；性价比；便利性；场景适配"),
    representationAndPov: list("产品中心视角；手部演示；真实使用环境；不过度依赖特定人设"),
    readabilityPacing: list("中等语速；中等字幕密度；关键利益点清楚停留"),
    sensitiveExpressionBoundary: list("避免性别、年龄、身材、收入、地域、家庭角色刻板印象；避免羞辱式表达"),
  },
  toddler: {
    addresseeRole: ["购买者和决策者是父母、照护者或新手家长；实际使用对象可能是幼儿"],
    languageStyle: ["温和、安心、解释型、不责备家长"],
    benefitPriority: list("安全感；舒适度；省心；照护效率；日常稳定；减少慌乱"),
    representationAndPov: list("以照护者手部演示、家庭照护场景为主；幼儿不承担购买表达；儿童正脸和身体暴露要克制"),
    readabilityPacing: list("字幕清楚；步骤慢一点；镜头稳定；关键安全动作需要停留"),
    sensitiveExpressionBoundary: list("不制造育儿焦虑；不使用“好妈妈才会买”等道德绑架；不暗示疾病治疗；不展示儿童隐私或危险照护动作"),
  },
  child: {
    addresseeRole: ["购买者是家长、老师或照护者；使用者是儿童"],
    languageStyle: ["鼓励、温和、解释型，强调兴趣和陪伴，不压迫"],
    benefitPriority: list("兴趣启发；安全适配；习惯养成；亲子互动；循序渐进；成就感"),
    representationAndPov: list("书桌、玩耍、学习或亲子互动视角；儿童可作为使用场景出现，但不作为被羞辱或被过度驱动的对象"),
    readabilityPacing: list("字幕清楚偏大；步骤化呈现；适度慢镜头；信息密度低于成人标品测评"),
    sensitiveExpressionBoundary: list("不制造教育焦虑；不说“落后、笨、再不学就晚了”；不承诺成绩必涨；不暴露儿童隐私"),
  },
  youth: {
    addresseeRole: ["自用型买家为主，包括学生、年轻职场人、兴趣消费人群"],
    languageStyle: ["直接、轻快、口语化、有节奏感；可以更短句，但不装腔作势"],
    benefitPriority: list("效率；审美表达；社交场景；性价比；便携；体验升级；情绪价值"),
    representationAndPov: list("第一人称 POV、手持、桌面、街拍、通勤、宿舍或轻生活方式场景"),
    readabilityPacing: list("剪辑可更快；字幕可以更短更密，但关键参数和 CTA 必须可读"),
    sensitiveExpressionBoundary: list("不做收入羞辱、外貌羞辱、身材焦虑、社交焦虑操控；不把年轻人刻板化为冲动或不理性"),
  },
  senior: {
    addresseeRole: ["实际使用者可能是银发用户；购买者也可能是成年子女或家庭成员"],
    languageStyle: ["尊重、清楚、耐心、不过度卖惨，不把老年人儿童化"],
    benefitPriority: list("安全；易用；舒适；独立感；省力；家人安心；日常便利"),
    representationAndPov: list("稳定机位；手部操作；家庭或社区真实场景；可出现家人协助，但不剥夺银发用户主体性"),
    readabilityPacing: list("字幕更大；语速更慢；减少跳切；关键步骤和安全提示要停留"),
    sensitiveExpressionBoundary: list("不使用年龄羞辱；不恐吓疾病风险；不说“拖累子女”；不把老年人表现为无能或被动"),
  },
} as const satisfies Record<Audience, AudienceGuidancePack>;

export const STRATEGY_GUIDANCE = {
  "pain-solution": {
    hookMechanism: ["用具体、可感知的日常痛点开场，避免泛泛而谈"],
    narrativeStructure: ["痛点场景 → 痛点原因 → 使用方式 → 结果缓解 → 行动引导"],
    evidenceOrganization: ["先呈现问题，再展示解决过程，最后展示结果；证据要与痛点一一对应"],
    shotEditingGrammar: list("痛点近景；动作前后对比；关键步骤字幕；结果镜头停留；避免夸张戏剧化"),
  },
  "scenario-demo": {
    hookMechanism: ["从高频、可代入的使用场景切入，让用户马上知道“什么时候会用到”"],
    narrativeStructure: ["场景进入 → 产品出现 → 完整使用路径 → 场景收益 → 行动引导"],
    evidenceOrganization: ["以完整场景链路作为证据，展示从拿起、使用到结果的过程"],
    shotEditingGrammar: list("先宽景交代场景，再切中景动作和近景细节；使用 POV、手部演示和自然转场"),
  },
  "review-comparison": {
    hookMechanism: ["用选择难题、对比问题、测试挑战或“同类差别在哪里”开场"],
    narrativeStructure: ["对比标准 → 同条件展示 → 关键差异 → 结论建议 → 行动引导"],
    evidenceOrganization: ["使用 A/B 对比、分屏、维度卡片、同光线同角度演示；避免不公平对比"],
    shotEditingGrammar: list("分屏、计时器、标签卡、近景细节、稳定机位；结论字幕必须明确"),
  },
  "tutorial-value": {
    hookMechanism: ["用“三步学会”“一分钟搞懂”“别再用错了”这类教程承诺开场，但不制造恐吓"],
    narrativeStructure: ["常见问题或错误 → 正确步骤 → 使用技巧 → 结果确认 → 收藏或行动引导"],
    evidenceOrganization: ["用步骤编号、关键动作重复、注意事项标注来证明“真的能学会”"],
    shotEditingGrammar: list("俯拍、POV、手部特写、步骤字幕、慢速停顿；避免过快转场遮挡步骤"),
  },
  "authority-proof": {
    hookMechanism: ["以标准、认证、原则、专业判断或高信任信息开场，但必须避免伪造权威"],
    narrativeStructure: ["权威标准或判断原则 → 产品与标准的对应点 → 细节证明 → 风险降低 → 行动引导"],
    evidenceOrganization: ["证书、标准、工艺、服务、流程、细节特写优先；如果没有真实证明，不得虚构"],
    shotEditingGrammar: list("稳定镜头、干净背景、证据信息卡、细节推近、低噪声剪辑；避免过度娱乐化"),
  },
  "emotional-story": {
    hookMechanism: ["用关系、纪念、陪伴、自我奖励或生活转折的情绪瞬间开场"],
    narrativeStructure: ["情绪场景 → 小冲突或愿望 → 产品作为承载物 → 情绪完成 → 软性行动引导"],
    evidenceOrganization: ["先建立情绪，再用细节、开盒、使用或送礼结果补足信任"],
    shotEditingGrammar: list("慢推、柔光、手部或表情特写、音乐铺垫、较长停留；避免煽情过度"),
  },
  "curiosity-hook": {
    hookMechanism: ["用反常识、悬念、隐藏结果、奇怪问题或“为什么会这样”制造好奇"],
    narrativeStructure: ["悬念 → 展示结果 → 揭示过程 → 解释原因 → 行动引导"],
    evidenceOrganization: ["先给结果或局部现象，再补充过程证据，最后解释可购买价值"],
    shotEditingGrammar: list("快切、遮挡揭示、极近景、音效点、字幕悬念；中段必须补足真实过程"),
  },
  "visual-story": {
    hookMechanism: ["用强视觉结果、动作、造型、空间变化或质感画面直接抓注意力"],
    narrativeStructure: ["结果先行 → 多场景视觉推进 → 细节证明 → 最终美感或使用收益 → 轻 CTA"],
    evidenceOrganization: ["以画面本身作为主要证据，辅以少量字幕标注，确保商品持续可见"],
    shotEditingGrammar: list("音乐卡点、转场匹配、低口播、细节微距、多场景切换；避免商品被氛围淹没"),
  },
} as const satisfies Record<Strategy, StrategyGuidancePack>;

export const FACTOR_GUIDANCE_REGISTRY = {
  factorPromptVersion: FACTOR_PROMPT_VERSION,
  productCategoryPacks: PRODUCT_CATEGORY_GUIDANCE,
  dealTypePacks: DEAL_TYPE_GUIDANCE,
  audiencePacks: AUDIENCE_GUIDANCE,
  strategyPacks: STRATEGY_GUIDANCE,
  compileTemplateVersion: FACTOR_COMPILE_TEMPLATE_VERSION,
  createdAt: "2026-06-08T00:00:00.000Z",
  immutable: true,
} as const;

function source(
  sourcePath: FactorGuidanceFieldPath,
  label: string,
  factor: CompiledRequirementSource["factor"],
  affects: CompiledRequirementField[],
): CompiledRequirementSource {
  return { sourcePath, label, factor, affects };
}

const SOURCE_DESCRIPTORS = {
  requiredVisualElements: source(
    "factorGuidance.productCategory.requiredVisualElements",
    "商品一级类目:必见视觉要素",
    "productCategory",
    ["image.style", "image.composition", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  proofObligation: source(
    "factorGuidance.productCategory.proofObligation",
    "商品一级类目:品类证明义务",
    "productCategory",
    ["image.composition", "script.tone", "storyboard.rhythm", "shotImage.global"],
  ),
  validUsageScenes: source(
    "factorGuidance.productCategory.validUsageScenes",
    "商品一级类目:合理使用场景",
    "productCategory",
    ["image.style", "image.composition", "image.avoid", "shotImage.global", "shotVideo.global"],
  ),
  aestheticBaseline: source(
    "factorGuidance.productCategory.aestheticBaseline",
    "商品一级类目:品类审美基线",
    "productCategory",
    ["image.style", "image.composition", "shotImage.global", "shotVideo.global"],
  ),
  authenticityComplianceBoundary: source(
    "factorGuidance.productCategory.authenticityComplianceBoundary",
    "商品一级类目:真实性与合规边界",
    "productCategory",
    ["image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  categoryRiskAvoidance: source(
    "factorGuidance.productCategory.categoryRiskAvoidance",
    "商品一级类目:品类风险规避",
    "productCategory",
    ["image.style", "image.composition", "image.avoid", "script.tone", "shotImage.global", "shotVideo.global"],
  ),
  purchaseTask: source(
    "factorGuidance.dealType.purchaseTask",
    "商品成交类型:购买任务",
    "dealType",
    ["script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  decisionInfoDimensions: source(
    "factorGuidance.dealType.decisionInfoDimensions",
    "商品成交类型:决策信息维度",
    "dealType",
    ["image.composition", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  proofTypes: source(
    "factorGuidance.dealType.proofTypes",
    "商品成交类型:证据类型",
    "dealType",
    ["image.composition", "image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  conversionFriction: source(
    "factorGuidance.dealType.conversionFriction",
    "商品成交类型:转化阻力",
    "dealType",
    ["image.composition", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  offerCommitmentStrategy: source(
    "factorGuidance.dealType.offerCommitmentStrategy",
    "商品成交类型:优惠与承诺策略",
    "dealType",
    ["image.composition", "image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  funnelPacing: source(
    "factorGuidance.dealType.funnelPacing",
    "商品成交类型:漏斗节奏",
    "dealType",
    ["script.tone", "storyboard.rhythm", "shotVideo.global"],
  ),
  addresseeRole: source(
    "factorGuidance.audience.addresseeRole",
    "适用人群:沟通对象身份",
    "audience",
    ["image.style", "image.composition", "image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  languageStyle: source(
    "factorGuidance.audience.languageStyle",
    "适用人群:语言风格",
    "audience",
    ["image.avoid", "script.tone", "storyboard.rhythm", "shotVideo.global"],
  ),
  benefitPriority: source(
    "factorGuidance.audience.benefitPriority",
    "适用人群:利益排序",
    "audience",
    ["image.style", "image.composition", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  representationAndPov: source(
    "factorGuidance.audience.representationAndPov",
    "适用人群:人物与视角适配",
    "audience",
    ["image.style", "image.composition", "image.avoid", "shotImage.global", "shotVideo.global"],
  ),
  readabilityPacing: source(
    "factorGuidance.audience.readabilityPacing",
    "适用人群:可读性与节奏适配",
    "audience",
    ["image.style", "image.composition", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  sensitiveExpressionBoundary: source(
    "factorGuidance.audience.sensitiveExpressionBoundary",
    "适用人群:敏感表达边界",
    "audience",
    ["image.style", "image.composition", "image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  hookMechanism: source(
    "factorGuidance.strategy.hookMechanism",
    "推销手法:开场钩子机制",
    "strategy",
    ["image.style", "image.composition", "image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  narrativeStructure: source(
    "factorGuidance.strategy.narrativeStructure",
    "推销手法:叙事结构",
    "strategy",
    ["image.composition", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
  evidenceOrganization: source(
    "factorGuidance.strategy.evidenceOrganization",
    "推销手法:证据组织方式",
    "strategy",
    ["image.composition", "image.avoid", "script.tone", "storyboard.rhythm", "shotImage.global", "shotVideo.global"],
  ),
} as const;

export const FACTOR_GUIDANCE_FIELD_AFFECTS: Record<
  FactorGuidanceFieldPath,
  {
    label: string;
    factor: CompiledRequirementSource["factor"];
    affects: CompiledRequirementField[];
  }
> = Object.fromEntries(
  Object.values(SOURCE_DESCRIPTORS).map((descriptor) => [
    descriptor.sourcePath,
    {
      label: descriptor.label,
      factor: descriptor.factor,
      affects: [...descriptor.affects],
    },
  ]),
) as Record<
  FactorGuidanceFieldPath,
  {
    label: string;
    factor: CompiledRequirementSource["factor"];
    affects: CompiledRequirementField[];
  }
>;

export const DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP =
  compiledRequirementSourceMapSchema.parse({
    imageStyle: [
      SOURCE_DESCRIPTORS.aestheticBaseline,
      SOURCE_DESCRIPTORS.validUsageScenes,
      SOURCE_DESCRIPTORS.representationAndPov,
      SOURCE_DESCRIPTORS.benefitPriority,
    ],
    imageComposition: [
      SOURCE_DESCRIPTORS.requiredVisualElements,
      SOURCE_DESCRIPTORS.proofObligation,
      SOURCE_DESCRIPTORS.decisionInfoDimensions,
      SOURCE_DESCRIPTORS.proofTypes,
      SOURCE_DESCRIPTORS.representationAndPov,
      SOURCE_DESCRIPTORS.readabilityPacing,
      SOURCE_DESCRIPTORS.evidenceOrganization,
    ],
    imageAvoid: [
      SOURCE_DESCRIPTORS.authenticityComplianceBoundary,
      SOURCE_DESCRIPTORS.categoryRiskAvoidance,
      SOURCE_DESCRIPTORS.sensitiveExpressionBoundary,
      SOURCE_DESCRIPTORS.offerCommitmentStrategy,
      SOURCE_DESCRIPTORS.hookMechanism,
      SOURCE_DESCRIPTORS.evidenceOrganization,
    ],
    scriptTone: [
      SOURCE_DESCRIPTORS.languageStyle,
      SOURCE_DESCRIPTORS.addresseeRole,
      SOURCE_DESCRIPTORS.benefitPriority,
      SOURCE_DESCRIPTORS.purchaseTask,
      SOURCE_DESCRIPTORS.conversionFriction,
      SOURCE_DESCRIPTORS.offerCommitmentStrategy,
      SOURCE_DESCRIPTORS.authenticityComplianceBoundary,
      SOURCE_DESCRIPTORS.hookMechanism,
      SOURCE_DESCRIPTORS.narrativeStructure,
    ],
    storyboardRhythm: [
      SOURCE_DESCRIPTORS.funnelPacing,
      SOURCE_DESCRIPTORS.narrativeStructure,
      SOURCE_DESCRIPTORS.evidenceOrganization,
      SOURCE_DESCRIPTORS.readabilityPacing,
      SOURCE_DESCRIPTORS.proofObligation,
    ],
    shotImageGlobal: [
      SOURCE_DESCRIPTORS.requiredVisualElements,
      SOURCE_DESCRIPTORS.proofObligation,
      SOURCE_DESCRIPTORS.categoryRiskAvoidance,
      SOURCE_DESCRIPTORS.decisionInfoDimensions,
      SOURCE_DESCRIPTORS.proofTypes,
      SOURCE_DESCRIPTORS.representationAndPov,
      SOURCE_DESCRIPTORS.readabilityPacing,
      SOURCE_DESCRIPTORS.evidenceOrganization,
    ],
    shotVideoGlobal: [
      SOURCE_DESCRIPTORS.requiredVisualElements,
      SOURCE_DESCRIPTORS.validUsageScenes,
      SOURCE_DESCRIPTORS.categoryRiskAvoidance,
      SOURCE_DESCRIPTORS.proofTypes,
      SOURCE_DESCRIPTORS.funnelPacing,
      SOURCE_DESCRIPTORS.representationAndPov,
      SOURCE_DESCRIPTORS.readabilityPacing,
      SOURCE_DESCRIPTORS.narrativeStructure,
    ],
  });

function compact(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(compact(values)));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown) {
  const text = typeof value === "string" ? value : stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function factorComboKey(factors: CreativeFactors) {
  return [
    factors.productCategory,
    factors.dealType,
    factors.audience,
    factors.strategy,
  ].join("__");
}

function guidanceForFactors(factors: CreativeFactors): FactorGuidance {
  return factorGuidanceSchema.parse({
    productCategory: PRODUCT_CATEGORY_GUIDANCE[factors.productCategory],
    dealType: DEAL_TYPE_GUIDANCE[factors.dealType],
    audience: AUDIENCE_GUIDANCE[factors.audience],
    strategy: STRATEGY_GUIDANCE[factors.strategy],
  });
}

export function compileCreativeRequirementFields(input: {
  creativeFactors: CreativeFactors;
  factorGuidance?: FactorGuidance;
  factorPromptVersion?: string;
}) {
  const factorPromptVersion = input.factorPromptVersion ?? FACTOR_PROMPT_VERSION;
  const guidance = input.factorGuidance ?? guidanceForFactors(input.creativeFactors);
  const compiledGlobalRequirements = compiledGlobalRequirementsSchema.parse({
    image: {
      style: unique([
        ...guidance.productCategory.aestheticBaseline,
        ...guidance.productCategory.validUsageScenes,
        ...guidance.audience.representationAndPov,
        ...guidance.audience.benefitPriority,
      ]),
      composition: unique([
        ...guidance.productCategory.requiredVisualElements,
        ...guidance.productCategory.proofObligation,
        ...guidance.dealType.decisionInfoDimensions,
        ...guidance.dealType.proofTypes,
        ...guidance.audience.representationAndPov,
        ...guidance.audience.readabilityPacing,
        ...guidance.strategy.evidenceOrganization,
      ]),
      avoid: unique([
        ...guidance.productCategory.authenticityComplianceBoundary,
        ...guidance.productCategory.categoryRiskAvoidance,
        ...guidance.audience.sensitiveExpressionBoundary,
        ...guidance.dealType.offerCommitmentStrategy.map(
          (item) => `促销/承诺边界：${item}`,
        ),
        ...guidance.strategy.hookMechanism.map((item) => `钩子表达边界：${item}`),
        ...guidance.strategy.evidenceOrganization.map(
          (item) => `证据组织边界：${item}`,
        ),
      ]),
    },
    script: {
      tone: unique([
        ...guidance.audience.languageStyle,
        ...guidance.audience.addresseeRole,
        ...guidance.audience.benefitPriority,
        ...guidance.dealType.purchaseTask,
        ...guidance.dealType.conversionFriction,
        ...guidance.dealType.offerCommitmentStrategy,
        ...guidance.productCategory.authenticityComplianceBoundary,
        ...guidance.strategy.hookMechanism,
        ...guidance.strategy.narrativeStructure,
      ]),
    },
    storyboard: {
      rhythm: unique([
        ...guidance.dealType.funnelPacing,
        ...guidance.strategy.narrativeStructure,
        ...guidance.strategy.evidenceOrganization,
        ...guidance.audience.readabilityPacing,
        ...guidance.productCategory.proofObligation,
      ]),
    },
    shotImage: {
      global: unique([
        ...guidance.productCategory.requiredVisualElements,
        ...guidance.productCategory.proofObligation,
        ...guidance.productCategory.categoryRiskAvoidance,
        ...guidance.dealType.decisionInfoDimensions,
        ...guidance.dealType.proofTypes,
        ...guidance.audience.representationAndPov,
        ...guidance.audience.readabilityPacing,
        ...guidance.strategy.evidenceOrganization,
      ]),
    },
    shotVideo: {
      global: unique([
        ...guidance.productCategory.requiredVisualElements,
        ...guidance.productCategory.validUsageScenes,
        ...guidance.productCategory.categoryRiskAvoidance,
        ...guidance.dealType.proofTypes,
        ...guidance.dealType.funnelPacing,
        ...guidance.audience.representationAndPov,
        ...guidance.audience.readabilityPacing,
        ...guidance.strategy.narrativeStructure,
      ]),
    },
  });
  const comboKey = factorComboKey(input.creativeFactors);
  const canonicalPromptJson = stableStringify({
    factorPromptVersion,
    factorComboKey: comboKey,
    compiledGlobalRequirements,
  });
  return {
    ...compiledGlobalRequirements,
    compiledGlobalRequirements,
    factorPromptVersion,
    factorComboKey: comboKey,
    compiledRequirementsHash: stableHash(canonicalPromptJson),
    canonicalPromptJson,
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
  const factorGuidance = guidanceForFactors(creativeFactors);
  const compiled = compileCreativeRequirementFields({
    creativeFactors,
    factorGuidance,
    factorPromptVersion: FACTOR_PROMPT_VERSION,
  });
  return creativeFactorRequirementsDataSchema.parse({
    image: compiled.image,
    script: compiled.script,
    storyboard: compiled.storyboard,
    shotImage: compiled.shotImage,
    shotVideo: compiled.shotVideo,
    creativeFactors,
    factorGuidance,
    compiledRequirementSourceMap: compiled.compiledRequirementSourceMap,
    factorPromptVersion: compiled.factorPromptVersion,
    factorComboKey: compiled.factorComboKey,
    compiledRequirementsHash: compiled.compiledRequirementsHash,
    attributionEligible: true,
  });
}

export function applyCreativeFactorsToPromptRequirements(
  _draft: unknown,
  input: Partial<CreativeFactors> = {},
): CreativeFactorRequirementsData {
  return buildCreativeFactorRequirements(input);
}
