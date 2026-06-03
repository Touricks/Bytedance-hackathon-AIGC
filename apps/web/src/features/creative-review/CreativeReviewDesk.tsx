import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  MessageSquare,
  PackageCheck,
  Play,
  RefreshCw,
  Send,
  Tags,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import {
  STORYBOARD_SCRIPT_DEFAULT_DURATIONS,
  STORYBOARD_SCRIPT_DEFAULT_PURPOSES,
  STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
  STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
  DEFAULT_SHOT_PROMPT_VOICE_PROFILE,
  redistributeP0StoryboardDurations,
  storyboardScriptVoiceoverCount,
  storyboardScriptVoiceoverLimit,
  validateP0StoryboardScript,
  type ShotPromptVoiceProfile,
} from "@aigc-video/shared";
import type {
  CreativeRequirementTemplate,
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import {
  toAbsoluteAssetUrl,
  toWorkspaceMaterialUrl,
  deleteWorkspaceMaterial,
  importReferenceVideoRequirements,
  listCreativeRequirementTemplates,
  type PromptRequirementsData,
  type ProposeWorkspaceBriefInput,
  type ReferenceVideoRequirementsImportResult,
  uploadWorkspaceMaterial,
  workspaceMaterialFileRejectionReason,
} from "../../lib/api/client.js";
import type { ShotSetShot } from "../../lib/api/shots.js";
import { materialAssetFilename } from "../../lib/materials.js";
import { shotStatusLabel } from "../../lib/shotStatusLabel.js";
import type { WorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";
import { useWorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";
import {
  canConfirmSelection,
  isSelectableCandidate,
  stageCandidate,
} from "./imageSelection.js";
import {
  canOpenReviewStep,
  deriveActiveStep,
  deriveCreativeActivity,
  deriveReviewStepIndicators,
  isTerminalReady,
  materialDeleteResetConfirmMessage,
  shouldResetFlowAfterMaterialDelete,
  statusTone,
  type ReviewStepId,
} from "./reviewFlow.js";
import {
  deriveMaterialPreviewMode,
  materialPreviewModeLabel,
  type MaterialPreviewMode,
} from "./materialPreview.js";
import {
  briefToForm,
  buildProductBriefRegenerationInput,
  formToBrief,
  type ProductBriefFormState,
} from "./productBriefForm.js";

function backToWorkspaces() {
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function shortEntityId(id: string | null | undefined) {
  if (!id) return "未创建";
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatReviewTime(value: string | null | undefined) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShotDuration(shot: Pick<ShotSetShot, "defaultDurationSec">) {
  return typeof shot.defaultDurationSec === "number"
    ? `约 ${Math.round(shot.defaultDurationSec)} 秒`
    : "时长待定";
}

function cssAspectRatio(value: string | null | undefined) {
  const match = value?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return `${width} / ${height}`;
}

function MaterialAssetPreview({
  kind,
  src,
  filename,
  className,
}: {
  kind: MaterialIntakeArtifact["assets"][number]["kind"];
  src: string;
  filename: string;
  className: string;
}) {
  const [mode, setMode] = useState<MaterialPreviewMode>(() =>
    deriveMaterialPreviewMode({ kind }),
  );

  useEffect(() => {
    setMode(deriveMaterialPreviewMode({ kind }));
  }, [kind, src]);

  return (
    <div
      className={`material-asset-preview material-asset-preview--${mode} ${className}`}
      data-preview-mode={mode}
    >
      {kind === "image" ? (
        <img
          src={src}
          alt={filename}
          onLoad={(event) => {
            const image = event.currentTarget;
            setMode(
              deriveMaterialPreviewMode({
                kind,
                width: image.naturalWidth,
                height: image.naturalHeight,
              }),
            );
          }}
        />
      ) : (
        <div
          className="material-asset-preview__file-cover"
          aria-label={`${filename} 文件封面`}
        >
          <FileText size={22} />
        </div>
      )}
      <span className="material-asset-preview__badge">
        {materialPreviewModeLabel(mode)}
      </span>
    </div>
  );
}

function StepRail({
  vm,
  active,
  defaultStep,
  onSelect,
  onShotSelect,
}: {
  vm: WorkbenchViewModel;
  active: ReviewStepId;
  defaultStep: ReviewStepId;
  onSelect: (step: ReviewStepId) => void;
  onShotSelect: (shotId: string) => void;
}) {
  const steps = deriveReviewStepIndicators(vm);

  return (
    <aside className="review-rail">
      <div className="review-rail__brand">
        <Layers3 size={18} />
        <div>
          <span>创作审核台</span>
        </div>
      </div>
      <ol className="review-steps">
        {steps.map((step, index) => {
          const reachable = canOpenReviewStep(vm, step.id, defaultStep);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`review-step ${active === step.id ? "review-step--active" : ""} ${
                  reachable ? "" : "review-step--locked"
                }`}
                disabled={!reachable}
                onClick={() => onSelect(step.id)}
                aria-current={active === step.id ? "step" : undefined}
              >
                <span className="review-step__index">{index + 1}</span>
                <span className="review-step__label">{step.label}</span>
                <span
                  className={`review-step__state review-step__state--${step.tone}`}
                >
                  {step.state}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {vm.shots.length > 0 ? (
        <section className="review-shot-nav">
          <h3>分镜列表</h3>
          {vm.shots.map((shot) => (
            <button
              key={shot.shotId}
              type="button"
              className={
                shot.shotId === vm.selectedShotId
                  ? "review-shot-nav__item review-shot-nav__item--active"
                  : "review-shot-nav__item"
              }
              onClick={() => onShotSelect(shot.shotId)}
            >
              <span className="review-shot-nav__index">{shot.orderIndex + 1}</span>
              {shot.selectedImageUrl ? (
                <img
                  className="review-shot-nav__thumb"
                  src={toAbsoluteAssetUrl(shot.selectedImageUrl)}
                  alt={`分镜 ${shot.orderIndex + 1} 已选分镜图`}
                />
              ) : (
                <span
                  className="review-shot-nav__thumb review-shot-nav__thumb--empty"
                  aria-hidden="true"
                />
              )}
              <strong>{shotStatusLabel(shot.status)}</strong>
              {shot.upstream?.upstreamChanged ? (
                <span className="review-shot-nav__upstream">上游已变化</span>
              ) : null}
            </button>
          ))}
        </section>
      ) : null}
    </aside>
  );
}

function RightRail({
  vm,
  onReturnToRequirements,
  onSelectStep,
}: {
  vm: WorkbenchViewModel;
  onReturnToRequirements: () => void;
  onSelectStep: (step: ReviewStepId) => void;
}) {
  const assets = vm.materialLibrary?.assets ?? [];
  const [deletingRef, setDeletingRef] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const shouldResetAfterDelete = shouldResetFlowAfterMaterialDelete(
    vm.artifacts.promptRequirements,
  );
  const activity = deriveCreativeActivity(vm);

  const deleteMaterial = async (ref: string) => {
    if (
      shouldResetAfterDelete &&
      !window.confirm(materialDeleteResetConfirmMessage)
    ) {
      return;
    }
    setDeletingRef(ref);
    setDeleteError(null);
    try {
      await deleteWorkspaceMaterial({ workspaceId: vm.workspaceId, ref });
      if (shouldResetAfterDelete) {
        onReturnToRequirements();
      }
      await vm.actions.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingRef(null);
    }
  };

  return (
    <aside className="review-side">
      <section className="review-side__section">
        <div className="review-side__head">
          <Upload size={16} />
          <h2>素材库</h2>
        </div>
        {assets.length === 0 ? (
          <p className="review-muted">还没有上传素材。</p>
        ) : (
          <div className="review-assets">
            {assets.map((asset) => {
              const filename = materialAssetFilename(asset.ref);
              return (
                <div
                  key={asset.ref}
                  className="review-asset"
                  title={asset.description}
                >
                  <MaterialAssetPreview
                    kind={asset.kind}
                    src={toWorkspaceMaterialUrl(vm.workspaceId, asset.ref)}
                    filename={filename}
                    className="review-asset__preview"
                  />
                  <span className="review-asset__name" title={filename}>
                    {filename}
                  </span>
                  <button
                    type="button"
                    className="review-secondary"
                    disabled={deletingRef === asset.ref}
                    title={
                      shouldResetAfterDelete
                        ? `删除 ${filename}，流程将返回模块一`
                        : `删除 ${filename}`
                    }
                    onClick={() => deleteMaterial(asset.ref)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {deleteError ? <p className="review-error">{deleteError}</p> : null}
        {shouldResetAfterDelete ? (
          <p className="review-muted">
            删除已提交后的素材会让流程返回模块一，避免后续模块继续引用已删除素材。
          </p>
        ) : null}
      </section>
      <section className="review-side__section">
        <div className="review-side__head">
          <Clock3 size={16} />
          <h2>创作动态</h2>
        </div>
        <div
          className={`review-activity review-activity--${activity.tone}`}
          aria-live="polite"
        >
          <strong>{activity.title}</strong>
          <p>{activity.message}</p>
          {activity.action ? (
            <button
              type="button"
              className="review-secondary review-activity__action"
              onClick={() => onSelectStep(activity.action!.stepId)}
            >
              {activity.action.label}
            </button>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

function stringifyRequirementValue(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join("，");
  return typeof value === "string" && value.trim() ? value : fallback;
}

function requirementSection(
  data: PromptRequirementsData | null,
  section: "image" | "script" | "storyboard" | "shotImage" | "shotVideo",
) {
  const value = data?.[section];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type RequirementsFormState = {
  imageStyle: string;
  imageComposition: string;
  imageAvoid: string;
  scriptTone: string;
  storyboardRhythm: string;
  shotImageGlobal: string;
  shotVideoGlobal: string;
};

export function applyCreativeRequirementTemplate(
  template: CreativeRequirementTemplate,
): RequirementsFormState {
  return { ...template.values };
}

export function requirementFormFromArtifact(
  data: PromptRequirementsData | null,
): RequirementsFormState {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return {
    imageStyle: stringifyRequirementValue(
      image.style,
      "真实电商产品摄影，保留商品材质和品牌识别",
    ),
    imageComposition: stringifyRequirementValue(
      image.composition,
      "干净主视觉，主体稳定，避免无关道具抢占画面",
    ),
    imageAvoid: stringifyRequirementValue(
      image.avoid,
      "文字贴片、商品变形、额外产品变体、环境漂移",
    ),
    scriptTone: stringifyRequirementValue(script.tone, "直接、可信、卖点清晰"),
    storyboardRhythm: stringifyRequirementValue(
      storyboard.rhythm,
      "开场快，卖点明确，证明充分，结尾行动引导清楚",
    ),
    shotImageGlobal: stringifyRequirementValue(
      shotImage.global,
      "每张分镜图延续前一镜环境、灯光、构图和商品身份",
    ),
    shotVideoGlobal: stringifyRequirementValue(
      shotVideo.global,
      "镜头运动平滑，前后镜头保持空间连续",
    ),
  };
}

export function requirementFormFromImportedDraft(
  data: PromptRequirementsData,
  fallback: RequirementsFormState,
): RequirementsFormState {
  const image = requirementSection(data, "image");
  const script = requirementSection(data, "script");
  const storyboard = requirementSection(data, "storyboard");
  const shotImage = requirementSection(data, "shotImage");
  const shotVideo = requirementSection(data, "shotVideo");
  return {
    imageStyle: stringifyRequirementValue(image.style, fallback.imageStyle),
    imageComposition: stringifyRequirementValue(
      image.composition,
      fallback.imageComposition,
    ),
    imageAvoid: stringifyRequirementValue(image.avoid, fallback.imageAvoid),
    scriptTone: stringifyRequirementValue(script.tone, fallback.scriptTone),
    storyboardRhythm: stringifyRequirementValue(
      storyboard.rhythm,
      fallback.storyboardRhythm,
    ),
    shotImageGlobal: stringifyRequirementValue(
      shotImage.global,
      fallback.shotImageGlobal,
    ),
    shotVideoGlobal: stringifyRequirementValue(
      shotVideo.global,
      fallback.shotVideoGlobal,
    ),
  };
}

function RequirementsStart({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const assets = vm.materialLibrary?.assets ?? [];
  const requirementsArtifact = vm.artifacts.promptRequirements;
  const initialForm = useMemo(
    () =>
      requirementFormFromArtifact(
        (requirementsArtifact?.data as PromptRequirementsData | undefined) ?? null,
      ),
    [requirementsArtifact?.id, requirementsArtifact?.data],
  );
  const [form, setForm] = useState(initialForm);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImporting, setReferenceImporting] = useState(false);
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceAnalysis, setReferenceAnalysis] =
    useState<ReferenceVideoRequirementsImportResult["analysis"] | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(true);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const templateQuery = useQuery({
    queryKey: ["creative-requirement-templates"],
    queryFn: listCreativeRequirementTemplates,
    staleTime: Infinity,
  });
  const creativeRequirementTemplates = templateQuery.data?.templates ?? [];

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const applyTemplate = (template: CreativeRequirementTemplate) => {
    setForm(applyCreativeRequirementTemplate(template));
    setTemplateMessage(`已套用「${template.name}」`);
  };

  const uploadFiles = async (files: File[]) => {
    const rejected = files
      .map((file) => ({
        file,
        reason: workspaceMaterialFileRejectionReason(file),
      }))
      .filter((item): item is { file: File; reason: string } =>
        Boolean(item.reason),
      );
    const accepted = files.filter(
      (file) => !workspaceMaterialFileRejectionReason(file),
    );
    setUploadMessage(
      rejected.length > 0
        ? rejected
            .map((item) => `${item.file.name}: ${item.reason}`)
            .join("；")
        : null,
    );
    if (accepted.length === 0) return;

    setUploading(true);
    try {
      for (const file of accepted) {
        await uploadWorkspaceMaterial({ workspaceId: vm.workspaceId, file });
      }
      await vm.actions.refresh();
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const importReferenceVideo = async () => {
    const trimmedUrl = referenceUrl.trim();
    if (!referenceFile && !trimmedUrl) {
      setReferenceError("请上传参考视频，或粘贴可直接下载的视频链接。");
      return;
    }

    setReferenceImporting(true);
    setReferenceError(null);
    setReferenceMessage(null);
    try {
      const imported = await importReferenceVideoRequirements({
        workspaceId: vm.workspaceId,
        source: referenceFile
          ? { type: "file", file: referenceFile }
          : { type: "url", url: trimmedUrl },
      });
      setForm((current) =>
        requirementFormFromImportedDraft(imported.draft, current),
      );
      setReferenceAnalysis(imported.analysis);
      setReferenceMessage("导入内容已填入表单，请确认后提交创作要求。");
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : String(error));
    } finally {
      setReferenceImporting(false);
    }
  };

  const data: PromptRequirementsData = useMemo(
    () => ({
      image: {
        style: form.imageStyle,
        composition: form.imageComposition,
        avoid: form.imageAvoid
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
      script: {
        tone: form.scriptTone,
      },
      storyboard: {
        rhythm: form.storyboardRhythm,
      },
      shotImage: {
        global: form.shotImageGlobal,
      },
      shotVideo: {
        global: form.shotVideoGlobal,
      },
    }),
    [form],
  );

  return (
    <section className="review-panel review-panel--start">
      <div className="review-panel__header">
        <span>首屏</span>
        <h1>创作要求 + 上传素材</h1>
        <p>
          先确认商家的创作要求和商品素材。提交后系统会自动完成素材理解，并等待你审核素材解读。
        </p>
      </div>
      {!requirementsArtifact?.isCurrent ? (
        <div className="reference-video-import">
          <div className="reference-video-import__main">
            <label>
              参考视频导入
              <textarea
                rows={2}
                value={referenceUrl}
                onChange={(event) => setReferenceUrl(event.target.value)}
                placeholder="粘贴可直接下载的视频链接，或上传参考视频"
              />
            </label>
            <div className="reference-video-import__actions">
              <label className="review-secondary reference-video-import__upload">
                上传参考视频
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.currentTarget.value = "";
                    setReferenceFile(file);
                    setReferenceError(null);
                    setReferenceMessage(
                      file ? `已选择 ${file.name}` : null,
                    );
                  }}
                />
              </label>
              <button
                type="button"
                className="review-primary"
                disabled={vm.busy || referenceImporting}
                onClick={() => {
                  void importReferenceVideo();
                }}
              >
                <Wand2 size={16} />
                {referenceImporting ? "正在导入..." : "导入创作要求"}
              </button>
            </div>
          </div>
          {referenceError ? <p className="review-error">{referenceError}</p> : null}
          {referenceMessage ? <p className="review-muted">{referenceMessage}</p> : null}
          {referenceAnalysis ? (
            <div className="reference-video-import__analysis">
              <strong>导入分析摘要</strong>
              <p>{referenceAnalysis.summary}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="review-upload-row">
        <label className="review-upload">
          <Upload size={16} />
          上传素材
          <input
            type="file"
            accept="image/*,video/*,.txt,.md"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.currentTarget.value = "";
              if (files.length > 0) void uploadFiles(files);
            }}
          />
        </label>
        <span>
          {uploading
            ? "正在上传素材..."
            : assets.length > 0
              ? `已上传 ${assets.length} 个素材`
              : "请先上传至少一个商品素材"}
        </span>
      </div>
      {uploadMessage ? <p className="review-error">{uploadMessage}</p> : null}
      <section className="requirement-template-panel">
        <Button
          className="requirement-template-panel__toggle"
          aria-expanded={templatesOpen}
          aria-controls="requirement-template-options"
          onClick={() => setTemplatesOpen((open) => !open)}
          size="small"
          variant="text"
        >
          {templatesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>创作要求模板</span>
        </Button>
        <Collapse in={templatesOpen} timeout="auto" unmountOnExit>
          <div
            id="requirement-template-options"
            className="requirement-template-panel__body"
          >
            {templateQuery.isLoading ? (
              <Button
                className="requirement-template-option"
                disabled
                variant="outlined"
              >
                <span>模板加载中</span>
                <small>稍后即可套用</small>
              </Button>
            ) : null}
            {templateQuery.isError ? (
              <p className="review-error requirement-template-panel__error">
                创作要求模板暂不可用
              </p>
            ) : null}
            {creativeRequirementTemplates.map((template) => (
              <Button
                key={template.id}
                className="requirement-template-option"
                onClick={() => applyTemplate(template)}
                variant="outlined"
              >
                <span>{template.name}</span>
                <small>{template.summary}</small>
              </Button>
            ))}
          </div>
        </Collapse>
        {templateMessage ? (
          <p className="review-muted requirement-template-panel__message">
            {templateMessage}
          </p>
        ) : null}
      </section>
      <div className="review-form-grid">
        <label>
          图像风格
          <textarea
            rows={3}
            value={form.imageStyle}
            onChange={(event) => update("imageStyle", event.target.value)}
          />
        </label>
        <label>
          图像构图
          <textarea
            rows={3}
            value={form.imageComposition}
            onChange={(event) => update("imageComposition", event.target.value)}
          />
        </label>
        <label>
          图像避免项
          <textarea
            rows={3}
            value={form.imageAvoid}
            onChange={(event) => update("imageAvoid", event.target.value)}
          />
        </label>
        <label>
          剧本语气
          <textarea
            rows={3}
            value={form.scriptTone}
            onChange={(event) => update("scriptTone", event.target.value)}
          />
        </label>
        <label>
          分镜节奏
          <textarea
            rows={3}
            value={form.storyboardRhythm}
            onChange={(event) => update("storyboardRhythm", event.target.value)}
          />
        </label>
        <label>
          分镜图全局要求
          <textarea
            rows={3}
            value={form.shotImageGlobal}
            onChange={(event) => update("shotImageGlobal", event.target.value)}
          />
        </label>
        <label className="review-form-grid__wide">
          分镜视频全局要求
          <textarea
            rows={3}
            value={form.shotVideoGlobal}
            onChange={(event) => update("shotVideoGlobal", event.target.value)}
          />
        </label>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || uploading || assets.length === 0}
          onClick={() => {
            vm.actions.startCreativeReview(data);
            onActionComplete();
          }}
        >
          <Wand2 size={16} />
          {requirementsArtifact?.isCurrent ? "更新创作要求" : "提交创作要求"}
        </button>
      </div>
    </section>
  );
}

const materialRoleOptions: Array<MaterialIntakeArtifact["assets"][number]["role"]> = [
  "product_main",
  "product_detail",
  "packaging",
  "logo",
  "demo_video",
  "spec_text",
  "reference",
  "other",
];

const materialRelevanceOptions: Array<
  MaterialIntakeArtifact["assets"][number]["relevance"]
> = ["high", "medium", "low"];

const materialRoleLabels: Record<
  MaterialIntakeArtifact["assets"][number]["role"],
  string
> = {
  product_main: "主商品",
  product_detail: "商品细节",
  packaging: "包装",
  logo: "品牌标识",
  demo_video: "演示视频",
  spec_text: "规格文本",
  reference: "参考素材",
  other: "其他",
};

const materialRelevanceLabels: Record<
  MaterialIntakeArtifact["assets"][number]["relevance"],
  string
> = {
  high: "高",
  medium: "中",
  low: "低",
};

function normalizeMaterialIntakeDraft(
  draft: MaterialIntakeArtifact,
): MaterialIntakeArtifact {
  return {
    ...draft,
    assets: draft.assets.map((asset) => ({
      ...asset,
      description: asset.description.trim(),
    })),
  };
}

function MaterialIntakeReview({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.material;
  const initialData = useMemo<MaterialIntakeArtifact>(
    () =>
      artifact?.data ?? {
        scannedAt: new Date(0).toISOString(),
        primaryProductRef: "",
        assets: [],
        rejected: [],
      },
    [artifact?.data],
  );
  const [draft, setDraft] = useState<MaterialIntakeArtifact>(initialData);

  useEffect(() => {
    setDraft(initialData);
  }, [artifact?.id, initialData]);

	  if (!artifact) {
	    return (
	      <ProposalPlaceholder
        title="素材解读"
        description="创作要求确认后，系统会清点上传素材并生成可审核的素材标签。"
        actionLabel="生成素材解读"
        busy={vm.busy}
        onAction={() => {
          vm.actions.runMaterialIntake();
          onActionComplete();
        }}
      />
    );
  }

  const updateAsset = (
    ref: string,
    patch: Partial<MaterialIntakeArtifact["assets"][number]>,
  ) => {
    setDraft((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.ref === ref ? { ...asset, ...patch } : asset,
      ),
      primaryProductRef:
        patch.included === false && current.primaryProductRef === ref
          ? (current.assets.find((asset) => asset.ref !== ref && asset.included)?.ref ??
            current.primaryProductRef)
          : current.primaryProductRef,
    }));
  };

  const includedAssets = draft.assets.filter((asset) => asset.included);
  const hasBlankDescriptions = draft.assets.some(
    (asset) => asset.description.trim().length === 0,
  );
  const canApprove = includedAssets.some(
    (asset) => asset.ref === draft.primaryProductRef && asset.usable,
  ) && !hasBlankDescriptions;

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>{artifact.isCurrent ? "生效创作产物" : "待审创作产物"}</span>
        <h1>素材解读</h1>
        <p>
          确认每个上传素材的角色、相关性和是否纳入后，再生成商品卖点审核。
        </p>
      </div>
      <div className="material-intake-summary">
        <div>
          <PackageCheck size={18} />
          <span>主商品素材</span>
        </div>
        <select
          value={draft.primaryProductRef}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              primaryProductRef: event.target.value,
            }))
          }
        >
          {includedAssets.map((asset) => (
            <option key={asset.ref} value={asset.ref}>
              {materialAssetFilename(asset.ref)}
            </option>
          ))}
        </select>
      </div>
      <div className="material-intake-grid">
        {draft.assets.map((asset) => {
          const filename = materialAssetFilename(asset.ref);
          return (
            <article key={asset.ref} className="material-intake-card">
              <MaterialAssetPreview
                kind={asset.kind}
                src={toWorkspaceMaterialUrl(vm.workspaceId, asset.ref)}
                filename={filename}
                className="material-intake-card__preview"
              />
              <div className="material-intake-card__body">
                <div className="material-intake-card__title">
                  <strong title={filename}>{filename}</strong>
                  <button
                    type="button"
                    className={`material-intake-card__toggle ${
                      asset.included ? "is-included" : "is-excluded"
                    }`}
                    aria-pressed={asset.included}
                    disabled={!asset.usable}
                    title={
                      asset.usable
                        ? asset.included
                          ? "点击后本轮不使用该素材"
                          : "点击后纳入本轮生成链路"
                        : "系统判定该素材不可用"
                    }
                    onClick={() =>
                      updateAsset(asset.ref, { included: !asset.included })
                    }
                  >
                    {asset.included ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                    <span>
                      {asset.usable
                        ? asset.included
                          ? "已纳入"
                          : "不纳入"
                        : "系统拒绝"}
                    </span>
                  </button>
                </div>
                <div className="material-intake-fields">
                  <label>
                    素材标签
                    <select
                      value={asset.role}
                      onChange={(event) =>
                        updateAsset(asset.ref, {
                          role: event.target.value as MaterialIntakeArtifact["assets"][number]["role"],
                        })
                      }
                    >
                      {materialRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {materialRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    相关性
                    <select
                      value={asset.relevance}
                      onChange={(event) =>
                        updateAsset(asset.ref, {
                          relevance:
                            event.target.value as MaterialIntakeArtifact["assets"][number]["relevance"],
                        })
                      }
                    >
                      {materialRelevanceOptions.map((relevance) => (
                        <option key={relevance} value={relevance}>
                          {materialRelevanceLabels[relevance]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="material-intake-fields__wide">
                    解读说明（必填）
                    <textarea
                      rows={3}
                      value={asset.description}
                      required
                      aria-invalid={asset.description.trim().length === 0}
                      placeholder="补充素材内容、用途或关键视觉信息，不能为空。"
                      onChange={(event) =>
                        updateAsset(asset.ref, { description: event.target.value })
                      }
                    />
                    {asset.description.trim().length === 0 ? (
                      <span className="material-intake-fields__error">
                        解读说明不能为空
                      </span>
                    ) : (
                      <span className="material-intake-fields__hint">
                        这段说明会作为后续商品卖点、分镜和单镜生成的素材依据。
                      </span>
                    )}
                  </label>
                </div>
                <div className="material-intake-meta">
                  <span>{asset.usable ? "可用于生成" : "系统判定不可用"}</span>
                  <span>{Math.round(asset.bytes / 1024)} KB</span>
                  <code>{asset.ref}</code>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {draft.rejected.length > 0 ? (
        <div className="material-intake-rejected">
          <Tags size={16} />
          <div>
            <strong>系统拒绝素材</strong>
            {draft.rejected.map((item) => (
              <span key={item.ref}>
                {materialAssetFilename(item.ref)}：{item.reason}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !canApprove}
          onClick={() => {
            vm.actions.approveMaterialIntakeAndProposeBrief(
              normalizeMaterialIntakeDraft(draft),
            );
            onActionComplete();
          }}
        >
          <CheckCircle2 size={16} />
          {vm.pending?.productBrief
            ? "正在生成商品卖点..."
            : "批准素材解读并生成商品卖点"}
        </button>
        <span className="review-action-note">
          {hasBlankDescriptions
            ? "每个素材都需要填写解读说明。"
            : "素材标签只描述素材角色，不会修改上传文件本身。"}
        </span>
      </div>
    </section>
  );
}

function ProposalPlaceholder({
  title,
  description,
  actionLabel,
  busy,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>等待生成</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="review-empty-state">
        <FileText size={22} />
        <strong>当前审核内容还没有生成。</strong>
        <span>点击后会读取上游生效创作产物，并创建新的待审创作产物。</span>
      </div>
      <div className="review-panel__actions">
        <button type="button" className="review-primary" onClick={onAction} disabled={busy}>
          <Wand2 size={16} />
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

type ProductBriefChatMessage = {
  id: string;
  role: "merchant" | "system";
  text: string;
};

function linesFromText(value: string) {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ProductBriefReviewForm({
  artifactId,
  brief,
  busy,
  onApprove,
  onRegenerate,
  onActionComplete,
}: {
  artifactId: string;
  brief: ProductBriefArtifact;
  busy: boolean;
  onApprove: (data: ProductBriefArtifact) => void;
  onRegenerate: (input: Omit<ProposeWorkspaceBriefInput, "workspaceId">) => Promise<unknown>;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => briefToForm(brief));
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ProductBriefChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatMessageCounter = useRef(0);

  useEffect(() => {
    setForm(briefToForm(brief));
    setChatError(null);
  }, [artifactId, brief]);

  const update = (key: keyof ProductBriefFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const nextChatMessageId = (role: ProductBriefChatMessage["role"]) => {
    chatMessageCounter.current += 1;
    return `${role}-${artifactId}-${chatMessageCounter.current}`;
  };

  const regenerateBrief = async () => {
    const userDirection = chatInput.trim();
    if (!userDirection || busy) return;
    setChatMessages((current) => [
      ...current,
      {
        id: nextChatMessageId("merchant"),
        role: "merchant",
        text: userDirection,
      },
    ]);
    setChatInput("");
    setChatError(null);
    try {
      await onRegenerate(
        buildProductBriefRegenerationInput({
          artifactId,
          brief,
          form,
          userDirection,
        }),
      );
      setChatMessages((current) => [
        ...current,
        {
          id: nextChatMessageId("system"),
          role: "system",
          text: "已生成新的待审商品卖点，请检查后再批准。",
        },
      ]);
      onActionComplete();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>待审创作产物</span>
        <h1>商品卖点审核</h1>
        <p>确认商品名、核心卖点、人群、语气和禁用表达后，再生成分镜脚本。</p>
      </div>
      <section className="product-brief-chat" aria-label="调整商品卖点">
        <div className="product-brief-chat__head">
          <MessageSquare size={18} />
          <div>
            <h2>调整商品卖点</h2>
            <p>描述希望强化或改写的方向，系统会基于当前表单草稿重新生成待审商品卖点。</p>
          </div>
        </div>
        <ul className="product-brief-chat__messages" aria-live="polite">
          {chatMessages.length === 0 ? (
            <li className="product-brief-chat__hint">
              例如：更突出送礼场景，语气更年轻，减少材质描述。
            </li>
          ) : (
            chatMessages.map((message) => (
              <li
                key={message.id}
                className={`product-brief-chat__message product-brief-chat__message--${message.role}`}
              >
                {message.text}
              </li>
            ))
          )}
        </ul>
        <div className="product-brief-chat__form">
          <label>
            补充要求
            <textarea
              rows={3}
              maxLength={1000}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="告诉系统这版商品卖点需要怎样调整"
            />
          </label>
          <div className="product-brief-chat__actions">
            <span className="product-brief-chat__meta">{chatInput.trim().length}/1000</span>
            <button
              type="button"
              className="review-primary"
              onClick={() => void regenerateBrief()}
              disabled={busy || chatInput.trim().length === 0}
            >
              <Send size={16} />
              {busy ? "正在重新生成..." : "重新生成商品卖点"}
            </button>
          </div>
          {chatError ? <p className="product-brief-chat__error">{chatError}</p> : null}
        </div>
      </section>
      <div className="review-business-form" aria-label="商品卖点表单">
        <label>
          商品名称
          <input
            value={form.productName}
            onChange={(event) => update("productName", event.target.value)}
          />
        </label>
        <label>
          商品品类
          <input
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          核心卖点
          <textarea
            rows={3}
            value={form.coreSellingPoint}
            onChange={(event) => update("coreSellingPoint", event.target.value)}
          />
        </label>
        <label>
          目标人群
          <textarea
            rows={3}
            value={form.audienceWho}
            onChange={(event) => update("audienceWho", event.target.value)}
          />
        </label>
        <label>
          痛点或愿望
          <textarea
            rows={3}
            value={form.audiencePainOrDesire}
            onChange={(event) => update("audiencePainOrDesire", event.target.value)}
          />
        </label>
        <label>
          语气
          <input
            value={form.brandTone}
            onChange={(event) => update("brandTone", event.target.value)}
          />
        </label>
        <label>
          平台
          <input
            value={form.platform}
            onChange={(event) => update("platform", event.target.value)}
          />
        </label>
        <label>
          商品事实
          <textarea
            rows={4}
            value={form.keyFacts}
            onChange={(event) => update("keyFacts", event.target.value)}
          />
        </label>
        <label>
          证明素材
          <textarea
            rows={4}
            value={form.proof}
            onChange={(event) => update("proof", event.target.value)}
          />
        </label>
        <label>
          禁用表达
          <textarea
            rows={3}
            value={form.bannedExpressions}
            onChange={(event) => update("bannedExpressions", event.target.value)}
          />
        </label>
        <label>
          优惠信息
          <textarea
            rows={3}
            value={form.offer}
            onChange={(event) => update("offer", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          落地页信息
          <textarea
            rows={3}
            value={form.landingInfo}
            onChange={(event) => update("landingInfo", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          关键假设
          <textarea
            rows={4}
            value={form.assumptions}
            onChange={(event) => update("assumptions", event.target.value)}
          />
        </label>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          onClick={() => {
            onApprove(formToBrief(form, brief));
            onActionComplete();
          }}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准商品卖点并生成分镜脚本
        </button>
      </div>
    </section>
  );
}

function ProductBriefReview({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.brief;
  const pending = Boolean(vm.pending?.productBrief);
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="商品卖点审核"
        description={
          pending
            ? "系统正在根据已批准的素材解读生成商品卖点，完成后会停在这里供你审核。"
            : "素材理解完成后，需要生成商品卖点供商家确认。"
        }
        actionLabel={pending ? "正在生成商品卖点..." : "生成商品卖点"}
        busy={vm.busy || pending}
        onAction={() => {
          vm.actions.proposeBrief();
          onActionComplete();
        }}
      />
    );
  }
  const brief = artifact.data;
  const storyboardPending = Boolean(vm.pending?.storyboard);
  return (
    <ProductBriefReviewForm
      artifactId={artifact.id}
      brief={brief}
      busy={vm.busy || storyboardPending}
      onApprove={vm.actions.approveBriefAndProposeStoryboard}
      onRegenerate={vm.actions.proposeBrief}
      onActionComplete={onActionComplete}
    />
  );
}

export type StoryboardShotFormState = {
  purpose: string;
  durationSec: string;
  scene: string;
  visualDirection: string;
  productAssetRef: string;
  voiceover: string;
  transition: string;
};

export type StoryboardFormState = {
  narrative: string;
  totalDurationSec: string;
  assumptions: string;
  shots: StoryboardShotFormState[];
};

function compactText(values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join("；");
}

function storyboardScriptFormShots(storyboard: StoryboardArtifact) {
  if (storyboard.shots.length === STORYBOARD_SCRIPT_DEFAULT_DURATIONS.length) {
    return storyboard.shots;
  }

  const firstShot = storyboard.shots[0];
  const lastShot = storyboard.shots.at(-1) ?? firstShot;
  const proofShots =
    storyboard.shots.length > 2
      ? storyboard.shots.slice(1, -1)
      : storyboard.shots.slice(1);
  const proofBase = proofShots[0] ?? lastShot ?? firstShot;
  const materialRef =
    firstShot?.productAssetRef ||
    proofBase?.productAssetRef ||
    lastShot?.productAssetRef ||
    "";

  return [firstShot, proofBase, lastShot].map((shot, index) => {
    const source = shot ?? firstShot ?? proofBase ?? lastShot;
    return {
      ...source,
      index,
      purpose: STORYBOARD_SCRIPT_DEFAULT_PURPOSES[index]!,
      durationSec: STORYBOARD_SCRIPT_DEFAULT_DURATIONS[index]!,
      productAssetRef: source?.productAssetRef || materialRef,
      scene:
        index === 1
          ? compactText(proofShots.map((item) => item.scene)) || source?.scene || ""
          : source?.scene || "",
      visualDirection:
        index === 1
          ? compactText(proofShots.map((item) => item.visualDirection)) ||
            source?.visualDirection ||
            ""
          : source?.visualDirection || "",
      voiceover:
        index === 1
          ? compactText(proofShots.map((item) => item.voiceover)) ||
            source?.voiceover ||
            ""
          : source?.voiceover || "",
    };
  });
}

export function storyboardToForm(storyboard: StoryboardArtifact): StoryboardFormState {
  const shots = storyboardScriptFormShots(storyboard);
  return {
    narrative: storyboard.narrative,
    totalDurationSec: String(STORYBOARD_SCRIPT_TOTAL_DURATION_SEC),
    assumptions: storyboard.assumptions.join("\n"),
    shots: shots.map((shot, index) => ({
      purpose: shot.purpose,
      durationSec: String(
        storyboard.shots.length === STORYBOARD_SCRIPT_DEFAULT_DURATIONS.length
          ? shot.durationSec
          : STORYBOARD_SCRIPT_DEFAULT_DURATIONS[index],
      ),
      scene: shot.scene,
      visualDirection: shot.visualDirection,
      productAssetRef: shot.productAssetRef,
      voiceover: shot.voiceover,
      transition: shot.transition ?? "",
    })),
  };
}

function normalizeStoryboardPurpose(
  value: string,
  fallback: StoryboardArtifact["shots"][number]["purpose"],
): StoryboardArtifact["shots"][number]["purpose"] {
  if (value === "benefit") return "proof";
  return ["hook", "proof", "cta"].includes(value)
    ? (value as StoryboardArtifact["shots"][number]["purpose"])
    : fallback;
}

function storyboardPurposeLabel(
  purpose: StoryboardArtifact["shots"][number]["purpose"],
) {
  switch (purpose) {
    case "hook":
      return "开场钩子";
    case "benefit":
      return "卖点证明";
    case "proof":
      return "卖点证明";
    case "cta":
      return "行动号召";
  }
}

function storyboardTiming(shots: StoryboardArtifact["shots"]) {
  let cursor = 0;
  return shots.map((shot) => {
    const start = cursor;
    const end = start + shot.durationSec;
    cursor = end;
    return { start, end };
  });
}

function positiveIntegerFromText(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function formToStoryboard(
  form: StoryboardFormState,
  current: StoryboardArtifact,
): StoryboardArtifact {
  return {
    ...current,
    narrative: form.narrative.trim(),
    totalDurationSec: STORYBOARD_SCRIPT_TOTAL_DURATION_SEC,
    assumptions: linesFromText(form.assumptions),
    shots: form.shots.map((shot, index) => {
      const currentShot = current.shots[index] ?? current.shots[0]!;
      return {
        ...currentShot,
        index,
        purpose: normalizeStoryboardPurpose(shot.purpose, currentShot.purpose),
        durationSec: positiveIntegerFromText(
          shot.durationSec,
          currentShot.durationSec,
        ),
        scene: shot.scene.trim(),
        visualDirection: shot.visualDirection.trim(),
        productAssetRef: shot.productAssetRef.trim(),
        voiceover: shot.voiceover.trim(),
        transition: shot.transition.trim(),
      };
    }),
  };
}

function clampTextToEffectiveChars(value: string, limit: number) {
  const chars: string[] = [];
  let count = 0;
  for (const char of Array.from(value.trim())) {
    if (!/\s/.test(char)) count += 1;
    if (count > limit) break;
    chars.push(char);
  }
  return chars.join("").trim();
}

export function fitStoryboardVoiceoversToBudget(form: StoryboardFormState) {
  return {
    ...form,
    shots: form.shots.map((shot) => {
      const durationSec = positiveIntegerFromText(
        shot.durationSec,
        STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
      );
      const limit = storyboardScriptVoiceoverLimit(durationSec);
      const source = shot.voiceover.trim() || shot.scene.trim() || shot.visualDirection.trim();
      return {
        ...shot,
        voiceover: clampTextToEffectiveChars(source, limit),
      };
    }),
  };
}

export function applyStoryboardDurationAllocation(
  form: StoryboardFormState,
  durations: readonly number[],
) {
  return {
    ...form,
    totalDurationSec: String(STORYBOARD_SCRIPT_TOTAL_DURATION_SEC),
    shots: form.shots.map((shot, index) => ({
      ...shot,
      durationSec: String(
        durations[index] ??
          positiveIntegerFromText(
            shot.durationSec,
            STORYBOARD_SCRIPT_MIN_SHOT_DURATION_SEC,
          ),
      ),
    })),
  };
}

function StoryboardReviewForm({
  artifactId,
  storyboard,
  busy,
  voiceoverGenerating,
  onGenerateVoiceover,
  onApprove,
  onActionComplete,
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
    null,
  );
  const [draggingDividerIndex, setDraggingDividerIndex] = useState<number | null>(
    null,
  );
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
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, [key]: value } : shot,
      ),
    }));
  };

  const generateVoiceoversByRatio = () => {
    if (voiceoverGenerating) return;
    onGenerateVoiceover({
      baseArtifactId: artifactId,
      draft,
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
        deltaSec,
      ),
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
        redistributeP0StoryboardDurations(
          startDurations,
          dividerIndex,
          deltaSec,
        ),
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
        <div
          className="storyboard-timeline"
          ref={timelineRef}
          aria-label="分镜时间轴"
        >
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
                {Math.round((shot.durationSec / STORYBOARD_SCRIPT_TOTAL_DURATION_SEC) * 100)}
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
          <span className="storyboard-duration-hint">
            单个场景必须保持在 4-12s 之间
          </span>
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
                  storyboard.shots[index]?.purpose ?? storyboard.shots[0]?.purpose ?? "hook";
                const purpose = normalizeStoryboardPurpose(shot.purpose, currentPurpose);
                const isOpen = openStructureShotIndex === index;
                const panelId = `storyboard-structure-shot-${index}`;
                return (
                  <article key={index} className="storyboard-shot-editor">
                    <button
                      type="button"
                      className="storyboard-shot-editor__toggle"
                      onClick={() =>
                        setOpenStructureShotIndex(isOpen ? null : index)
                      }
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                    >
                      <span className="storyboard-row__index">{index + 1}</span>
                      <span className="storyboard-shot-editor__summary">
                        <strong>{storyboardPurposeLabel(purpose)}</strong>
                        <em>{shot.durationSec || "0"}s</em>
                        <small>{shot.scene || shot.visualDirection || "未填写画面意图"}</small>
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

function StoryboardReview({
  vm,
  onActionComplete,
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

type ShotPromptShotFormState = {
  providerPrompt: string;
  shotImage: Record<string, string>;
  shotVideo: Record<string, string>;
};

type ShotPromptFormState = {
  aspectRatio: ShotPromptArtifact["aspectRatio"];
  prompt: string;
  negativePrompt: string;
  voiceProfile: ShotPromptVoiceProfile;
  shots: ShotPromptShotFormState[];
};

type ShotPromptLayer = "shotImage" | "shotVideo";

const VOICE_GENDER_LABELS: Record<ShotPromptVoiceProfile["gender"], string> = {
  female: "女声",
  male: "男声",
};

const VOICE_PITCH_LABELS: Record<ShotPromptVoiceProfile["pitch"], string> = {
  low: "低沉",
  medium: "自然中声区",
  high: "明亮偏高",
};

const VOICE_PACE_LABELS: Record<ShotPromptVoiceProfile["pace"], string> = {
  slow: "慢速",
  medium: "中速",
  fast: "中等偏快",
};

const SHOT_IMAGE_LABELS: Record<string, string> = {
  scene: "场景",
  composition: "构图",
  lighting: "光线",
  productVisibility: "商品呈现",
  referenceUsage: "参考图使用",
  style: "视觉风格",
  negative: "负向约束",
};

const SHOT_VIDEO_LABELS: Record<string, string> = {
  cameraMotion: "镜头运动",
  subjectMotion: "主体运动",
  firstFrameIntent: "首帧意图",
  lastFrameIntent: "末帧意图",
  durationIntent: "时长节奏",
  continuity: "连续性",
  negative: "负向约束",
};

const SHOT_IMAGE_ORDER = [
  "scene",
  "composition",
  "lighting",
  "productVisibility",
  "referenceUsage",
  "negative",
];

const SHOT_VIDEO_ORDER = [
  "cameraMotion",
  "subjectMotion",
  "firstFrameIntent",
  "lastFrameIntent",
  "durationIntent",
  "continuity",
  "negative",
];

const SHOT_IMAGE_REQUIRED_KEYS = SHOT_IMAGE_ORDER.filter(
  (key) => key !== "negative",
);

const SHOT_VIDEO_REQUIRED_KEYS = SHOT_VIDEO_ORDER.filter(
  (key) => key !== "negative",
);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function layerKeys(
  value: unknown,
  preferredOrder: string[],
): string[] {
  if (!isPlainRecord(value)) return [];
  const known = preferredOrder.filter((key) => key in value);
  const extra = Object.keys(value)
    .filter((key) => !preferredOrder.includes(key))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

function valueToFormText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join("\n");
  }
  if (isPlainRecord(value)) {
    return JSON.stringify(value, null, 2);
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function layerToForm(value: unknown, preferredOrder: string[]) {
  if (!isPlainRecord(value)) {
    return Object.fromEntries(preferredOrder.map((key) => [key, ""]));
  }
  const keys = layerKeys(value, preferredOrder);
  return Object.fromEntries(
    [...preferredOrder, ...keys.filter((key) => !preferredOrder.includes(key))].map(
      (key) => [key, valueToFormText(value[key])],
    ),
  );
}

function formTextToLayerValue(text: string, original: unknown): unknown {
  if (Array.isArray(original)) {
    return linesFromText(text);
  }
  if (typeof original === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : original;
  }
  if (typeof original === "boolean") {
    return text.trim().toLowerCase() === "true";
  }
  if (isPlainRecord(original)) {
    try {
      const parsed = JSON.parse(text);
      return isPlainRecord(parsed) || Array.isArray(parsed) ? parsed : original;
    } catch {
      return original;
    }
  }
  return text.trim();
}

function formLayerToRecord(
  formLayer: Record<string, string>,
  currentLayer: unknown,
): Record<string, unknown> | undefined {
  const original = isPlainRecord(currentLayer) ? currentLayer : {};
  const entries = Object.entries(formLayer).map(([key, value]) => [
    key,
    formTextToLayerValue(value, original[key]),
  ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function derivedTtsVoiceover(shots: ShotPromptArtifact["shots"]) {
  return shots
    .map((shot) => shot.voiceover.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeVoiceProfile(
  profile: Partial<ShotPromptVoiceProfile> | undefined,
): ShotPromptVoiceProfile {
  return {
    ...DEFAULT_SHOT_PROMPT_VOICE_PROFILE,
    ...profile,
    tone: profile?.tone?.trim() || DEFAULT_SHOT_PROMPT_VOICE_PROFILE.tone,
  };
}

function describeVoiceProfile(profile: ShotPromptVoiceProfile) {
  return [
    VOICE_GENDER_LABELS[profile.gender],
    profile.tone,
    VOICE_PITCH_LABELS[profile.pitch],
    VOICE_PACE_LABELS[profile.pace],
  ].join(" · ");
}

function withDerivedTts(shotPrompt: ShotPromptArtifact): ShotPromptArtifact {
  return {
    ...shotPrompt,
    tts: {
      ...shotPrompt.tts,
      source: "shots.voiceover",
      voiceover: derivedTtsVoiceover(shotPrompt.shots),
      voiceProfile: normalizeVoiceProfile(shotPrompt.tts.voiceProfile),
    },
  };
}

function layerSectionKey(index: number, layer: ShotPromptLayer) {
  return `${index}:${layer}`;
}

function goalSectionKey(index: number) {
  return `${index}:providerPrompt`;
}

function layerRequiredKeys(layer: ShotPromptLayer) {
  return layer === "shotImage" ? SHOT_IMAGE_REQUIRED_KEYS : SHOT_VIDEO_REQUIRED_KEYS;
}

function validateLayerFields(
  fields: Record<string, string>,
  layer: ShotPromptLayer,
) {
  return Object.fromEntries(
    layerRequiredKeys(layer)
      .filter((key) => !fields[key]?.trim())
      .map((key) => [key, "必填"]),
  );
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join("、");
  if (isPlainRecord(value)) return JSON.stringify(value);
  if (value === null || value === undefined || value === "") return "未填写";
  return String(value);
}

function shotDuration(shot: ShotPromptArtifact["shots"][number]) {
  return Math.max(0, shot.endSec - shot.startSec);
}

function shotLayerEntries(
  shot: ShotPromptArtifact["shots"][number],
  layer: "shotImage" | "shotVideo",
) {
  const labels = layer === "shotImage" ? SHOT_IMAGE_LABELS : SHOT_VIDEO_LABELS;
  const order = layer === "shotImage" ? SHOT_IMAGE_ORDER : SHOT_VIDEO_ORDER;
  const value = layer === "shotImage" ? shot.shotImage : shot.shotVideo;
  if (!isPlainRecord(value)) return [];
  return layerKeys(value, order).map((key) => ({
    key,
    label: labels[key] ?? key,
    value: value[key],
  }));
}

function shotPromptToForm(shotPrompt: ShotPromptArtifact): ShotPromptFormState {
  return {
    aspectRatio: shotPrompt.aspectRatio,
    prompt: shotPrompt.prompt,
    negativePrompt: shotPrompt.negativePrompt,
    voiceProfile: normalizeVoiceProfile(shotPrompt.tts.voiceProfile),
    shots: shotPrompt.shots.map((shot) => ({
      providerPrompt: shot.providerPrompt,
      shotImage: layerToForm(shot.shotImage, SHOT_IMAGE_ORDER),
      shotVideo: layerToForm(shot.shotVideo, SHOT_VIDEO_ORDER),
    })),
  };
}

function summaryFormToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact,
): ShotPromptArtifact {
  return {
    ...current,
    aspectRatio: form.aspectRatio,
    prompt: form.prompt.trim(),
    negativePrompt: form.negativePrompt.trim(),
    tts: {
      ...current.tts,
      voiceProfile: normalizeVoiceProfile(form.voiceProfile),
    },
  };
}

function formGoalToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact,
  targetIndex: number,
): ShotPromptArtifact {
  return {
    ...current,
    shots: form.shots.map((shot, shotIndex) => {
      const currentShot = current.shots[shotIndex] ?? current.shots[0]!;
      if (shotIndex !== targetIndex) return currentShot;
      return {
        ...currentShot,
        providerPrompt: shot.providerPrompt.trim(),
      };
    }),
  };
}

function formLayerToShotPrompt(
  form: ShotPromptFormState,
  current: ShotPromptArtifact,
  targetIndex: number,
  layer: ShotPromptLayer,
): ShotPromptArtifact {
  return {
    ...current,
    shots: form.shots.map((shot, shotIndex) => {
      const currentShot = current.shots[shotIndex] ?? current.shots[0]!;
      if (shotIndex !== targetIndex) return currentShot;
      return {
        ...currentShot,
        [layer]:
          formLayerToRecord(shot[layer], currentShot[layer]) ?? currentShot[layer],
      };
    }),
  };
}

function ShotPromptDict({
  title,
  entries,
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
  onCancel,
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

function ShotPromptReviewForm({
  artifactId,
  shotPrompt,
  busy,
  onApprove,
  onActionComplete,
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
    value: string,
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateVoiceProfile = <K extends keyof ShotPromptVoiceProfile>(
    key: K,
    value: ShotPromptVoiceProfile[K],
  ) => {
    setForm((current) => ({
      ...current,
      voiceProfile: {
        ...current.voiceProfile,
        [key]: value,
      },
    }));
  };

  const updateShotLayer = (
    index: number,
    layer: ShotPromptLayer,
    key: string,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index
          ? { ...shot, [layer]: { ...shot[layer], [key]: value } }
          : shot,
      ),
    }));
  };

  const updateShotGoal = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      shots: current.shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, providerPrompt: value } : shot,
      ),
    }));
  };

  const toggleGoalEditor = (index: number) => {
    const key = goalSectionKey(index);
    setOpenShotIndex(index);
    setEditingSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const toggleLayerEditor = (index: number, layer: ShotPromptLayer) => {
    const key = layerSectionKey(index, layer);
    setOpenShotIndex(index);
    setEditingSections((current) => ({
      ...current,
      [key]: !current[key],
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
              providerPrompt: reset.shots[index]?.providerPrompt ?? shot.providerPrompt,
            }
          : shot,
      ),
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
          : shot,
      ),
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
        <span>待审创作产物</span>
        <h1>分镜生成要求</h1>
        <p>确认逐分镜的分镜图和分镜视频要求。批准后可进入应用分镜，创建分镜链路实例。</p>
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
                  event.target.value as ShotPromptArtifact["aspectRatio"],
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
                  event.target.value as ShotPromptVoiceProfile["gender"],
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
                  event.target.value as ShotPromptVoiceProfile["pitch"],
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
                  event.target.value as ShotPromptVoiceProfile["pace"],
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
                            error={Boolean(
                              sectionErrors[goalKey]?.providerPrompt,
                            )}
                            helperText={
                              sectionErrors[goalKey]?.providerPrompt ?? " "
                            }
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
                      <ShotPromptDict
                        title="分镜图要求"
                        entries={imageEntries}
                      />
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
                      <ShotPromptDict
                        title="分镜视频要求"
                        entries={videoEntries}
                      />
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
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          onClick={approveDraft}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准分镜生成要求
        </button>
      </div>
    </section>
  );
}

function P0StoryboardRequiredPanel({
  issues,
}: {
  issues: Array<{ message: string }>;
}) {
  const issueText = issues
    .slice(0, 2)
    .map((issue) => issue.message)
    .join(" ");
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>等待上游确认</span>
        <h1>分镜生成要求</h1>
        <p>需要先让分镜脚本成为 15 秒三镜版本，再生成逐分镜的分镜图和分镜视频要求。</p>
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

function ShotPromptReview({
  vm,
  onActionComplete,
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
        description={
          pending
            ? "系统正在根据已批准的分镜脚本生成分镜图和分镜视频要求，完成后会停在这里供你审核。"
            : "分镜脚本批准后，生成每个分镜的分镜图和分镜视频要求。"
        }
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

function ApplyShotSetPanel({
  vm,
  onActionComplete,
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const shotPrompt = vm.artifacts.shotPrompt;
  const activeShotSet = vm.workspaceStatus?.activeShotSet;
  const pending = Boolean(vm.pending?.applyShotSet);
  const storyboardValidation = vm.artifacts.storyboard
    ? validateP0StoryboardScript(vm.artifacts.storyboard.data)
    : null;
  const storyboardRequiresApproval = Boolean(
    storyboardValidation && !storyboardValidation.valid,
  );
  const activeShotRows = [...vm.shotRows].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const activeChanged = Boolean(activeShotSet?.upstream?.upstreamChanged);
  const actionClass =
    activeShotSet && !activeChanged ? "review-secondary" : "review-primary";
  const actionLabel = pending
    ? "正在创建分镜链路实例..."
      : activeShotSet
        ? activeChanged
          ? "应用并创建新实例"
          : "重新创建实例"
        : "创建分镜链路实例";

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>同步点</span>
        <h1>应用分镜</h1>
        <p>
          将当前生效的分镜生成要求创建为分镜链路实例。旧实例、候选结果和成片会保留。
        </p>
      </div>
      {storyboardRequiresApproval ? (
        <div className="review-upstream-note">
          <Ban size={14} />
          当前生效的分镜脚本仍是旧结构。请先回到分镜脚本模块，批准 15 秒三镜版本。
        </div>
      ) : null}
      {activeShotSet ? (
        <article className="shot-set-instance shot-set-instance--active">
          <header className="shot-set-instance__head">
            <Layers3 size={20} />
            <div>
              <strong>
                当前分镜链路实例{" "}
                <span className="mono">{shortEntityId(activeShotSet.id)}</span>
              </strong>
              <span>
                创建于 {formatReviewTime(activeShotSet.createdAt)} ·{" "}
                {activeShotRows.length || activeShotSet.shotCount || 0} 个分镜脚本
              </span>
            </div>
            <span className="review-status review-status--good">当前生效</span>
          </header>
          {activeChanged ? (
            <div className="review-upstream-note">
              <RefreshCw size={14} />
              生效分镜生成要求有更新，重新应用会创建新实例并归档当前实例。
            </div>
          ) : null}
          {activeShotRows.length > 0 ? (
            <div className="shot-set-shot-grid" aria-label="当前分镜脚本摘要">
              {activeShotRows.map((shot) => (
                <article key={shot.id} className="shot-set-shot-card">
                  <span className="mono">
                    #{shot.orderIndex} · {formatShotDuration(shot)}
                  </span>
                  <strong className="u-clip">{shot.title}</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className="review-muted">正在同步当前分镜脚本摘要。</p>
          )}
        </article>
      ) : (
        <div className="review-empty-state">
          <Layers3 size={22} />
          <strong>尚未创建分镜链路实例。</strong>
          <span>
            需要先把生效的分镜生成要求应用为可执行 shots，再开始逐分镜制作。
          </span>
        </div>
      )}
      <div className="shot-set-apply-card">
        <div>
          <strong>
            {activeShotSet
              ? activeChanged
                ? "生效分镜生成要求有更新"
                : "当前分镜链路实例已创建"
              : "等待创建分镜链路实例"}
          </strong>
          <span>
            {activeShotSet
              ? activeChanged
                ? "应用后会创建新的分镜链路实例，当前实例进入归档历史。"
                : "如需强制重新创建，可手动触发；通常可以继续进入分镜图选择。"
              : "创建后会生成可执行分镜脚本，后续分镜图和分镜视频只读取当前生效实例。"}
          </span>
        </div>
        <button
          type="button"
          className={actionClass}
          disabled={vm.busy || !shotPrompt?.isCurrent || storyboardRequiresApproval}
          onClick={() => {
            vm.actions.applyShotSet();
            onActionComplete();
          }}
        >
          <CheckCircle2 size={16} />
          {actionLabel}
        </button>
      </div>
      <span className="review-action-note">
        批准分镜生成要求不会自动清空或重建已有分镜链路。
      </span>
    </section>
  );
}

function ImageSelectionPanel({
  vm,
  manualShotSelectionId,
  onAutoSelectShot,
  onImageSelectionConfirmed,
}: {
  vm: WorkbenchViewModel;
  manualShotSelectionId: string | null;
  onAutoSelectShot: (shotId: string) => void;
  onImageSelectionConfirmed: () => void;
}) {
  const nextImageShot = vm.shots.find((shot) => !shot.selectedImageId) ?? null;
  const shot = vm.selectedWorkflowShot ?? nextImageShot;
  const rounds = vm.imageRounds;
  const mustSelectNext = nextImageShot && shot?.shotId !== nextImageShot.shotId;
  const selectedWasManual =
    manualShotSelectionId !== null && manualShotSelectionId === vm.selectedShotId;
  const canGenerate =
    Boolean(vm.selectedShotId) &&
    shot !== null &&
    !mustSelectNext &&
    !["IMAGE_GENERATING", "IMAGE_PROMPT_PROPOSING"].includes(shot.status);
  const selectedImageRendered = Boolean(
    shot?.selectedImageId &&
      rounds.some((round) =>
        round.candidates.some((candidate) => candidate.id === shot.selectedImageId),
      ),
  );

  useEffect(() => {
    if (
      nextImageShot &&
      (!vm.selectedShotId ||
        (!selectedWasManual && vm.selectedWorkflowShot?.selectedImageId))
    ) {
      onAutoSelectShot(nextImageShot.shotId);
    }
  }, [
    nextImageShot?.shotId,
    selectedWasManual,
    vm.selectedShotId,
    vm.selectedWorkflowShot?.selectedImageId,
  ]);

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>按分镜顺序推进</span>
        <h1>分镜图选择</h1>
        <p>
          后一张分镜图会使用前一张已选分镜图作为场景连续性锚点，所以这里不能并行生成。
        </p>
      </div>
      {!shot ? (
        <div className="review-empty-state">没有可生成的分镜图。</div>
      ) : (
        <>
          <div className="review-current-shot">
            <span>当前分镜</span>
            <strong>分镜 {shot.orderIndex + 1}</strong>
            <em>{shot.status}</em>
          </div>
          {mustSelectNext && nextImageShot ? (
            <p className="review-warning">
              请先完成分镜 {nextImageShot.orderIndex + 1} 的分镜图选择。
            </p>
          ) : null}
          <div className="review-panel__actions">
            <button
              type="button"
              className="review-primary"
              disabled={vm.busy || !canGenerate}
              onClick={vm.actions.proposeImage}
            >
              <ImageIcon size={16} />
              {vm.pending?.image ? "正在生成分镜图..." : "生成分镜图候选"}
            </button>
          </div>
          {rounds.length > 0 ? (
            <>
              {rounds.map((round, index) => (
                <CandidateImages
                  key={round.artifact.id}
                  round={round}
                  batchId={round.batch?.id ?? null}
                  busy={vm.busy}
                  showDetachedSelection={!selectedImageRendered && index === 0}
                  allowFeedback={index === 0}
                  onSelect={(candidateId, selectedBatchId) => {
                    vm.actions.selectImageCandidate(candidateId, selectedBatchId);
                    onImageSelectionConfirmed();
                  }}
                  onRegenerate={(candidateId, userDirection) =>
                    vm.actions.regenerateImage({
                      baseArtifactId: round.artifact.id,
                      feedbackImageCandidateId: candidateId,
                      userDirection,
                    })
                  }
                />
              ))}
            </>
          ) : (
            <div className="review-empty-state">
              <ImageIcon size={22} />
              <strong>当前分镜还没有候选图。</strong>
              <span>生成后，选择一张作为当前分镜图，再进入下一分镜。</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RequirementSummarySection({
  title,
  value,
  labels,
  order,
}: {
  title: string;
  value: unknown;
  labels: Record<string, string>;
  order: string[];
}) {
  const keys = layerKeys(value, order);
  return (
    <section className="review-requirement-summary__section">
      <strong>{title}</strong>
      {keys.length > 0 && isPlainRecord(value) ? (
        <dl>
          {keys.map((key) => (
            <div key={key}>
              <dt>{labels[key] ?? key}</dt>
              <dd>{displayValue(value[key])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{displayValue(value)}</p>
      )}
    </section>
  );
}

function CandidateImages({
  round,
  batchId,
  busy,
  showDetachedSelection,
  allowFeedback,
  onSelect,
  onRegenerate,
}: {
  round: NonNullable<WorkbenchViewModel["latestImageRound"]>;
  batchId: string | null;
  busy: boolean;
  showDetachedSelection: boolean;
  allowFeedback: boolean;
  onSelect: (candidateId: string, batchId: string) => void;
  onRegenerate: (candidateId: string, userDirection: string) => void;
}) {
  const committedId = round.selection?.selectedCandidateId ?? null;
  const [stagedId, setStagedId] = useState<string | null>(committedId);
  const [feedbackCandidateId, setFeedbackCandidateId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const candidateAspectRatio = cssAspectRatio(round.batch?.aspectRatio);
  useEffect(() => {
    setStagedId(committedId);
  }, [committedId]);
  useEffect(() => {
    setFeedbackCandidateId(null);
    setFeedbackText("");
  }, [round.artifact.id]);

  const confirmEnabled =
    Boolean(batchId) && canConfirmSelection({ stagedId, committedId, busy });

  const confirmNote = committedId
    ? stagedId === committedId
      ? "已确认当前分镜图，点选其他候选可改选。"
      : "已选中新候选，点击确认以更新当前分镜图。"
    : stagedId
      ? "点击确认以选定当前分镜图。"
      : "先点选一张成功生成的候选图，再确认。";

  return (
    <div className="review-round">
      <div className="review-round__head">
        <span className={`review-status review-status--${statusTone(round.batch?.status)}`}>
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          第 {round.artifact.version} 轮 · {round.batch?.succeededCount ?? 0}/
          {round.batch?.requestedCount ?? round.candidates.length}
        </span>
      </div>
      {round.upstream?.upstreamChanged ? (
        <div className="review-upstream-note">
          <Clock3 size={15} />
          <span>本轮分镜图基于旧上游；当前选择仍可用，重新生成会使用最新内容。</span>
        </div>
      ) : null}
      <div className="review-image-grid">
        {round.candidates.map((candidate) => {
          const isStaged = candidate.id === stagedId;
          const isCommitted = candidate.id === committedId;
          const isFeedbackOpen = feedbackCandidateId === candidate.id;
          const canFeedback =
            allowFeedback && candidate.status === "SUCCEEDED" && Boolean(candidate.imageUrl);
          return (
            <div
              key={candidate.id}
              className="review-candidate-card"
            >
              <button
                type="button"
                disabled={busy || !isSelectableCandidate(candidate.status)}
                aria-pressed={isStaged}
                className={[
                  "review-candidate",
                  `review-candidate--${statusTone(candidate.status)}`,
                  isStaged ? "review-candidate--staged" : "",
                  isCommitted ? "review-candidate--committed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() =>
                  setStagedId((current) =>
                    stageCandidate(current, candidate.id, round.candidates),
                  )
                }
                style={
                  candidateAspectRatio
                    ? { aspectRatio: candidateAspectRatio }
                    : undefined
                }
              >
                {candidate.imageUrl ? (
                  <img src={toAbsoluteAssetUrl(candidate.imageUrl)} alt={candidate.id} />
                ) : (
                  <span>{candidate.errorMessage ?? candidate.status}</span>
                )}
                {isCommitted ? (
                  <span className="review-candidate__badge">当前选择</span>
                ) : null}
              </button>
              {canFeedback ? (
                <div className="review-candidate-feedback">
                  {isFeedbackOpen ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const trimmed = feedbackText.trim();
                        if (!trimmed || busy) return;
                        onRegenerate(candidate.id, trimmed);
                      }}
                    >
                      <label>
                        本次反馈
                        <textarea
                          value={feedbackText}
                          onChange={(event) => setFeedbackText(event.target.value)}
                          placeholder="填写你的意见"
                          required
                        />
                      </label>
                      <div className="review-panel__actions">
                        <button
                          type="submit"
                          className="review-secondary"
                          disabled={busy || !feedbackText.trim()}
                        >
                          <RefreshCw size={16} />
                          按反馈重新生成
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            setFeedbackCandidateId(null);
                            setFeedbackText("");
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="review-secondary"
                      disabled={busy}
                      onClick={() => {
                        setFeedbackCandidateId(candidate.id);
                        setFeedbackText("");
                      }}
                    >
                      <RefreshCw size={16} />
                      基于这张图反馈
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {committedId &&
      !round.candidates.some((candidate) => candidate.id === committedId) &&
      showDetachedSelection &&
      round.selection?.selectedImageUrl ? (
        <div className="review-current-image">
          <img
            src={toAbsoluteAssetUrl(round.selection.selectedImageUrl)}
            alt="当前已确认分镜图"
          />
          <div>
            <strong>当前选择</strong>
            <span>来自旧候选轮次；重新生成不会自动替换它。</span>
          </div>
        </div>
      ) : null}
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={!confirmEnabled}
          onClick={() => {
            if (batchId && stagedId) onSelect(stagedId, batchId);
          }}
        >
          <CheckCircle2 size={16} />
          确认选择
        </button>
        <span className="review-action-note">{confirmNote}</span>
      </div>
    </div>
  );
}

function VideoSelectionPanel({ vm }: { vm: WorkbenchViewModel }) {
  const allImagesSelected =
    vm.shots.length > 0 && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const videoTargets = vm.shots.filter(
    (shot) => shot.selectedImageId && !shot.selectedVideoId && !shot.activeVideoBatchId,
  );
  const rounds = vm.videoRounds;

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>批量生成，逐分镜审核</span>
        <h1>分镜视频选择</h1>
        <p>
          全部分镜图选择完成后，批量生成视频候选；用户仍然逐个分镜选择当前分镜视频。
        </p>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !allImagesSelected || videoTargets.length === 0}
          onClick={vm.actions.proposeAllVideos}
        >
          <Film size={16} />
          {vm.pending?.video ? "正在生成分镜视频..." : "批量生成分镜视频候选"}
        </button>
        <span className="review-action-note">
          {videoTargets.length > 0
            ? `待生成 ${videoTargets.length} 个分镜`
            : "已有视频候选或已完成选择"}
        </span>
      </div>
      {vm.selectedWorkflowShot ? (
        <div className="review-current-shot">
          <span>当前审核</span>
          <strong>分镜 {vm.selectedWorkflowShot.orderIndex + 1}</strong>
          <em>{vm.selectedWorkflowShot.status}</em>
        </div>
      ) : null}
      {rounds.length > 0 ? (
        <>
          {rounds.map((round, index) => (
            <CandidateVideos
              key={round.artifact.id}
              round={round}
              batchId={round.batch?.id ?? null}
              busy={vm.busy}
              allowFeedback={index === 0}
              onSelect={vm.actions.selectVideoCandidate}
              onRegenerate={(candidateId, userDirection) =>
                vm.actions.regenerateVideo({
                  baseArtifactId: round.artifact.id,
                  feedbackVideoCandidateId: candidateId,
                  userDirection,
                })
              }
            />
          ))}
        </>
      ) : (
        <div className="review-empty-state">
          <Film size={22} />
          <strong>当前分镜还没有视频候选。</strong>
          <span>批量生成完成后，在左侧切换分镜逐个审核。</span>
        </div>
      )}
    </section>
  );
}

function CandidateVideos({
  round,
  batchId,
  busy,
  allowFeedback,
  onSelect,
  onRegenerate,
}: {
  round: NonNullable<WorkbenchViewModel["latestVideoRound"]>;
  batchId: string | null;
  busy: boolean;
  allowFeedback: boolean;
  onSelect: (candidateId: string, batchId: string) => void;
  onRegenerate: (candidateId: string, userDirection: string) => void;
}) {
  const candidateAspectRatio = cssAspectRatio(round.batch?.aspectRatio);
  const [feedbackCandidateId, setFeedbackCandidateId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  useEffect(() => {
    setFeedbackCandidateId(null);
    setFeedbackText("");
  }, [round.artifact.id]);
  return (
    <div className="review-round">
      <div className="review-round__head">
        <span className={`review-status review-status--${statusTone(round.batch?.status)}`}>
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          {round.batch?.succeededCount ?? 0}/{round.batch?.requestedCount ?? round.candidates.length}
        </span>
      </div>
      {round.upstream?.upstreamChanged ? (
        <div className="review-upstream-note">
          <Clock3 size={15} />
          <span>本轮分镜视频基于旧上游；当前选择仍可用，重新生成会使用最新内容。</span>
        </div>
      ) : null}
      <div className="review-video-grid">
        {round.candidates.map((candidate) => {
          const isFeedbackOpen = feedbackCandidateId === candidate.id;
          const isCommitted = candidate.id === round.selection?.selectedCandidateId;
          const canFeedback =
            allowFeedback && candidate.status === "SUCCEEDED" && Boolean(candidate.videoUrl);
          return (
            <div
              key={candidate.id}
              className={`review-video-candidate review-candidate--${statusTone(candidate.status)}`}
            >
              {candidate.videoUrl ? (
                <>
                  <video
                    src={toAbsoluteAssetUrl(candidate.videoUrl)}
                    controls
                    preload="metadata"
                    style={
                      candidateAspectRatio
                        ? { aspectRatio: candidateAspectRatio }
                        : undefined
                    }
                  />
                  {isCommitted ? (
                    <span className="review-candidate__badge">当前选择</span>
                  ) : null}
                </>
              ) : (
                <span>{candidate.errorMessage ?? candidate.status}</span>
              )}
              <button
                type="button"
                disabled={busy || !batchId || candidate.status !== "SUCCEEDED"}
                onClick={() => batchId && onSelect(candidate.id, batchId)}
              >
                选择为当前分镜视频
              </button>
              {canFeedback ? (
                <div className="review-candidate-feedback">
                  {isFeedbackOpen ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const trimmed = feedbackText.trim();
                        if (!trimmed || busy) return;
                        onRegenerate(candidate.id, trimmed);
                      }}
                    >
                      <label>
                        本次反馈
                        <textarea
                          value={feedbackText}
                          onChange={(event) => setFeedbackText(event.target.value)}
                          placeholder="填写你的意见"
                          required
                        />
                      </label>
                      <div className="review-panel__actions">
                        <button
                          type="submit"
                          className="review-secondary"
                          disabled={busy || !feedbackText.trim()}
                        >
                          <RefreshCw size={16} />
                          按反馈重新生成
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            setFeedbackCandidateId(null);
                            setFeedbackText("");
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="review-secondary"
                      disabled={busy}
                      onClick={() => {
                        setFeedbackCandidateId(candidate.id);
                        setFeedbackText("");
                      }}
                    >
                      <RefreshCw size={16} />
                      基于这个视频反馈
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!isTerminalReady(round.batch?.status) ? <div className="review-progress" /> : null}
    </div>
  );
}

function FinalPanel({ vm }: { vm: WorkbenchViewModel }) {
  const job = vm.finalVideo;
  const finalUrl = job?.localUrl ? toAbsoluteAssetUrl(job.localUrl) : null;
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>用户手动触发</span>
        <h1>生成成片</h1>
        <p>全部分镜视频确认后，再由用户明确点击生成成片。</p>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={
            vm.busy ||
            Boolean(vm.pending?.finalVideo) ||
            !vm.workflow?.canComposeFinalVideo
          }
          onClick={vm.actions.composeFinal}
        >
          <Play size={16} />
          {vm.pending?.finalVideo ? "正在生成成片..." : "生成成片"}
        </button>
      </div>
      {job ? (
        <div className="review-final">
          <span className={`review-status review-status--${statusTone(job.status)}`}>
            {job.status}
          </span>
          {finalUrl ? (
            <>
              <video src={finalUrl} controls />
              <a className="download-link" href={finalUrl} download>
                <Download size={14} />
                下载 MP4
              </a>
            </>
          ) : (
            <p className="review-muted">成片任务仍在处理中。</p>
          )}
          {job.errorMessage ? <p className="review-error">{job.errorMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function MainPanel({
  vm,
  active,
  onActionComplete,
  manualShotSelectionId,
  onAutoSelectShot,
  onImageSelectionConfirmed,
}: {
  vm: WorkbenchViewModel;
  active: ReviewStepId;
  onActionComplete: () => void;
  manualShotSelectionId: string | null;
  onAutoSelectShot: (shotId: string) => void;
  onImageSelectionConfirmed: () => void;
}) {
  switch (active) {
    case "requirements":
      return <RequirementsStart vm={vm} onActionComplete={onActionComplete} />;
    case "material":
      return <MaterialIntakeReview vm={vm} onActionComplete={onActionComplete} />;
    case "brief":
      return <ProductBriefReview vm={vm} onActionComplete={onActionComplete} />;
    case "storyboard":
      return <StoryboardReview vm={vm} onActionComplete={onActionComplete} />;
    case "shotprompt":
      return <ShotPromptReview vm={vm} onActionComplete={onActionComplete} />;
    case "apply":
      return <ApplyShotSetPanel vm={vm} onActionComplete={onActionComplete} />;
    case "image":
      return (
        <ImageSelectionPanel
          vm={vm}
          manualShotSelectionId={manualShotSelectionId}
          onAutoSelectShot={onAutoSelectShot}
          onImageSelectionConfirmed={onImageSelectionConfirmed}
        />
      );
    case "video":
      return <VideoSelectionPanel vm={vm} />;
    case "final":
      return <FinalPanel vm={vm} />;
  }
}

export function CreativeReviewDesk({ workspaceId }: { workspaceId: string }) {
  const vm = useWorkbenchViewModel(workspaceId);
  const defaultStep = deriveActiveStep(vm);
  const [selectedStep, setSelectedStep] = useState<ReviewStepId | null>(null);
  const [manualShotSelectionId, setManualShotSelectionId] = useState<string | null>(
    null,
  );
  const active = selectedStep ?? defaultStep;

  useEffect(() => {
    if (selectedStep && !canOpenReviewStep(vm, selectedStep, defaultStep)) {
      setSelectedStep(null);
    }
  }, [
    defaultStep,
    selectedStep,
    vm.artifacts.brief?.id,
    vm.artifacts.material?.id,
    vm.artifacts.promptRequirements?.id,
    vm.artifacts.shotPrompt?.id,
    vm.artifacts.shotPrompt?.isCurrent,
    vm.artifacts.storyboard?.id,
    vm.shots.length,
    vm.workspaceStatus?.activeShotSet?.id,
    vm.workflow?.canComposeFinalVideo,
  ]);

  return (
    <div className="review-desk">
      <header className="review-topbar">
        <button type="button" className="review-icon-button" onClick={backToWorkspaces} title="返回工作区">
          <ArrowLeft size={18} />
        </button>
        <div className="review-topbar__title">
          <span>创作工作目录</span>
          <strong>{vm.workspace?.localPath ?? vm.workspaceId}</strong>
        </div>
        <button
          type="button"
          className="review-icon-button"
          onClick={() => void vm.actions.refresh()}
          title="刷新"
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {vm.error ? <div className="review-global-error">{vm.error}</div> : null}
      {vm.loading ? (
        <div className="review-loading">
          <div />
          <div />
          <div />
        </div>
      ) : (
        <main className="review-grid">
          <StepRail
            vm={vm}
            active={active}
            defaultStep={defaultStep}
            onSelect={setSelectedStep}
            onShotSelect={(shotId) => {
              setManualShotSelectionId(shotId);
              vm.actions.setSelectedShotId(shotId);
            }}
          />
          <MainPanel
            vm={vm}
            active={active}
            onActionComplete={() => setSelectedStep(null)}
            manualShotSelectionId={manualShotSelectionId}
            onAutoSelectShot={(shotId) => {
              setManualShotSelectionId(null);
              vm.actions.setSelectedShotId(shotId);
            }}
            onImageSelectionConfirmed={() => setManualShotSelectionId(null)}
          />
          <RightRail
            vm={vm}
            onReturnToRequirements={() => setSelectedStep("requirements")}
            onSelectStep={setSelectedStep}
          />
        </main>
      )}
      {vm.busy || vm.refreshing || vm.hasActiveGeneration ? (
        <div className="review-live-strip">
          <span />
          正在同步创作状态
        </div>
      ) : null}
    </div>
  );
}
