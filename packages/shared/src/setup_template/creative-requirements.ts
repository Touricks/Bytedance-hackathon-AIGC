import { z } from "zod";
import {
  FACTOR_GUIDANCE_FIELD_AFFECTS,
  audienceSchema,
  buildCreativeFactorRequirements,
  compileCreativeRequirementFields,
  compiledRequirementFieldSchema,
  creativeFactorsSchema,
  factorGuidanceFieldPathSchema,
  productTypeSchema,
  strategySchema,
  type Audience,
  type CreativeFactors,
  type FactorGuidance,
  type FactorGuidanceFieldPath,
  type ProductType,
  type VisualStyle,
} from "../schemas/creative-factors.js";

export const creativeRequirementTemplateValuesSchema = z.object({
  imageStyle: z.string().trim().min(1),
  imageComposition: z.string().trim().min(1),
  imageAvoid: z.string().trim().min(1),
  scriptTone: z.string().trim().min(1),
  storyboardRhythm: z.string().trim().min(1),
  shotImageGlobal: z.string().trim().min(1),
  shotVideoGlobal: z.string().trim().min(1),
});
export type CreativeRequirementTemplateValues = z.infer<
  typeof creativeRequirementTemplateValuesSchema
>;

export const creativeRequirementTemplateFieldSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
  affects: z.array(compiledRequirementFieldSchema).min(1),
});
export type CreativeRequirementTemplateField = z.infer<
  typeof creativeRequirementTemplateFieldSchema
>;

export const creativeRequirementTemplateFieldsSchema = z.record(
  factorGuidanceFieldPathSchema,
  creativeRequirementTemplateFieldSchema,
);
export type CreativeRequirementTemplateFields = z.infer<
  typeof creativeRequirementTemplateFieldsSchema
>;

export const creativeRequirementTemplateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  version: z.string().trim().min(1),
  // 兼容旧调用方的平铺分类字段；新代码以 creativeFactors 为准。
  productType: productTypeSchema,
  audiences: z.array(audienceSchema).min(1),
  strategy: strategySchema,
  creativeFactors: creativeFactorsSchema,
  fields: creativeRequirementTemplateFieldsSchema,
  // 兼容缓存：必须由 creativeFactors + fields 编译得到，不再作为模板本体维护。
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
      for (const sourcePath of Object.keys(FACTOR_GUIDANCE_FIELD_AFFECTS)) {
        if (template.fields[sourcePath as FactorGuidanceFieldPath]) continue;
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "fields", sourcePath],
          message: `${sourcePath} is required so template field influence is explicit`,
        });
      }
      for (const [sourcePath, field] of Object.entries(template.fields)) {
        const expected = FACTOR_GUIDANCE_FIELD_AFFECTS[sourcePath as FactorGuidanceFieldPath];
        if (!expected) continue;
        if (!sameSet(field.affects, expected.affects)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "fields", sourcePath, "affects"],
            message: `${sourcePath} affects must match canonical factor guidance mapping`,
          });
        }
      }
    }
  });

export type CreativeRequirementTemplate = z.infer<
  typeof creativeRequirementTemplateSchema
>;

type CreativeFactorsInput = Omit<CreativeFactors, "visualStyle"> & {
  visualStyle?: VisualStyle;
};

type TemplateSeed = {
  id: string;
  name: string;
  summary: string;
  creativeFactors: CreativeFactorsInput;
  factorGuidanceOverrides?: {
    productType?: Partial<FactorGuidance["productType"]>;
    audience?: Partial<FactorGuidance["audience"]>;
    strategy?: Partial<FactorGuidance["strategy"]>;
  };
  version?: string;
};

const TEMPLATE_VERSION = "p0-2026-06";

const GUIDANCE_FIELD_LABELS: Record<FactorGuidanceFieldPath, string> = {
  "factorGuidance.productType.subjectPresentation": "主体呈现",
  "factorGuidance.productType.sceneAndDelivery": "场景与交付",
  "factorGuidance.productType.authenticityBoundaries": "真实性边界",
  "factorGuidance.audience.addressingAndTone": "称谓与语气",
  "factorGuidance.audience.benefitFrame": "利益表达",
  "factorGuidance.audience.sensitivityBoundaries": "敏感边界",
  "factorGuidance.strategy.openingHook": "开场方式",
  "factorGuidance.strategy.storyStructure": "故事结构",
  "factorGuidance.strategy.evidenceAndCta": "证据与行动引导",
};

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function valueAtFactorGuidancePath(
  factorGuidance: FactorGuidance,
  path: FactorGuidanceFieldPath,
) {
  const [, group, field] = path.split(".") as [
    "factorGuidance",
    keyof FactorGuidance,
    string,
  ];
  return (factorGuidance[group] as Record<string, string>)[field] ?? "";
}

export function buildCreativeRequirementTemplateFields(
  factorGuidance: FactorGuidance,
): CreativeRequirementTemplateFields {
  const entries = Object.entries(FACTOR_GUIDANCE_FIELD_AFFECTS).map(
    ([sourcePath, descriptor]) => [
      sourcePath,
      {
        label: GUIDANCE_FIELD_LABELS[sourcePath as FactorGuidanceFieldPath],
        value: valueAtFactorGuidancePath(
          factorGuidance,
          sourcePath as FactorGuidanceFieldPath,
        ),
        affects: descriptor.affects,
      },
    ],
  );
  return creativeRequirementTemplateFieldsSchema.parse(Object.fromEntries(entries));
}

function stringifyRequirementValue(value: unknown) {
  return Array.isArray(value) ? value.join("，") : String(value ?? "");
}

export function creativeRequirementValuesFromFactors(
  creativeFactors: CreativeFactorsInput,
): CreativeRequirementTemplateValues {
  const data = buildCreativeFactorRequirements(creativeFactors);
  const compiled = compileCreativeRequirementFields({
    factorGuidance: data.factorGuidance,
    scriptInfluence: data.scriptInfluence,
    visualStyle: data.creativeFactors.visualStyle,
  });
  return creativeRequirementValuesSchemaFromCompiled(compiled);
}

function creativeRequirementValuesSchemaFromCompiled(
  compiled: ReturnType<typeof compileCreativeRequirementFields>,
): CreativeRequirementTemplateValues {
  return creativeRequirementTemplateValuesSchema.parse({
    imageStyle: stringifyRequirementValue(compiled.image.style),
    imageComposition: stringifyRequirementValue(compiled.image.composition),
    imageAvoid: stringifyRequirementValue(compiled.image.avoid),
    scriptTone: stringifyRequirementValue(compiled.script.tone),
    storyboardRhythm: stringifyRequirementValue(compiled.storyboard.rhythm),
    shotImageGlobal: stringifyRequirementValue(compiled.shotImage.global),
    shotVideoGlobal: stringifyRequirementValue(compiled.shotVideo.global),
  });
}

function mergeFactorGuidance(
  base: FactorGuidance,
  overrides: TemplateSeed["factorGuidanceOverrides"] = {},
): FactorGuidance {
  return {
    productType: {
      ...base.productType,
      ...overrides.productType,
    },
    audience: {
      ...base.audience,
      ...overrides.audience,
    },
    strategy: {
      ...base.strategy,
      ...overrides.strategy,
    },
  };
}

function createTemplate(seed: TemplateSeed): CreativeRequirementTemplate {
  const data = buildCreativeFactorRequirements(seed.creativeFactors);
  const factorGuidance = mergeFactorGuidance(
    data.factorGuidance,
    seed.factorGuidanceOverrides,
  );
  const compiled = compileCreativeRequirementFields({
    factorGuidance,
    scriptInfluence: data.scriptInfluence,
    visualStyle: data.creativeFactors.visualStyle,
  });
  return creativeRequirementTemplateSchema.parse({
    id: seed.id,
    name: seed.name,
    summary: seed.summary,
    version: seed.version ?? TEMPLATE_VERSION,
    productType: data.creativeFactors.productType,
    audiences: [data.creativeFactors.audience],
    strategy: data.creativeFactors.strategy,
    creativeFactors: data.creativeFactors,
    fields: buildCreativeRequirementTemplateFields(factorGuidance),
    values: creativeRequirementValuesSchemaFromCompiled(compiled),
  });
}

export const CREATIVE_REQUIREMENT_TEMPLATES = [
  createTemplate({
    id: "consumable-youth-seeding",
    name: "快消种草·青年",
    summary: "痛点直给，质地和体验可见，结尾给出轻决策购买理由。",
    creativeFactors: {
      productType: "consumable-good",
      audience: "youth",
      strategy: "pain-solution",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "真实展示包装开封、近景质地、单次用量和使用瞬间,让商品状态可感知。",
        sceneAndDelivery: "按痛点开场、开箱/质地、上手使用、即时感受、复购或下单理由推进。",
        authenticityBoundaries: "避免虚假成分对比、夸大功效、过度磨皮修图和无法证明的立竿见影。",
      },
      audience: {
        addressingAndTone: "面向年轻用户直接说体验,少形容词,多具体感受和可复现细节。",
        benefitFrame: "强调省时、好看、好用、随手可得和试错成本低。",
        sensitivityBoundaries: "避免制造容貌焦虑、身材焦虑和绝对化效果承诺。",
      },
      strategy: {
        openingHook: "前3秒用一个高频痛点或反差体验切入,马上出现商品解决动作。",
        storyStructure: "按痛点放大、方案出现、质地/用量证明、使用反馈、低门槛行动引导推进。",
        evidenceAndCta: "用近景质地、真实使用动作、口碑或复购理由收束,避免强压式逼单。",
      },
    },
  }),
  createTemplate({
    id: "durable-youth-showcase",
    name: "数码家居·青年",
    summary: "场景先行，功能部位可视化，把参数翻译成日常收益。",
    creativeFactors: {
      productType: "durable-good",
      audience: "youth",
      strategy: "scenario-demo",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "突出商品主体、关键功能部位、材质细节、接口/配件和真实使用尺度。",
        sceneAndDelivery: "按日常使用场景、功能演示、细节特写、前后效果和购买理由推进。",
        authenticityBoundaries: "避免虚假参数、夸大续航/性能、商品结构变形和不存在的配件承诺。",
      },
      audience: {
        addressingAndTone: "面向年轻用户讲效率和体验,把参数翻译成省事、好看、好用。",
        benefitFrame: "强调桌面/居家/通勤场景里的效率提升、空间整洁和长期使用价值。",
        sensitivityBoundaries: "避免参数堆砌、虚假横评和把个体体验说成绝对结论。",
      },
      strategy: {
        openingHook: "用一个真实使用瞬间或问题场景开场,先让观众看到为什么需要它。",
        storyStructure: "按场景进入、核心功能演示、细节证明、结果落点、行动引导推进。",
        evidenceAndCta: "用功能演示、材质近景、使用前后变化完成转化,结尾给适用人群建议。",
      },
    },
  }),
  createTemplate({
    id: "virtual-youth-conversion",
    name: "知识服务·青年",
    summary: "先建立可信来源，再把抽象服务拆成流程、样例和报名路径。",
    creativeFactors: {
      productType: "digital-service",
      audience: "youth",
      strategy: "authority-proof",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "用课程界面、服务流程、案例截图、交付物样例和讲师/顾问出镜具象化服务。",
        sceneAndDelivery: "按目标问题、服务流程、关键能力、案例证据和咨询/报名路径推进。",
        authenticityBoundaries: "避免虚假数据、保过承诺、收益保证和无法验证的效果背书。",
      },
      audience: {
        addressingAndTone: "面向年轻用户讲清投入产出,语气专业但不端着。",
        benefitFrame: "强调节省试错、获得方法、明确路径和能马上开始执行。",
        sensitivityBoundaries: "避免制造职业焦虑、学历焦虑和夸大单次服务效果。",
      },
      strategy: {
        openingHook: "用资质、案例或一个清晰方法论开场,先降低观众对服务类商品的怀疑。",
        storyStructure: "按可信来源、方法拆解、样例展示、适用边界、咨询报名推进。",
        evidenceAndCta: "用真实案例、交付样例和明确报名路径收束,不把个例包装成普遍结果。",
      },
    },
  }),
  createTemplate({
    id: "consumable-senior-health",
    name: "银发滋补·老年",
    summary: "温和叙事，成分与礼赠场景并重，功效表达克制合规。",
    creativeFactors: {
      productType: "consumable-good",
      audience: "senior",
      strategy: "emotional-story",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "真实展示包装规格、成分来源、冲泡/食用方式、礼盒质感和日常摆放。",
        sceneAndDelivery: "按关心长辈、送达/开封、日常食用、体面送礼和安心购买推进。",
        authenticityBoundaries: "避免疾病治疗暗示、夸大滋补功效、虚假产地和医疗化承诺。",
      },
      audience: {
        addressingAndTone: "面向银发用户或子女温和说明,语气稳重可信,不制造恐慌。",
        benefitFrame: "强调安心、品质、日常便利、体面心意和长期陪伴感。",
        sensitivityBoundaries: "避免恐吓式健康表达、替代专业医疗建议和绝对化功效。",
      },
      strategy: {
        openingHook: "用一次探望、节日送礼或日常关心场景开场,先建立情绪动机。",
        storyStructure: "按人物关系、关心理由、产品呈现、食用/送礼场景、安心引导推进。",
        evidenceAndCta: "用成分、包装、食用方式和礼赠场景完成信任,结尾温和引导了解。",
      },
    },
  }),
  createTemplate({
    id: "durable-child-parent",
    name: "儿童好物·家长向",
    summary: "把安全、耐用和孩子真实使用过程讲清楚，向家长做稳妥说服。",
    creativeFactors: {
      productType: "durable-good",
      audience: "child",
      strategy: "scenario-demo",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "展示商品主体、圆角/材质/承重等安全细节、孩子使用尺度和家长辅助动作。",
        sceneAndDelivery: "按家庭场景、孩子上手、关键功能、安全细节、收纳或长期使用推进。",
        authenticityBoundaries: "避免危险示范、夸大教育效果、虚假材质和超龄/错龄使用承诺。",
      },
      audience: {
        addressingAndTone: "面向家长说明选择理由,语气温暖可信,强调看得见的安全细节。",
        benefitFrame: "强调安全、省心、耐用、陪伴和孩子愿意持续使用。",
        sensitivityBoundaries: "避免制造教育焦虑、成长焦虑和把商品说成替代陪伴。",
      },
      strategy: {
        openingHook: "用孩子真实使用或家长高频顾虑开场,马上给出场景代入。",
        storyStructure: "按场景进入、孩子使用、家长观察、安全证明、购买建议推进。",
        evidenceAndCta: "用材质细节、使用过程和家长反馈收束,结尾给适龄/适用场景建议。",
      },
    },
  }),
  createTemplate({
    id: "consumable-toddler-mombaby",
    name: "母婴用品·幼儿",
    summary: "安全第一，成分和使用步骤透明，避免制造育儿焦虑。",
    creativeFactors: {
      productType: "consumable-good",
      audience: "toddler",
      strategy: "authority-proof",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "展示包装密封、成分信息、质地/用量、宝宝接触方式和家长操作手部特写。",
        sceneAndDelivery: "按家长顾虑、成分/标准说明、使用步骤、宝宝反应和购买提醒推进。",
        authenticityBoundaries: "避免替代专业建议、夸大成长效果、虚假检测和不适龄使用暗示。",
      },
      audience: {
        addressingAndTone: "面向新手家长温柔说明,给确定感但不制造紧张。",
        benefitFrame: "强调安全、成分透明、步骤简单、日常可执行和照护省心。",
        sensitivityBoundaries: "避免育儿恐吓、贬低其他家长选择和绝对安全承诺。",
      },
      strategy: {
        openingHook: "用成分、检测、适用年龄或家长高频疑问开场,先建立可信边界。",
        storyStructure: "按可信来源、成分/标准、使用步骤、适用边界、购买咨询推进。",
        evidenceAndCta: "用包装信息、标准说明和真实使用步骤收束,结尾提醒按需选择。",
      },
    },
  }),
  createTemplate({
    id: "offline-child-travel",
    name: "亲子旅游·家长向",
    summary: "真实路线和服务保障优先，让家长看见省心、安全和孩子体验。",
    creativeFactors: {
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "真实展示目的地、交通衔接、酒店/营地、带队人员、亲子互动和孩子体验状态。",
        sceneAndDelivery: "按出发准备、到达入住、核心景点/活动、服务保障、报名路径推进。",
        authenticityBoundaries: "避免虚假景点、不存在的酒店交通承诺、夸大安全保障和摆拍冒充真实行程。",
      },
      audience: {
        addressingAndTone: "面向家长说服,语气温暖可信,先回应安全和省心顾虑。",
        benefitFrame: "强调省心安排、安全保障、亲子陪伴、孩子真实体验和路线清晰。",
        sensitivityBoundaries: "避免制造教育焦虑、危险示范和把一次旅行夸大成决定性成长。",
      },
      strategy: {
        openingHook: "用真实亲子出行片段或家长出行痛点开场,迅速建立代入。",
        storyStructure: "按路线顺序和服务节点推进,每个节点都落到家长关心的保障或体验。",
        evidenceAndCta: "用行程安排、服务人员、场地实拍和报名路径完成转化。",
      },
    },
  }),
  createTemplate({
    id: "offline-youth-restaurant",
    name: "到店餐饮·青年",
    summary: "真实到店动线，出品、环境、服务和性价比都给出可验证判断。",
    creativeFactors: {
      productType: "offline-experience-service",
      audience: "youth",
      strategy: "review-comparison",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "真实展示门头位置、排队/入座、环境氛围、招牌菜出品、服务动作和结账信息。",
        sceneAndDelivery: "按到店动线、点单理由、出品近景、口味/分量反馈、适合人群和到店引导推进。",
        authenticityBoundaries: "避免过度滤镜、虚假门店信息、摆拍冒充真实出餐和无法兑现的优惠承诺。",
      },
      audience: {
        addressingAndTone: "面向年轻本地生活用户直接给判断,语气像真实探店但不标题党。",
        benefitFrame: "强调好吃程度、环境氛围、拍照友好、价格感和约会/聚餐适配。",
        sensitivityBoundaries: "避免踩一捧一、绝对化口味结论、诱导浪费和虚假排队热度。",
      },
      strategy: {
        openingHook: "用一道招牌菜、门店反差或明确探店结论开场,先抛出值得去的理由。",
        storyStructure: "按测评维度、到店过程、出品体验、价格/服务对比、适用建议推进。",
        evidenceAndCta: "用菜单价格、菜品近景、环境实拍和适合场景收束,结尾给预约或到店路径。",
      },
    },
  }),
  createTemplate({
    id: "offline-youth-photography",
    name: "本地摄影·青年",
    summary: "用拍摄前后、服务过程和情绪价值，推动咨询预约而非硬卖套餐。",
    creativeFactors: {
      productType: "offline-experience-service",
      audience: "youth",
      strategy: "emotional-story",
    },
    factorGuidanceOverrides: {
      productType: {
        subjectPresentation: "真实展示摄影棚/外景地、妆造沟通、拍摄引导、原片/精修对比和交付样片。",
        sceneAndDelivery: "按拍摄顾虑、沟通过程、现场引导、成片前后变化、咨询预约推进。",
        authenticityBoundaries: "避免盗用样片、过度修图承诺、虚假档期价格和把个案效果说成固定结果。",
      },
      audience: {
        addressingAndTone: "面向年轻用户讲自我表达和纪念感,语气轻松真诚。",
        benefitFrame: "强调被引导的安心感、出片稳定、风格匹配、纪念价值和社交展示。",
        sensitivityBoundaries: "避免制造外貌焦虑、羞辱素人状态和承诺人人同款效果。",
      },
      strategy: {
        openingHook: "用拍摄前的顾虑或成片反差开场,先让用户代入想被好好记录的情绪。",
        storyStructure: "按人物处境、拍摄顾虑、服务引导、成片变化、预约咨询推进。",
        evidenceAndCta: "用沟通片段、引导动作、前后对比和交付样片收束,结尾温和引导咨询档期。",
      },
    },
  }),
] satisfies CreativeRequirementTemplate[];

export function getCreativeRequirementTemplates(
  templates: unknown = CREATIVE_REQUIREMENT_TEMPLATES,
): CreativeRequirementTemplate[] {
  return creativeRequirementTemplatesSchema.parse(templates);
}

/**
 * 按商品种类 / 适用人群筛选模板。新模板以 creativeFactors 为准；
 * productType/audiences/strategy 平铺字段仅作为兼容输出。
 */
export function filterCreativeRequirementTemplates(
  filters: { productType?: ProductType; audience?: Audience } = {},
  templates: CreativeRequirementTemplate[] = getCreativeRequirementTemplates(),
): CreativeRequirementTemplate[] {
  const { productType, audience } = filters;
  return templates.filter((template) => {
    if (productType && template.creativeFactors.productType !== productType) return false;
    if (audience && template.creativeFactors.audience !== audience) return false;
    return true;
  });
}
