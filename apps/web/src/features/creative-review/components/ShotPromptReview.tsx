import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { Ban, CheckCircle2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import {
  validateP0StoryboardScript,
  type ShotPromptVoiceProfile
} from "@aigc-video/shared";
import type { ShotPromptArtifact } from "@aigc-video/shared";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  SHOT_IMAGE_LABELS,
  SHOT_IMAGE_REQUIRED_KEYS,
  SHOT_VIDEO_LABELS,
  SHOT_VIDEO_REQUIRED_KEYS,
  describeVoiceProfile,
  displayValue,
  formGoalToShotPrompt,
  formLayerToShotPrompt,
  goalSectionKey,
  layerSectionKey,
  normalizeVoiceProfile,
  shotDuration,
  shotLayerEntries,
  shotPromptToForm,
  summaryFormToShotPrompt,
  validateLayerFields,
  withDerivedTts,
  type ShotPromptFormState,
  type ShotPromptLayer
} from "../shotPromptForm.js";
import { ProposalPlaceholder, ReviewActionDock } from "./Common.js";

function ShotPromptDict({
  title,
  entries
}: {
  title: string;
  entries: Array<{ key: string; label: string; value: unknown }>;
}) {
  return (
    <section className="shotprompt-dict">
      <h3>{title}</h3>
      {entries.length > 0 ? (
        <dl>
          {entries.map((entry) => (
            <div key={entry.key}>
              <dt>{entry.label}</dt>
              <dd>{displayValue(entry.value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>当前镜头没有独立{title}。</p>
      )}
    </section>
  );
}

function ShotPromptLayerEditor({
  title,
  fields,
  labels,
  requiredKeys,
  errors,
  saveLabel,
  onChange,
  onSave,
  onCancel
}: {
  title: string;
  fields: Record<string, string>;
  labels: Record<string, string>;
  requiredKeys: string[];
  errors: Record<string, string>;
  saveLabel: string;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;
  return (
    <div
      className="shotprompt-layer-editor shotprompt-edit-form__wide"
      role="group"
      aria-label={title}
    >
      <h3>{title}</h3>
      <div className="shotprompt-layer-editor__fields">
        {entries.map(([key, value]) => (
          <TextField
            key={key}
            label={labels[key] ?? key}
            value={value}
            onChange={(event) => onChange(key, event.target.value)}
            multiline
            minRows={value.includes("\n") ? 3 : 1}
            maxRows={6}
            size="small"
            fullWidth
            required={requiredKeys.includes(key)}
            error={Boolean(errors[key])}
            helperText={errors[key] ?? " "}
          />
        ))}
      </div>
      <div className="shotprompt-layer-editor__actions">
        <Button variant="contained" size="small" onClick={onSave}>
          {saveLabel}
        </Button>
        <Button variant="outlined" size="small" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

export function ShotPromptReviewForm({
  artifactId,
  shotPrompt,
  busy,
  onApprove,
  onActionComplete
}: {
  artifactId: string;
  shotPrompt: ShotPromptArtifact;
  busy: boolean;
  onApprove: (data: ShotPromptArtifact) => void;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => shotPromptToForm(shotPrompt));
  const [draft, setDraft] = useState<ShotPromptArtifact>(shotPrompt);
  const [openShotIndex, setOpenShotIndex] = useState(0);
  const [editingSections, setEditingSections] = useState<Record<string, boolean>>({});
  const [sectionErrors, setSectionErrors] = useState<
    Record<string, Record<string, string>>
  >({});
  const [editingSummary, setEditingSummary] = useState(false);

  useEffect(() => {
    setForm(shotPromptToForm(shotPrompt));
    setDraft(shotPrompt);
    setOpenShotIndex(0);
    setEditingSections({});
    setSectionErrors({});
    setEditingSummary(false);
  }, [artifactId, shotPrompt]);

  const update = (
    key: keyof Omit<ShotPromptFormState, "shots" | "voiceProfile">,
    value: string
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateVoiceProfile = <K extends keyof ShotPromptVoiceProfile>(
    key: K,
    value: ShotPromptVoiceProfile[K]
  ) => {
    setForm((current) => ({
      ...current,
      voiceProfile: {
        ...current.voiceProfile,
        [key]: value
      }
    }));
  };

  const updateShotLayer = (
    index: number,
    layer: ShotPromptLayer,
    key: string,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index
          ? { ...shot, [layer]: { ...shot[layer], [key]: value } }
          : shot
      )
    }));
  };

  const updateShotGoal = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, providerPrompt: value } : shot
      )
    }));
  };

  const toggleGoalEditor = (index: number) => {
    const key = goalSectionKey(index);
    setOpenShotIndex(index);
    setEditingSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const toggleLayerEditor = (index: number, layer: ShotPromptLayer) => {
    const key = layerSectionKey(index, layer);
    setOpenShotIndex(index);
    setEditingSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const saveSummaryDraft = () => {
    setDraft((current) => summaryFormToShotPrompt(form, current));
  };

  const saveGoalDraft = (index: number) => {
    const key = goalSectionKey(index);
    const providerPrompt = form.shots[index]?.providerPrompt ?? "";
    const errors: Record<string, string> = providerPrompt.trim()
      ? {}
      : { providerPrompt: "必填" };
    setSectionErrors((current) => ({ ...current, [key]: errors }));
    if (Object.keys(errors).length > 0) return;
    setDraft((current) => formGoalToShotPrompt(form, current, index));
    setEditingSections((current) => ({ ...current, [key]: false }));
  };

  const saveLayerDraft = (index: number, layer: ShotPromptLayer) => {
    const key = layerSectionKey(index, layer);
    const errors = validateLayerFields(form.shots[index]?.[layer] ?? {}, layer);
    setSectionErrors((current) => ({ ...current, [key]: errors }));
    if (Object.keys(errors).length > 0) return;
    setDraft((current) => formLayerToShotPrompt(form, current, index, layer));
    setEditingSections((current) => ({ ...current, [key]: false }));
  };

  const cancelGoalEdit = (index: number) => {
    const reset = shotPromptToForm(draft);
    const key = goalSectionKey(index);
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index
          ? {
              ...shot,
              providerPrompt: reset.shots[index]?.providerPrompt ?? shot.providerPrompt
            }
          : shot
      )
    }));
    setSectionErrors((current) => ({ ...current, [key]: {} }));
    setEditingSections((current) => ({ ...current, [key]: false }));
  };

  const cancelLayerEdit = (index: number, layer: ShotPromptLayer) => {
    const reset = shotPromptToForm(draft);
    const key = layerSectionKey(index, layer);
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index
          ? { ...shot, [layer]: reset.shots[index]?.[layer] ?? shot[layer] }
          : shot
      )
    }));
    setSectionErrors((current) => ({ ...current, [key]: {} }));
    setEditingSections((current) => ({ ...current, [key]: false }));
  };

  const approveDraft = () => {
    const nextDraft = withDerivedTts(draft);
    setDraft(nextDraft);
    onApprove(nextDraft);
    onActionComplete();
  };
  const summaryEditorId = "shotprompt-summary-editor";
  const draftVoiceProfile = normalizeVoiceProfile(draft.tts.voiceProfile);

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>分镜生成要求</h1>
      </div>
      <div className="shotprompt-summary">
        <div className="shotprompt-summary__metric">
          <span>总时长</span>
          <strong>{draft.durationSec}s</strong>
        </div>
        <div className="shotprompt-summary__metric">
          <span>画幅</span>
          <strong>{draft.aspectRatio}</strong>
        </div>
        <div className="shotprompt-summary__text">
          <span>全片生成要求</span>
          <p>{draft.prompt}</p>
        </div>
        <div className="shotprompt-summary__text">
          <span>负向约束</span>
          <p>{draft.negativePrompt || "未填写"}</p>
        </div>
        <div className="shotprompt-summary__text">
          <span>口播声音</span>
          <p>{describeVoiceProfile(draftVoiceProfile)}</p>
        </div>
        <div className="shotprompt-summary__actions">
          <button
            type="button"
            className="review-secondary"
            onClick={() => setEditingSummary((current) => !current)}
            aria-expanded={editingSummary}
            aria-controls={summaryEditorId}
          >
            <FileText size={16} />
            {editingSummary ? "收起全片要求" : "编辑全片要求"}
          </button>
        </div>
      </div>
      <Collapse in={editingSummary} timeout="auto" unmountOnExit>
        <div
          id={summaryEditorId}
          className="review-business-form"
          aria-label="全片分镜生成要求表单"
        >
          <label>
            画幅
            <select
              value={form.aspectRatio}
              onChange={(event) =>
                update(
                  "aspectRatio",
                  event.target.value as ShotPromptArtifact["aspectRatio"]
                )
              }
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <label>
            口播音色
            <select
              value={form.voiceProfile.gender}
              onChange={(event) =>
                updateVoiceProfile(
                  "gender",
                  event.target.value as ShotPromptVoiceProfile["gender"]
                )
              }
            >
              <option value="female">女声</option>
              <option value="male">男声</option>
            </select>
          </label>
          <label>
            声调
            <select
              value={form.voiceProfile.pitch}
              onChange={(event) =>
                updateVoiceProfile(
                  "pitch",
                  event.target.value as ShotPromptVoiceProfile["pitch"]
                )
              }
            >
              <option value="low">低沉</option>
              <option value="medium">自然中声区</option>
              <option value="high">明亮偏高</option>
            </select>
          </label>
          <label>
            语速
            <select
              value={form.voiceProfile.pace}
              onChange={(event) =>
                updateVoiceProfile(
                  "pace",
                  event.target.value as ShotPromptVoiceProfile["pace"]
                )
              }
            >
              <option value="slow">慢速</option>
              <option value="medium">中速</option>
              <option value="fast">中等偏快</option>
            </select>
          </label>
          <label className="review-business-form__wide">
            全片生成要求
            <textarea
              rows={3}
              value={form.prompt}
              onChange={(event) => update("prompt", event.target.value)}
            />
          </label>
          <label className="review-business-form__wide">
            负向约束
            <textarea
              rows={3}
              value={form.negativePrompt}
              onChange={(event) => update("negativePrompt", event.target.value)}
            />
          </label>
          <label className="review-business-form__wide">
            口播语气
            <textarea
              rows={2}
              value={form.voiceProfile.tone}
              onChange={(event) => updateVoiceProfile("tone", event.target.value)}
            />
          </label>
          <div className="review-panel__actions review-business-form__wide">
            <button
              type="button"
              className="review-secondary"
              onClick={() => {
                saveSummaryDraft();
                setEditingSummary(false);
              }}
            >
              <CheckCircle2 size={16} />
              保存全片要求
            </button>
          </div>
        </div>
      </Collapse>
      <div className="shotprompt-list">
        {draft.shots.map((shot, index) => {
          const formShot = form.shots[index];
          const isOpen = openShotIndex === index;
          const goalKey = goalSectionKey(index);
          const imageSectionKey = layerSectionKey(index, "shotImage");
          const videoSectionKey = layerSectionKey(index, "shotVideo");
          const isEditingGoal = Boolean(editingSections[goalKey]);
          const isEditingImage = Boolean(editingSections[imageSectionKey]);
          const isEditingVideo = Boolean(editingSections[videoSectionKey]);
          const imageEntries = shotLayerEntries(shot, "shotImage");
          const videoEntries = shotLayerEntries(shot, "shotVideo");
          const panelId = `shotprompt-shot-${index}-body`;
          return (
            <article key={`${shot.index}:${index}`} className="shotprompt-card">
              <div className="shotprompt-card__head">
                <button
                  type="button"
                  className="shotprompt-card__toggle"
                  onClick={() => setOpenShotIndex(isOpen ? -1 : index)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span className="shotprompt-card__index">{shot.index}</span>
                  <span className="shotprompt-card__title">
                    <strong>分镜 {index + 1}</strong>
                    <em>
                      {shot.startSec}-{shot.endSec}s · {shotDuration(shot)}s
                    </em>
                    <small>{shot.voiceover}</small>
                  </span>
                  {isOpen ? (
                    <ChevronDown size={16} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={16} aria-hidden="true" />
                  )}
                </button>
                <div className="shotprompt-card__actions">
                  <button
                    type="button"
                    className="review-secondary"
                    onClick={() => toggleGoalEditor(index)}
                  >
                    <FileText size={16} />
                    {isEditingGoal ? "收起镜头目标" : "编辑镜头目标"}
                  </button>
                  <button
                    type="button"
                    className="review-secondary"
                    onClick={() => toggleLayerEditor(index, "shotImage")}
                  >
                    <FileText size={16} />
                    {isEditingImage ? "收起分镜图要求" : "编辑分镜图要求"}
                  </button>
                  <button
                    type="button"
                    className="review-secondary"
                    onClick={() => toggleLayerEditor(index, "shotVideo")}
                  >
                    <FileText size={16} />
                    {isEditingVideo ? "收起分镜视频要求" : "编辑分镜视频要求"}
                  </button>
                </div>
              </div>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <Stack
                  id={panelId}
                  className="shotprompt-card__body"
                  spacing={1.75}
                  useFlexGap
                >
                  {shot.referenceAssetRefs.length > 0 ? (
                    <Box className="shotprompt-assets">
                      <span>参考素材</span>
                      {shot.referenceAssetRefs.map((assetRef) => (
                        <code key={assetRef}>{assetRef}</code>
                      ))}
                    </Box>
                  ) : null}
                  <Box className="shotprompt-goal-section">
                    <div className="shotprompt-provider">
                      <span>镜头目标</span>
                      <p>{shot.providerPrompt}</p>
                    </div>
                    <Collapse
                      in={isEditingGoal && Boolean(formShot)}
                      timeout="auto"
                      unmountOnExit
                      sx={{ width: 1 }}
                    >
                      {formShot ? (
                        <div
                          className="shotprompt-layer-editor shotprompt-edit-form__wide shotprompt-goal-editor"
                          role="group"
                          aria-label={`编辑分镜 ${index + 1} 镜头目标`}
                        >
                          <h3>编辑分镜 {index + 1} 镜头目标</h3>
                          <TextField
                            label="镜头目标"
                            value={formShot.providerPrompt}
                            onChange={(event) =>
                              updateShotGoal(index, event.target.value)
                            }
                            multiline
                            minRows={3}
                            maxRows={8}
                            size="small"
                            fullWidth
                            required
                            error={Boolean(sectionErrors[goalKey]?.providerPrompt)}
                            helperText={sectionErrors[goalKey]?.providerPrompt ?? " "}
                          />
                          <div className="shotprompt-layer-editor__actions">
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => saveGoalDraft(index)}
                            >
                              保存镜头目标
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => cancelGoalEdit(index)}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </Collapse>
                  </Box>
                  <Box className="shotprompt-requirement-grid">
                    <Box className="shotprompt-requirement-column shotprompt-requirement-column--image">
                      <ShotPromptDict title="分镜图要求" entries={imageEntries} />
                      <Collapse
                        in={isEditingImage && Boolean(formShot)}
                        timeout="auto"
                        unmountOnExit
                      >
                        {formShot ? (
                          <ShotPromptLayerEditor
                            title={`编辑分镜 ${index + 1} 分镜图要求`}
                            fields={formShot.shotImage}
                            labels={SHOT_IMAGE_LABELS}
                            requiredKeys={SHOT_IMAGE_REQUIRED_KEYS}
                            errors={sectionErrors[imageSectionKey] ?? {}}
                            saveLabel="保存分镜图要求"
                            onChange={(key, value) =>
                              updateShotLayer(index, "shotImage", key, value)
                            }
                            onSave={() => saveLayerDraft(index, "shotImage")}
                            onCancel={() => cancelLayerEdit(index, "shotImage")}
                          />
                        ) : null}
                      </Collapse>
                    </Box>
                    <Box className="shotprompt-requirement-column shotprompt-requirement-column--video">
                      <ShotPromptDict title="分镜视频要求" entries={videoEntries} />
                      <Collapse
                        in={isEditingVideo && Boolean(formShot)}
                        timeout="auto"
                        unmountOnExit
                      >
                        {formShot ? (
                          <ShotPromptLayerEditor
                            title={`编辑分镜 ${index + 1} 分镜视频要求`}
                            fields={formShot.shotVideo}
                            labels={SHOT_VIDEO_LABELS}
                            requiredKeys={SHOT_VIDEO_REQUIRED_KEYS}
                            errors={sectionErrors[videoSectionKey] ?? {}}
                            saveLabel="保存分镜视频要求"
                            onChange={(key, value) =>
                              updateShotLayer(index, "shotVideo", key, value)
                            }
                            onSave={() => saveLayerDraft(index, "shotVideo")}
                            onCancel={() => cancelLayerEdit(index, "shotVideo")}
                          />
                        ) : null}
                      </Collapse>
                    </Box>
                  </Box>
                </Stack>
              </Collapse>
            </article>
          );
        })}
      </div>
      <ReviewActionDock>
        <button
          type="button"
          className="review-primary"
          onClick={approveDraft}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准分镜生成要求
        </button>
      </ReviewActionDock>
    </section>
  );
}

function P0StoryboardRequiredPanel({ issues }: { issues: Array<{ message: string }> }) {
  const issueText = issues
    .slice(0, 2)
    .map((issue) => issue.message)
    .join(" ");
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>分镜生成要求</h1>
      </div>
      <div className="review-empty-state">
        <Ban size={22} />
        <strong>请先批准三镜分镜脚本。</strong>
        <span>
          当前生效的分镜脚本仍是旧结构。回到分镜脚本模块，确认三镜整理稿并点击批准生效。
        </span>
        {issueText ? <span>{issueText}</span> : null}
      </div>
    </section>
  );
}

export function ShotPromptReview({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.shotPrompt;
  const storyboardValidation = vm.artifacts.storyboard
    ? validateP0StoryboardScript(vm.artifacts.storyboard.data)
    : null;
  const pending = Boolean(vm.pending?.shotPrompt);
  if (storyboardValidation && !storyboardValidation.valid) {
    return <P0StoryboardRequiredPanel issues={storyboardValidation.issues} />;
  }
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="分镜生成要求"
        actionLabel={pending ? "正在生成分镜生成要求..." : "生成分镜生成要求"}
        busy={vm.busy || pending}
        onAction={() => {
          vm.actions.compileShotPrompt();
          onActionComplete();
        }}
      />
    );
  }
  const shotPrompt = artifact.data;
  return (
    <ShotPromptReviewForm
      artifactId={artifact.id}
      shotPrompt={shotPrompt}
      busy={vm.busy}
      onApprove={vm.actions.approveShotPromptData}
      onActionComplete={onActionComplete}
    />
  );
}
