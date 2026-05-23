const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

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
