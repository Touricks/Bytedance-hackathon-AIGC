import { useState, useEffect } from "react";
import { FolderOpen, Plus } from "lucide-react";
import {
  listWorkspaces,
  selectWorkspaceDirectory,
  initializeWorkspace,
} from "../lib/api/client.js";
import type { CreativeWorkspace } from "@aigc-video/shared";

function openWorkspace(id: string) {
  window.history.pushState({}, "", `/workspaces/${id}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [workspaces, setWorkspaces] = useState<CreativeWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listWorkspaces();
      setWorkspaces(result.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onCreate = async () => {
    try {
      const picked = await selectWorkspaceDirectory();
      if (picked.directory) {
        const detail = await initializeWorkspace(picked.directory);
        openWorkspace(detail.workspace.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="workspaces-landing">
      <header>
        <h1>AIGC 视频工作区</h1>
        <button onClick={onCreate}>
          <Plus size={16} /> 新建工作区
        </button>
      </header>
      <main>
        {error ? <p className="error">{error}</p> : null}
        {loading ? (
          <p>加载中…</p>
        ) : workspaces.length === 0 ? (
          <p>暂无工作区。点击右上角新建。</p>
        ) : (
          <ul className="workspaces-list">
            {workspaces.map((w) => (
              <li key={w.id}>
                <button onClick={() => openWorkspace(w.id)}>
                  <FolderOpen size={14} /> {w.localPath}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
