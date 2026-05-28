import { useFocusStore } from "../state/focusStore.js";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { ImagePromptStep } from "./ImagePromptStep.js";
import { ImageCandidatesStep } from "./ImageCandidatesStep.js";
import { VideoScriptStep } from "./VideoScriptStep.js";
import { VideoCandidatesStep } from "./VideoCandidatesStep.js";
import { ReviewStep } from "./ReviewStep.js";
import { FinalComposeStep } from "./FinalComposeStep.js";
import { defaultStepForStatus } from "../state/stepDerivation.js";

export function FocusRouter({ workspaceId }: { workspaceId: string }) {
  const shotId = useFocusStore((s) => s.shotId);
  const step = useFocusStore((s) => s.step);
  const { data } = useShotWorkflowStatus(workspaceId);
  if (step === "final_compose")
    return <FinalComposeStep workspaceId={workspaceId} />;
  if (!shotId)
    return <div className="focus-empty">从左侧选择一个分镜开始</div>;
  const shot = data?.data.shots.find((s) => s.shotId === shotId);
  const effective =
    step ?? (shot ? defaultStepForStatus(shot.status) : "image_prompt");
  switch (effective) {
    case "image_prompt":
      return <ImagePromptStep workspaceId={workspaceId} shotId={shotId} />;
    case "image_candidates":
      return (
        <ImageCandidatesStep workspaceId={workspaceId} shotId={shotId} />
      );
    case "video_script":
      return <VideoScriptStep workspaceId={workspaceId} shotId={shotId} />;
    case "video_candidates":
      return (
        <VideoCandidatesStep workspaceId={workspaceId} shotId={shotId} />
      );
    case "review":
      return <ReviewStep workspaceId={workspaceId} shotId={shotId} />;
    case "final_compose":
      return <FinalComposeStep workspaceId={workspaceId} />;
  }
}
