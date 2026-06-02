import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "../../../lib/api/client.js";
import {
  patchShotAssetRefs,
  type ShotAssetRef,
} from "../../../lib/api/assetRefs.js";

export function useShotAssetRefs(shotId: string | null) {
  const refsQuery = useQuery({
    queryKey: ["shot-asset-refs", shotId],
    queryFn: async () => {
      if (!shotId) return { data: [] as ShotAssetRef[] };
      const res = await fetch(`${apiBaseUrl}/api/shots/${shotId}/asset-refs`);
      if (!res.ok) return { data: [] as ShotAssetRef[] };
      return res.json() as Promise<{ data: ShotAssetRef[] }>;
    },
    enabled: Boolean(shotId),
  });

  const qc = useQueryClient();
  const setRefs = useMutation({
    mutationFn: async (
      refs: Array<{
        assetId: string;
        role: ShotAssetRef["role"];
        weight?: number;
      }>,
    ) => {
      if (!shotId) return { data: [] as ShotAssetRef[] };
      return patchShotAssetRefs(shotId, refs);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["shot-asset-refs", shotId] }),
  });

  return { refs: refsQuery.data?.data ?? [], setRefs };
}
