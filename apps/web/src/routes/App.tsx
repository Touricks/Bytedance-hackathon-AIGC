import { useState, useEffect } from "react";
import { ArrowRight, FolderOpen, Plus, RotateCcw } from "lucide-react";
import {
  initializeWorkspace,
  listWorkspaces,
  selectWorkspaceDirectory
} from "../lib/api/client.js";
import type { DiscoveredWorkspace } from "../lib/api/client.js";
import type { CreativeWorkspace } from "@aigc-video/shared";

function openWorkspace(id: string) {
  window.history.pushState({}, "", `/workspaces/${id}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [workspaces, setWorkspaces] = useState<CreativeWorkspace[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState("");
  const latestWorkspace = [...workspaces].sort(
    (a, b) =>
      new Date(b.lastSeenAt ?? b.updatedAt).getTime() -
      new Date(a.lastSeenAt ?? a.updatedAt).getTime(),
  )[0];

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listWorkspaces();
      setWorkspaces(result.workspaces);
      setDiscovered(result.discovered ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openDirectory = async (path: string) => {
    setError(null);
    try {
      const detail = await initializeWorkspace(path);
      openWorkspace(detail.workspace.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onChooseDirectory = async () => {
    setError(null);
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
    await openDirectory(trimmed);
  };

  const onCreateManaged = async () => {
    await onChooseDirectory();
  };

  return (
    <div className="workspaces-landing">
      <header>
        <div>
          <span className="workspaces-landing__eyebrow">Daireel 创作入口</span>
          <h1>AIGC 视频工作区</h1>
          <p>启动会话后进入创作审核台，从创作要求和素材上传开始。</p>
        </div>
      </header>
      <main>
        {error ? <p className="error">{error}</p> : null}
        <section className="workspaces-launcher" aria-label="会话启动">
          <div className="workspaces-launcher__primary">
            <span>新会话</span>
            <strong>启动创作会话</strong>
            <p>选择工作目录后进入创作审核台。</p>
          </div>
          <button
            type="button"
            className="workspaces-landing__primary"
            onClick={onCreateManaged}
            disabled={loading}
          >
            <Plus size={18} />
            启动创作会话
          </button>
          {latestWorkspace ? (
            <button
              type="button"
              className="workspaces-landing__secondary"
              onClick={() => openWorkspace(latestWorkspace.id)}
            >
              <RotateCcw size={16} />
              继续最近会话
              <ArrowRight size={16} />
            </button>
          ) : null}
        </section>
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
              placeholder="输入工作目录的绝对路径，例如 …/Project-AIGC/my-draft"
            />
          </label>
          <div className="workspaces-landing__form-actions">
            <button type="button" onClick={onChooseDirectory}>
              <FolderOpen size={16} />
              选择
            </button>
            <button type="submit">打开</button>
          </div>
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
        {discovered.length > 0 ? (
          <section className="workspaces-discovered" aria-label="本地草稿">
            <h2>本地草稿（未登记）</h2>
            <p>
              在磁盘上发现了 .daireel 工作区，但未登记到数据库（例如数据库被重置）。点击可重新打开并复用原工作区
              id。
            </p>
            <ul className="workspaces-list">
              {discovered.map((d) => (
                <li key={d.localPath}>
                  <button onClick={() => openDirectory(d.localPath)}>
                    <FolderOpen size={14} /> {d.localPath}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
