import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const STORYBOARD_PROMPT_VERSION = "ugc-storyboard.v1";

export interface BuildStoryboardPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
}

export interface BuildStoryboardPromptViewInput extends BuildStoryboardPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function storyboardMaterialSummary(input: MaterialIntakeArtifact) {
  return input.assets
    .filter((asset) => asset.included)
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}, ${asset.role}): ${asset.description}`,
    )
    .join("\n");
}

export function buildStoryboardPromptView(
  input: BuildStoryboardPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "UGC storyboard prompt",
      sections: [
        {
          id: "role",
          label: "Role",
          body: "You are a UGC storyboard builder. Turn one approved product brief into one editable short-form UGC storyboard.",
        },
        {
          id: "approved_brief",
          label: "Approved product brief",
          body: `${input.brief.product.name}: ${input.brief.coreSellingPoint}. Audience: ${input.brief.audience.who}. Tone: ${input.brief.brandTone}.`,
        },
        {
          id: "approved_material",
          label: "Approved material",
          body:
            storyboardMaterialSummary(input.material) ||
            "No included material assets are available.",
        },
        {
          id: "task",
          label: "Task",
          body: "Create one 12-second ecommerce UGC storyboard. Preserve the single core selling point. Each shot purpose must be exactly one of hook, benefit, proof, or cta, and each productAssetRef must be a non-empty ref from the approved material manifest.",
        },
        {
          id: "output_contract",
          label: "Output contract",
          body: "Return strict JSON with narrative, totalDurationSec, shots, and assumptions. Each shot includes purpose, durationSec, scene, visualDirection, productAssetRef, voiceover, and transition. Do not request readable text inside the generated video.",
        },
      ],
    },
    variables: {
      productName: input.brief.product.name,
      coreSellingPoint: input.brief.coreSellingPoint,
      audience: input.brief.audience.who,
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildStoryboardPrompt(input: BuildStoryboardPromptInput) {
  return [
    "Role:",
    "You are a UGC storyboard builder. You turn one approved product brief into one editable short-form UGC storyboard.",
    "",
    "Inputs:",
    "Approved product brief:",
    JSON.stringify(input.brief),
    "Approved material manifest:",
    JSON.stringify(input.material.assets),
    "",
    "Task:",
    "Create exactly one storyboard for a short ecommerce UGC video.",
    "Stay loyal to the brief's single coreSellingPoint. Do not introduce a new product claim.",
    "Each shots[].purpose must be exactly one of: hook, benefit, proof, cta. Do not use natural-language purpose labels.",
    "Each shots[].productAssetRef must be a non-empty ref from the approved material manifest.",
    "Use productAssetRef values only from the approved material manifest.",
    "If there is only one included material ref, use that ref for every shot.",
    "Write natural creator voiceover for each shot.",
    "Do not require readable text inside the generated video.",
    "Do not write Seedance image-to-video prompts or final provider prompt strings.",
    "",
    "Output:",
    "Return strict JSON matching this shape and do not include markdown:",
    JSON.stringify({
      narrative: "string",
      totalDurationSec: 12,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 3,
          scene: "string",
          visualDirection: "string",
          productAssetRef: "product.png",
          voiceover: "string",
          transition: "cut",
        },
      ],
      assumptions: ["string"],
    }),
  ].join("\n");
}
