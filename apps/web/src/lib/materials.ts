export function materialAssetFilename(ref: string) {
  const trimmed = ref.trim();
  const leaf = trimmed.split(/[\\/]/).filter(Boolean).at(-1) ?? trimmed;
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}
