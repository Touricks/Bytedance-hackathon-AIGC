import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import { ChevronDown, ChevronRight, Upload, Wand2 } from "lucide-react";
import type { CreativeRequirementTemplate } from "@aigc-video/shared";
import {
  importReferenceVideoRequirements,
  listCreativeRequirementTemplates,
  type PromptRequirementsData,
  type ReferenceVideoRequirementsImportResult,
  uploadWorkspaceMaterial,
  workspaceMaterialFileRejectionReason
} from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  applyCreativeRequirementTemplate,
  requirementFormFromArtifact,
  requirementFormFromImportedDraft
} from "../requirementsForm.js";

export function RequirementsStart({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const assets = vm.materialLibrary?.assets ?? [];
  const requirementsArtifact = vm.artifacts.promptRequirements;
  const initialForm = useMemo(
    () =>
      requirementFormFromArtifact(
        (requirementsArtifact?.data as PromptRequirementsData | undefined) ?? null
      ),
    [requirementsArtifact?.id, requirementsArtifact?.data]
  );
  const [form, setForm] = useState(initialForm);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImporting, setReferenceImporting] = useState(false);
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceAnalysis, setReferenceAnalysis] = useState<
    ReferenceVideoRequirementsImportResult["analysis"] | null
  >(null);
  const [templatesOpen, setTemplatesOpen] = useState(true);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const templateQuery = useQuery({
    queryKey: ["creative-requirement-templates"],
    queryFn: listCreativeRequirementTemplates,
    staleTime: Infinity
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
        reason: workspaceMaterialFileRejectionReason(file)
      }))
      .filter((item): item is { file: File; reason: string } => Boolean(item.reason));
    const accepted = files.filter((file) => !workspaceMaterialFileRejectionReason(file));
    setUploadMessage(
      rejected.length > 0
        ? rejected.map((item) => `${item.file.name}: ${item.reason}`).join("；")
        : null
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
          : { type: "url", url: trimmedUrl }
      });
      setForm((current) => requirementFormFromImportedDraft(imported.draft, current));
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
          .filter(Boolean)
      },
      script: {
        tone: form.scriptTone
      },
      storyboard: {
        rhythm: form.storyboardRhythm
      },
      shotImage: {
        global: form.shotImageGlobal
      },
      shotVideo: {
        global: form.shotVideoGlobal
      }
    }),
    [form]
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
                    setReferenceMessage(file ? `已选择 ${file.name}` : null);
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
              <Button className="requirement-template-option" disabled variant="outlined">
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
