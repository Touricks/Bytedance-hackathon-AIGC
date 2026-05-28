import { useEffect, useState } from "react";
import { TopBar } from "./TopBar.js";
import {
  parseWorkspaceUrl,
  buildWorkspaceUrl,
  type FocusedStep,
} from "./state/urlState.js";
import { getFocusStore } from "./state/focusStore.js";
import { LeftRail } from "./LeftRail/LeftRail.js";
import { AssetRail } from "./AssetRail/AssetRail.js";
import { FocusRouter } from "./Focus/FocusRouter.js";

function useUrlState() {
  const [parsed, setParsed] = useState(() =>
    parseWorkspaceUrl(window.location.pathname, window.location.search),
  );
  useEffect(() => {
    const onPop = () =>
      setParsed(
        parseWorkspaceUrl(window.location.pathname, window.location.search),
      );
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // mirror URL into store
  useEffect(() => {
    getFocusStore().setState({ shotId: parsed.shotId, step: parsed.step });
  }, [parsed.shotId, parsed.step]);
  return parsed;
}

export function navigateFocus(input: {
  workspaceId: string;
  shotId: string | null;
  step: FocusedStep | null;
}) {
  const url = buildWorkspaceUrl(input);
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function WorkspaceLayout() {
  const parsed = useUrlState();
  const [traceOpen, setTraceOpen] = useState(false);
  const workspaceId = parsed.workspaceId;
  if (!workspaceId) {
    return <div className="workspace-layout__empty">未指定工作区</div>;
  }
  return (
    <div
      className={`workspace-layout ${traceOpen ? "workspace-layout--trace-open" : ""}`}
    >
      <TopBar
        workspaceLabel={workspaceId}
        activeShotLabel={parsed.shotId}
        onBack={() => {
          window.history.pushState({}, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onToggleTrace={() => setTraceOpen((v) => !v)}
      />
      <aside className="workspace-layout__left-rail">
        <LeftRail workspaceId={workspaceId} />
      </aside>
      <main className="workspace-layout__focus">
        <FocusRouter workspaceId={workspaceId} />
      </main>
      <aside className="workspace-layout__asset-rail">
        <AssetRail workspaceId={workspaceId} />
      </aside>
      {traceOpen ? (
        <aside className="workspace-layout__trace">TraceDrawer (Wave H)</aside>
      ) : null}
    </div>
  );
}
