import type { ReactNode } from "react";
import { Info } from "lucide-react";

interface DashboardCardProps {
  title: string;
  badge?: string;
  info?: string;
  right?: ReactNode;
  pad?: boolean;
  /** Engine output: emerald "基于推荐引擎" tag + accent shell. */
  accent?: boolean;
  /** Frontend seed: muted "演示功能" tag so demo content is never mistaken for live data. */
  demo?: boolean;
  children: ReactNode;
}

/** Card shell with badge / title / info tooltip / right slot — ported from the design `Card`. */
export function DashboardCard({
  title,
  badge,
  info,
  right,
  pad = true,
  accent = false,
  demo = false,
  children,
}: DashboardCardProps) {
  return (
    <section className={"dash-card" + (accent ? " is-accent" : "")}>
      <header className="dash-card-hd">
        <div className="dash-card-hd-l">
          {badge ? <span className="dash-card-badge">{badge}</span> : null}
          <h3 className="dash-card-title">{title}</h3>
          {accent ? <span className="dash-tag-real">基于推荐引擎</span> : null}
          {demo ? <span className="dash-tag-demo">演示功能</span> : null}
          {info ? (
            <span className="dash-card-info" title={info}>
              <Info size={14} strokeWidth={1.6} />
            </span>
          ) : null}
        </div>
        {right ? <div className="dash-card-hd-r">{right}</div> : null}
      </header>
      <div className="dash-card-bd" style={pad ? undefined : { padding: 0 }}>
        {children}
      </div>
    </section>
  );
}
