import { Check, ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import { factorLabels } from "./dashboardFormatters.js";
import type {
  DashboardAnalyticsSnapshot,
  DashboardDiagnosis,
  DashboardStrategyRecommendation,
  DashboardVideoContext,
} from "./dashboardTypes.js";

/** Emerald-accent 智能创作建议 zone: factor combo → diagnosis → strategy recommendation. */
export function DashboardAdvisor({
  snapshot,
  video,
}: {
  snapshot: DashboardAnalyticsSnapshot;
  video: DashboardVideoContext;
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
            <p>基于推销手法 × 量化渠道</p>
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
              诊断结论
            </div>
            <DiagnosisList items={snapshot.diagnosis} />
          </section>

          <section className="dash-advisor-section">
            <div className="dash-advisor-sec-hd">
              <span className="dash-dot-accent" />
              推销手法建议
            </div>
            <StrategyRec
              snapshot={snapshot}
              recommendation={snapshot.strategyRecommendation}
              currentStrategy={video.creativeFactors.strategy}
            />
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
    { key: "商品类目", value: labels.productCategory.label, lever: false },
    { key: "商品成交类型", value: labels.dealType.label, lever: false },
    { key: "适用人群", value: labels.audience.label, lever: false },
    { key: "推销手法", value: labels.strategy.label, lever: true },
  ];
  return (
    <div className="dash-combo">
      {items.map((item) => (
        <div key={item.key} className={"dash-combo-item" + (item.lever ? " is-lever" : "")}>
          <span className="dash-combo-k">{item.key}</span>
          <span className="dash-combo-v">
            {item.value}
            {item.lever ? <i className="dash-combo-lever-tag">可调杠杆</i> : null}
          </span>
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

function StrategyRec({
  snapshot,
  recommendation,
  currentStrategy,
}: {
  snapshot: DashboardAnalyticsSnapshot;
  recommendation: DashboardStrategyRecommendation;
  currentStrategy?: DashboardStrategyRecommendation["currentStrategy"];
}) {
  const strategies = snapshot.factorCatalog.strategies;
  const current = strategies[currentStrategy ?? recommendation.currentStrategy];
  const suggested = strategies[recommendation.suggestedStrategy];
  const maxRoas = Math.max(
    ...recommendation.rankForCurrentChannel.map((entry) => entry.roas),
    0.0001,
  );

  return (
    <div className="dash-srec">
      <div className="dash-srec-switch">
        <div className="dash-srec-col dash-srec-cur">
          <span className="dash-srec-kicker">当前推销手法</span>
          <span className="dash-srec-name">{current.label}</span>
          <span className="dash-srec-flow">{current.flow}</span>
        </div>
        <div className="dash-srec-arrow">
          <ChevronRight size={18} strokeWidth={2} />
        </div>
        <div className="dash-srec-col dash-srec-sug">
          <span className="dash-srec-kicker">建议下一条采用</span>
          <span className="dash-srec-name">
            {suggested.label}
            <i className="dash-srec-lift">{recommendation.lift}</i>
          </span>
          <span className="dash-srec-flow">{suggested.flow}</span>
        </div>
      </div>

      <ul className="dash-srec-reasons">
        {recommendation.reasons.map((reason) => (
          <li key={reason}>
            <Check size={13} strokeWidth={2.4} />
            {reason}
          </li>
        ))}
      </ul>

      <div className="dash-srec-rank">
        <div className="dash-srec-rank-hd">当前渠道各推销手法 ROAS</div>
        {recommendation.rankForCurrentChannel.map((entry) => {
          const strategy = strategies[entry.strategy];
          return (
            <div
              key={entry.strategy}
              className={
                "dash-srank-row" +
                (entry.isBest ? " is-best" : "") +
                (entry.isCurrent ? " is-cur" : "")
              }
            >
              <span className="dash-srank-name">
                {strategy.label}
                {entry.isBest ? <i className="dash-srank-tag rec">推荐</i> : null}
                {entry.isCurrent ? <i className="dash-srank-tag cur">当前</i> : null}
              </span>
              <span className="dash-srank-bar">
                <i style={{ width: `${(entry.roas / maxRoas) * 100}%` }} />
              </span>
              <span className="dash-srank-val">{entry.roas.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
