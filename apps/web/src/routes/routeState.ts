export type AppRoute =
  | { type: "workspaces-landing" }
  | { type: "creative-review"; workspaceId: string }
  | { type: "data-dashboard"; workspaceId?: string }
  | { type: "missing-workspace" };

export function workspacePath(workspaceId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

export function dashboardPath(workspaceId?: string) {
  return workspaceId
    ? `/dashboard/${encodeURIComponent(workspaceId)}`
    : "/dashboard";
}

export function navigateToPath(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateToWorkspace(workspaceId: string) {
  navigateToPath(workspacePath(workspaceId));
}

export function navigateToDataDashboard(workspaceId?: string) {
  navigateToPath(dashboardPath(workspaceId));
}

export function navigateToWorkspacesLanding() {
  navigateToPath("/");
}

export function resolveAppRoute(pathname: string): AppRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard") {
    return segments[1]
      ? { type: "data-dashboard", workspaceId: segments[1] }
      : { type: "data-dashboard" };
  }

  if (segments[0] !== "workspaces" || segments.length === 1) {
    return { type: "workspaces-landing" };
  }

  if (segments[1] === "dashboard") {
    return segments[2]
      ? { type: "data-dashboard", workspaceId: segments[2] }
      : { type: "data-dashboard" };
  }

  const workspaceId = segments[1];
  if (!workspaceId) {
    return { type: "missing-workspace" };
  }

  return { type: "creative-review", workspaceId };
}
