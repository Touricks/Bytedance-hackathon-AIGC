export type DashboardRouteView = "diagnosis" | "videos";

export type AppRoute =
  | { type: "workspaces-landing" }
  | { type: "creative-review"; workspaceId: string }
  | { type: "data-dashboard"; workspaceId?: string; initialView?: DashboardRouteView }
  | { type: "missing-workspace" };

export function workspacePath(workspaceId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

export function dashboardPath(workspaceId?: string, view?: DashboardRouteView) {
  const path = workspaceId
    ? `/dashboard/${encodeURIComponent(workspaceId)}`
    : "/dashboard";
  return view ? `${path}?view=${encodeURIComponent(view)}` : path;
}

export function navigateToPath(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateToWorkspace(workspaceId: string) {
  navigateToPath(workspacePath(workspaceId));
}

export function navigateToDataDashboard(
  workspaceId?: string,
  view?: DashboardRouteView,
) {
  navigateToPath(dashboardPath(workspaceId, view));
}

export function navigateToWorkspacesLanding() {
  navigateToPath("/");
}

function dashboardViewFromSearch(search: string): DashboardRouteView | undefined {
  const view = new URLSearchParams(search).get("view");
  return view === "diagnosis" || view === "videos" ? view : undefined;
}

export function resolveAppRoute(pathname: string, search = ""): AppRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard") {
    const initialView = dashboardViewFromSearch(search);
    const viewState = initialView ? { initialView } : {};
    return segments[1]
      ? { type: "data-dashboard", workspaceId: segments[1], ...viewState }
      : { type: "data-dashboard", ...viewState };
  }

  if (segments[0] !== "workspaces" || segments.length === 1) {
    return { type: "workspaces-landing" };
  }

  const workspaceId = segments[1];
  if (!workspaceId) {
    return { type: "missing-workspace" };
  }

  return { type: "creative-review", workspaceId };
}
