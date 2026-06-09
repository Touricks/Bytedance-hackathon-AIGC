import { Play } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../lib/api/client.js";
import { factorLabels } from "./dashboardFormatters.js";
import { dashboardVideoPosterDataUrl } from "./dashboardVideoPoster.js";
import type {
  DashboardAnalyticsSnapshot,
  DashboardChannel,
  DashboardVideoContext,
} from "./dashboardTypes.js";

/** Current-video scope bar with dashboard attribution-factor chips. */
export function DashboardScopeBar({
  snapshot,
  video,
  channel,
}: {
  snapshot: DashboardAnalyticsSnapshot;
  video: DashboardVideoContext;
  channel: DashboardChannel;
}) {
  const labels = factorLabels(snapshot, video.creativeFactors);

  return (
    <div className="dash-scope">
      <div className="dash-scope-thumb">
        {video.localUrl ? (
          <video
            src={toAbsoluteAssetUrl(video.localUrl)}
            poster={dashboardVideoPosterDataUrl(video.id)}
            muted
            playsInline
            preload="none"
            className="dash-scope-preview"
            aria-label={video.name}
          />
        ) : (
          <Play size={20} fill="currentColor" strokeWidth={0} />
        )}
      </div>
      <div className="dash-scope-main">
        <div className="dash-scope-row1">
          <span className="dash-scope-name">{video.filename}</span>
          <span className="dash-tag dash-tag-slate">{video.model}</span>
          <span className="dash-tag dash-tag-slate">{video.duration}</span>
        </div>
        <div className="dash-scope-tags">
          <span className="dash-factor-chip">
            <i>类目</i>
            {labels.productCategory.label}
          </span>
          <span className="dash-factor-chip">
            <i>成交</i>
            {labels.dealType.label}
          </span>
          <span className="dash-factor-chip">
            <i>人群</i>
            {labels.audience.label}
          </span>
          <span className="dash-factor-chip">
            <i>推销手法</i>
            {labels.strategy.label}
          </span>
          {video.template.status !== "none" ? (
            <span className="dash-factor-chip ghost">
              <i>模板</i>
              {video.template.name}
            </span>
          ) : null}
        </div>
      </div>
      <div className="dash-scope-facts">
        <div className="dash-scope-fact">
          <span>受众</span>
          <b>{video.audienceText}</b>
        </div>
        <div className="dash-scope-fact">
          <span>分发渠道</span>
          <b>
            {channel.name} · {channel.tier}
          </b>
        </div>
        <div className="dash-scope-fact">
          <span>发布</span>
          <b>{video.publishedAt}</b>
        </div>
      </div>
    </div>
  );
}
