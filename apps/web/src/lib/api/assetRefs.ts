import { fetchJson } from "./client.js";

export interface ShotAssetRef {
  id: string;
  shotId: string;
  assetId: string;
  role:
    | "product_identity"
    | "reference_style"
    | "reference_scene"
    | "first_frame_hint"
    | "other";
  weight: number;
}

export function patchShotAssetRefs(
  shotId: string,
  refs: Array<{
    assetId: string;
    role: ShotAssetRef["role"];
    weight?: number;
  }>,
) {
  return fetchJson<{ data: ShotAssetRef[] }>(
    `/api/shots/${shotId}/asset-refs`,
    {
      method: "PATCH",
      body: JSON.stringify({ refs }),
    },
  );
}
