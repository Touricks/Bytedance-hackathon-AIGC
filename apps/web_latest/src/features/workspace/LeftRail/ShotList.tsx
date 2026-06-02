import { Check, Clock, AlertCircle } from "lucide-react";
import type { WorkflowStatus } from "../../../lib/api/shots.js";
import { shotStatusLabel } from "../../../lib/shotStatusLabel.js";

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
                  {shotStatusLabel(s.status)}
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
