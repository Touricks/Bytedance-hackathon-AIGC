import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useFocusStore } from "../state/focusStore.js";
import { ShotList } from "./ShotList.js";
import { StepLadder } from "./StepLadder.js";
import { navigateFocus } from "../WorkspaceLayout.js";
import { defaultStepForStatus } from "../state/stepDerivation.js";
import { FinalComposeCta } from "./FinalComposeCta.js";

export interface LeftRailProps {
  workspaceId: string;
}

export function LeftRail({ workspaceId }: LeftRailProps) {
  const { data, isLoading } = useShotWorkflowStatus(workspaceId);
  const activeShotId = useFocusStore((s) => s.shotId);
  const shots = data?.data.shots ?? [];
  const activeShot = shots.find((s) => s.shotId === activeShotId);

  return (
    <div className="left-rail">
      {isLoading ? (
        <p className="left-rail__loading">加载中…</p>
      ) : (
        <ShotList
          shots={shots}
          activeShotId={activeShotId}
          onSelect={(shotId) => {
            const status =
              shots.find((s) => s.shotId === shotId)?.status ?? "DRAFT";
            navigateFocus({
              workspaceId,
              shotId,
              step: defaultStepForStatus(status),
            });
          }}
        />
      )}
      {activeShot ? (
        <StepLadder
          workspaceId={workspaceId}
          shotId={activeShot.shotId}
          status={activeShot.status}
        />
      ) : null}
      <FinalComposeCta
        workspaceId={workspaceId}
        canCompose={data?.data.canComposeFinalVideo ?? false}
      />
    </div>
  );
}
