import { useState, useEffect } from "react";
import { FolderOpen, Plus } from "lucide-react";
import {
  createWorkspace,
  initializeWorkspace,
  listWorkspaces,
  selectWorkspaceDirectory
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
  const [directory, setDirectory] = useState("");

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

  const onChooseDirectory = async () => {
    try {
      const picked = await selectWorkspaceDirectory();
      if (picked.directory) {
        const detail = await initializeWorkspace(picked.directory);
        openWorkspace(detail.workspace.id);
        return;
      }
      if (picked.cancelled) return;
      setError("当前环境不支持系统目录选择，请输入工作目录路径。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onOpenDirectory = async () => {
    const trimmed = directory.trim();
    if (!trimmed) {
      setError("请输入工作目录路径。");
      return;
    }
    try {
      const detail = await initializeWorkspace(trimmed);
      openWorkspace(detail.workspace.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCreateManaged = async () => {
    try {
      const detail = await createWorkspace();
      openWorkspace(detail.workspace.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="workspaces-landing">
      <header>
        <h1>AIGC 视频工作区</h1>
        <div className="workspaces-landing__actions">
          <button onClick={onChooseDirectory}>
            <FolderOpen size={16} /> 选择工作目录
          </button>
          <button onClick={onCreateManaged}>
            <Plus size={16} /> 新建托管工作区
          </button>
        </div>
      </header>
      <main>
        {error ? <p className="error">{error}</p> : null}
        <form
          className="workspaces-landing__directory-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onOpenDirectory();
          }}
        >
          <label>
            工作目录路径
            <input
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
              placeholder="/Users/carrick/TestWorkspace/Project-AIGC/0526v1"
            />
          </label>
          <button type="submit">打开</button>
        </form>
        {loading ? (
          <p>加载中…</p>
        ) : workspaces.length === 0 ? (
          <p>暂无托管工作区。</p>
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
