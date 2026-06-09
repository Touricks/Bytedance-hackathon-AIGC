import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import {
  AUDIENCE_LABELS,
  DEAL_TYPE_LABELS,
  PRODUCT_CATEGORY_LABELS,
  STRATEGY_LABELS,
  audienceSchema,
  dealTypeSchema,
  productCategorySchema,
  strategySchema,
  type CompiledRequirementSource,
  type CompiledRequirementSourceMap,
  type FactorGuidance,
  type FactorGuidanceFieldPath,
} from "@aigc-video/shared";
import type { RequirementsFormState } from "../requirementsForm.js";

type RequirementFieldStateKey = keyof Pick<
  RequirementsFormState,
  | "imageStyle"
  | "imageComposition"
  | "imageAvoid"
  | "scriptTone"
  | "storyboardRhythm"
  | "shotImageGlobal"
  | "shotVideoGlobal"
>;

export const COMPILED_REQUIREMENT_FIELDS = [
  { key: "imageStyle", sourceMapKey: "imageStyle", label: "图像风格" },
  { key: "imageComposition", sourceMapKey: "imageComposition", label: "图像构图" },
  { key: "imageAvoid", sourceMapKey: "imageAvoid", label: "图像避免项" },
  { key: "scriptTone", sourceMapKey: "scriptTone", label: "剧本语气" },
  { key: "storyboardRhythm", sourceMapKey: "storyboardRhythm", label: "分镜节奏" },
  { key: "shotImageGlobal", sourceMapKey: "shotImageGlobal", label: "分镜图全局要求" },
  { key: "shotVideoGlobal", sourceMapKey: "shotVideoGlobal", label: "分镜视频全局要求", wide: true },
] as const satisfies Array<{
  key: RequirementFieldStateKey;
  sourceMapKey: keyof CompiledRequirementSourceMap;
  label: string;
  wide?: boolean;
}>;

function factorOptions<TValue extends string>(
  values: readonly TValue[],
  labels: Record<TValue, string>,
) {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const PRODUCT_CATEGORY_OPTIONS = factorOptions(
  productCategorySchema.options,
  PRODUCT_CATEGORY_LABELS,
);
export const DEAL_TYPE_OPTIONS = factorOptions(dealTypeSchema.options, DEAL_TYPE_LABELS);
export const AUDIENCE_OPTIONS = factorOptions(audienceSchema.options, AUDIENCE_LABELS);
export const STRATEGY_OPTIONS = factorOptions(strategySchema.options, STRATEGY_LABELS);

export function sourceSummary(sources: readonly CompiledRequirementSource[]) {
  return `由 ${sources.length} 个细分字段编译`;
}

export function SourceChips({ sources }: { sources: CompiledRequirementSource[] }) {
  return (
    <div className="compiled-source-chips" aria-label="字段来源">
      {sources.map((source) => (
        <span className="compiled-source-chip" key={source.sourcePath}>
          {source.label}
        </span>
      ))}
    </div>
  );
}

const GUIDANCE_VALUE_LABELS: Record<string, string> = {
  low: "低",
  medium: "中等",
  medium_high: "中高",
  high: "高",
};

export function packText(values: readonly string[]) {
  return values.map((value) => GUIDANCE_VALUE_LABELS[value] ?? value).join("；");
}

export function unpackText(value: string) {
  return value.split("；").map((item) => item.trim()).filter(Boolean);
}

type GuidanceGroup = {
  title: string;
  rows: GuidanceRow[];
};

type GuidanceRow = {
  label: string;
  values: readonly string[];
  sourcePath: FactorGuidanceFieldPath;
};

function guidanceRow(
  label: string,
  values: readonly string[],
  sourcePath: FactorGuidanceFieldPath,
): GuidanceRow {
  return { label, values, sourcePath };
}

export function guidanceGroups(guidance: FactorGuidance): GuidanceGroup[] {
  return [
    {
      title: "商品一级类目",
      rows: [
        guidanceRow("必见视觉要素", guidance.productCategory.requiredVisualElements, "factorGuidance.productCategory.requiredVisualElements"),
        guidanceRow("品类证明义务", guidance.productCategory.proofObligation, "factorGuidance.productCategory.proofObligation"),
        guidanceRow("合理使用场景", guidance.productCategory.validUsageScenes, "factorGuidance.productCategory.validUsageScenes"),
        guidanceRow("品类审美基线", guidance.productCategory.aestheticBaseline, "factorGuidance.productCategory.aestheticBaseline"),
        guidanceRow("真实性与合规边界", guidance.productCategory.authenticityComplianceBoundary, "factorGuidance.productCategory.authenticityComplianceBoundary"),
        guidanceRow("品类风险规避", guidance.productCategory.categoryRiskAvoidance, "factorGuidance.productCategory.categoryRiskAvoidance"),
      ],
    },
    {
      title: "商品成交类型",
      rows: [
        guidanceRow("购买任务", guidance.dealType.purchaseTask, "factorGuidance.dealType.purchaseTask"),
        guidanceRow("决策信息维度", guidance.dealType.decisionInfoDimensions, "factorGuidance.dealType.decisionInfoDimensions"),
        guidanceRow("证据类型", guidance.dealType.proofTypes, "factorGuidance.dealType.proofTypes"),
        guidanceRow("转化阻力", guidance.dealType.conversionFriction, "factorGuidance.dealType.conversionFriction"),
        guidanceRow("优惠与承诺策略", guidance.dealType.offerCommitmentStrategy, "factorGuidance.dealType.offerCommitmentStrategy"),
        guidanceRow("漏斗节奏", guidance.dealType.funnelPacing, "factorGuidance.dealType.funnelPacing"),
      ],
    },
    {
      title: "适用人群",
      rows: [
        guidanceRow("沟通对象身份", guidance.audience.addresseeRole, "factorGuidance.audience.addresseeRole"),
        guidanceRow("语言风格", guidance.audience.languageStyle, "factorGuidance.audience.languageStyle"),
        guidanceRow("利益排序", guidance.audience.benefitPriority, "factorGuidance.audience.benefitPriority"),
        guidanceRow("人物与视角适配", guidance.audience.representationAndPov, "factorGuidance.audience.representationAndPov"),
        guidanceRow("可读性与节奏适配", guidance.audience.readabilityPacing, "factorGuidance.audience.readabilityPacing"),
        guidanceRow("敏感表达边界", guidance.audience.sensitiveExpressionBoundary, "factorGuidance.audience.sensitiveExpressionBoundary"),
      ],
    },
    {
      title: "推销手法",
      rows: [
        guidanceRow("开场钩子机制", guidance.strategy.hookMechanism, "factorGuidance.strategy.hookMechanism"),
        guidanceRow("叙事结构", guidance.strategy.narrativeStructure, "factorGuidance.strategy.narrativeStructure"),
        guidanceRow("证据组织方式", guidance.strategy.evidenceOrganization, "factorGuidance.strategy.evidenceOrganization"),
      ],
    },
  ];
}

export function FactorSelect<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue | "";
  options: Array<{ value: TValue; label: string }>;
  onChange: (value: TValue) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label;
  return (
    <FormControl className="creative-factor-select-card" size="small" variant="outlined">
      <Select<string>
        aria-label={label}
        displayEmpty
        value={value}
        onChange={(event: SelectChangeEvent<string>) => {
          if (event.target.value) onChange(event.target.value as TValue);
        }}
        renderValue={() => (
          <span className={value ? undefined : "creative-factor-select-card__placeholder"}>
            {selectedLabel ?? label}
          </span>
        )}
      >
        <MenuItem value="">
          <em>请选择</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
