import { z } from "zod";

export const artifactStatusSchema = z.enum([
  "proposed",
  "approved",
  "stale",
  "failed",
]);

export const materialAssetSchema = z.object({
  ref: z.string().min(1),
  kind: z.enum(["image", "video", "text"]),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  role: z.enum([
    "product_main",
    "product_detail",
    "packaging",
    "logo",
    "demo_video",
    "spec_text",
    "reference",
    "other",
  ]),
  description: z.string().min(1),
  relevance: z.enum(["high", "medium", "low"]),
  usable: z.boolean(),
  included: z.boolean(),
});

export const rejectedMaterialAssetSchema = z.object({
  ref: z.string().min(1),
  reason: z.string().min(1),
});

export const materialIntakeArtifactSchema = z.object({
  scannedAt: z.string().min(1),
  primaryProductRef: z.string().min(1),
  assets: z.array(materialAssetSchema),
  rejected: z.array(rejectedMaterialAssetSchema),
});

export const productBriefArtifactSchema = z.object({
  product: z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    keyFacts: z.array(z.string().min(1)),
    assets: z.array(
      z.object({
        ref: z.string().min(1),
        useAs: z.enum(["primary", "support"]),
      }),
    ),
  }),
  audience: z.object({
    who: z.string().min(1),
    painOrDesire: z.string().min(1),
  }),
  coreSellingPoint: z.string().min(1),
  proof: z.array(z.string().min(1)),
  offer: z.string().nullable(),
  platform: z.string().min(1),
  brandTone: z.string().min(1),
  bannedExpressions: z.array(z.string()),
  landingInfo: z.string().nullable(),
  assumptions: z.array(z.string()),
});

export const storyboardShotArtifactSchema = z.object({
  index: z.number().int().nonnegative(),
  purpose: z.enum(["hook", "benefit", "proof", "cta"]),
  durationSec: z.number().int().positive(),
  scene: z.string().min(1),
  visualDirection: z.string().min(1),
  productAssetRef: z.string().min(1),
  voiceover: z.string().min(1),
  transition: z.string().min(1),
});

export const storyboardArtifactSchema = z.object({
  narrative: z.string().min(1),
  totalDurationSec: z.number().int().positive(),
  shots: z.array(storyboardShotArtifactSchema).min(1),
  assumptions: z.array(z.string()),
});

export const shotPromptShotArtifactSchema = z.object({
  index: z.number().int().nonnegative(),
  startSec: z.number().int().nonnegative(),
  endSec: z.number().int().positive(),
  providerPrompt: z.string().min(1),
  referenceAssetRefs: z.array(z.string().min(1)),
  voiceover: z.string().min(1),
  shotImage: z.record(z.unknown()).optional(),
  shotVideo: z.record(z.unknown()).optional(),
});

export const shotPromptArtifactSchema = z.object({
  targetProvider: z.literal("seedance"),
  durationSec: z.number().int().positive(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  prompt: z.string().min(1),
  negativePrompt: z.string(),
  shots: z.array(shotPromptShotArtifactSchema).min(1),
  tts: z.object({
    enabled: z.boolean(),
    source: z.literal("shots.voiceover").default("shots.voiceover"),
    voiceover: z.string(),
    audioAssetRef: z.string().min(1).optional(),
  }),
  assumptions: z.array(z.string()),
});

export const videoBreakdownShotSchema = z.object({
  purpose: z.enum(["hook", "benefit", "proof", "cta"]),
  description: z.string().min(1),
  durationSec: z.number().int().positive(),
});

export const videoBreakdownArtifactSchema = z.object({
  hookTechnique: z.string().min(1),
  sellingPoints: z.array(z.string().min(1)).min(1),
  structure: z.array(videoBreakdownShotSchema).min(3),
  emotionalArc: z.string().min(1),
  copyStyle: z.string().min(1),
  suggestedCategories: z.array(z.string().min(1)).min(1),
  suggestedName: z.string().min(1),
  whyViral: z.string().min(1),
});

export type VideoBreakdownArtifact = z.infer<typeof videoBreakdownArtifactSchema>;

export const feedbackRouteArtifactSchema = z.object({
  feedback: z.string().min(1),
  targetArtifact: z.enum(["brief", "storyboard", "shotprompt"]),
  previousJobId: z.string().min(1).optional(),
  reason: z.string().min(1),
  revisionInstruction: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  routedAt: z.string().min(1),
});

export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;
export type MaterialAsset = z.infer<typeof materialAssetSchema>;
export type MaterialIntakeArtifact = z.infer<
  typeof materialIntakeArtifactSchema
>;
export type ProductBriefArtifact = z.infer<typeof productBriefArtifactSchema>;
export type StoryboardArtifact = z.infer<typeof storyboardArtifactSchema>;
export type ShotPromptArtifact = z.infer<typeof shotPromptArtifactSchema>;
export type FeedbackRouteArtifact = z.infer<typeof feedbackRouteArtifactSchema>;

function isRecord(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertShotPromptMatchesStoryboard(
  shotPrompt: ShotPromptArtifact,
  storyboard: StoryboardArtifact,
  options: { requireShotLayers?: boolean } = {},
) {
  const expectedIndexes = storyboard.shots.map((shot) => shot.index);
  const actualIndexes = shotPrompt.shots.map((shot) => shot.index);
  if (actualIndexes.length !== expectedIndexes.length) {
    throw new Error(
      `Shotprompt provider output does not match storyboard shot count: expected ${expectedIndexes.length}, got ${actualIndexes.length}`,
    );
  }

  const mismatchedIndex = actualIndexes.findIndex(
    (index, position) => index !== expectedIndexes[position],
  );
  if (mismatchedIndex >= 0) {
    throw new Error(
      `Shotprompt provider output index mismatch at position ${mismatchedIndex}: expected ${expectedIndexes[mismatchedIndex]}, got ${actualIndexes[mismatchedIndex]}`,
    );
  }

  if (options.requireShotLayers) {
    const missingLayer = shotPrompt.shots.find((shot) => {
      return !isRecord(shot.shotImage) || !isRecord(shot.shotVideo);
    });
    if (missingLayer) {
      throw new Error(
        `Shotprompt provider output missing shotImage/shotVideo for shot index ${missingLayer.index}`,
      );
    }
  }
}
