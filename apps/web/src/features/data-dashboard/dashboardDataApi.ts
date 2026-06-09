import seedData from "./dashboardAnalyticsSeed.json" assert { type: "json" };
import type { DashboardAnalyticsSnapshot } from "./dashboardTypes.js";

const snapshot = seedData as DashboardAnalyticsSnapshot;

export async function loadDashboardAnalyticsSnapshot() {
  return snapshot;
}

export function getDashboardAnalyticsSnapshot() {
  return snapshot;
}
