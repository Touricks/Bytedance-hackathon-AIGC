export type DashboardRouteView = "diagnosis" | "videos";
export type DashboardRouteScope = "global" | "workspace";

export type AppRoute =
  | { type: "workspaces-landing" }
  | { type: "creative-review"; workspaceId: string }
  | {
      type: "data-dashboard";
      workspaceId?: string;
      returnWorkspaceId?: string;
      dashboardScope?: DashboardRouteScope;
      initialView?: DashboardRouteView;
      initialDashboardVideoId?: string;
      initialFinalVideoJobId?: string;
    }
  | { type: "missing-workspace" };

export function workspacePath(workspaceId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

export function dashboardPath(
  workspaceId?: string,
  view?: DashboardRouteView,
  finalVideoJobId?: string,
  dashboardVideoId?: string,
  options: { scope?: DashboardRouteScope; returnWorkspaceId?: string } = {},
) {
  const scope = options.scope ?? "global";
  const returnWorkspaceId = options.returnWorkspaceId ?? workspaceId;
  const path =
    scope === "workspace" && workspaceId
      ? `/dashboard/${encodeURIComponent(workspaceId)}`
      : "/dashboard";
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (dashboardVideoId) params.set("videoId", dashboardVideoId);
  if (finalVideoJobId) params.set("finalVideoJobId", finalVideoJobId);
  if (returnWorkspaceId && scope !== "workspace") {
    params.set("returnWorkspaceId", returnWorkspaceId);
  }
  if (scope === "workspace") params.set("scope", scope);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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
  finalVideoJobId?: string,
  dashboardVideoId?: string,
  options?: { scope?: DashboardRouteScope; returnWorkspaceId?: string },
) {
  navigateToPath(dashboardPath(workspaceId, view, finalVideoJobId, dashboardVideoId, options));
}

export function navigateToWorkspacesLanding() {
  navigateToPath("/");
}

function dashboardViewFromSearch(search: string): DashboardRouteView | undefined {
  const view = new URLSearchParams(search).get("view");
  return view === "diagnosis" || view === "videos" ? view : undefined;
}

function finalVideoJobIdFromSearch(search: string): string | undefined {
  return new URLSearchParams(search).get("finalVideoJobId") ?? undefined;
}

function dashboardVideoIdFromSearch(search: string): string | undefined {
  return new URLSearchParams(search).get("videoId") ?? undefined;
}

function returnWorkspaceIdFromSearch(search: string): string | undefined {
  return new URLSearchParams(search).get("returnWorkspaceId") ?? undefined;
}

function dashboardScopeFromSearch(search: string): DashboardRouteScope {
  return new URLSearchParams(search).get("scope") === "workspace"
    ? "workspace"
    : "global";
}

export function resolveAppRoute(pathname: string, search = ""): AppRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard") {
    const initialView = dashboardViewFromSearch(search);
    const initialDashboardVideoId = dashboardVideoIdFromSearch(search);
    const initialFinalVideoJobId = finalVideoJobIdFromSearch(search);
    const dashboardScope = dashboardScopeFromSearch(search);
    const pathWorkspaceId = segments[1];
    const returnWorkspaceId =
      returnWorkspaceIdFromSearch(search) ??
      (dashboardScope === "global" ? pathWorkspaceId : undefined);
    const workspaceState =
      dashboardScope === "workspace" && pathWorkspaceId
        ? { workspaceId: pathWorkspaceId }
        : {};
    const returnState = returnWorkspaceId ? { returnWorkspaceId } : {};
    const viewState = initialView ? { initialView } : {};
    const dashboardVideoState = initialDashboardVideoId
      ? { initialDashboardVideoId }
      : {};
    const videoState = initialFinalVideoJobId ? { initialFinalVideoJobId } : {};
    return {
      type: "data-dashboard",
      dashboardScope,
      ...workspaceState,
      ...returnState,
      ...viewState,
      ...dashboardVideoState,
      ...videoState,
    };
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
