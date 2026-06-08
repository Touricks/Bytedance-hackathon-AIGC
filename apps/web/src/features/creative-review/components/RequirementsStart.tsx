import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import { ChevronDown, ChevronRight, Upload, Wand2 } from "lucide-react";
import {
  type Audience,
  type CreativeFactors,
  type DealType,
  type ProductCategory,
  type Strategy
} from "@aigc-video/shared";
import {
  importReferenceVideoRequirements,
  type PromptRequirementsData,
  type ReferenceVideoRequirementsImportResult,
  uploadWorkspaceMaterial,
  workspaceMaterialFileRejectionReason
} from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  requirementFormFromArtifact,
  requirementFormWithGuidanceField,
  requirementFormWithCreativeFactors,
  promptRequirementsDataFromForm
} from "../requirementsForm.js";
import {
  AUDIENCE_OPTIONS,
  COMPILED_REQUIREMENT_FIELDS,
  DEAL_TYPE_OPTIONS,
  FactorSelect,
  PRODUCT_CATEGORY_OPTIONS,
  SourceChips,
  STRATEGY_OPTIONS,
  guidanceGroups,
  packText,
  sourceSummary,
  unpackText
} from "./RequirementsStartHelpers.js";
import { ReviewActionDock } from "./Common.js";

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
  const [referenceRecommendation, setReferenceRecommendation] = useState<
    ReferenceVideoRequirementsImportResult["creativeFactorsRecommendation"] | null
  >(null);
  const [guidanceOpen, setGuidanceOpen] = useState(true);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const updateCreativeFactor = <
    K extends "productCategory" | "dealType" | "audience" | "strategy"
  >(
    key: K,
    value: CreativeFactors[K]
  ) => {
    setForm((current) =>
      requirementFormWithCreativeFactors({ ...current.creativeFactors, [key]: value })
    );
  };

  const updateGuidanceField = (
    sourcePath: Parameters<typeof requirementFormWithGuidanceField>[1],
    value: string
  ) => {
    setForm((current) =>
      requirementFormWithGuidanceField(current, sourcePath, unpackText(value))
    );
  };

  const uploadFiles = async (files: File[]) => {
    const rejected = files
      .map((file) => ({ file, reason: workspaceMaterialFileRejectionReason(file) }))
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
      setForm(requirementFormFromArtifact(imported.artifact.data));
      setReferenceAnalysis(imported.analysis);
      setReferenceRecommendation(imported.creativeFactorsRecommendation);
      setReferenceMessage("模型推荐已保存为四因子草稿，请确认后提交创作要求。");
      await vm.actions.refresh();
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : String(error));
    } finally {
      setReferenceImporting(false);
    }
  };

  return (
    <section className="review-panel review-panel--start">
      <div className="review-panel__header">
        <h1>创作要求 + 上传素材</h1>
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
                onClick={() => void importReferenceVideo()}
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
              {referenceRecommendation ? (
                <p>
                  推荐因子：
                  {referenceRecommendation.recommendedFactors.productCategory} /{" "}
                  {referenceRecommendation.recommendedFactors.dealType} /{" "}
                  {referenceRecommendation.recommendedFactors.audience} /{" "}
                  {referenceRecommendation.recommendedFactors.strategy}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="review-upload-row">
        <label className="review-upload">
          <Upload size={16} /> 上传素材
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
      <section className="creative-factor-panel">
        <div className="creative-factor-panel__header">
          <div>
            <span>全局创作因子</span>
          </div>
        </div>
        <div className="creative-factor-selects">
          <FactorSelect
            label="商品一级类目"
            value={form.creativeFactors.productCategory}
            options={PRODUCT_CATEGORY_OPTIONS}
            onChange={(value) =>
              updateCreativeFactor("productCategory", value as ProductCategory)
            }
          />
          <FactorSelect
            label="商品成交类型"
            value={form.creativeFactors.dealType}
            options={DEAL_TYPE_OPTIONS}
            onChange={(value) => updateCreativeFactor("dealType", value as DealType)}
          />
          <FactorSelect
            label="适用人群"
            value={form.creativeFactors.audience}
            options={AUDIENCE_OPTIONS}
            onChange={(value) => updateCreativeFactor("audience", value as Audience)}
          />
          <FactorSelect
            label="推销手法"
            value={form.creativeFactors.strategy}
            options={STRATEGY_OPTIONS}
            onChange={(value) => updateCreativeFactor("strategy", value as Strategy)}
          />
        </div>
        <Button
          className="creative-factor-group__toggle"
          aria-expanded={guidanceOpen}
          onClick={() => setGuidanceOpen((open) => !open)}
          size="small"
          variant="text"
        >
          {guidanceOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>细分字段</span>
        </Button>
        <Collapse in={guidanceOpen} timeout="auto" unmountOnExit>
          <div className="creative-factor-groups">
            {guidanceGroups(form.factorGuidance).map((group) => (
              <section className="creative-factor-group" key={group.title}>
                <strong className="creative-factor-group__title">{group.title}</strong>
                <div className="creative-factor-group__fields">
                  {group.rows.map((row) => (
                    <label key={row.sourcePath}>
                      <div className="creative-factor-field__title">
                        <span className="creative-factor-field__label">
                          {row.label}
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={packText(row.values)}
                        onChange={(event) =>
                          updateGuidanceField(row.sourcePath, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Collapse>
      </section>
      <section className="global-prompt-panel">
        <div className="global-prompt-panel__header">
          <div className="global-prompt-panel__title">
            <span>全局创作要求</span>
            <small>（只读）</small>
          </div>
        </div>
        <div className="review-form-grid">
          {COMPILED_REQUIREMENT_FIELDS.map((field) => (
            <label
              className={
                "wide" in field && field.wide ? "review-form-grid__wide" : undefined
              }
              key={field.key}
            >
              <div className="compiled-field-title">
                <span>{field.label}</span>
                <small>
                  {sourceSummary(form.compiledRequirementSourceMap[field.sourceMapKey])}
                </small>
                <SourceChips
                  sources={form.compiledRequirementSourceMap[field.sourceMapKey]}
                />
              </div>
              <textarea rows={3} value={form[field.key]} readOnly />
            </label>
          ))}
        </div>
      </section>
      <ReviewActionDock>
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || uploading}
          onClick={() => {
            if (assets.length === 0) {
              setUploadMessage("请先上传至少一个商品素材，再提交创作要求。");
              return;
            }
            let data: PromptRequirementsData;
            try {
              data = promptRequirementsDataFromForm(form);
            } catch {
              setUploadMessage("请确保每个细分字段至少填写一项，再提交创作要求。");
              return;
            }
            vm.actions.startCreativeReview(data);
            onActionComplete();
          }}
        >
          <Wand2 size={16} />
          {requirementsArtifact?.isCurrent ? "更新创作要求" : "提交创作要求"}
        </button>
      </ReviewActionDock>
    </section>
  );
}
