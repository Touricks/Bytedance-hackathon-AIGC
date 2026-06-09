import { Sparkles, TrendingUp } from "lucide-react";
import { factorLabels } from "./dashboardFormatters.js";
import { DashboardLiveRecommendation } from "./DashboardLiveRecommendation.js";
import type {
  DashboardAnalyticsSnapshot,
  DashboardDiagnosis,
  DashboardVideoContext,
  WeightMode,
} from "./dashboardTypes.js";
import type {
  GroupRecommendation,
} from "../../lib/api/dashboardRecommendations.js";

/** Emerald-accent 智能创作建议 zone: factor combo → diagnosis → live 策略推荐. */
export function DashboardAdvisor({
  snapshot,
  video,
  recommendation,
  recommendationLoading,
  recommendationError,
  weightMode,
  onWeightModeChange,
}: {
  snapshot: DashboardAnalyticsSnapshot;
  video: DashboardVideoContext;
  recommendation: GroupRecommendation | null;
  recommendationLoading: boolean;
  recommendationError: string | null;
  weightMode: WeightMode;
  onWeightModeChange: (mode: WeightMode) => void;
}) {
  return (
    <aside className="dash-col-advisor">
      <div className="dash-advisor">
        <div className="dash-advisor-hd">
          <span className="dash-advisor-icon">
            <Sparkles size={16} />
          </span>
          <div>
            <h3>智能创作建议</h3>
            <p>基于商品分组 ROAS × GMV 投放表现</p>
          </div>
          <span className="dash-advisor-badge">AI</span>
        </div>

        <div className="dash-advisor-scroll">
          <section className="dash-advisor-section">
            <div className="dash-advisor-sec-hd">
              <span className="dash-dot-accent" />
              当前因子组合
            </div>
            <FactorCombo snapshot={snapshot} video={video} />
          </section>

          <section className="dash-advisor-section">
            <div className="dash-advisor-sec-hd">
              <span className="dash-dot-accent" />
              策略推荐
              <span className="dash-tag-real">基于推荐引擎</span>
            </div>
            <DashboardLiveRecommendation
              recommendation={recommendation}
              loading={recommendationLoading}
              error={recommendationError}
              weightMode={weightMode}
              onWeightModeChange={onWeightModeChange}
              selectedFactors={video.creativeFactors}
            />
          </section>

          <section className="dash-advisor-section">
            <div className="dash-advisor-sec-hd">
              <span className="dash-dot-accent" />
              诊断结论
              <span className="dash-tag-demo">演示功能</span>
            </div>
            <DiagnosisList items={snapshot.diagnosis} />
          </section>
        </div>
      </div>
    </aside>
  );
}

function FactorCombo({
  snapshot,
  video,
}: {
  snapshot: DashboardAnalyticsSnapshot;
  video: DashboardVideoContext;
}) {
  const labels = factorLabels(snapshot, video.creativeFactors);
  const items = [
    { key: "商品类目", value: labels.productCategory.label },
    { key: "商品成交类型", value: labels.dealType.label },
    { key: "适用人群", value: labels.audience.label },
    { key: "推销手法", value: labels.strategy.label },
  ];
  return (
    <div className="dash-combo">
      {items.map((item) => (
        <div key={item.key} className="dash-combo-item">
          <span className="dash-combo-k">{item.key}</span>
          <span className="dash-combo-v">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function diagnosisTagTone(tag: string) {
  if (tag === "主因") return "tag-red";
  if (tag === "保持" || tag === "最优组合") return "tag-green";
  return "tag-blue";
}

function DiagnosisList({ items }: { items: DashboardDiagnosis[] }) {
  return (
    <div className="dash-diag-list">
      {items.map((item) => (
        <div key={item.title} className={`dash-diag-item lvl-${item.level}`}>
          <div className="dash-diag-top">
            <span className={`dash-diag-dot lvl-${item.level}`} />
            <span className="dash-diag-metric">{item.metric}</span>
            <span className={`dash-diag-tag ${diagnosisTagTone(item.tag)}`}>{item.tag}</span>
            {item.lift ? (
              <span className="dash-diag-lift">
                <TrendingUp size={13} strokeWidth={2} />
                {item.lift}
              </span>
            ) : null}
          </div>
          <div className="dash-diag-title">{item.title}</div>
          <p className="dash-diag-body">{item.body}</p>
        </div>
      ))}
    </div>
  );
}
