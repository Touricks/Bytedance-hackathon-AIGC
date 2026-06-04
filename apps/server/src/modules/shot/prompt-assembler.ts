export const SHOT_IMAGE_ASSEMBLER_VERSION = "server-image-prompt-assembler.v1";
export const SHOT_VIDEO_ASSEMBLER_VERSION = "server-video-script-assembler.v1";

const IMAGE_FIELD_ORDER = [
  "scene",
  "composition",
  "lighting",
  "productVisibility",
  "productVis",
  "referenceUsage",
  "style",
  "negative",
];

const VIDEO_FIELD_ORDER = [
  "cameraMotion",
  "subjectMotion",
  "firstFrame",
  "firstFrameIntent",
  "lastFrame",
  "lastFrameIntent",
  "durationIntent",
  "continuity",
  "negative",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未提供";
  if (typeof value === "string") return value.trim() || "未提供";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).join("；");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function entries(value: unknown, order: string[]) {
  if (!isRecord(value)) return [["value", value]] as Array<[string, unknown]>;
  const preferred = order
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => [key, value[key]] as [string, unknown]);
  const extra = Object.keys(value)
    .filter((key) => !order.includes(key))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, value[key]] as [string, unknown]);
  return [...preferred, ...extra];
}

function section(title: string, value: unknown, order: string[]) {
  return [
    `[${title}]`,
    ...entries(value, order).map(([key, fieldValue]) => `${key}: ${stringifyValue(fieldValue)}`),
  ].join("\n");
}

function negativeFrom(value: unknown) {
  if (!isRecord(value)) return "";
  const negative = value.negative;
  return stringifyValue(negative === undefined ? "" : negative);
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.map((line) => line?.trim()).filter(Boolean).join("\n\n");
}

export function assembleShotImagePrompt(input: {
  shotGoal: string;
  shotImage: unknown;
  userDirection?: string;
  mode: "propose" | "regenerate";
}) {
  const userDirection = input.userDirection?.trim();
  const promptText = compactLines([
    `[镜头目标]\n${input.shotGoal.trim() || "未提供"}`,
    section("分镜图要求", input.shotImage, IMAGE_FIELD_ORDER),
    userDirection
      ? [
          "[本轮反馈]",
          userDirection,
          "在不改变当前镜头目标和分镜图要求的前提下，只调整反馈明确指出的部分。",
        ].join("\n")
      : null,
    [
      "[参考图规则]",
      ...(input.mode === "regenerate"
        ? [
            "第一优先级：被反馈的候选分镜图，用作本轮改稿基准。",
            "第二优先级：本镜头绑定素材，用作商品/景观身份和画面事实参考。",
            "第三优先级：上一镜已选分镜图，仅用于保持连续性，不覆盖本镜头主体要求。",
          ]
        : [
            "第一优先级：本镜头绑定素材，用作商品/景观身份和画面事实参考。",
            "第二优先级：上一镜已选分镜图，仅用于保持连续性，不覆盖本镜头主体要求。",
          ]),
    ].join("\n"),
  ]);
  return {
    promptText,
    negativePrompt: negativeFrom(input.shotImage),
    promptJson: {
      promptText,
      negativePrompt: negativeFrom(input.shotImage) || null,
      visualStyle: null,
      composition: isRecord(input.shotImage)
        ? stringifyValue(input.shotImage.composition)
        : null,
      lighting: isRecord(input.shotImage) ? stringifyValue(input.shotImage.lighting) : null,
      productVisibilityRule: isRecord(input.shotImage)
        ? stringifyValue(input.shotImage.productVisibility ?? input.shotImage.productVis)
        : "未提供",
      referenceImageUsage: [],
      qualityChecklist: ["镜头目标优先", "分镜图要求完整", "参考素材身份一致"],
    },
  };
}

export function assembleShotVideoScript(input: {
  shotGoal: string;
  shotVideo: unknown;
  durationSec: number;
  voiceover: string;
  voiceProfile?: unknown;
  firstFrameCandidateId: string;
  firstFrameUrl: string | null;
  lastFrameCandidateId?: string | null;
  lastFrameUrl?: string | null;
  userDirection?: string;
  feedbackVideoCandidateId?: string;
  mode: "propose" | "regenerate";
}) {
  const userDirection = input.userDirection?.trim();
  const prompt = compactLines([
    `[镜头目标上下文]\n${input.shotGoal.trim() || "未提供"}`,
    section("分镜视频要求", input.shotVideo, VIDEO_FIELD_ORDER),
    [
      "[首尾帧约束]",
      `首帧：必须贴合当前分镜已选图 ${input.firstFrameCandidateId}。`,
      input.lastFrameCandidateId
        ? `尾帧：自然接近下一分镜已选图 ${input.lastFrameCandidateId}。`
        : "尾帧：最后一镜无下一分镜尾帧，按本镜末帧意图自然收束。",
      `时长：${input.durationSec} 秒。`,
    ].join("\n"),
    userDirection
      ? [
          "[本轮反馈]",
          input.feedbackVideoCandidateId
            ? `反馈对象：最新轮次候选视频 ${input.feedbackVideoCandidateId}。`
            : "反馈对象：未指定候选视频。",
          userDirection,
          "只调整运动节奏、稳定性、自然度等执行层表现，不改变镜头目标、首尾帧意图和商品/景观主体。",
        ].join("\n")
      : null,
  ]);
  const negativePrompt = negativeFrom(input.shotVideo);
  return {
    durationSec: input.durationSec,
    scriptJson: {
      durationSec: input.durationSec,
      shotGoal: input.shotGoal,
      startFrameDescription: `贴合首帧候选 ${input.firstFrameCandidateId}`,
      endFrameDescription: input.lastFrameCandidateId
        ? `自然接近尾帧候选 ${input.lastFrameCandidateId}`
        : "按本镜末帧意图自然收束",
      cameraMotion: isRecord(input.shotVideo)
        ? stringifyValue(input.shotVideo.cameraMotion)
        : "未提供",
      subjectMotion: isRecord(input.shotVideo)
        ? stringifyValue(input.shotVideo.subjectMotion)
        : "未提供",
      productVisibility: isRecord(input.shotVideo)
        ? stringifyValue(input.shotVideo.productVisibility ?? input.shotVideo.productVis)
        : "未提供",
      sceneConsistency: isRecord(input.shotVideo)
        ? stringifyValue(input.shotVideo.continuity)
        : "未提供",
      continuityWithPrevious: null,
      continuityWithNext: input.lastFrameCandidateId ?? null,
      voiceover: input.voiceover || null,
      onscreenText: null,
      negativePrompt,
      providerPrompt: prompt,
      riskNotes: [],
      context: {
        voiceProfile: input.voiceProfile ?? null,
      },
    },
    providerPrompt: prompt,
    negativePrompt,
  };
}
