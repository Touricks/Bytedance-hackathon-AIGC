import type { ShotSetShot } from "../../lib/api/shots.js";

export function backToWorkspaces() {
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function shortEntityId(id: string | null | undefined) {
  if (!id) return "未创建";
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function formatReviewTime(value: string | null | undefined) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatShotDuration(shot: Pick<ShotSetShot, "defaultDurationSec">) {
  return typeof shot.defaultDurationSec === "number"
    ? `约 ${Math.round(shot.defaultDurationSec)} 秒`
    : "时长待定";
}
