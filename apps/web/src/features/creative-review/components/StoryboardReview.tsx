import { useEffect, useMemo, useRef, useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import TextField from "@mui/material/TextField";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
  Wand2
} from "lucide-react";
import {
  STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
  STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
  redistributeP0StoryboardDurations,
  storyboardScriptVoiceoverCount,
  storyboardScriptVoiceoverLimit,
  validateP0StoryboardScript
} from "@aigc-video/shared";
import type { StoryboardArtifact } from "@aigc-video/shared";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  applyStoryboardDurationAllocation,
  formToStoryboard,
  normalizeStoryboardPurpose,
  storyboardPurposeLabel,
  storyboardTiming,
  storyboardToForm,
  type StoryboardFormState,
  type StoryboardShotFormState
} from "../storyboardForm.js";
import { ProposalPlaceholder } from "./Common.js";

export function StoryboardReviewForm({
  artifactId,
  storyboard,
  busy,
  voiceoverGenerating,
  onGenerateVoiceover,
  onApprove,
  onActionComplete
}: {
  artifactId: string;
  storyboard: StoryboardArtifact;
  busy: boolean;
  voiceoverGenerating: boolean;
  onGenerateVoiceover: (input: {
    baseArtifactId?: string;
    draft: StoryboardArtifact;
  }) => void;
  onApprove: (data: StoryboardArtifact) => void;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => storyboardToForm(storyboard));
  const [structureEditorOpen, setStructureEditorOpen] = useState(false);
  const [openStructureShotIndex, setOpenStructureShotIndex] = useState<number | null>(
    null
  );
  const [draggingDividerIndex, setDraggingDividerIndex] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const draft = useMemo(() => formToStoryboard(form, storyboard), [form, storyboard]);
  const timing = useMemo(() => storyboardTiming(draft.shots), [draft.shots]);
  const validation = useMemo(() => validateP0StoryboardScript(draft), [draft]);

  useEffect(() => {
    setForm(storyboardToForm(storyboard));
    setStructureEditorOpen(false);
    setOpenStructureShotIndex(null);
  }, [artifactId, storyboard]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const update = (key: keyof Omit<StoryboardFormState, "shots">, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateShot = (
    index: number,
    key: keyof StoryboardShotFormState,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, [key]: value } : shot
      )
    }));
  };

  const generateVoiceoversByRatio = () => {
    if (voiceoverGenerating) return;
    onGenerateVoiceover({
      baseArtifactId: artifactId,
      draft
    });
  };

  const applyDurations = (durations: readonly number[]) => {
    setForm((current) => applyStoryboardDurationAllocation(current, durations));
  };

  const nudgeDurationDivider = (dividerIndex: number, deltaSec: number) => {
    applyDurations(
      redistributeP0StoryboardDurations(
        draft.shots.map((shot) => shot.durationSec),
        dividerIndex,
        deltaSec
      )
    );
  };

  const beginDurationDrag = (dividerIndex: number, startClientX: number) => {
    const timelineWidth = timelineRef.current?.getBoundingClientRect().width ?? 0;
    if (timelineWidth <= 0) return;

    dragCleanupRef.current?.();
    setDraggingDividerIndex(dividerIndex);
    const startDurations = draft.shots.map((shot) => shot.durationSec);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.userSelect = previousUserSelect;
      setDraggingDividerIndex(null);
      dragCleanupRef.current = null;
    };
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      const deltaSec =
        ((event.clientX - startClientX) / timelineWidth) *
        STORYBOARD_SCRIPT_TOTAL_DURATION_SEC;
      applyDurations(
        redistributeP0StoryboardDurations(startDurations, dividerIndex, deltaSec)
      );
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", cleanup, { once: true });
    window.addEventListener("pointercancel", cleanup, { once: true });
  };

  const canApprove = !busy && !voiceoverGenerating && validation.valid;
  const validationSummary = validation.issues
    .slice(0, 3)
    .map((issue) => issue.message)
    .join(" ");

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>待审创作产物</span>
        <h1>分镜脚本</h1>
        <p>确认每段讲什么、讲多久，以及口播是否能在时长内说完。</p>
      </div>

      <section
        className="storyboard-plan"
        aria-label="分镜脚本摘要"
        aria-busy={voiceoverGenerating}
      >
        <div className="storyboard-plan__topline">
          <div>
            <span>叙事结构</span>
            <p>{draft.narrative}</p>
          </div>
          <div className="storyboard-plan__stats">
            <span>{STORYBOARD_SCRIPT_TOTAL_DURATION_SEC}s</span>
            <span>{draft.shots.length} 镜</span>
          </div>
        </div>
        <div className="storyboard-timeline" ref={timelineRef} aria-label="分镜时间轴">
          {draft.shots.map((shot, index) => (
            <article
              key={`${shot.index}-${index}`}
              className={`storyboard-timeline__beat ${
                draggingDividerIndex === index || draggingDividerIndex === index - 1
                  ? "storyboard-timeline__beat--dragging"
                  : ""
              }`}
              style={{ flexGrow: Math.max(shot.durationSec, 1) }}
            >
              <span>
                {timing[index]?.start ?? 0}-{timing[index]?.end ?? shot.durationSec}s
              </span>
              <strong>{storyboardPurposeLabel(shot.purpose)}</strong>
              <em>
                {shot.durationSec}s ·{" "}
                {Math.round(
                  (shot.durationSec / STORYBOARD_SCRIPT_TOTAL_DURATION_SEC) * 100
                )}
                %
              </em>
              {index > 0 ? (
                <button
                  type="button"
                  className="storyboard-timeline__handle storyboard-timeline__handle--left"
                  aria-label={`调整第 ${index} 和第 ${index + 1} 段时长`}
                  title="拖动分配相邻段时长"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    beginDurationDrag(index - 1, event.clientX);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      nudgeDurationDivider(index - 1, -1);
                    }
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      nudgeDurationDivider(index - 1, 1);
                    }
                  }}
                />
              ) : null}
              {index < draft.shots.length - 1 ? (
                <button
                  type="button"
                  className="storyboard-timeline__handle storyboard-timeline__handle--right"
                  aria-label={`调整第 ${index + 1} 和第 ${index + 2} 段时长`}
                  title="拖动分配相邻段时长"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    beginDurationDrag(index, event.clientX);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      nudgeDurationDivider(index, -1);
                    }
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      nudgeDurationDivider(index, 1);
                    }
                  }}
                />
              ) : null}
            </article>
          ))}
        </div>
        <div className="storyboard-ratio-action">
          <Button
            type="button"
            variant="contained"
            size="small"
            startIcon={
              voiceoverGenerating ? (
                <RefreshCw className="spin" size={15} />
              ) : (
                <Wand2 size={15} />
              )
            }
            disabled={busy || voiceoverGenerating}
            onClick={generateVoiceoversByRatio}
          >
            {voiceoverGenerating ? "正在生成..." : "按比例生成剧本文案"}
          </Button>
          <span>
            {voiceoverGenerating
              ? "生成完成前保留当前口播，不会更新字数与草稿。"
              : "按当前时长比例调用模型重写每段口播。"}
          </span>
          <span className="storyboard-duration-hint">单个场景必须保持在 4-12s 之间</span>
        </div>
      </section>

      <section className="storyboard-script-list" aria-label="口播文案">
        {draft.shots.map((shot, index) => {
          const count = storyboardScriptVoiceoverCount(shot.voiceover);
          const limit = storyboardScriptVoiceoverLimit(shot.durationSec);
          const overLimit = count > limit;
          return (
            <article
              key={`${shot.index}-${index}`}
              className={`storyboard-script-row ${
                overLimit ? "storyboard-script-row--invalid" : ""
              }`}
            >
              <div className="storyboard-script-row__meta">
                <span className="storyboard-row__index">{index + 1}</span>
                <div>
                  <strong>{storyboardPurposeLabel(shot.purpose)}</strong>
                  <em>
                    {timing[index]?.start ?? 0}-{timing[index]?.end ?? shot.durationSec}s
                    {" · "}
                    {shot.durationSec}s
                  </em>
                </div>
              </div>
              <div className="storyboard-script-row__current">
                <div>
                  <span>当前口播</span>
                  <p>{shot.voiceover || "未填写口播"}</p>
                </div>
                <div>
                  <span>画面意图</span>
                  <p>{shot.scene || "未填写画面意图"}</p>
                </div>
              </div>
              <div
                className={`storyboard-voiceover-count ${
                  overLimit ? "storyboard-voiceover-count--invalid" : ""
                }`}
              >
                <span>{overLimit ? "偏长" : "节奏合适"}</span>
                <strong>
                  {count} / {limit} 字
                </strong>
              </div>
              <Accordion
                className="storyboard-script-editor"
                disableGutters
                elevation={0}
              >
                <AccordionSummary
                  expandIcon={<ChevronDown size={16} />}
                  aria-controls={`storyboard-script-editor-${index}`}
                  id={`storyboard-script-editor-summary-${index}`}
                >
                  编辑口播与画面意图
                </AccordionSummary>
                <AccordionDetails id={`storyboard-script-editor-${index}`}>
                  <TextField
                    label="口播文案"
                    value={form.shots[index]?.voiceover ?? ""}
                    onChange={(event) =>
                      updateShot(index, "voiceover", event.target.value)
                    }
                    multiline
                    minRows={2}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="画面意图"
                    value={form.shots[index]?.scene ?? ""}
                    onChange={(event) => updateShot(index, "scene", event.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                    size="small"
                  />
                </AccordionDetails>
              </Accordion>
            </article>
          );
        })}
      </section>

      {!validation.valid ? (
        <div className="review-validation-alert" role="status">
          <Ban size={16} />
          <span>{validationSummary}</span>
        </div>
      ) : null}

      <section className="storyboard-edit" aria-label="调整分镜结构">
        <button
          type="button"
          className="storyboard-edit__toggle"
          onClick={() => setStructureEditorOpen((current) => !current)}
          aria-expanded={structureEditorOpen}
          aria-controls="storyboard-structure-editor"
        >
          <span className="storyboard-edit__title">
            <FileText size={16} />
            <span>
              <strong>调整分镜结构</strong>
              <em>低频编辑：叙事、素材、画面方向与转场</em>
            </span>
          </span>
          {structureEditorOpen ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} aria-hidden="true" />
          )}
        </button>
        <Collapse in={structureEditorOpen} timeout="auto" unmountOnExit>
          <div id="storyboard-structure-editor" className="storyboard-edit__body">
            <div className="storyboard-edit__global">
              <div className="storyboard-edit__section-title">
                <strong>全局结构</strong>
                <span>影响整条片子的叙事和总时长</span>
              </div>
              <div className="review-business-form" aria-label="分镜脚本表单">
                <label className="review-business-form__wide">
                  分镜叙事
                  <textarea
                    rows={3}
                    value={form.narrative}
                    onChange={(event) => update("narrative", event.target.value)}
                  />
                </label>
                <label>
                  分镜假设
                  <textarea
                    rows={3}
                    value={form.assumptions}
                    onChange={(event) => update("assumptions", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="storyboard-shot-editor-list">
              {form.shots.map((shot, index) => {
                const currentPurpose =
                  storyboard.shots[index]?.purpose ??
                  storyboard.shots[0]?.purpose ??
                  "hook";
                const purpose = normalizeStoryboardPurpose(shot.purpose, currentPurpose);
                const isOpen = openStructureShotIndex === index;
                const panelId = `storyboard-structure-shot-${index}`;
                return (
                  <article key={index} className="storyboard-shot-editor">
                    <button
                      type="button"
                      className="storyboard-shot-editor__toggle"
                      onClick={() => setOpenStructureShotIndex(isOpen ? null : index)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                    >
                      <span className="storyboard-row__index">{index + 1}</span>
                      <span className="storyboard-shot-editor__summary">
                        <strong>{storyboardPurposeLabel(purpose)}</strong>
                        <em>{shot.durationSec || "0"}s</em>
                        <small>
                          {shot.scene || shot.visualDirection || "未填写画面意图"}
                        </small>
                      </span>
                      {isOpen ? (
                        <ChevronDown size={16} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={16} aria-hidden="true" />
                      )}
                    </button>
                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                      <fieldset id={panelId} className="review-shot-form">
                        <legend>分镜 {index + 1}</legend>
                        <label>
                          分镜 {index + 1} 目的
                          <select
                            value={shot.purpose}
                            onChange={(event) =>
                              updateShot(index, "purpose", event.target.value)
                            }
                          >
                            <option value="hook">开场钩子</option>
                            <option value="proof">卖点证明</option>
                            <option value="cta">行动号召</option>
                          </select>
                        </label>
                        <label>
                          分镜 {index + 1} 时长
                          <input
                            type="number"
                            min={STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC}
                            value={shot.durationSec}
                            onChange={(event) =>
                              updateShot(index, "durationSec", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          分镜 {index + 1} 场景
                          <textarea
                            rows={2}
                            value={shot.scene}
                            onChange={(event) =>
                              updateShot(index, "scene", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          分镜 {index + 1} 画面方向
                          <textarea
                            rows={2}
                            value={shot.visualDirection}
                            onChange={(event) =>
                              updateShot(index, "visualDirection", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          分镜 {index + 1} 素材
                          <input
                            value={shot.productAssetRef}
                            onChange={(event) =>
                              updateShot(index, "productAssetRef", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          分镜 {index + 1} 转场
                          <input
                            value={shot.transition}
                            onChange={(event) =>
                              updateShot(index, "transition", event.target.value)
                            }
                          />
                        </label>
                      </fieldset>
                    </Collapse>
                  </article>
                );
              })}
            </div>
          </div>
        </Collapse>
      </section>

      <div className="storyboard-approve-dock">
        <button
          type="button"
          className="review-primary"
          onClick={() => {
            onApprove(draft);
            onActionComplete();
          }}
          disabled={!canApprove}
        >
          <CheckCircle2 size={16} />
          批准生效
        </button>
      </div>
    </section>
  );
}

export function StoryboardReview({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.storyboard;
  const pending = Boolean(vm.pending?.storyboard);
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="分镜脚本"
        description={
          pending
            ? "系统正在根据已批准的商品卖点生成分镜脚本，完成后会停在这里供你审核。"
            : "商品卖点批准后，生成视频口播、节奏和画面意图。"
        }
        actionLabel={pending ? "正在生成分镜脚本..." : "生成分镜脚本"}
        busy={vm.busy || pending}
        onAction={() => {
          vm.actions.proposeStoryboard();
          onActionComplete();
        }}
      />
    );
  }
  const storyboard = artifact.data;
  return (
    <StoryboardReviewForm
      artifactId={artifact.id}
      storyboard={storyboard}
      busy={vm.busy}
      voiceoverGenerating={Boolean(vm.pending?.storyboardVoiceover)}
      onGenerateVoiceover={vm.actions.proposeStoryboardVoiceover}
      onApprove={vm.actions.approveStoryboardAndProposeShotPrompt}
      onActionComplete={onActionComplete}
    />
  );
}
