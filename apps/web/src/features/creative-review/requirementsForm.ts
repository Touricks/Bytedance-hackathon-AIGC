import {
  DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
  DEFAULT_CREATIVE_FACTORS,
  buildCreativeFactorRequirements,
  compileCreativeRequirementFields,
  creativeFactorRequirementsDataSchema,
  type CompiledRequirementSourceMap,
  type CreativeFactors,
  type FactorGuidance,
  type FactorGuidanceFieldPath
} from "@aigc-video/shared";
import type { PromptRequirementsData } from "../../lib/api/client.js";

function stringifyRequirementValue(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join("；");
  return typeof value === "string" && value.trim() ? value : fallback;
}

type FactorState = {
  creativeFactors: CreativeFactors;
  factorGuidance: FactorGuidance;
  compiledRequirementSourceMap: CompiledRequirementSourceMap;
  factorPromptVersion: string;
  factorComboKey: string;
  compiledRequirementsHash: string;
};

function factorStateFromArtifact(data: PromptRequirementsData | null): FactorState {
  const parsed = creativeFactorRequirementsDataSchema.safeParse(data);
  if (parsed.success) {
    return {
      creativeFactors: parsed.data.creativeFactors,
      factorGuidance: parsed.data.factorGuidance,
      compiledRequirementSourceMap: parsed.data.compiledRequirementSourceMap,
      factorPromptVersion: parsed.data.factorPromptVersion,
      factorComboKey: parsed.data.factorComboKey,
      compiledRequirementsHash: parsed.data.compiledRequirementsHash
    };
  }
  const defaults = buildCreativeFactorRequirements(DEFAULT_CREATIVE_FACTORS);
  return {
    creativeFactors: defaults.creativeFactors,
    factorGuidance: defaults.factorGuidance,
    compiledRequirementSourceMap:
      defaults.compiledRequirementSourceMap ?? DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
    factorPromptVersion: defaults.factorPromptVersion,
    factorComboKey: defaults.factorComboKey,
    compiledRequirementsHash: defaults.compiledRequirementsHash
  };
}

export type RequirementsFormState = {
  creativeFactors: CreativeFactors;
  factorGuidance: FactorGuidance;
  compiledRequirementSourceMap: CompiledRequirementSourceMap;
  factorPromptVersion: string;
  factorComboKey: string;
  compiledRequirementsHash: string;
  imageStyle: string;
  imageComposition: string;
  imageAvoid: string;
  scriptTone: string;
  storyboardRhythm: string;
  shotImageGlobal: string;
  shotVideoGlobal: string;
};

export function syncCompiledRequirementFields(
  state: Pick<RequirementsFormState, "creativeFactors" | "factorGuidance">
): RequirementsFormState {
  const compiled = compileCreativeRequirementFields({
    creativeFactors: state.creativeFactors,
    factorGuidance: state.factorGuidance
  });
  return {
    creativeFactors: state.creativeFactors,
    factorGuidance: state.factorGuidance,
    imageStyle: stringifyRequirementValue(compiled.image.style, ""),
    imageComposition: stringifyRequirementValue(compiled.image.composition, ""),
    imageAvoid: stringifyRequirementValue(compiled.image.avoid, ""),
    scriptTone: stringifyRequirementValue(compiled.script.tone, ""),
    storyboardRhythm: stringifyRequirementValue(compiled.storyboard.rhythm, ""),
    shotImageGlobal: stringifyRequirementValue(compiled.shotImage.global, ""),
    shotVideoGlobal: stringifyRequirementValue(compiled.shotVideo.global, ""),
    compiledRequirementSourceMap: compiled.compiledRequirementSourceMap,
    factorPromptVersion: compiled.factorPromptVersion,
    factorComboKey: compiled.factorComboKey,
    compiledRequirementsHash: compiled.compiledRequirementsHash
  };
}

export function requirementFormWithCreativeFactors(
  creativeFactors: CreativeFactors
): RequirementsFormState {
  const defaults = buildCreativeFactorRequirements(creativeFactors);
  return syncCompiledRequirementFields({
    creativeFactors: defaults.creativeFactors,
    factorGuidance: defaults.factorGuidance
  });
}

export function requirementFormFromArtifact(
  data: PromptRequirementsData | null
): RequirementsFormState {
  const factorState = factorStateFromArtifact(data);
  return syncCompiledRequirementFields(factorState);
}

export function requirementFormWithGuidanceField(
  state: RequirementsFormState,
  sourcePath: FactorGuidanceFieldPath,
  values: string[]
): RequirementsFormState {
  const [, factor, field] = sourcePath.split(".");
  if (!factor || !field) {
    throw new Error(`Invalid factor guidance source path: ${sourcePath}`);
  }
  const factorKey = factor as
    | "productCategory"
    | "dealType"
    | "audience"
    | "strategy";
  const currentFactor = state.factorGuidance[factorKey] as Record<string, string[]>;
  const factorGuidance = {
    ...state.factorGuidance,
    [factorKey]: {
      ...currentFactor,
      [field]: values
    }
  } as FactorGuidance;
  return syncCompiledRequirementFields({
    creativeFactors: state.creativeFactors,
    factorGuidance
  });
}

export function promptRequirementsDataFromForm(
  state: RequirementsFormState
): PromptRequirementsData {
  const compiled = compileCreativeRequirementFields({
    creativeFactors: state.creativeFactors,
    factorGuidance: state.factorGuidance
  });
  const data = creativeFactorRequirementsDataSchema.parse({
    image: compiled.image,
    script: compiled.script,
    storyboard: compiled.storyboard,
    shotImage: compiled.shotImage,
    shotVideo: compiled.shotVideo,
    creativeFactors: state.creativeFactors,
    factorGuidance: state.factorGuidance,
    compiledRequirementSourceMap: compiled.compiledRequirementSourceMap,
    factorPromptVersion: compiled.factorPromptVersion,
    factorComboKey: compiled.factorComboKey,
    compiledRequirementsHash: compiled.compiledRequirementsHash,
    attributionEligible: true
  }) as PromptRequirementsData;
  return data;
}
