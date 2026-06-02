export type MaterialPreviewMode = "portrait" | "landscape" | "square" | "file";

type MaterialPreviewKind = "image" | "video" | "text" | string;

const supportedRatios = {
  portrait: 9 / 16,
  landscape: 16 / 9,
  square: 1,
} as const;

const ratioTolerance = 0.04;

function isCloseRatio(value: number, target: number) {
  return Math.abs(value - target) / target <= ratioTolerance;
}

export function deriveImagePreviewMode(
  width: number | null | undefined,
  height: number | null | undefined,
): Exclude<MaterialPreviewMode, "file"> {
  if (!width || !height || width <= 0 || height <= 0) return "landscape";

  const ratio = width / height;
  if (isCloseRatio(ratio, supportedRatios.square)) return "square";
  if (isCloseRatio(ratio, supportedRatios.portrait)) return "portrait";
  if (isCloseRatio(ratio, supportedRatios.landscape)) return "landscape";
  return "landscape";
}

export function deriveMaterialPreviewMode({
  kind,
  width,
  height,
}: {
  kind: MaterialPreviewKind;
  width?: number | null;
  height?: number | null;
}): MaterialPreviewMode {
  if (kind !== "image") return "file";
  return deriveImagePreviewMode(width, height);
}

export function materialPreviewModeLabel(mode: MaterialPreviewMode) {
  if (mode === "portrait") return "9:16";
  if (mode === "square") return "1:1";
  if (mode === "file") return "文件";
  return "16:9";
}
