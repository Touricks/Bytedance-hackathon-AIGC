import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import type { ReviewStepId } from "../reviewFlow.js";
import { ApplyShotSetPanel } from "./ApplyShotSetPanel.js";
import { FinalPanel } from "./FinalPanel.js";
import { ImageSelectionPanel } from "./ImageSelectionPanel.js";
import { MaterialIntakeReview } from "./MaterialIntakeReview.js";
import { OneClickFinalVideoProgressPanel } from "./OneClickFinalVideoProgressPanel.js";
import { ProductBriefReview } from "./ProductBriefReview.js";
import { RequirementsStart } from "./RequirementsStart.js";
import { ShotPromptReview } from "./ShotPromptReview.js";
import { StoryboardReview } from "./StoryboardReview.js";
import { VideoSelectionPanel } from "./VideoSelectionPanel.js";

export function MainPanel({
  vm,
  active,
  onActionComplete,
  manualShotSelectionId,
  onAutoSelectShot,
  onImageSelectionConfirmed
}: {
  vm: WorkbenchViewModel;
  active: ReviewStepId;
  onActionComplete: () => void;
  manualShotSelectionId: string | null;
  onAutoSelectShot: (shotId: string) => void;
  onImageSelectionConfirmed: () => void;
}) {
  if (active !== "requirements" && vm.pending?.oneClickFinalVideo) {
    return <OneClickFinalVideoProgressPanel vm={vm} />;
  }

  switch (active) {
    case "requirements":
      return <RequirementsStart vm={vm} onActionComplete={onActionComplete} />;
    case "material":
      return <MaterialIntakeReview vm={vm} onActionComplete={onActionComplete} />;
    case "brief":
      return <ProductBriefReview vm={vm} onActionComplete={onActionComplete} />;
    case "storyboard":
      return <StoryboardReview vm={vm} onActionComplete={onActionComplete} />;
    case "shotprompt":
      return <ShotPromptReview vm={vm} onActionComplete={onActionComplete} />;
    case "apply":
      return <ApplyShotSetPanel vm={vm} onActionComplete={onActionComplete} />;
    case "image":
      return (
        <ImageSelectionPanel
          vm={vm}
          manualShotSelectionId={manualShotSelectionId}
          onAutoSelectShot={onAutoSelectShot}
          onImageSelectionConfirmed={onImageSelectionConfirmed}
        />
      );
    case "video":
      return <VideoSelectionPanel vm={vm} />;
    case "final":
      return <FinalPanel vm={vm} />;
  }
}
