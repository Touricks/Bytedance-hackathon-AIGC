import { Calendar, Target, User, Zap } from "lucide-react";
import { DashboardDropdown } from "./DashboardControls.js";
import type { DataDashboardViewModel } from "./useDataDashboardViewModel.js";

/** Top filter bar: 平台 / KOL渠道 / 时间 / 目标 + live indicator. */
export function DashboardFilterBar({ vm }: { vm: DataDashboardViewModel }) {
  const { snapshot } = vm;

  return (
    <div className="dash-filters">
      <DashboardDropdown
        icon={Target}
        label="平台"
        value={vm.platform}
        options={snapshot.filters.platforms.map((platform) => ({ value: platform, label: platform }))}
        onChange={vm.setPlatform}
      />
      <DashboardDropdown
        icon={User}
        label="KOL渠道"
        value={vm.channelId}
        valueLabel={vm.channel.name}
        options={snapshot.channels.map((channel) => ({ value: channel.id, label: channel.name }))}
        onChange={vm.setChannel}
      />
      <DashboardDropdown
        icon={Calendar}
        label="时间"
        value={vm.range}
        options={snapshot.filters.ranges.map((range) => ({ value: range, label: range }))}
        onChange={vm.setRange}
      />
      <DashboardDropdown
        icon={Zap}
        label="目标"
        value={vm.goal}
        options={snapshot.filters.goals.map((goal) => ({ value: goal, label: goal }))}
        onChange={vm.setGoal}
      />
      <div className="dash-filters-spacer" />
      <span className="dash-filters-live">
        <i className="dash-live-dot" />
        {snapshot.meta.updatedLabel}
      </span>
    </div>
  );
}
