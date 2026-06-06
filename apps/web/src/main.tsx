import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./routes/App.js";
import { CreativeReviewDesk } from "./features/creative-review/CreativeReviewDesk.js";
import { DataDashboardPage } from "./features/data-dashboard/DataDashboardPage.js";
import { resolveAppRoute } from "./routes/routeState.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Root() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const route = resolveAppRoute(pathname);
  if (route.type === "creative-review") {
    return <CreativeReviewDesk workspaceId={route.workspaceId} />;
  }
  if (route.type === "data-dashboard") {
    return <DataDashboardPage workspaceId={route.workspaceId} />;
  }
  if (route.type === "missing-workspace") {
    return <div className="workspace-layout__empty">未指定工作区</div>;
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
