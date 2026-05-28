import { Check, Clock, AlertCircle } from "lucide-react";
import type { WorkflowStatus } from "../../../lib/api/shots.js";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  IMAGE_PROMPT_PROPOSING: "生成图 Prompt 中",
  IMAGE_PROMPT_READY: "等待生成图",
  IMAGE_PROMPT_EDITED: "已编辑 Prompt",
  IMAGE_GENERATING: "图生成中",
  IMAGE_CANDIDATES_READY: "等待选图",
  IMAGE_SELECTED: "已选图",
  VIDEO_SCRIPT_PROPOSING: "生成剧本中",
  VIDEO_SCRIPT_READY: "剧本就绪",
  VIDEO_SCRIPT_EDITED: "已编辑剧本",
  VIDEO_GENERATING: "视频生成中",
  VIDEO_CANDIDATES_READY: "等待选视频",
  VIDEO_SELECTED: "已选视频",
  FAILED: "失败",
};

export interface ShotListProps {
  shots: WorkflowStatus["shots"];
  activeShotId: string | null;
  onSelect(shotId: string): void;
}

export function ShotList({ shots, activeShotId, onSelect }: ShotListProps) {
  return (
    <ul className="shot-list">
      {shots
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((s) => {
          const isActive = s.shotId === activeShotId;
          const done = s.status === "VIDEO_SELECTED";
          const failed = s.status === "FAILED";
          const inProgress =
            s.status.endsWith("_GENERATING") || s.status.endsWith("_PROPOSING");
          return (
            <li
              key={s.shotId}
              className={`shot-list__row ${isActive ? "shot-list__row--active" : ""}`}
            >
              <button onClick={() => onSelect(s.shotId)}>
                <span className="shot-list__idx">{s.orderIndex + 1}</span>
                <span className="shot-list__label">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {done ? (
                  <Check
                    size={14}
                    className="shot-list__icon shot-list__icon--ok"
                  />
                ) : null}
                {inProgress ? (
                  <Clock
                    size={14}
                    className="shot-list__icon shot-list__icon--busy"
                  />
                ) : null}
                {failed ? (
                  <AlertCircle
                    size={14}
                    className="shot-list__icon shot-list__icon--err"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
    </ul>
  );
}
