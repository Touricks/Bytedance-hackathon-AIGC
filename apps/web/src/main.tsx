import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./routes/App.js";
import { Workbench } from "./features/workbench/Workbench.js";
import { CreativeReviewDesk } from "./features/creative-review/CreativeReviewDesk.js";
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
  if (pathname.startsWith("/debug/workbenches/")) {
    const workspaceId = pathname.split("/")[3];
    return workspaceId ? (
      <Workbench workspaceId={workspaceId} />
    ) : (
      <div className="workspace-layout__empty">未指定工作区</div>
    );
  }
  if (pathname.startsWith("/workspaces/")) {
    const workspaceId = pathname.split("/")[2];
    return workspaceId ? (
      <CreativeReviewDesk workspaceId={workspaceId} />
    ) : (
      <div className="workspace-layout__empty">未指定工作区</div>
    );
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
