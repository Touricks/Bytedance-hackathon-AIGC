import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";

export const SHOTPROMPT_PROMPT_VERSION = "video-shotprompt.v1";

export interface BuildShotPromptPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

export interface BuildShotPromptPromptViewInput extends BuildShotPromptPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

function voiceoverPreview(input: StoryboardArtifact) {
  return input.shots
    .map((shot) => `${shot.index + 1}. ${shot.voiceover}`)
    .join("\n");
}

export function buildShotPromptPromptView(
  input: BuildShotPromptPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "Video shotprompt prompt",
      sections: [
        {
          id: "role",
          label: "Role",
          body: "You are a Seedance video shotprompt builder. Turn the approved storyboard into editable provider-ready video generation prompts.",
        },
        {
          id: "approved_storyboard",
          label: "Approved storyboard",
          body: input.storyboard.narrative,
        },
        {
          id: "voiceover_source",
          label: "Voiceover source",
          body:
            voiceoverPreview(input.storyboard) ||
            "No storyboard voiceover is available.",
        },
        {
          id: "task",
          label: "Task",
          body: "Create Seedance-focused prompts that preserve the product, timing, reference assets, and voiceover. V1 does not generate subtitles.",
        },
        {
          id: "output_contract",
          label: "Output contract",
          body: "Return strict JSON with targetProvider, durationSec, aspectRatio, prompt, negativePrompt, shots, tts, and assumptions. ShotPrompt shots only include provider prompts, reference assets, and voiceover.",
        },
      ],
    },
    variables: {
      aspectRatio: input.aspectRatio,
      storyboardShotCount: input.storyboard.shots.length,
      voiceoverSource: "shots.voiceover",
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildShotPromptPrompt(input: BuildShotPromptPromptInput) {
  return [
    "Role:",
    "You are a video shotprompt builder for Seedance image-to-video generation. You turn an approved UGC storyboard into one editable provider-ready shotprompt artifact.",
    "",
    "Inputs:",
    `Aspect ratio: ${input.aspectRatio}`,
    "Approved product brief:",
    JSON.stringify(input.brief),
    "Approved material manifest:",
    JSON.stringify(input.material.assets),
    "Approved storyboard:",
    JSON.stringify(input.storyboard),
    "",
    "Task:",
    "Create a Seedance-focused shotprompt artifact that preserves the referenced product exactly.",
    "Use referenceAssetRefs only from the approved material manifest.",
    "Keep the storyboard's timing and voiceover aligned.",
    "V1 does not generate subtitles. Do not use readable text as a video-generation requirement.",
    "Enable tts and derive the full voiceover string from shots[].voiceover. Treat tts as a rendering plan/result, not a second editable script.",
    "Do not change the upstream product claim or audience.",
    "",
    "Output:",
    "Return strict JSON matching this shape and do not include markdown:",
    JSON.stringify({
      targetProvider: "seedance",
      durationSec: 12,
      aspectRatio: input.aspectRatio,
      prompt: "string",
      negativePrompt: "string",
      shots: [
        {
          index: 0,
          startSec: 0,
          endSec: 3,
          providerPrompt: "string",
          referenceAssetRefs: ["product.png"],
          voiceover: "string",
        },
      ],
      tts: {
        enabled: true,
        source: "shots.voiceover",
        voiceover: "string",
      },
      assumptions: ["string"],
    }),
  ].join("\n");
}
