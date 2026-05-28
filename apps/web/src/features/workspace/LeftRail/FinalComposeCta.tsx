import { navigateFocus } from "../WorkspaceLayout.js";

export function FinalComposeCta({
  workspaceId,
  canCompose,
}: {
  workspaceId: string;
  canCompose: boolean;
}) {
  return (
    <div className="final-compose-cta">
      <button
        disabled={!canCompose}
        onClick={() =>
          navigateFocus({
            workspaceId,
            shotId: null,
            step: "final_compose",
          })
        }
      >
        合成最终视频
      </button>
    </div>
  );
}
