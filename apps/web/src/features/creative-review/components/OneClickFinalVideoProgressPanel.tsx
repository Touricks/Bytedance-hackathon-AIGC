import { Clapperboard } from "lucide-react";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { OneClickProgress } from "./OneClickProgress.js";

export function OneClickFinalVideoProgressPanel({
  vm
}: {
  vm: WorkbenchViewModel;
}) {
  const job = vm.oneClickFinalVideo;
  const shotCount = vm.workflow?.shots?.length ?? vm.shots.length;

  return (
    <section className="review-panel review-panel--one-click-active">
      <div className="review-panel__header">
        <h1>一键成片进行中</h1>
      </div>
      <div className="review-one-click-focus">
        <Clapperboard size={24} />
        <div>
          <strong>正在自动推进成片任务</strong>
          <span>
            模块 2-9 会统一显示当前成片任务进度。失败后已生成的中间产物会保留，可回到对应步骤手动继续。
          </span>
        </div>
      </div>
      {job ? (
        <OneClickProgress
          job={job}
          shotCount={shotCount}
          description="系统正在自动推进素材解读、分镜生成要求、分镜图选择、分镜视频选择与成片生成。"
        />
      ) : null}
    </section>
  );
}
