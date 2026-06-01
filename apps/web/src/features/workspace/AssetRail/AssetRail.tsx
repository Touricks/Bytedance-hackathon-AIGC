import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWorkspaceStatus,
  toWorkspaceMaterialUrl,
} from "../../../lib/api/client.js";
import { useFocusStore } from "../state/focusStore.js";
import { useShotAssetRefs } from "../hooks/useShotAssetRefs.js";
import { AssetTile } from "./AssetTile.js";
import { QuickUpload } from "./QuickUpload.js";

export function AssetRail({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const ws = useQuery({
    queryKey: ["workspace-status", workspaceId],
    queryFn: () => getWorkspaceStatus(workspaceId),
  });
  const activeShotId = useFocusStore((s) => s.shotId);
  const { refs, setRefs } = useShotAssetRefs(activeShotId);

  const materials = ws.data?.materialLibrary?.assets ?? [];

  return (
    <div className="asset-rail">
      <section>
        <h4>当前分镜引用</h4>
        {!activeShotId ? (
          <p className="asset-rail__hint">未选择分镜。</p>
        ) : refs.length === 0 ? (
          <p className="asset-rail__hint">无引用素材。</p>
        ) : (
          <ul className="asset-rail__refs">
            {refs.map((r) => (
              <li key={r.id}>
                <span className="asset-rail__role">{r.role}</span>
                <span className="asset-rail__id">
                  {r.assetId.slice(0, 8)}…
                </span>
                <button
                  onClick={() =>
                    setRefs.mutate(
                      refs
                        .filter((x) => x.id !== r.id)
                        .map((x) => ({
                          assetId: x.assetId,
                          role: x.role,
                          weight: x.weight,
                        })),
                    )
                  }
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>素材库</h4>
        <div className="asset-rail__grid">
          {materials.map((a) => (
            <AssetTile
              key={a.ref}
              assetId={a.ref}
              url={toWorkspaceMaterialUrl(workspaceId, a.ref)}
              label={a.description}
              selected={refs.some((r) => r.assetId === a.ref)}
              onToggle={() => {
                if (!activeShotId) return;
                const exists = refs.find((r) => r.assetId === a.ref);
                const next = exists
                  ? refs
                      .filter((r) => r !== exists)
                      .map((r) => ({
                        assetId: r.assetId,
                        role: r.role,
                        weight: r.weight,
                      }))
                  : [
                      ...refs.map((r) => ({
                        assetId: r.assetId,
                        role: r.role,
                        weight: r.weight,
                      })),
                      {
                        assetId: a.ref,
                        role: "product_identity" as const,
                      },
                    ];
                setRefs.mutate(next);
              }}
            />
          ))}
        </div>
        <QuickUpload
          workspaceId={workspaceId}
          onUploaded={() =>
            qc.invalidateQueries({
              queryKey: ["workspace-status", workspaceId],
            })
          }
        />
      </section>
    </div>
  );
}
