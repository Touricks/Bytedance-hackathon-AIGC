import {
  DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
  buildCreativeFactorRequirements,
  compileCreativeRequirementFields,
  creativeFactorRequirementsDataSchema,
  type CompiledRequirementSourceMap,
  type CreativeFactors,
  type FactorGuidance,
  type FactorGuidanceFieldPath
} from "@aigc-video/shared";
import type { PromptRequirementsData } from "../../lib/api/client.js";

export type DraftCreativeFactors = {
  [K in keyof CreativeFactors]: CreativeFactors[K] | "";
};

function stringifyRequirementValue(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join("；");
  return typeof value === "string" && value.trim() ? value : fallback;
}

const EMPTY_CREATIVE_FACTORS: DraftCreativeFactors = {
  productCategory: "",
  dealType: "",
  audience: "",
  strategy: ""
};

const EMPTY_FACTOR_GUIDANCE: FactorGuidance = {
  productCategory: {
    requiredVisualElements: [],
    proofObligation: [],
    validUsageScenes: [],
    aestheticBaseline: [],
    authenticityComplianceBoundary: [],
    categoryRiskAvoidance: []
  },
  dealType: {
    purchaseTask: [],
    decisionInfoDimensions: [],
    proofTypes: [],
    conversionFriction: [],
    offerCommitmentStrategy: [],
    funnelPacing: []
  },
  audience: {
    addresseeRole: [],
    languageStyle: [],
    benefitPriority: [],
    representationAndPov: [],
    readabilityPacing: [],
    sensitiveExpressionBoundary: []
  },
  strategy: {
    hookMechanism: [],
    narrativeStructure: [],
    evidenceOrganization: [],
    shotEditingGrammar: []
  }
};

type FactorState = {
  creativeFactors: CreativeFactors;
  factorGuidance: FactorGuidance;
  compiledRequirementSourceMap: CompiledRequirementSourceMap;
  factorPromptVersion: string;
  factorComboKey: string;
  compiledRequirementsHash: string;
};

export function areCreativeFactorsComplete(
  factors: DraftCreativeFactors
): factors is CreativeFactors {
  return Boolean(
    factors.productCategory && factors.dealType && factors.audience && factors.strategy
  );
}

function factorStateFromArtifact(data: PromptRequirementsData | null): FactorState | null {
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
  return null;
}

export type RequirementsFormState = {
  creativeFactors: DraftCreativeFactors;
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

function emptyRequirementFormState(): RequirementsFormState {
  return {
    creativeFactors: { ...EMPTY_CREATIVE_FACTORS },
    factorGuidance: EMPTY_FACTOR_GUIDANCE,
    compiledRequirementSourceMap: DEFAULT_COMPILED_REQUIREMENT_SOURCE_MAP,
    factorPromptVersion: "",
    factorComboKey: "",
    compiledRequirementsHash: "",
    imageStyle: "",
    imageComposition: "",
    imageAvoid: "",
    scriptTone: "",
    storyboardRhythm: "",
    shotImageGlobal: "",
    shotVideoGlobal: ""
  };
}

export function syncCompiledRequirementFields(
  state: { creativeFactors: CreativeFactors; factorGuidance: FactorGuidance }
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
  if (!factorState) return emptyRequirementFormState();
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
  if (!areCreativeFactorsComplete(state.creativeFactors)) {
    return {
      ...state,
      factorGuidance
    };
  }
  return syncCompiledRequirementFields({
    creativeFactors: state.creativeFactors,
    factorGuidance
  });
}

export function promptRequirementsDataFromForm(
  state: RequirementsFormState
): PromptRequirementsData {
  if (!areCreativeFactorsComplete(state.creativeFactors)) {
    throw new Error("CREATIVE_FACTORS_REQUIRED");
  }
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
