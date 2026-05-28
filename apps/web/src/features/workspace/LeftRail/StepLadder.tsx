import { useFocusStore } from "../state/focusStore.js";
import {
  defaultStepForStatus,
  isStepReachable,
} from "../state/stepDerivation.js";
import type { FocusedStep } from "../state/urlState.js";
import type { ShotStatus } from "../../../lib/api/client.js";
import { navigateFocus } from "../WorkspaceLayout.js";

const STEP_LABEL: Record<FocusedStep, string> = {
  image_prompt: "1. 图 Prompt",
  image_candidates: "2. 选图",
  video_script: "3. 视频剧本",
  video_candidates: "4. 选视频",
  review: "5. 审阅",
  final_compose: "6. 最终合成",
};

export interface StepLadderProps {
  workspaceId: string;
  shotId: string;
  status: ShotStatus;
}

export function StepLadder({ workspaceId, shotId, status }: StepLadderProps) {
  const current = useFocusStore((s) => s.step) ?? defaultStepForStatus(status);
  return (
    <ol className="step-ladder">
      {(Object.keys(STEP_LABEL) as FocusedStep[])
        .filter((s) => s !== "final_compose")
        .map((step) => {
          const reachable = isStepReachable(step, status);
          const active = current === step;
          return (
            <li
              key={step}
              className={`step-ladder__row ${active ? "step-ladder__row--active" : ""} ${reachable ? "" : "step-ladder__row--locked"}`}
            >
              <button
                disabled={!reachable}
                onClick={() => navigateFocus({ workspaceId, shotId, step })}
              >
                {STEP_LABEL[step]}
              </button>
            </li>
          );
        })}
    </ol>
  );
}
