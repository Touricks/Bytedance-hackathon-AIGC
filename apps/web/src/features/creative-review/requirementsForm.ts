import {
  DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
  DEFAULT_CREATIVE_FACTORS,
  applyCreativeFactorsToPromptRequirements,
  buildCreativeFactorRequirements,
  compileCreativeRequirementFields,
  creativeFactorRequirementsDataSchema,
  type CompiledRequirementSourceMap,
  type CreativeFactors,
  type CreativeRequirementTemplate,
  type CreativeRequirementTemplateSource,
  type FactorGuidance,
  type FactorGuidanceFieldPath,
  type ScriptInfluence,
} from "@aigc-video/shared";
import type { PromptRequirementsData } from "../../lib/api/client.js";

function stringifyRequirementValue(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join("，");
  return typeof value === "string" && value.trim() ? value : fallback;
}

function requirementSection(
  data: PromptRequirementsData | null,
  section: "image" | "script" | "storyboard" | "shotImage" | "shotVideo",
) {
  const value = data?.[section];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type FactorState = {
  creativeFactors: CreativeFactors;
  factorGuidance: FactorGuidance;
  scriptInfluence: ScriptInfluence;
  compiledRequirementSourceMap: CompiledRequirementSourceMap;
  creativeRequirementTemplate?: CreativeRequirementTemplateSource;
};

function factorStateFromArtifact(data: PromptRequirementsData | null): FactorState {
  const parsed = creativeFactorRequirementsDataSchema.safeParse(data);
  if (parsed.success) {
    const compiled = compileCreativeRequirementFields({
      factorGuidance: parsed.data.factorGuidance,
      scriptInfluence: parsed.data.scriptInfluence,
    });
    return {
      creativeFactors: parsed.data.creativeFactors,
      factorGuidance: parsed.data.factorGuidance,
      scriptInfluence: parsed.data.scriptInfluence,
      compiledRequirementSourceMap:
        parsed.data.compiledRequirementSourceMap ?? compiled.compiledRequirementSourceMap,
      creativeRequirementTemplate: parsed.data.creativeRequirementTemplate,
    };
  }
  const defaults = buildCreativeFactorRequirements(DEFAULT_CREATIVE_FACTORS);
  return {
    creativeFactors: defaults.creativeFactors,
    factorGuidance: defaults.factorGuidance,
    scriptInfluence: defaults.scriptInfluence,
    compiledRequirementSourceMap:
      defaults.compiledRequirementSourceMap ?? DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
  };
}

export type RequirementsFormState = {
  creativeFactors: CreativeFactors;
  factorGuidance: FactorGuidance;
  scriptInfluence: ScriptInfluence;
  compiledRequirementSourceMap: CompiledRequirementSourceMap;
  creativeRequirementTemplate?: CreativeRequirementTemplateSource;
  imageStyle: string;
  imageComposition: string;
  imageAvoid: string;
  scriptTone: string;
  storyboardRhythm: string;
  shotImageGlobal: string;
  shotVideoGlobal: string;
};

export function syncCompiledRequirementFields(
  state: Pick<
    RequirementsFormState,
    "creativeFactors" | "factorGuidance" | "scriptInfluence" | "creativeRequirementTemplate"
  >,
): RequirementsFormState {
  const compiled = compileCreativeRequirementFields({
    factorGuidance: state.factorGuidance,
    scriptInfluence: state.scriptInfluence,
  });
  return {
    ...state,
    imageStyle: stringifyRequirementValue(compiled.image.style, ""),
    imageComposition: stringifyRequirementValue(compiled.image.composition, ""),
    imageAvoid: stringifyRequirementValue(compiled.image.avoid, ""),
    scriptTone: stringifyRequirementValue(compiled.script.tone, ""),
    storyboardRhythm: stringifyRequirementValue(compiled.storyboard.rhythm, ""),
    shotImageGlobal: stringifyRequirementValue(compiled.shotImage.global, ""),
    shotVideoGlobal: stringifyRequirementValue(compiled.shotVideo.global, ""),
    compiledRequirementSourceMap: compiled.compiledRequirementSourceMap,
  };
}

export function requirementFormWithCreativeFactors(
  creativeFactors: CreativeFactors,
  options: { creativeRequirementTemplate?: CreativeRequirementTemplateSource } = {},
): RequirementsFormState {
  const data = buildCreativeFactorRequirements(creativeFactors);
  const form = requirementFormFromArtifact(data);
  return {
    ...form,
    creativeRequirementTemplate: options.creativeRequirementTemplate,
  };
}

export function applyCreativeRequirementTemplate(
  template: CreativeRequirementTemplate,
): RequirementsFormState {
  const data = buildCreativeFactorRequirements(template.creativeFactors);
  return syncCompiledRequirementFields({
    creativeFactors: data.creativeFactors,
    factorGuidance: factorGuidanceFromTemplateFields(template, data.factorGuidance),
    scriptInfluence: data.scriptInfluence,
    creativeRequirementTemplate: {
      source: "setup-template",
      templateId: template.id,
      templateNameSnapshot: template.name,
      templateVersion: template.version,
      status: "applied",
    },
  });
}

export function requirementFormFromArtifact(
  data: PromptRequirementsData | null,
): RequirementsFormState {
  const factorState = factorStateFromArtifact(data);
  const compiled = compileCreativeRequirementFields(factorState);
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return {
    ...factorState,
    imageStyle: stringifyRequirementValue(
      image.style,
      stringifyRequirementValue(compiled.image.style, ""),
    ),
    imageComposition: stringifyRequirementValue(
      image.composition,
      stringifyRequirementValue(compiled.image.composition, ""),
    ),
    imageAvoid: stringifyRequirementValue(
      image.avoid,
      stringifyRequirementValue(compiled.image.avoid, ""),
    ),
    scriptTone: stringifyRequirementValue(
      script.tone,
      stringifyRequirementValue(compiled.script.tone, ""),
    ),
    storyboardRhythm: stringifyRequirementValue(
      storyboard.rhythm,
      stringifyRequirementValue(compiled.storyboard.rhythm, ""),
    ),
    shotImageGlobal: stringifyRequirementValue(
      shotImage.global,
      stringifyRequirementValue(compiled.shotImage.global, ""),
    ),
    shotVideoGlobal: stringifyRequirementValue(
      shotVideo.global,
      stringifyRequirementValue(compiled.shotVideo.global, ""),
    ),
    compiledRequirementSourceMap: factorState.compiledRequirementSourceMap,
  };
}

export function requirementFormFromImportedDraft(
  data: PromptRequirementsData,
  fallback: RequirementsFormState,
): RequirementsFormState {
  const hasStructuredFactors = creativeFactorRequirementsDataSchema.safeParse(data)
    .success;
  return requirementFormFromArtifact(
    hasStructuredFactors
      ? data
      : applyCreativeFactorsToPromptRequirements(data, fallback.creativeFactors),
  );
}

export function promptRequirementsDataFromForm(
  state: RequirementsFormState,
): PromptRequirementsData {
  const data: PromptRequirementsData = {
    image: {
      style: state.imageStyle,
      composition: state.imageComposition,
      avoid: state.imageAvoid
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    },
    script: { tone: state.scriptTone },
    storyboard: { rhythm: state.storyboardRhythm },
    shotImage: { global: state.shotImageGlobal },
    shotVideo: { global: state.shotVideoGlobal },
    creativeFactors: state.creativeFactors,
    factorGuidance: state.factorGuidance,
    scriptInfluence: state.scriptInfluence,
    compiledRequirementSourceMap: state.compiledRequirementSourceMap,
  };
  if (state.creativeRequirementTemplate) {
    data.creativeRequirementTemplate = state.creativeRequirementTemplate;
  }
  return data;
}

function factorGuidanceFromTemplateFields(
  template: CreativeRequirementTemplate,
  fallback: FactorGuidance,
): FactorGuidance {
  const next: FactorGuidance = {
    productType: { ...fallback.productType },
    audience: { ...fallback.audience },
    strategy: { ...fallback.strategy },
  };
  for (const [path, field] of Object.entries(template.fields)) {
    setFactorGuidanceValue(next, path as FactorGuidanceFieldPath, field.value);
  }
  return next;
}

function setFactorGuidanceValue(
  factorGuidance: FactorGuidance,
  path: FactorGuidanceFieldPath,
  value: string,
) {
  const [, group, field] = path.split(".") as [
    "factorGuidance",
    keyof FactorGuidance,
    string,
  ];
  (factorGuidance[group] as Record<string, string>)[field] = value;
}
