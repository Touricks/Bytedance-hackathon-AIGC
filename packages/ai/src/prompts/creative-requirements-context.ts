import {
  creativeFactorRequirementsDataSchema,
  FACTOR_GUIDANCE_FIELD_AFFECTS,
  type CompiledRequirementSourceMap,
  type FactorGuidanceFieldPath,
} from "@aigc-video/shared";

export type CreativeRequirementsTarget =
  | "material-intake"
  | "product-brief"
  | "storyboard"
  | "shotprompt";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requirementSection(
  data: unknown,
  section: "image" | "script" | "storyboard" | "shotImage" | "shotVideo",
) {
  if (!isRecord(data)) return {};
  const value = data[section];
  return isRecord(value) ? value : {};
}

function formatRequirementValue(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatRequirementValue(item))
      .filter((item) => item && item !== "未填写");
    return items.length > 0 ? items.join("；") : "未填写";
  }
  if (typeof value === "string") {
    return value.trim() || "未填写";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value)) {
    return JSON.stringify(value);
  }
  return "未填写";
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function list(values: readonly string[]) {
  const items = dedupe(values);
  return items.length > 0 ? items.join("；") : "未填写";
}

type ParsedCreativeRequirements = ReturnType<
  typeof creativeFactorRequirementsDataSchema.parse
>;

/**
 * One labeled fragment of approved module-1 guidance to render. Either a real
 * factorGuidance sub-field (`path`, label resolved from the shared provenance
 * map so it matches the UI chips) or a synthetic, pre-labeled bundle
 * (`labelOverride`, e.g. the compiled `image.avoid` list whose entries are
 * already self-prefixed).
 */
type GuidanceSelection = {
  path?: FactorGuidanceFieldPath;
  values: readonly string[];
  labelOverride?: string;
};

function splitLabel(label: string): [string, string] {
  const index = label.indexOf(":");
  if (index === -1) return [label, label];
  return [label.slice(0, index), label.slice(index + 1)];
}

function subfieldLabel(label: string): string {
  return splitLabel(label)[1];
}

/**
 * Render selected guidance grouped by source dimension, de-duplicated, and
 * labeled. Each sub-field is emitted once under its `【dimension】` header; the
 * same value never repeats across output channels (the channel routing is
 * carried separately by {@link renderChannelMapping}).
 */
function renderGroupedGuidance(selections: readonly GuidanceSelection[]): string {
  const groups = new Map<string, string[]>();
  const pushBullet = (dimension: string, bullet: string) => {
    const existing = groups.get(dimension);
    if (existing) existing.push(bullet);
    else groups.set(dimension, [bullet]);
  };

  for (const selection of selections) {
    const values = dedupe(selection.values);
    if (values.length === 0) continue;

    if (selection.labelOverride) {
      for (const value of values) {
        pushBullet(selection.labelOverride, `  · ${value}`);
      }
      continue;
    }

    const label = selection.path
      ? FACTOR_GUIDANCE_FIELD_AFFECTS[selection.path]?.label ?? ""
      : "";
    const [dimension, subfield] = splitLabel(label);
    pushBullet(dimension, `  · ${subfield}：${values.join("；")}`);
  }

  return Array.from(groups.entries())
    .map(([dimension, bullets]) => `【${dimension}】\n${bullets.join("\n")}`)
    .join("\n");
}

function resolveGuidanceValues(
  data: ParsedCreativeRequirements,
  path: FactorGuidanceFieldPath,
): readonly string[] {
  const segments = path.split(".");
  const factor = segments[1] as keyof ParsedCreativeRequirements["factorGuidance"];
  const key = segments[2] ?? "";
  const pack = data.factorGuidance[factor] as
    | Record<string, readonly string[]>
    | undefined;
  const values = pack?.[key];
  return Array.isArray(values) ? values : [];
}

function selectPaths(
  data: ParsedCreativeRequirements,
  paths: readonly FactorGuidanceFieldPath[],
): GuidanceSelection[] {
  return paths.map((path) => ({ path, values: resolveGuidanceValues(data, path) }));
}

const CHANNEL_NAMES: Record<keyof CompiledRequirementSourceMap, string> = {
  imageStyle: "图像风格",
  imageComposition: "图像构图",
  imageAvoid: "图像避免项",
  scriptTone: "剧本语气",
  storyboardRhythm: "分镜节奏",
  shotImageGlobal: "分镜图全局",
  shotVideoGlobal: "分镜视频全局",
};

const CHANNEL_ORDER = Object.keys(CHANNEL_NAMES) as (keyof CompiledRequirementSourceMap)[];

/**
 * Compact provenance line mapping each output channel to the source sub-fields
 * that compile into it. Replaces the per-channel value duplication that the
 * grouped block removes, so the model can still route guidance per channel.
 */
function renderChannelMapping(
  sourceMap: CompiledRequirementSourceMap,
  channelKeys: readonly (keyof CompiledRequirementSourceMap)[],
): string {
  const parts = channelKeys
    .map((key) => {
      const subs = dedupe((sourceMap[key] ?? []).map((entry) => subfieldLabel(entry.label)));
      return subs.length > 0 ? `${CHANNEL_NAMES[key]}←${subs.join("+")}` : null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `通道映射：${parts.join("；")}` : "";
}

function formatLegacyShotPromptRequirements(data: unknown) {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return [
    "已批准创作要求（导演约束）：",
    "以下内容来自 current approved prompt_requirements_artifacts.data。生成分镜生成要求时优先遵守，并按 providerPrompt / shotImage / shotVideo / tts.voiceProfile 各自职责吸收。",
    `- 图像风格：${formatRequirementValue(image.style)}`,
    `- 图像构图：${formatRequirementValue(image.composition)}`,
    `- 图像避免项：${formatRequirementValue(image.avoid)}`,
    `- 剧本语气：${formatRequirementValue(script.tone)}`,
    `- 分镜节奏：${formatRequirementValue(storyboard.rhythm)}`,
    `- 分镜图全局要求：${formatRequirementValue(shotImage.global)}`,
    `- 分镜视频全局要求：${formatRequirementValue(shotVideo.global)}`,
  ].join("\n");
}

function formatMaterialIntakeView(data: ParsedCreativeRequirements) {
  const grouped = renderGroupedGuidance([
    ...selectPaths(data, [
      "factorGuidance.productCategory.requiredVisualElements",
      "factorGuidance.productCategory.validUsageScenes",
    ]),
    { labelOverride: "素材纳入避免项", values: data.image.avoid },
  ]);
  return [
    "已批准全局创作要求（素材解读视图）：",
    "只用于判断素材角色、相关性、主素材选择和纳入边界。不要生成商品卖点、剧本、分镜或视频提示词。",
    grouped,
  ].join("\n");
}

function formatProductBriefView(data: ParsedCreativeRequirements) {
  const grouped = renderGroupedGuidance(
    selectPaths(data, [
      "factorGuidance.dealType.purchaseTask",
      "factorGuidance.dealType.decisionInfoDimensions",
      "factorGuidance.productCategory.proofObligation",
      "factorGuidance.audience.benefitPriority",
      "factorGuidance.productCategory.authenticityComplianceBoundary",
      "factorGuidance.audience.sensitiveExpressionBoundary",
    ]),
  );
  return [
    "已批准全局创作要求（商品卖点视图）：",
    "用于定义商品、目标人群、核心卖点、证明对象和禁用表达。不要生成开场钩子、分镜或最终视频提示词。",
    grouped,
  ].join("\n");
}

function formatStoryboardView(data: ParsedCreativeRequirements) {
  const grouped = renderGroupedGuidance(
    selectPaths(data, [
      "factorGuidance.strategy.hookMechanism",
      "factorGuidance.strategy.narrativeStructure",
      "factorGuidance.strategy.evidenceOrganization",
    ]),
  );
  return [
    "已批准全局创作要求（分镜生成视图）：",
    "用于约束口播开场、分镜结构、证据顺序和 CTA 风格。不得改写已确认商品事实或新增素材中没有的证据。",
    `- 推销手法：${data.creativeFactors.strategy}`,
    grouped,
    `- 分镜节奏：${list(data.storyboard.rhythm)}`,
  ].join("\n");
}

function formatShotPromptView(data: ParsedCreativeRequirements) {
  const sourceMap = data.compiledRequirementSourceMap;
  const seen = new Set<string>();
  const selections: GuidanceSelection[] = [];
  for (const key of CHANNEL_ORDER) {
    for (const entry of sourceMap[key] ?? []) {
      if (seen.has(entry.sourcePath)) continue;
      seen.add(entry.sourcePath);
      selections.push({
        path: entry.sourcePath,
        values: resolveGuidanceValues(data, entry.sourcePath),
      });
    }
  }
  return [
    "已批准创作要求（导演约束）：",
    "以下内容来自 current approved prompt_requirements_artifacts.data。生成分镜生成要求时优先遵守，并按 providerPrompt / shotImage / shotVideo / tts.voiceProfile 各自职责吸收。",
    renderGroupedGuidance(selections),
    renderChannelMapping(sourceMap, CHANNEL_ORDER),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatCreativeRequirementsForModule(
  data: unknown,
  target: CreativeRequirementsTarget,
): string | null {
  if (data === undefined || data === null) return null;
  const parsed = creativeFactorRequirementsDataSchema.safeParse(data);

  if (!parsed.success) {
    return target === "shotprompt"
      ? formatLegacyShotPromptRequirements(data)
      : null;
  }

  switch (target) {
    case "material-intake":
      return formatMaterialIntakeView(parsed.data);
    case "product-brief":
      return formatProductBriefView(parsed.data);
    case "storyboard":
      return formatStoryboardView(parsed.data);
    case "shotprompt":
      return formatShotPromptView(parsed.data);
  }
}
