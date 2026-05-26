import type { MaterialIntakeArtifact } from "@aigc-video/shared";

export const MATERIAL_INTAKE_PROMPT_VERSION = "material-intake.v1";

export interface BuildMaterialIntakePromptInput {
  initialPrompt?: string;
  scanned: MaterialIntakeArtifact;
  textPreviews?: Array<{ ref: string; text: string }>;
}

export interface RuntimePromptView {
  contractId: string;
  promptVersion: string;
  provider: "ark" | "seedance" | "deterministic";
  model?: string;
  nl: {
    title: string;
    sections: Array<{
      id: string;
      label: string;
      body: string;
    }>;
  };
  variables: Record<string, unknown>;
}

export interface BuildMaterialIntakePromptViewInput
  extends BuildMaterialIntakePromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function materialManifestPreview(input: MaterialIntakeArtifact) {
  return input.assets
    .map(
      (asset) =>
        `${asset.ref} (${asset.kind}, ${asset.mime}, ${asset.bytes} bytes, default role: ${asset.role})`
    )
    .join("\n");
}

export function buildMaterialIntakePromptView(
  input: BuildMaterialIntakePromptViewInput
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "Material intake prompt",
      sections: [
        {
          id: "role",
          label: "Role",
          body:
            "You are a material intake tagging builder for workspace files used in ecommerce video generation."
        },
        {
          id: "user_intent",
          label: "User intent",
          body: input.initialPrompt?.trim() || "No initial user direction provided."
        },
        {
          id: "selected_material_manifest",
          label: "Selected material manifest",
          body: materialManifestPreview(input.scanned) || "No valid material selected."
        },
        {
          id: "task",
          label: "Task",
          body:
            "For each validated asset, choose a role, description, relevance, and whether it should be included. Prefer one valid product image as the primary product reference."
        },
        {
          id: "output_contract",
          label: "Output contract",
          body:
            "Return strict JSON with primaryProductRef and tags. Do not create product briefs, hooks, storyboards, or video prompts."
        }
      ]
    },
    variables: {
      initialPrompt: input.initialPrompt ?? null,
      materialRefs: input.scanned.assets.map((asset) => asset.ref),
      rejectedRefs: input.scanned.rejected.map((item) => item.ref),
      textPreviewRefs: input.textPreviews?.map((preview) => preview.ref) ?? []
    }
  };
}

export function buildMaterialIntakePrompt(input: BuildMaterialIntakePromptInput) {
  return [
    "Role:",
    "You are a material intake tagging builder. You label already-validated workspace files for ecommerce video generation.",
    "",
    "Inputs:",
    `User initial prompt: ${input.initialPrompt ?? "unspecified"}`,
    "Validated material manifest:",
    JSON.stringify(input.scanned.assets),
    "Rejected files, for awareness only. Do not include them in tags:",
    JSON.stringify(input.scanned.rejected),
    "Text previews:",
    JSON.stringify(input.textPreviews ?? []),
    "",
    "Task:",
    "For each validated asset, choose role, description, relevance, and included.",
    "Prefer one image as primaryProductRef when a valid product image exists.",
    "Never invent refs. Use refs exactly from the validated material manifest.",
    "Do not create product briefs, hooks, storyboards, or video prompts.",
    "",
    "Output:",
    "Return strict JSON matching this shape and do not include markdown:",
    JSON.stringify({
      primaryProductRef: "product.png",
      tags: [
        {
          ref: "product.png",
          role: "product_main",
          description: "short factual description",
          relevance: "high",
          included: true
        }
      ]
    })
  ].join("\n");
}
