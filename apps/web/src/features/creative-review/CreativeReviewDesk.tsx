import { useEffect, useState } from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { ArrowLeft, BarChart3, RefreshCw } from "lucide-react";
import { useWorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";
import { navigateToDataDashboard } from "../../routes/routeState.js";
import { canOpenReviewStep, deriveActiveStep, type ReviewStepId } from "./reviewFlow.js";
import { backToWorkspaces } from "./creativeReviewFormat.js";
import { MainPanel } from "./components/MainPanel.js";
import { RightRail, StepRail } from "./components/ReviewRails.js";

export {
  applyCreativeRequirementTemplate,
  requirementFormFromArtifact
} from "./requirementsForm.js";
export type { RequirementsFormState } from "./requirementsForm.js";
export {
  applyStoryboardDurationAllocation,
  fitStoryboardVoiceoversToBudget,
  formToStoryboard,
  storyboardToForm
} from "./storyboardForm.js";
export type { StoryboardFormState, StoryboardShotFormState } from "./storyboardForm.js";

export function CreativeReviewDesk({ workspaceId }: { workspaceId: string }) {
  const vm = useWorkbenchViewModel(workspaceId);
  const defaultStep = deriveActiveStep(vm);
  const [selectedStep, setSelectedStep] = useState<ReviewStepId | null>(null);
  const [manualShotSelectionId, setManualShotSelectionId] = useState<string | null>(null);
  const active = selectedStep ?? defaultStep;

  useEffect(() => {
    if (selectedStep && !canOpenReviewStep(vm, selectedStep, defaultStep)) {
      setSelectedStep(null);
    }
  }, [
    defaultStep,
    selectedStep,
    vm.artifacts.brief?.id,
    vm.artifacts.material?.id,
    vm.artifacts.promptRequirements?.id,
    vm.artifacts.shotPrompt?.id,
    vm.artifacts.shotPrompt?.isCurrent,
    vm.artifacts.storyboard?.id,
    vm.shots.length,
    vm.workspaceStatus?.activeShotSet?.id,
    vm.workflow?.canComposeFinalVideo
  ]);

  return (
    <div className="review-desk">
      <header className="review-topbar">
        <Tooltip title="返回工作区">
          <IconButton
            type="button"
            className="review-icon-button"
            onClick={backToWorkspaces}
            aria-label="返回工作区"
            size="small"
            sx={{ width: 36, height: 36 }}
          >
            <ArrowLeft size={18} />
          </IconButton>
        </Tooltip>
        <div className="review-topbar__title">
          <span>创作工作区</span>
          <strong>{vm.workspace?.localPath || vm.workspaceId}</strong>
        </div>
        <button
          type="button"
          className="review-secondary"
          onClick={() => navigateToDataDashboard(workspaceId)}
        >
          <BarChart3 size={15} />
          分析诊断
        </button>
        <Tooltip title="刷新">
          <IconButton
            type="button"
            className="review-icon-button"
            onClick={() => void vm.actions.refresh()}
            aria-label="刷新"
            size="small"
            sx={{ width: 36, height: 36 }}
          >
            <RefreshCw size={18} />
          </IconButton>
        </Tooltip>
      </header>
      {vm.error ? <div className="review-global-error">{vm.error}</div> : null}
      {vm.loading ? (
        <div className="review-loading">
          <div />
          <div />
          <div />
        </div>
      ) : (
        <main className="review-grid">
          <StepRail
            vm={vm}
            active={active}
            defaultStep={defaultStep}
            onSelect={setSelectedStep}
            onShotSelect={(shotId) => {
              setManualShotSelectionId(shotId);
              vm.actions.setSelectedShotId(shotId);
            }}
          />
          <MainPanel
            vm={vm}
            active={active}
            onActionComplete={() => setSelectedStep(null)}
            manualShotSelectionId={manualShotSelectionId}
            onAutoSelectShot={(shotId) => {
              setManualShotSelectionId(null);
              vm.actions.setSelectedShotId(shotId);
            }}
            onImageSelectionConfirmed={() => setManualShotSelectionId(null)}
          />
          <RightRail
            vm={vm}
            onReturnToRequirements={() => setSelectedStep("requirements")}
            onSelectStep={setSelectedStep}
          />
        </main>
      )}
      {vm.busy || vm.refreshing || vm.hasActiveGeneration ? (
        <div className="review-live-strip">
          <span />
          正在同步创作状态
        </div>
      ) : null}
    </div>
  );
}
