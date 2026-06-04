import { HttpError } from "./errors.js";

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

/**
 * The Ark vision model rejects images whose smallest side is below 14 pixels
 * ("Image dimensions are too small. Minimum allowed dimension: 14 pixels").
 * We mirror that floor so a degenerate image is rejected with a clean domain
 * error before we ever spend a real provider call.
 */
export const MIN_IMAGE_DIMENSION = 14;

const rasterImageValidators: Record<string, (bytes: Buffer) => boolean> = {
  "image/png": (bytes) =>
    bytes.length >= pngSignature.length &&
    bytes.subarray(0, pngSignature.length).equals(pngSignature),
  "image/jpeg": (bytes) =>
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff,
  "image/gif": (bytes) => {
    const signature = bytes.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  },
  "image/webp": (bytes) =>
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP",
  "image/bmp": (bytes) =>
    bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d,
  "image/tiff": (bytes) =>
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
};

export function assertValidRasterImageBytes(
  bytes: Buffer,
  contentType: string
): string {
  const normalizedContentType = contentType.toLowerCase();
  const validate = rasterImageValidators[normalizedContentType];
  if (!validate) {
    throw new Error(
      `Unsupported product image content type: ${contentType}`
    );
  }

  if (!validate(bytes)) {
    throw new Error(
      `Uploaded product image must be a valid image file: ${contentType}`
    );
  }

  return normalizedContentType;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

function readPngDimensions(bytes: Buffer): ImageDimensions | undefined {
  // 8-byte signature, then the IHDR chunk: 4-byte length + "IHDR" tag, with
  // width and height as big-endian uint32 at byte offsets 16 and 20.
  if (bytes.length < 24) {
    return undefined;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readGifDimensions(bytes: Buffer): ImageDimensions | undefined {
  // Logical screen descriptor: little-endian uint16 width/height at offset 6/8.
  if (bytes.length < 10) {
    return undefined;
  }
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function readBmpDimensions(bytes: Buffer): ImageDimensions | undefined {
  // BITMAPINFOHEADER: signed int32 width/height at offset 18/22 (height may be
  // negative for top-down bitmaps, so take the absolute value).
  if (bytes.length < 26) {
    return undefined;
  }
  return {
    width: Math.abs(bytes.readInt32LE(18)),
    height: Math.abs(bytes.readInt32LE(22))
  };
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | undefined {
  // Walk the marker segments until a Start-Of-Frame marker, which carries the
  // height/width as big-endian uint16 right after its 2-byte length + precision.
  let offset = 2; // skip the SOI marker (0xFFD8)
  while (offset + 9 < bytes.length) {
    if (bytes.readUInt8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes.readUInt8(offset + 1);
    // Standalone markers carry no length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC
    if (isStartOfFrame) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + segmentLength;
  }
  return undefined;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | undefined {
  if (bytes.length < 30) {
    return undefined;
  }
  const format = bytes.subarray(12, 16).toString("ascii");
  if (format === "VP8X") {
    // Canvas size is stored as 24-bit little-endian (minus one) at offset 24/27.
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    return { width, height };
  }
  if (format === "VP8 ") {
    // Lossy: 14-bit width/height after the 3-byte start code at offset 23.
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }
  // VP8L (lossless) bit-packs its dimensions; skip rather than risk a false
  // reject and let the provider validate instead.
  return undefined;
}

/**
 * Best-effort decode of an image's pixel dimensions from its header bytes.
 * Returns `undefined` for formats we cannot decode (e.g. TIFF, lossless WebP)
 * so callers defer to provider-side validation instead of false-rejecting.
 */
export function readRasterImageDimensions(
  bytes: Buffer,
  contentType: string
): ImageDimensions | undefined {
  try {
    switch (contentType.toLowerCase()) {
      case "image/png":
        return readPngDimensions(bytes);
      case "image/jpeg":
        return readJpegDimensions(bytes);
      case "image/gif":
        return readGifDimensions(bytes);
      case "image/bmp":
        return readBmpDimensions(bytes);
      case "image/webp":
        return readWebpDimensions(bytes);
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Throws a clean `400 IMAGE_TOO_SMALL` when a decodable image is below the
 * minimum side length the vision model accepts. No-op when the dimensions
 * cannot be decoded.
 */
export function assertImageDimensionsWithinPolicy(
  bytes: Buffer,
  contentType: string,
  minDimension: number = MIN_IMAGE_DIMENSION,
  ref?: string
): void {
  const dimensions = readRasterImageDimensions(bytes, contentType);
  if (!dimensions) {
    return;
  }
  if (dimensions.width < minDimension || dimensions.height < minDimension) {
    const subject = ref ? `Material image "${ref}"` : "Material image";
    throw new HttpError(
      400,
      "IMAGE_TOO_SMALL",
      `${subject} is too small (${dimensions.width}x${dimensions.height}px). ` +
        `The minimum accepted size is ${minDimension}px on each side.`
    );
  }
}
