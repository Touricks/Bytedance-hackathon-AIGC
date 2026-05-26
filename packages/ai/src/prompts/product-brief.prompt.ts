import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const PRODUCT_BRIEF_PROMPT_VERSION = "product-brief.v1";

export interface BuildProductBriefPromptInput {
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
  material: MaterialIntakeArtifact;
}

export interface BuildProductBriefPromptViewInput extends BuildProductBriefPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function summarizeMaterial(input: MaterialIntakeArtifact) {
  return input.assets
    .filter((asset) => asset.included)
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}, ${asset.role}, ${asset.relevance}): ${asset.description}`,
    )
    .join("\n");
}

function legacySeed(input: BuildProductBriefPromptInput) {
  const lines = [
    input.title ? `Product title: ${input.title}` : "",
    input.sellingPoints ? `Selling points: ${input.sellingPoints}` : "",
    input.audience ? `Target audience: ${input.audience}` : "",
    input.stylePreference ? `Style preference: ${input.stylePreference}` : "",
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "No prefilled form fields provided.";
}

export function buildProductBriefPromptView(
  input: BuildProductBriefPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "Product brief prompt",
      sections: [
        {
          id: "role",
          label: "Role",
          body: "You are an ecommerce product brief builder. Create a merchant-editable product brief, not hooks, storyboards, or final video prompts.",
        },
        {
          id: "user_direction",
          label: "User direction",
          body:
            input.userDirection?.trim() ||
            "No optional product direction provided.",
        },
        {
          id: "legacy_seed",
          label: "Optional prefilled fields",
          body: legacySeed(input),
        },
        {
          id: "approved_material",
          label: "Approved material",
          body:
            summarizeMaterial(input.material) ||
            "No included material assets are available.",
        },
        {
          id: "task",
          label: "Task",
          body: "Infer one concise product brief from the approved material. Pick exactly one core selling point and keep unsupported claims in assumptions.",
        },
        {
          id: "output_contract",
          label: "Output contract",
          body: "Return strict JSON with product, audience, coreSellingPoint, proof, offer, platform, brandTone, bannedExpressions, landingInfo, and assumptions.",
        },
      ],
    },
    variables: {
      userDirection: input.userDirection ?? null,
      primaryProductRef: input.material.primaryProductRef,
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
      legacySeed: {
        title: input.title ?? null,
        sellingPoints: input.sellingPoints ?? null,
        audience: input.audience ?? null,
        stylePreference: input.stylePreference ?? null,
      },
    },
  };
}

export function buildProductBriefPrompt(input: BuildProductBriefPromptInput) {
  return [
    "Role:",
    "You are an ecommerce product brief builder. You create a merchant-editable product brief, not a hook, storyboard, or final video prompt.",
    "",
    "Inputs:",
    `User direction: ${input.userDirection ?? "unspecified"}`,
    legacySeed(input),
    `Primary product asset ref: ${input.material.primaryProductRef}`,
    "Usable material manifest:",
    JSON.stringify(input.material.assets),
    "",
    "Task:",
    "Create one concise product brief for a short ecommerce video.",
    "Pick exactly one coreSellingPoint.",
    "Use product.assets refs only from the material manifest.",
    "Do not write hooks, storyboard beats, voiceover, CTA copy, or image-to-video prompts.",
    "If a fact is not directly supported by the inputs, mark it in assumptions.",
    "",
    "Output:",
    "Return strict JSON matching this shape and do not include markdown:",
    JSON.stringify({
      product: {
        name: "string",
        category: "string",
        keyFacts: ["string"],
        assets: [{ ref: "product.png", useAs: "primary | support" }],
      },
      audience: {
        who: "string",
        painOrDesire: "string",
      },
      coreSellingPoint: "single string",
      proof: ["string"],
      offer: null,
      platform: "Seedance",
      brandTone: "string",
      bannedExpressions: ["string"],
      landingInfo: null,
      assumptions: ["string"],
    }),
  ].join("\n");
}

export function buildProductBriefRepairPrompt(rawOutput: string) {
  return [
    "Repair the following model output into strict JSON matching the product brief schema.",
    "Keep exactly one coreSellingPoint string.",
    "Do not add hooks, storyboard beats, voiceover, CTA copy, or image-to-video prompts.",
    "Do not include markdown.",
    "",
    rawOutput,
  ].join("\n");
}
