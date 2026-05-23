import type { CreativeBlueprint, Script, StoryboardShot } from "@aigc-video/shared";

interface ScriptPanelProps {
  script?: Script;
  creativeBlueprint?: CreativeBlueprint;
  shots?: StoryboardShot[];
}

export function ScriptPanel({
  script,
  creativeBlueprint,
  shots = []
}: ScriptPanelProps) {
  if (!script) {
    return (
      <section className="panel muted-panel">
        <h2>剧本与基础分镜</h2>
        <p>任务进入剧本阶段后，这里会展示 2-4 个脚本分镜。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>剧本与基础分镜</h2>
        <span>只读确认 · {shots.length} shots</span>
      </div>
      <p className="narrative">{script.narrative}</p>
      {creativeBlueprint ? (
        <div className="blueprint-meta">
          <span>{creativeBlueprint.visualStyle}</span>
          <span>{creativeBlueprint.coreSellingPoint}</span>
        </div>
      ) : null}
      <div className="shot-list">
        {shots.map((shot) => (
          <article className="shot-card" key={shot.id}>
            <strong>Shot {shot.index}</strong>
            <p>{shot.visualPrompt}</p>
            <small>
              {shot.durationSec}s · {shot.cameraMotion}
            </small>
            <blockquote>{shot.subtitle}</blockquote>
          </article>
        ))}
      </div>
      {creativeBlueprint?.improvementHints.length ? (
        <div className="hint-list">
          <h3>改进提示</h3>
          {creativeBlueprint.improvementHints.map((hint) => (
            <article className="hint-card" key={hint.ifVideoLooksBad}>
              <strong>{hint.ifVideoLooksBad}</strong>
              <p>{hint.suggestedUserAction}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
