import { z } from "zod";
import {
  buildCreativeFactorRequirements,
  creativeFactorsSchema,
  productCategorySchema,
  audienceSchema,
  dealTypeSchema,
  type Audience,
  type DealType,
  type ProductCategory,
} from "../schemas/creative-factors.js";

export const creativeRequirementTemplateSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    version: z.string().trim().min(1),
    creativeFactors: creativeFactorsSchema,
  })
  .strict()
  .superRefine((template, context) => {
    const compiled = buildCreativeFactorRequirements(template.creativeFactors);
    if (compiled.factorComboKey.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["creativeFactors"],
        message: "factor preset must compile to a stable factor combo key",
      });
    }
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
          message: `Duplicate creative requirement preset id: ${template.id}`,
        });
      }
      seen.add(template.id);
    }
  });

export type CreativeRequirementTemplate = z.infer<
  typeof creativeRequirementTemplateSchema
>;

const PRESET_VERSION = "factor-preset.2026-06-08";

export const CREATIVE_REQUIREMENT_TEMPLATES = [
  {
    id: "consumer-electronics-search-youth-review",
    name: "3C数码·搜索标品",
    summary: "规格适配和测评对比优先，面向年轻自用买家做理性选择建议。",
    version: PRESET_VERSION,
    creativeFactors: {
      productCategory: "consumer-electronics",
      dealType: "search-standard",
      audience: "youth",
      strategy: "review-comparison",
    },
  },
  {
    id: "beauty-seeding-youth-scenario",
    name: "美妆个护·青年种草",
    summary: "用真实场景和质地细节建立体验感，适合非标品种草。",
    version: PRESET_VERSION,
    creativeFactors: {
      productCategory: "beauty-personal-care",
      dealType: "seeding-nonstandard",
      audience: "youth",
      strategy: "scenario-demo",
    },
  },
  {
    id: "food-impulse-general-curiosity",
    name: "食品饮料·爆款钩子",
    summary: "第一眼结果和感官证据优先，快速解释真实过程。",
    version: PRESET_VERSION,
    creativeFactors: {
      productCategory: "food-beverage",
      dealType: "impulse-hit",
      audience: "general",
      strategy: "curiosity-hook",
    },
  },
  {
    id: "mom-baby-repeat-toddler-pain",
    name: "母婴宠物·复购痛点",
    summary: "围绕高频照护痛点和稳定使用证据建立复购理由。",
    version: PRESET_VERSION,
    creativeFactors: {
      productCategory: "mom-baby-pet",
      dealType: "repeat-consumable",
      audience: "toddler",
      strategy: "pain-solution",
    },
  },
  {
    id: "jewelry-premium-general-emotional",
    name: "珠宝文玩·礼赠",
    summary: "先建立信任和情绪价值，再用工艺、证书和服务降低决策风险。",
    version: PRESET_VERSION,
    creativeFactors: {
      productCategory: "jewelry-collectibles",
      dealType: "premium-brand",
      audience: "general",
      strategy: "emotional-story",
    },
  },
] satisfies CreativeRequirementTemplate[];

export function getCreativeRequirementTemplates(
  templates: unknown = CREATIVE_REQUIREMENT_TEMPLATES,
): CreativeRequirementTemplate[] {
  return creativeRequirementTemplatesSchema.parse(templates);
}

export function filterCreativeRequirementTemplates(
  filters: {
    productCategory?: ProductCategory;
    dealType?: DealType;
    audience?: Audience;
  } = {},
  templates: CreativeRequirementTemplate[] = getCreativeRequirementTemplates(),
): CreativeRequirementTemplate[] {
  const { productCategory, dealType, audience } = filters;
  return templates.filter((template) => {
    if (productCategory && template.creativeFactors.productCategory !== productCategory) {
      return false;
    }
    if (dealType && template.creativeFactors.dealType !== dealType) {
      return false;
    }
    if (audience && template.creativeFactors.audience !== audience) {
      return false;
    }
    return true;
  });
}

export const creativeRequirementTemplateFilterSchema = z
  .object({
    productCategory: productCategorySchema.optional(),
    dealType: dealTypeSchema.optional(),
    audience: audienceSchema.optional(),
  })
  .strict();
